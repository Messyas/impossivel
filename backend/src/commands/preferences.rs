use tauri::State;
use crate::db::Database;
use crate::models::UserPreferences;

fn read_pref(conn: &rusqlite::Connection, key: &str) -> String {
    conn.query_row(
        "SELECT value FROM preferences WHERE key = ?1",
        [key],
        |row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "\"\"".to_string())
}

fn strip_quotes(s: &str) -> String {
    serde_json::from_str::<String>(s).unwrap_or_else(|_| s.to_string())
}

#[tauri::command]
pub fn get_preferences(db: State<'_, Database>) -> Result<UserPreferences, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    Ok(UserPreferences {
        name: strip_quotes(&read_pref(&conn, "name")),
        avatar: strip_quotes(&read_pref(&conn, "avatar")),
        theme: strip_quotes(&read_pref(&conn, "theme")),
        font: strip_quotes(&read_pref(&conn, "font")),
        locale: strip_quotes(&read_pref(&conn, "locale")),
    })
}

#[tauri::command]
pub fn update_preferences(db: State<'_, Database>, preferences: UserPreferences) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let pairs = [
        ("name", &preferences.name),
        ("avatar", &preferences.avatar),
        ("theme", &preferences.theme),
        ("font", &preferences.font),
        ("locale", &preferences.locale),
    ];

    for (key, value) in pairs {
        let json_value = serde_json::to_string(value).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO preferences (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
            rusqlite::params![key, json_value],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn reset_preferences(db: State<'_, Database>) -> Result<UserPreferences, String> {
    let defaults = UserPreferences::default();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute_batch("DELETE FROM preferences;")
        .map_err(|e| e.to_string())?;

    let pairs = [
        ("name", &defaults.name),
        ("avatar", &defaults.avatar),
        ("theme", &defaults.theme),
        ("font", &defaults.font),
        ("locale", &defaults.locale),
    ];

    for (key, value) in pairs {
        let json_value = serde_json::to_string(value).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO preferences (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, json_value],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(defaults)
}
