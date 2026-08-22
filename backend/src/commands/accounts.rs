use tauri::State;
use uuid::Uuid;
use crate::crypto;
use crate::db::Database;
use crate::models::{Account, Credential, AccountWithCredentials, CreateAccountPayload, AddCredentialPayload, PaginatedResponse, PaginationQueryPayload};

fn encode_cursor(s: &str) -> String {
    s.bytes().map(|b| format!("{:02x}", b)).collect()
}

fn decode_cursor(s: &str) -> Option<String> {
    if s.len() % 2 != 0 { return None; }
    let bytes: Option<Vec<u8>> = (0..s.len()).step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i+2], 16).ok())
        .collect();
    bytes.and_then(|b| String::from_utf8(b).ok())
}

#[tauri::command]
pub fn get_accounts(
    db: State<'_, Database>,
    query: Option<PaginationQueryPayload>,
) -> Result<PaginatedResponse<AccountWithCredentials>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let per_page = query.as_ref().and_then(|q| q.per_page).unwrap_or(20).max(1);
    let page = query.as_ref().and_then(|q| q.page).unwrap_or(1).max(1);

    let total_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM accounts", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let total_pages = if total_count > 0 {
        (total_count + per_page - 1) / per_page
    } else {
        1
    };

    let offset = (page - 1) * per_page;

    // Decode cursor if provided for Keyset pagination
    let cursor_parts = query
        .as_ref()
        .and_then(|q| q.cursor.as_ref())
        .and_then(|c| decode_cursor(c));

    let (sql, params) = match cursor_parts {
        Some(cp) => {
            let parts: Vec<&str> = cp.split('|').collect();
            if parts.len() == 2 {
                (
                    "SELECT id, service, label, email, username, purpose, status, free_tier, last_used, plan, in_use, notes, tags, credits, created_at
                     FROM accounts 
                     WHERE (created_at < ?1) OR (created_at = ?1 AND id < ?2)
                     ORDER BY created_at DESC, id DESC LIMIT ?3".to_string(),
                    vec![parts[0].to_string(), parts[1].to_string(), (per_page + 1).to_string()],
                )
            } else {
                (
                    "SELECT id, service, label, email, username, purpose, status, free_tier, last_used, plan, in_use, notes, tags, credits, created_at
                     FROM accounts ORDER BY created_at DESC, id DESC LIMIT ?1 OFFSET ?2".to_string(),
                    vec![(per_page + 1).to_string(), offset.to_string()],
                )
            }
        }
        None => (
            "SELECT id, service, label, email, username, purpose, status, free_tier, last_used, plan, in_use, notes, tags, credits, created_at
             FROM accounts ORDER BY created_at DESC, id DESC LIMIT ?1 OFFSET ?2".to_string(),
            vec![(per_page + 1).to_string(), offset.to_string()],
        ),
    };

    let mut acc_stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|s| s as &dyn rusqlite::ToSql).collect();

    let mut raw_accounts: Vec<Account> = acc_stmt
        .query_map(&param_refs[..], |row| {
            let tags_json: Option<String> = row.get(12)?;
            let tags: Vec<String> = tags_json
                .and_then(|j| serde_json::from_str(&j).ok())
                .unwrap_or_default();
            Ok(Account {
                id: row.get(0)?,
                service: row.get(1)?,
                label: row.get(2)?,
                email: row.get(3)?,
                username: row.get(4)?,
                purpose: row.get(5)?,
                status: row.get(6)?,
                free_tier: row.get(7)?,
                last_used: row.get(8)?,
                plan: row.get(9)?,
                in_use: row.get::<_, i64>(10)? != 0,
                notes: row.get(11)?,
                tags,
                credits: row.get(13)?,
                created_at: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let has_more = raw_accounts.len() > per_page as usize;
    if has_more {
        raw_accounts.pop();
    }

    let next_cursor = if has_more {
        raw_accounts.last().map(|a| {
            let raw_cursor = format!("{}|{}", a.created_at, a.id);
            encode_cursor(&raw_cursor)
        })
    } else {
        None
    };

    let mut items = Vec::new();
    for account in raw_accounts {
        let mut cred_stmt = conn
            .prepare("SELECT id, account_id, label, cred_type, secret_encrypted, nonce, active, created_at FROM credentials WHERE account_id = ?1")
            .map_err(|e| e.to_string())?;

        let credentials: Vec<Credential> = cred_stmt
            .query_map([&account.id], |row| {
                let encrypted: Vec<u8> = row.get(4)?;
                let nonce: Vec<u8> = row.get(5)?;
                let masked = match crypto::decrypt_secret(&encrypted, &nonce) {
                    Ok(plain) => crypto::mask_secret(&plain),
                    Err(_) => "••••••••".to_string(),
                };
                Ok(Credential {
                    id: row.get(0)?,
                    account_id: row.get(1)?,
                    label: row.get(2)?,
                    cred_type: row.get(3)?,
                    secret_masked: masked,
                    active: row.get::<_, i64>(6)? != 0,
                    created_at: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        items.push(AccountWithCredentials {
            account,
            credentials,
        });
    }

    Ok(PaginatedResponse {
        items,
        next_cursor,
        prev_cursor: None,
        has_more,
        total_count,
        page,
        total_pages,
        per_page,
    })
}

#[tauri::command]
pub fn create_account(db: State<'_, Database>, payload: CreateAccountPayload) -> Result<Account, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = payload.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let tags_json = serde_json::to_string(&payload.tags.unwrap_or_default()).map_err(|e| e.to_string())?;

    let purpose = payload.purpose.unwrap_or_else(|| "Development".into());
    let status = payload.status.unwrap_or_else(|| "Active".into());
    let free_tier = payload.free_tier.unwrap_or_else(|| "Unknown".into());
    let plan = payload.plan.unwrap_or_else(|| "Free".into());
    let in_use = payload.in_use.unwrap_or(false);

    conn.execute(
        "INSERT INTO accounts (id, service, label, email, username, purpose, status, free_tier, plan, in_use, notes, tags, credits)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT(id) DO UPDATE SET
            service=excluded.service,
            label=excluded.label,
            email=excluded.email,
            username=excluded.username,
            purpose=excluded.purpose,
            status=excluded.status,
            free_tier=excluded.free_tier,
            plan=excluded.plan,
            in_use=excluded.in_use,
            notes=excluded.notes,
            tags=excluded.tags,
            credits=excluded.credits",
        rusqlite::params![
            id,
            payload.service,
            payload.label,
            payload.email,
            payload.username,
            purpose,
            status,
            free_tier,
            plan,
            in_use as i64,
            payload.notes,
            tags_json,
            payload.credits,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(Account {
        id,
        service: payload.service,
        label: payload.label,
        email: payload.email,
        username: payload.username,
        purpose,
        status,
        free_tier,
        last_used: "Never".into(),
        plan,
        in_use,
        notes: payload.notes,
        tags: Vec::new(),
        credits: payload.credits,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub fn archive_account(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM credentials WHERE account_id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM accounts WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_account(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM credentials WHERE account_id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM accounts WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_all_accounts(db: State<'_, Database>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM credentials", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM accounts", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn toggle_account_use(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE accounts SET in_use = CASE WHEN in_use = 0 THEN 1 ELSE 0 END WHERE id = ?1",
        [&id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_credential(db: State<'_, Database>, payload: AddCredentialPayload) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let cred_type = payload.cred_type.unwrap_or_else(|| "API Key".into());

    let (encrypted, nonce) = crypto::encrypt_secret(&payload.secret)?;

    conn.execute(
        "INSERT INTO credentials (id, account_id, label, cred_type, secret_encrypted, nonce) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, payload.account_id, payload.label, cred_type, encrypted, nonce],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn reveal_credential(db: State<'_, Database>, id: String) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let (encrypted, nonce): (Vec<u8>, Vec<u8>) = conn
        .query_row(
            "SELECT secret_encrypted, nonce FROM credentials WHERE id = ?1",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    crypto::decrypt_secret(&encrypted, &nonce)
}

#[tauri::command]
pub fn remove_credential(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM credentials WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
