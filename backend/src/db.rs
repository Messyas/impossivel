use rusqlite::{Connection, Result as SqlResult};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

pub fn get_db_dir() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("study-os");
    std::fs::create_dir_all(&dir).ok();
    dir
}

pub fn init_database() -> SqlResult<Database> {
    let db_path = get_db_dir().join("study_os.db");
    let conn = Connection::open(&db_path)?;

    // Enable WAL mode for better concurrency
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    run_migrations(&conn)?;

    Ok(Database {
        conn: Mutex::new(conn),
    })
}

fn run_migrations(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS preferences (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            group_name TEXT NOT NULL DEFAULT 'Hoje',
            subject TEXT NOT NULL DEFAULT 'Inbox',
            duration INTEGER NOT NULL DEFAULT 25,
            priority TEXT NOT NULL DEFAULT 'Média',
            done INTEGER NOT NULL DEFAULT 0,
            due TEXT NOT NULL DEFAULT 'Hoje',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS roadmaps (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            code TEXT NOT NULL,
            progress INTEGER NOT NULL DEFAULT 0,
            hours REAL NOT NULL DEFAULT 0,
            streak INTEGER NOT NULL DEFAULT 0,
            next_step TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS roadmap_steps (
            id TEXT PRIMARY KEY,
            roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'locked',
            mastery INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'Inbox',
            link TEXT NOT NULL DEFAULT 'Sem vínculo',
            content TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            service TEXT NOT NULL,
            label TEXT NOT NULL,
            email TEXT NOT NULL,
            username TEXT,
            purpose TEXT NOT NULL DEFAULT 'Development',
            status TEXT NOT NULL DEFAULT 'Active',
            free_tier TEXT NOT NULL DEFAULT 'Unknown',
            last_used TEXT NOT NULL DEFAULT 'Never',
            plan TEXT NOT NULL DEFAULT 'Free',
            in_use INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            tags TEXT,
            credits TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS credentials (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            label TEXT NOT NULL,
            cred_type TEXT NOT NULL DEFAULT 'API Key',
            secret_encrypted BLOB NOT NULL,
            nonce BLOB NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS focus_sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            duration_seconds INTEGER NOT NULL,
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS dashboard_analytics (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            focus_time_minutes INTEGER NOT NULL DEFAULT 1218,
            completed_sessions INTEGER NOT NULL DEFAULT 27,
            execution_rate INTEGER NOT NULL DEFAULT 86,
            reviews_on_time INTEGER NOT NULL DEFAULT 92,
            daily_focus_json TEXT NOT NULL DEFAULT '[{"d":"M","v":2.1},{"d":"T","v":3.8},{"d":"W","v":2.9},{"d":"T","v":4.4},{"d":"F","v":3.2},{"d":"S","v":1.4},{"d":"S","v":2.5}]',
            subject_study_json TEXT NOT NULL DEFAULT '[{"s":"Cálculo","v":8.5},{"s":"Rust","v":6.2},{"s":"Inglês","v":5.1},{"s":"Física","v":3.8}]',
            planned_vs_actual_json TEXT NOT NULL DEFAULT '[{"d":"M","p":3,"a":2.8},{"d":"T","p":4,"a":3.8},{"d":"W","p":3,"a":2.2},{"d":"T","p":4,"a":4.4},{"d":"F","p":3,"a":3.1},{"d":"S","p":2,"a":1.4},{"d":"S","p":3,"a":2.5}]',
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        "#,
    )?;

    // Seed initial data if tables are empty
    seed_if_empty(conn)?;

    Ok(())
}

fn seed_if_empty(conn: &Connection) -> SqlResult<()> {
    let task_count: i64 = conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0)).unwrap_or(0);
    if task_count >= 10 {
        return Ok(());
    }

    // Seed 120+ Tasks
    let groups = ["Hoje", "Próximas"];
    let subjects = ["Cálculo", "Rust", "Inglês", "Física", "Algoritmos", "Sistemas", "Redes", "IA"];
    let priorities = ["Alta", "Média", "Baixa"];
    let dues = ["10:00", "14:30", "18:00", "Amanhã", "Qui, 21", "Sex, 22", "Próx. semana"];

    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT OR IGNORE INTO tasks (id, title, group_name, subject, duration, priority, done, due, created_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now', ?9))"
        )?;

        for i in 1..=125 {
            let id = format!("t_{:03}", i);
            let group = groups[i % groups.len()];
            let subj = subjects[i % subjects.len()];
            let title = format!("{} — Exercício e revisão #{:02}", subj, i);
            let duration = (15 + (i % 6) * 15) as i64;
            let priority = priorities[i % priorities.len()];
            let done = if i % 3 == 0 { 1 } else { 0 };
            let due = dues[i % dues.len()];
            let time_offset = format!("-{} minutes", (125 - i) * 10);

            stmt.execute(rusqlite::params![id, title, group, subj, duration, priority, done, due, time_offset])?;
        }
    }

    // Seed 50+ Roadmaps with Steps
    {
        let mut rm_stmt = tx.prepare(
            "INSERT OR IGNORE INTO roadmaps (id, name, code, progress, hours, streak, next_step, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now', ?8))"
        )?;
        let mut step_stmt = tx.prepare(
            "INSERT OR IGNORE INTO roadmap_steps (id, roadmap_id, title, status, mastery, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
        )?;

        let roadmap_names = [
            "Cálculo I", "Rust", "English C1", "Física I", "Estrutura de Dados", 
            "Web Architecture", "DevOps & Cloud", "Machine Learning", "Mobile React Native", "Design Systems"
        ];

        for i in 1..=55 {
            let rm_id = format!("r_{:03}", i);
            let base_name = roadmap_names[(i - 1) % roadmap_names.len()];
            let name = format!("{} — Módulo {:02}", base_name, (i + 1) / 2);
            let code = format!("MOD{:03}", i);
            let progress = (20 + (i * 7) % 80) as i64;
            let hours = ((i as f64) * 1.5).round();
            let streak = (i % 15) as i64;
            let next_step = format!("Etapa Avançada #{:02}", (i % 5) + 1);
            let time_offset = format!("-{} hours", (55 - i) * 4);

            rm_stmt.execute(rusqlite::params![rm_id, name, code, progress, hours, streak, next_step, time_offset])?;

            for s in 0..5 {
                let step_id = format!("s_{:03}_{}", i, s + 1);
                let step_title = format!("Conceito Fundamentação #{:02}.{}", i, s + 1);
                let status = if s < 2 { "done" } else if s == 2 { "active" } else { "locked" };
                let mastery = if s < 2 { 90 - s * 10 } else if s == 2 { 50 } else { 0 };
                step_stmt.execute(rusqlite::params![step_id, rm_id, step_title, status, mastery, s as i64])?;
            }
        }
    }

    // Seed 100+ Accounts & Encrypted Credentials
    {
        let services = ["OpenAI", "Anthropic", "Google Cloud", "Groq", "GitHub", "Vercel", "AWS", "Cloudflare", "Supabase", "DigitalOcean"];
        let purposes = ["Main", "Personal", "Development", "Testing", "Backup", "Free Tier"];
        let statuses = ["Active", "Backup", "Inactive"];
        let tiers = ["Available", "Exhausted", "N/A"];

        let mut acc_stmt = tx.prepare(
            "INSERT OR IGNORE INTO accounts (id, service, label, email, username, purpose, status, free_tier, last_used, plan, in_use, notes, tags, credits, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, datetime('now', ?15))"
        )?;

        let mut cred_stmt = tx.prepare(
            "INSERT OR IGNORE INTO credentials (id, account_id, label, cred_type, secret_encrypted, nonce, active, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, datetime('now'))"
        )?;

        for i in 1..=105 {
            let acc_id = format!("acc_{:03}", i);
            let service = services[(i - 1) % services.len()];
            let label = format!("{} Account #{:02}", service, i);
            let email = format!("user{:03}@devops.io", i);
            let username = format!("dev_user_{:03}", i);
            let purpose = purposes[i % purposes.len()];
            let status = statuses[i % statuses.len()];
            let free_tier = tiers[i % tiers.len()];
            let last_used = if i % 2 == 0 { "Hoje" } else { "Há 3 dias" };
            let plan = if i % 4 == 0 { "Pro" } else { "Free" };
            let in_use = if i % 3 == 0 { 1 } else { 0 };
            let notes = format!("Notas de gerenciamento para conta {}", label);
            let tags = format!("[\"{}\", \"prod\"]", service.to_lowercase());
            let credits = format!("${}", 10 + (i % 50) * 5);
            let time_offset = format!("-{} minutes", (105 - i) * 15);

            acc_stmt.execute(rusqlite::params![
                acc_id, service, label, email, username, purpose, status, free_tier, last_used, plan, in_use, notes, tags, credits, time_offset
            ])?;

            // Insert 1 API Key credential per account
            let cred_id = format!("c_{:03}", i);
            let cred_label = format!("API Key Principal #{:02}", i);
            let dummy_secret = vec![0u8; 32];
            let dummy_nonce = vec![0u8; 12];
            cred_stmt.execute(rusqlite::params![cred_id, acc_id, cred_label, "API Key", dummy_secret, dummy_nonce])?;
        }
    }

    // Seed Notes & Preferences
    tx.execute_batch(
        r#"
        INSERT OR IGNORE INTO notes (id, title, category, link, content, updated_at) VALUES
            ('n1', 'Regras de derivação', 'Cálculo', 'Cálculo I / Etapa 3', '# Regras de derivação', datetime('now', '-12 minutes')),
            ('n2', 'Ownership mental model', 'Rust', 'Rust / Ownership', '# Ownership mental model', datetime('now', '-1 day')),
            ('n3', 'C1 vocabulary — week 8', 'Inglês', 'English C1', '# Vocabulary — week 8', datetime('now', '-2 days'));

        INSERT OR IGNORE INTO preferences (key, value) VALUES
            ('name', '"Alex Morgan"'),
            ('avatar', '""'),
            ('theme', '"system"'),
            ('font', '"geist"'),
            ('locale', '"pt-BR"');

        INSERT OR IGNORE INTO dashboard_analytics (id, focus_time_minutes, completed_sessions, execution_rate, reviews_on_time, daily_focus_json, subject_study_json, planned_vs_actual_json)
        VALUES (1, 1218, 27, 86, 92,
            '[{"d":"M","v":2.1},{"d":"T","v":3.8},{"d":"W","v":2.9},{"d":"T","v":4.4},{"d":"F","v":3.2},{"d":"S","v":1.4},{"d":"S","v":2.5}]',
            '[{"s":"Cálculo","v":8.5},{"s":"Rust","v":6.2},{"s":"Inglês","v":5.1},{"s":"Física","v":3.8}]',
            '[{"d":"M","p":3,"a":2.8},{"d":"T","p":4,"a":3.8},{"d":"W","p":3,"a":2.2},{"d":"T","p":4,"a":4.4},{"d":"F","p":3,"a":3.1},{"d":"S","p":2,"a":1.4},{"d":"S","p":3,"a":2.5}]'
        );
        "#,
    )?;

    tx.commit()?;
    Ok(())
}
