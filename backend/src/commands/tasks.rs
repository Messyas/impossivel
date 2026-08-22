use tauri::State;
use uuid::Uuid;
use crate::db::Database;
use crate::models::{Task, CreateTaskPayload, PaginatedResponse, PaginationQueryPayload};
use crate::commands::analytics::update_analytics_internal;

#[tauri::command]
pub fn get_tasks(
    db: State<'_, Database>,
    query: Option<PaginationQueryPayload>,
) -> Result<PaginatedResponse<Task>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let per_page = query.as_ref().and_then(|q| q.per_page).unwrap_or(20).max(1);
    let page = query.as_ref().and_then(|q| q.page).unwrap_or(1).max(1);

    let total_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let total_pages = if total_count > 0 {
        (total_count + per_page - 1) / per_page
    } else {
        1
    };

    let offset = (page - 1) * per_page;

    let mut stmt = conn
        .prepare("SELECT id, title, group_name, subject, duration, priority, done, due, created_at, updated_at FROM tasks ORDER BY created_at DESC LIMIT ?1 OFFSET ?2")
        .map_err(|e| e.to_string())?;

    let items: Vec<Task> = stmt
        .query_map([per_page, offset], |row| {
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                group_name: row.get(2)?,
                subject: row.get(3)?,
                duration: row.get(4)?,
                priority: row.get(5)?,
                done: row.get::<_, i64>(6)? != 0,
                due: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let has_more = page < total_pages;

    Ok(PaginatedResponse {
        items,
        next_cursor: None,
        prev_cursor: None,
        has_more,
        total_count,
        page,
        total_pages,
        per_page,
    })
}

#[tauri::command]
pub fn create_task(db: State<'_, Database>, payload: CreateTaskPayload) -> Result<Task, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let group = payload.group_name.unwrap_or_else(|| "Hoje".into());
    let subject = payload.subject.unwrap_or_else(|| "Inbox".into());
    let duration = payload.duration.unwrap_or(25);
    let priority = payload.priority.unwrap_or_else(|| "Média".into());
    let due = payload.due.unwrap_or_else(|| "Hoje".into());

    conn.execute(
        "INSERT INTO tasks (id, title, group_name, subject, duration, priority, done, due) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
        rusqlite::params![id, payload.title, group, subject, duration, priority, due],
    )
    .map_err(|e| e.to_string())?;

    update_analytics_internal(&conn);

    let task = conn
        .query_row(
            "SELECT id, title, group_name, subject, duration, priority, done, due, created_at, updated_at FROM tasks WHERE id = ?1",
            [&id],
            |row| {
                Ok(Task {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    group_name: row.get(2)?,
                    subject: row.get(3)?,
                    duration: row.get(4)?,
                    priority: row.get(5)?,
                    done: row.get::<_, i64>(6)? != 0,
                    due: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(task)
}

#[tauri::command]
pub fn toggle_task(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE tasks SET done = CASE WHEN done = 0 THEN 1 ELSE 0 END, updated_at = datetime('now') WHERE id = ?1",
        [&id],
    )
    .map_err(|e| e.to_string())?;

    update_analytics_internal(&conn);
    Ok(())
}

#[tauri::command]
pub fn delete_task(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tasks WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    update_analytics_internal(&conn);
    Ok(())
}

#[tauri::command]
pub fn clear_all_tasks(db: State<'_, Database>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tasks", [])
        .map_err(|e| e.to_string())?;

    update_analytics_internal(&conn);
    Ok(())
}
