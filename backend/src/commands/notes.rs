use rusqlite::{params, OptionalExtension};
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::models::{Note, NotesQueryPayload, PaginatedResponse, UpdateNotePayload};

const DEFAULT_PAGE_SIZE: i64 = 30;
const MAX_PAGE_SIZE: i64 = 50;
const MAX_TITLE_CHARS: usize = 200;
const MAX_CONTENT_BYTES: usize = 500_000;

fn normalize_title(title: &str) -> Result<String, String> {
    let title = title.trim();
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(format!("O título deve ter no máximo {MAX_TITLE_CHARS} caracteres."));
    }
    Ok(if title.is_empty() { "Sem título".into() } else { title.into() })
}

fn validate_content(content: &str) -> Result<(), String> {
    if content.len() > MAX_CONTENT_BYTES {
        return Err("O conteúdo da nota excede o limite de 500 KB.".into());
    }
    Ok(())
}

fn escape_like(value: &str) -> String {
    value.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

#[tauri::command]
pub fn get_notes(
    db: State<'_, Database>,
    query: Option<NotesQueryPayload>,
) -> Result<PaginatedResponse<Note>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let page = query.as_ref().and_then(|q| q.page).unwrap_or(1).clamp(1, 1_000_000);
    let per_page = query
        .as_ref()
        .and_then(|q| q.per_page)
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(1, MAX_PAGE_SIZE);
    let search = query
        .and_then(|q| q.search)
        .unwrap_or_default()
        .trim()
        .chars()
        .take(200)
        .collect::<String>();
    let pattern = format!("%{}%", escape_like(&search));

    let total_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE ?1 = '' OR title LIKE ?2 ESCAPE '\\' OR content LIKE ?2 ESCAPE '\\'",
            params![search, pattern],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let total_pages = ((total_count + per_page - 1) / per_page).max(1);
    let offset = (page - 1) * per_page;

    let mut statement = conn
        .prepare(
            "SELECT id, title, content, created_at, updated_at
             FROM notes
             WHERE ?1 = '' OR title LIKE ?2 ESCAPE '\\' OR content LIKE ?2 ESCAPE '\\'
             ORDER BY updated_at DESC, id DESC
             LIMIT ?3 OFFSET ?4",
        )
        .map_err(|e| e.to_string())?;
    let items = statement
        .query_map(params![search, pattern, per_page, offset], |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(PaginatedResponse {
        items,
        next_cursor: None,
        prev_cursor: None,
        has_more: page < total_pages,
        total_count,
        page,
        total_pages,
        per_page,
    })
}

#[tauri::command]
pub fn create_note(db: State<'_, Database>) -> Result<Note, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO notes (id, title, content) VALUES (?1, 'Nova nota', '')",
        [&id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, title, content, created_at, updated_at FROM notes WHERE id = ?1",
        [&id],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_note(db: State<'_, Database>, payload: UpdateNotePayload) -> Result<(), String> {
    let title = payload.title.as_deref().map(normalize_title).transpose()?;
    if let Some(content) = payload.content.as_deref() {
        validate_content(content)?;
    }
    if title.is_none() && payload.content.is_none() {
        return Ok(());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let changed = conn
        .execute(
            "UPDATE notes
             SET title = COALESCE(?1, title), content = COALESCE(?2, content), updated_at = datetime('now')
             WHERE id = ?3",
            params![title, payload.content, payload.id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Nota não encontrada.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn delete_note(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let exists = conn
        .query_row("SELECT 1 FROM notes WHERE id = ?1", [&id], |_| Ok(()))
        .optional()
        .map_err(|e| e.to_string())?
        .is_some();
    if !exists {
        return Err("Nota não encontrada.".into());
    }
    conn.execute("DELETE FROM notes WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_all_notes(db: State<'_, Database>) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes", []).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_title_gets_a_safe_default() {
        assert_eq!(normalize_title("   ").unwrap(), "Sem título");
    }

    #[test]
    fn like_search_is_escaped() {
        assert_eq!(escape_like(r"50%_off\today"), r"50\%\_off\\today");
    }

    #[test]
    fn oversized_values_are_rejected() {
        assert!(normalize_title(&"a".repeat(MAX_TITLE_CHARS + 1)).is_err());
        assert!(validate_content(&"a".repeat(MAX_CONTENT_BYTES + 1)).is_err());
    }
}
