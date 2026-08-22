use tauri::State;
use uuid::Uuid;
use crate::db::Database;
use crate::models::{Note, UpdateNotePayload};

#[tauri::command]
pub fn get_notes(db: State<'_, Database>) -> Result<Vec<Note>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, title, category, link, content, created_at, updated_at FROM notes ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let notes = stmt
        .query_map([], |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                category: row.get(2)?,
                link: row.get(3)?,
                content: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(notes)
}

#[tauri::command]
pub fn create_note(db: State<'_, Database>) -> Result<Note, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO notes (id, title, category, link, content) VALUES (?1, 'Untitled note', 'Inbox', 'Sem vínculo', '# Untitled note\n\nComece a escrever...')",
        [&id],
    )
    .map_err(|e| e.to_string())?;

    let note = conn
        .query_row(
            "SELECT id, title, category, link, content, created_at, updated_at FROM notes WHERE id = ?1",
            [&id],
            |row| {
                Ok(Note {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    category: row.get(2)?,
                    link: row.get(3)?,
                    content: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(note)
}

#[tauri::command]
pub fn update_note(db: State<'_, Database>, payload: UpdateNotePayload) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    if let Some(ref title) = payload.title {
        conn.execute("UPDATE notes SET title = ?1, updated_at = datetime('now') WHERE id = ?2", rusqlite::params![title, payload.id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(ref category) = payload.category {
        conn.execute("UPDATE notes SET category = ?1, updated_at = datetime('now') WHERE id = ?2", rusqlite::params![category, payload.id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(ref link) = payload.link {
        conn.execute("UPDATE notes SET link = ?1, updated_at = datetime('now') WHERE id = ?2", rusqlite::params![link, payload.id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(ref content) = payload.content {
        conn.execute("UPDATE notes SET content = ?1, updated_at = datetime('now') WHERE id = ?2", rusqlite::params![content, payload.id])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_note(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_all_notes(db: State<'_, Database>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}
