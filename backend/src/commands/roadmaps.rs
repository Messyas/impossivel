use tauri::State;
use uuid::Uuid;
use crate::db::Database;
use crate::models::{Roadmap, RoadmapStep, RoadmapWithSteps, CreateRoadmapPayload, AddStepPayload, PaginatedResponse, PaginationQueryPayload};

#[tauri::command]
pub fn get_roadmaps(
    db: State<'_, Database>,
    query: Option<PaginationQueryPayload>,
) -> Result<PaginatedResponse<RoadmapWithSteps>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let per_page = query.as_ref().and_then(|q| q.per_page).unwrap_or(10).max(1);
    let page = query.as_ref().and_then(|q| q.page).unwrap_or(1).max(1);

    let total_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM roadmaps", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let total_pages = if total_count > 0 {
        (total_count + per_page - 1) / per_page
    } else {
        1
    };

    let offset = (page - 1) * per_page;

    let mut roadmap_stmt = conn
        .prepare("SELECT id, name, code, progress, hours, streak, next_step, created_at FROM roadmaps ORDER BY created_at DESC LIMIT ?1 OFFSET ?2")
        .map_err(|e| e.to_string())?;

    let roadmaps: Vec<Roadmap> = roadmap_stmt
        .query_map([per_page, offset], |row| {
            Ok(Roadmap {
                id: row.get(0)?,
                name: row.get(1)?,
                code: row.get(2)?,
                progress: row.get(3)?,
                hours: row.get(4)?,
                streak: row.get(5)?,
                next_step: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for roadmap in roadmaps {
        let mut step_stmt = conn
            .prepare("SELECT id, roadmap_id, title, status, mastery, sort_order FROM roadmap_steps WHERE roadmap_id = ?1 ORDER BY sort_order")
            .map_err(|e| e.to_string())?;

        let steps: Vec<RoadmapStep> = step_stmt
            .query_map([&roadmap.id], |row| {
                Ok(RoadmapStep {
                    id: row.get(0)?,
                    roadmap_id: row.get(1)?,
                    title: row.get(2)?,
                    status: row.get(3)?,
                    mastery: row.get(4)?,
                    sort_order: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        items.push(RoadmapWithSteps { roadmap, steps });
    }

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
pub fn create_roadmap(db: State<'_, Database>, payload: CreateRoadmapPayload) -> Result<RoadmapWithSteps, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let code = payload.code.unwrap_or_else(|| format!("MAP{}", &id[..3]));
    let next_step = payload.steps.first().map(|s| s.title.clone());

    conn.execute(
        "INSERT INTO roadmaps (id, name, code, progress, hours, streak, next_step) VALUES (?1, ?2, ?3, 0, 0, 0, ?4)",
        rusqlite::params![id, payload.name, code, next_step],
    )
    .map_err(|e| e.to_string())?;

    let mut steps = Vec::new();
    for (i, step) in payload.steps.iter().enumerate() {
        let step_id = Uuid::new_v4().to_string();
        let status = step.status.as_deref().unwrap_or(if i == 0 { "active" } else { "locked" });
        let mastery = step.mastery.unwrap_or(0);

        conn.execute(
            "INSERT INTO roadmap_steps (id, roadmap_id, title, status, mastery, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![step_id, id, step.title, status, mastery, i as i64],
        )
        .map_err(|e| e.to_string())?;

        steps.push(RoadmapStep {
            id: step_id,
            roadmap_id: id.clone(),
            title: step.title.clone(),
            status: status.to_string(),
            mastery,
            sort_order: i as i64,
        });
    }

    let roadmap = Roadmap {
        id,
        name: payload.name,
        code,
        progress: 0,
        hours: 0.0,
        streak: 0,
        next_step,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    Ok(RoadmapWithSteps { roadmap, steps })
}

#[tauri::command]
pub fn add_roadmap_step(db: State<'_, Database>, payload: AddStepPayload) -> Result<RoadmapStep, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let step_id = Uuid::new_v4().to_string();

    // Find the max sort_order
    let max_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM roadmap_steps WHERE roadmap_id = ?1",
            [&payload.roadmap_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let sort_order = max_order + 1;

    conn.execute(
        "INSERT INTO roadmap_steps (id, roadmap_id, title, status, mastery, sort_order) VALUES (?1, ?2, ?3, 'locked', 0, ?4)",
        rusqlite::params![step_id, payload.roadmap_id, payload.title, sort_order],
    )
    .map_err(|e| e.to_string())?;

    Ok(RoadmapStep {
        id: step_id,
        roadmap_id: payload.roadmap_id,
        title: payload.title,
        status: "locked".into(),
        mastery: 0,
        sort_order,
    })
}

#[tauri::command]
pub fn delete_roadmap(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM roadmap_steps WHERE roadmap_id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM roadmaps WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_all_roadmaps(db: State<'_, Database>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM roadmap_steps", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM roadmaps", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}
