use tauri::State;
use uuid::Uuid;
use crate::db::Database;
use crate::models::{FocusSessionPayload, FocusStats, DailyFocus};
use crate::commands::analytics::update_analytics_internal;

#[tauri::command]
pub fn log_focus_session(db: State<'_, Database>, payload: FocusSessionPayload) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let completed = payload.completed.unwrap_or(true) as i64;

    conn.execute(
        "INSERT INTO focus_sessions (id, title, duration_seconds, completed) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, payload.title, payload.duration_seconds, completed],
    )
    .map_err(|e| e.to_string())?;

    update_analytics_internal(&conn);

    Ok(())
}

#[tauri::command]
pub fn get_focus_stats(db: State<'_, Database>, days: i64) -> Result<FocusStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let total_seconds: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(duration_seconds), 0) FROM focus_sessions WHERE started_at >= datetime('now', ?1)",
            [format!("-{} days", days)],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let sessions_completed: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM focus_sessions WHERE completed = 1 AND started_at >= datetime('now', ?1)",
            [format!("-{} days", days)],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT date(started_at) as d, SUM(duration_seconds) / 3600.0 as hours FROM focus_sessions WHERE started_at >= datetime('now', ?1) GROUP BY d ORDER BY d",
        )
        .map_err(|e| e.to_string())?;

    let daily: Vec<DailyFocus> = stmt
        .query_map([format!("-{} days", days)], |row| {
            Ok(DailyFocus {
                date: row.get(0)?,
                hours: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(FocusStats {
        total_hours: total_seconds / 3600.0,
        sessions_completed,
        daily,
    })
}
