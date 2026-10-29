use rusqlite::{Connection, Result as SqlResult};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;

#[derive(Clone)]
pub struct Database {
    pub conn: Arc<Mutex<Connection>>,
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
        conn: Arc::new(Mutex::new(conn)),
    })
}

pub(crate) fn run_migrations(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS preferences (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_meta (
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
            description TEXT NOT NULL DEFAULT '',
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

        CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);

        CREATE TABLE IF NOT EXISTS knowledge_maps (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            viewport_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
            revision INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS knowledge_nodes (
            id TEXT PRIMARY KEY,
            map_id TEXT NOT NULL REFERENCES knowledge_maps(id) ON DELETE CASCADE,
            kind TEXT NOT NULL CHECK(kind IN ('concept','roadmap_step')),
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            roadmap_step_id TEXT REFERENCES roadmap_steps(id) ON DELETE SET NULL,
            source_roadmap_name TEXT,
            position_x REAL NOT NULL DEFAULT 0,
            position_y REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(map_id, roadmap_step_id)
        );
        CREATE TABLE IF NOT EXISTS knowledge_edges (
            id TEXT PRIMARY KEY,
            map_id TEXT NOT NULL REFERENCES knowledge_maps(id) ON DELETE CASCADE,
            source_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
            target_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
            relation TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            CHECK(source_id != target_id),
            UNIQUE(map_id, source_id, target_id, relation)
        );
        CREATE TABLE IF NOT EXISTS study_task_links (
            task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
            roadmap_step_id TEXT REFERENCES roadmap_steps(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS knowledge_note_links (
            note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            target_kind TEXT NOT NULL CHECK(target_kind IN ('roadmap_step','knowledge_node','knowledge_edge')),
            target_id TEXT NOT NULL,
            PRIMARY KEY(note_id, target_kind, target_id)
        );
        CREATE TABLE IF NOT EXISTS agent_tokens (
            client TEXT PRIMARY KEY,
            token_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS agent_change_log (
            id TEXT PRIMARY KEY,
            client TEXT NOT NULL,
            operation TEXT NOT NULL,
            summary TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS agent_operations (
            operation_id TEXT PRIMARY KEY,
            client TEXT NOT NULL,
            result TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS entity_revisions (
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY(entity_type,entity_id)
        );
        CREATE TRIGGER IF NOT EXISTS revision_roadmap_insert AFTER INSERT ON roadmaps BEGIN
            INSERT INTO entity_revisions(entity_type,entity_id,revision) VALUES('roadmap',NEW.id,1) ON CONFLICT(entity_type,entity_id) DO UPDATE SET revision=revision+1;
        END;
        CREATE TRIGGER IF NOT EXISTS revision_roadmap_update AFTER UPDATE ON roadmaps BEGIN
            INSERT INTO entity_revisions(entity_type,entity_id,revision) VALUES('roadmap',NEW.id,1) ON CONFLICT(entity_type,entity_id) DO UPDATE SET revision=revision+1;
        END;
        CREATE TRIGGER IF NOT EXISTS revision_step_insert AFTER INSERT ON roadmap_steps BEGIN
            INSERT INTO entity_revisions(entity_type,entity_id,revision) VALUES('roadmap_step',NEW.id,1) ON CONFLICT(entity_type,entity_id) DO UPDATE SET revision=revision+1;
        END;
        CREATE TRIGGER IF NOT EXISTS revision_step_update AFTER UPDATE ON roadmap_steps BEGIN
            INSERT INTO entity_revisions(entity_type,entity_id,revision) VALUES('roadmap_step',NEW.id,1) ON CONFLICT(entity_type,entity_id) DO UPDATE SET revision=revision+1;
        END;
        CREATE TRIGGER IF NOT EXISTS revision_task_insert AFTER INSERT ON tasks BEGIN
            INSERT INTO entity_revisions(entity_type,entity_id,revision) VALUES('task',NEW.id,1) ON CONFLICT(entity_type,entity_id) DO UPDATE SET revision=revision+1;
        END;
        CREATE TRIGGER IF NOT EXISTS revision_task_update AFTER UPDATE ON tasks BEGIN
            INSERT INTO entity_revisions(entity_type,entity_id,revision) VALUES('task',NEW.id,1) ON CONFLICT(entity_type,entity_id) DO UPDATE SET revision=revision+1;
        END;
        CREATE TRIGGER IF NOT EXISTS revision_note_insert AFTER INSERT ON notes BEGIN
            INSERT INTO entity_revisions(entity_type,entity_id,revision) VALUES('note',NEW.id,1) ON CONFLICT(entity_type,entity_id) DO UPDATE SET revision=revision+1;
        END;
        CREATE TRIGGER IF NOT EXISTS revision_note_update AFTER UPDATE ON notes BEGIN
            INSERT INTO entity_revisions(entity_type,entity_id,revision) VALUES('note',NEW.id,1) ON CONFLICT(entity_type,entity_id) DO UPDATE SET revision=revision+1;
        END;
        CREATE TABLE IF NOT EXISTS pending_deletions (
            id TEXT PRIMARY KEY,
            client TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            summary TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TRIGGER IF NOT EXISTS keep_knowledge_snapshot_before_step_delete
        BEFORE DELETE ON roadmap_steps BEGIN
            UPDATE knowledge_nodes SET kind='concept',roadmap_step_id=NULL,
              title=OLD.title,description=OLD.description,
              source_roadmap_name=COALESCE((SELECT name FROM roadmaps WHERE id=OLD.roadmap_id),source_roadmap_name)
            WHERE roadmap_step_id=OLD.id;
        END;
        DROP TRIGGER IF EXISTS snapshot_knowledge_roadmap_before_delete;
        CREATE TRIGGER snapshot_knowledge_roadmap_before_delete
        BEFORE DELETE ON roadmaps BEGIN
            UPDATE knowledge_nodes SET source_roadmap_name=OLD.name
            WHERE roadmap_step_id IN (SELECT id FROM roadmap_steps WHERE roadmap_id=OLD.id);
        END;
        CREATE TRIGGER IF NOT EXISTS sync_knowledge_step_snapshot
        AFTER UPDATE OF title,description ON roadmap_steps BEGIN
            UPDATE knowledge_nodes SET title=NEW.title,description=NEW.description
            WHERE roadmap_step_id=NEW.id;
        END;
        CREATE TRIGGER IF NOT EXISTS sync_knowledge_roadmap_snapshot
        AFTER UPDATE OF name ON roadmaps BEGIN
            UPDATE knowledge_nodes SET source_roadmap_name=NEW.name
            WHERE roadmap_step_id IN (SELECT id FROM roadmap_steps WHERE roadmap_id=NEW.id);
        END;
        DROP TRIGGER IF EXISTS remove_knowledge_on_map_delete;
        CREATE TRIGGER remove_knowledge_on_map_delete
        AFTER DELETE ON knowledge_maps BEGIN
            DELETE FROM knowledge_note_links WHERE target_kind='knowledge_node' AND target_id IN (SELECT id FROM knowledge_nodes WHERE map_id=OLD.id);
            DELETE FROM knowledge_note_links WHERE target_kind='knowledge_edge' AND target_id IN (SELECT id FROM knowledge_edges WHERE map_id=OLD.id);
            DELETE FROM knowledge_edges WHERE map_id=OLD.id;
            DELETE FROM knowledge_nodes WHERE map_id=OLD.id;
        END;

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

    // Additive migrations for roadmap execution and per-step review scheduling.
    // SQLite does not support `ADD COLUMN IF NOT EXISTS`, so duplicate-column
    // errors are intentionally ignored to keep startup migrations idempotent.
    for migration in [
        "ALTER TABLE roadmaps ADD COLUMN description TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE roadmaps ADD COLUMN review_intervals TEXT NOT NULL DEFAULT '[0,1,3,7]'",
        "ALTER TABLE roadmap_steps ADD COLUMN description TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE roadmap_steps ADD COLUMN checklist TEXT NOT NULL DEFAULT '[\"Compreender os conceitos fundamentais\"]'",
        "ALTER TABLE roadmap_steps ADD COLUMN checklist_state TEXT NOT NULL DEFAULT '[false]'",
        "ALTER TABLE roadmap_steps ADD COLUMN focus_seconds INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE roadmap_steps ADD COLUMN timer_remaining INTEGER NOT NULL DEFAULT 1500",
        "ALTER TABLE roadmap_steps ADD COLUMN completed_at TEXT",
    ] {
        let _ = conn.execute(migration, []);
    }

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS review_occurrences (
            id TEXT PRIMARY KEY,
            roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
            step_id TEXT NOT NULL REFERENCES roadmap_steps(id) ON DELETE CASCADE,
            interval_days INTEGER NOT NULL,
            due_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            checklist_state TEXT NOT NULL DEFAULT '[]',
            focus_seconds INTEGER NOT NULL DEFAULT 0,
            timer_remaining INTEGER NOT NULL DEFAULT 1500,
            completed_at TEXT,
            UNIQUE(step_id, interval_days)
        );

        CREATE INDEX IF NOT EXISTS idx_review_occurrences_due_date ON review_occurrences(due_date);
        CREATE INDEX IF NOT EXISTS idx_review_occurrences_status ON review_occurrences(status);

        UPDATE roadmap_steps SET status = 'available' WHERE status = 'active';
        UPDATE roadmap_steps SET completed_at = datetime('now') WHERE status = 'done' AND completed_at IS NULL;
        UPDATE roadmap_steps SET checklist_state = '[true]' WHERE status = 'done' AND checklist_state = '[false]';
        "#,
    )?;

    // Seed initial data if tables are empty
    seed_if_empty(conn)?;

    // Existing completed stages receive their first individual review queue.
    conn.execute_batch(
        r#"
        INSERT OR IGNORE INTO review_occurrences
            (id, roadmap_id, step_id, interval_days, due_date, status, checklist_state)
        SELECT
            rs.id || '-review-' || CAST(schedule.value AS TEXT),
            rs.roadmap_id,
            rs.id,
            CAST(schedule.value AS INTEGER),
            date(COALESCE(rs.completed_at, datetime('now')), printf('+%d days', CAST(schedule.value AS INTEGER))),
            'pending',
            '[false]'
        FROM roadmap_steps rs
        JOIN roadmaps r ON r.id = rs.roadmap_id
        JOIN json_each(r.review_intervals) schedule
        WHERE rs.status = 'done';
        "#,
    )?;

    conn.execute_batch(
        r#"
        INSERT OR IGNORE INTO entity_revisions(entity_type,entity_id,revision) SELECT 'roadmap',id,1 FROM roadmaps;
        INSERT OR IGNORE INTO entity_revisions(entity_type,entity_id,revision) SELECT 'roadmap_step',id,1 FROM roadmap_steps;
        INSERT OR IGNORE INTO entity_revisions(entity_type,entity_id,revision) SELECT 'task',id,1 FROM tasks;
        INSERT OR IGNORE INTO entity_revisions(entity_type,entity_id,revision) SELECT 'note',id,1 FROM notes;
        "#,
    )?;

    Ok(())
}

fn seed_if_empty(conn: &Connection) -> SqlResult<()> {
    let seed_completed: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM app_meta WHERE key = 'demo_seed_v1')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if seed_completed {
        return Ok(());
    }

    // Existing installations may predate the marker. Any user or demo data means
    // initialization already happened; marking it prevents deleted data from being
    // recreated on a later launch.
    let existing_records: i64 = conn
        .query_row(
            "SELECT (SELECT COUNT(*) FROM tasks) + (SELECT COUNT(*) FROM roadmaps) + (SELECT COUNT(*) FROM notes) + (SELECT COUNT(*) FROM accounts)",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if existing_records > 0 {
        conn.execute(
            "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('demo_seed_v1', datetime('now'))",
            [],
        )?;
        return Ok(());
    }

    // Seed 120+ Tasks
    let groups = ["Hoje", "Próximas"];
    let subjects = [
        "Cálculo",
        "Rust",
        "Inglês",
        "Física",
        "Algoritmos",
        "Sistemas",
        "Redes",
        "IA",
    ];
    let priorities = ["Alta", "Média", "Baixa"];
    let dues = [
        "10:00",
        "14:30",
        "18:00",
        "Amanhã",
        "Qui, 21",
        "Sex, 22",
        "Próx. semana",
    ];

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

            stmt.execute(rusqlite::params![
                id,
                title,
                group,
                subj,
                duration,
                priority,
                done,
                due,
                time_offset
            ])?;
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
            "Cálculo I",
            "Rust",
            "English C1",
            "Física I",
            "Estrutura de Dados",
            "Web Architecture",
            "DevOps & Cloud",
            "Machine Learning",
            "Mobile React Native",
            "Design Systems",
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

            rm_stmt.execute(rusqlite::params![
                rm_id,
                name,
                code,
                progress,
                hours,
                streak,
                next_step,
                time_offset
            ])?;

            for s in 0..5 {
                let step_id = format!("s_{:03}_{}", i, s + 1);
                let step_title = format!("Conceito Fundamentação #{:02}.{}", i, s + 1);
                let status = if s < 2 {
                    "done"
                } else if s == 2 {
                    "active"
                } else {
                    "locked"
                };
                let mastery = if s < 2 {
                    90 - s * 10
                } else if s == 2 {
                    50
                } else {
                    0
                };
                step_stmt.execute(rusqlite::params![
                    step_id, rm_id, step_title, status, mastery, s as i64
                ])?;
            }
        }
    }

    // Seed 100+ Accounts & Encrypted Credentials
    {
        let services = [
            "OpenAI",
            "Anthropic",
            "Google Cloud",
            "Groq",
            "GitHub",
            "Vercel",
            "AWS",
            "Cloudflare",
            "Supabase",
            "DigitalOcean",
        ];
        let purposes = [
            "Main",
            "Personal",
            "Development",
            "Testing",
            "Backup",
            "Free Tier",
        ];
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
                acc_id,
                service,
                label,
                email,
                username,
                purpose,
                status,
                free_tier,
                last_used,
                plan,
                in_use,
                notes,
                tags,
                credits,
                time_offset
            ])?;

            // Insert 1 API Key credential per account
            let cred_id = format!("c_{:03}", i);
            let cred_label = format!("API Key Principal #{:02}", i);
            let dummy_secret = vec![0u8; 32];
            let dummy_nonce = vec![0u8; 12];
            cred_stmt.execute(rusqlite::params![
                cred_id,
                acc_id,
                cred_label,
                "API Key",
                dummy_secret,
                dummy_nonce
            ])?;
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

        INSERT OR REPLACE INTO app_meta (key, value) VALUES ('demo_seed_v1', datetime('now'));
        "#,
    )?;

    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deleted_notes_are_not_seeded_again() {
        let connection = Connection::open_in_memory().unwrap();
        run_migrations(&connection).unwrap();
        let initial_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .unwrap();
        assert!(initial_count > 0);

        connection.execute("DELETE FROM notes", []).unwrap();
        run_migrations(&connection).unwrap();

        let count_after_restart: i64 = connection
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count_after_restart, 0);
    }

    #[test]
    fn deleting_a_roadmap_preserves_map_concepts_and_unlinks_tasks() {
        let connection = Connection::open_in_memory().unwrap();
        run_migrations(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO roadmaps(id,name,code) VALUES('roadmap-x','Rust','RX')",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO roadmap_steps(id,roadmap_id,title,description,status) VALUES('step-x','roadmap-x','Ownership','Borrowing rules','available')", []).unwrap();
        connection
            .execute(
                "INSERT INTO knowledge_maps(id,name) VALUES('map-x','Rust concepts')",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO knowledge_nodes(id,map_id,kind,title,description,roadmap_step_id,source_roadmap_name) VALUES('node-x','map-x','roadmap_step','Ownership','Borrowing rules','step-x','Rust')", []).unwrap();
        connection
            .execute(
                "INSERT INTO tasks(id,title) VALUES('task-x','Practice borrowing')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO study_task_links(task_id,roadmap_step_id) VALUES('task-x','step-x')",
                [],
            )
            .unwrap();
        connection
            .execute("DELETE FROM roadmaps WHERE id='roadmap-x'", [])
            .unwrap();
        let node: (String, Option<String>, String, String, Option<String>) = connection.query_row("SELECT kind,roadmap_step_id,title,description,source_roadmap_name FROM knowledge_nodes WHERE id='node-x'", [], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).unwrap();
        assert_eq!(
            node,
            (
                "concept".into(),
                None,
                "Ownership".into(),
                "Borrowing rules".into(),
                Some("Rust".into())
            )
        );
        let linked_step: Option<String> = connection
            .query_row(
                "SELECT roadmap_step_id FROM study_task_links WHERE task_id='task-x'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(linked_step, None);
    }
}
