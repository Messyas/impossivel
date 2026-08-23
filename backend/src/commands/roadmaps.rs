use chrono::{Duration, Utc};
use rusqlite::{params, Transaction};
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::models::{
    AddStepPayload, CreateRoadmapPayload, PaginatedResponse, PaginationQueryPayload,
    ReviewOccurrence, Roadmap, RoadmapStep, RoadmapWithSteps, UpdateReviewProgressPayload,
    UpdateRoadmapPayload, UpdateStepProgressPayload,
};

fn parse_strings(value: String) -> Vec<String> { serde_json::from_str(&value).unwrap_or_default() }
fn parse_bools(value: String) -> Vec<bool> { serde_json::from_str(&value).unwrap_or_default() }
fn parse_intervals(value: String) -> Vec<i64> { serde_json::from_str(&value).unwrap_or_else(|_| vec![0, 1, 3, 7]) }

fn sync_roadmap_summary(tx: &Transaction<'_>, roadmap_id: &str) -> Result<(), String> {
    let (total, done, focus_seconds): (i64, i64, i64) = tx.query_row(
            "SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0), COALESCE(SUM(focus_seconds), 0) FROM roadmap_steps WHERE roadmap_id = ?1",
        [roadmap_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|e| e.to_string())?;
    let progress = if total == 0 { 0 } else { done * 100 / total };
    let next_step: Option<String> = tx.query_row(
        "SELECT title FROM roadmap_steps WHERE roadmap_id = ?1 AND status != 'done' ORDER BY sort_order LIMIT 1",
        [roadmap_id], |row| row.get(0),
    ).ok();
    tx.execute("UPDATE roadmaps SET progress = ?1, hours = ?2, next_step = ?3 WHERE id = ?4", params![progress, focus_seconds as f64 / 3600.0, next_step, roadmap_id]).map_err(|e| e.to_string())?;
    Ok(())
}

fn generate_reviews(tx: &Transaction<'_>, roadmap_id: &str, step_id: &str) -> Result<(), String> {
    let intervals_json: String = tx.query_row("SELECT review_intervals FROM roadmaps WHERE id = ?1", [roadmap_id], |row| row.get(0)).map_err(|e| e.to_string())?;
    let base_date = chrono::Local::now().date_naive();
    let checklist_json: String = tx.query_row("SELECT checklist FROM roadmap_steps WHERE id = ?1", [step_id], |row| row.get(0)).map_err(|e| e.to_string())?;
    let empty_checklist = serde_json::to_string(&vec![false; parse_strings(checklist_json).len()]).map_err(|e| e.to_string())?;
    for interval in parse_intervals(intervals_json) {
        let due_date = (base_date + Duration::days(interval.max(0))).format("%Y-%m-%d").to_string();
        tx.execute(
            "INSERT OR IGNORE INTO review_occurrences (id, roadmap_id, step_id, interval_days, due_date, checklist_state) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![Uuid::new_v4().to_string(), roadmap_id, step_id, interval, due_date, empty_checklist],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_roadmaps(db: State<'_, Database>, query: Option<PaginationQueryPayload>) -> Result<PaginatedResponse<RoadmapWithSteps>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let per_page = query.as_ref().and_then(|q| q.per_page).unwrap_or(10).max(1);
    let page = query.as_ref().and_then(|q| q.page).unwrap_or(1).max(1);
    let total_count: i64 = conn.query_row("SELECT COUNT(*) FROM roadmaps", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    let total_pages = if total_count > 0 { (total_count + per_page - 1) / per_page } else { 1 };
    let offset = (page - 1) * per_page;
    let mut roadmap_stmt = conn.prepare("SELECT id, name, code, progress, hours, streak, next_step, created_at, review_intervals FROM roadmaps ORDER BY created_at DESC LIMIT ?1 OFFSET ?2").map_err(|e| e.to_string())?;
    let roadmaps = roadmap_stmt.query_map([per_page, offset], |row| Ok(Roadmap {
        id: row.get(0)?, name: row.get(1)?, code: row.get(2)?, progress: row.get(3)?, hours: row.get(4)?, streak: row.get(5)?, next_step: row.get(6)?, created_at: row.get(7)?, review_intervals: parse_intervals(row.get(8)?),
    })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for roadmap in roadmaps {
        let mut step_stmt = conn.prepare("SELECT id, roadmap_id, title, status, mastery, sort_order, description, checklist, checklist_state, focus_seconds, timer_remaining, completed_at FROM roadmap_steps WHERE roadmap_id = ?1 ORDER BY sort_order").map_err(|e| e.to_string())?;
        let steps = step_stmt.query_map([&roadmap.id], |row| Ok(RoadmapStep {
            id: row.get(0)?, roadmap_id: row.get(1)?, title: row.get(2)?, status: row.get(3)?, mastery: row.get(4)?, sort_order: row.get(5)?, description: row.get(6)?, checklist: parse_strings(row.get(7)?), checklist_state: parse_bools(row.get(8)?), focus_seconds: row.get(9)?, timer_remaining: row.get(10)?, completed_at: row.get(11)?,
        })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        items.push(RoadmapWithSteps { roadmap, steps });
    }
    Ok(PaginatedResponse { items, next_cursor: None, prev_cursor: None, has_more: page < total_pages, total_count, page, total_pages, per_page })
}

#[tauri::command]
pub fn create_roadmap(db: State<'_, Database>, payload: CreateRoadmapPayload) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let code = payload.code.unwrap_or_else(|| format!("MAP{}", &id[..3]));
    let next_step = payload.steps.first().map(|step| step.title.clone());
    let intervals = serde_json::to_string(&payload.review_intervals.unwrap_or_else(|| vec![0, 1, 3, 7])).map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO roadmaps (id, name, code, progress, hours, streak, next_step, review_intervals) VALUES (?1, ?2, ?3, 0, 0, 0, ?4, ?5)", params![id, payload.name, code, next_step, intervals]).map_err(|e| e.to_string())?;
    for (index, step) in payload.steps.iter().enumerate() {
        let step_id = Uuid::new_v4().to_string();
        let status = step.status.as_deref().unwrap_or(if index == 0 { "available" } else { "locked" });
        let checklist = step.checklist.clone().unwrap_or_else(|| vec!["Compreender os conceitos fundamentais".into()]);
        let checklist_state = step.checklist_state.clone().unwrap_or_else(|| vec![false; checklist.len()]);
        tx.execute(
            "INSERT INTO roadmap_steps (id, roadmap_id, title, status, mastery, sort_order, description, checklist, checklist_state, focus_seconds, timer_remaining, completed_at) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![step_id, id, step.title, status, index as i64, step.description.clone().unwrap_or_default(), serde_json::to_string(&checklist).unwrap(), serde_json::to_string(&checklist_state).unwrap(), step.focus_seconds.unwrap_or(0), step.timer_remaining.unwrap_or(1500), step.completed_at],
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_roadmap(db: State<'_, Database>, payload: UpdateRoadmapPayload) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let intervals = serde_json::to_string(&payload.review_intervals.unwrap_or_else(|| vec![0, 1, 3, 7])).map_err(|e| e.to_string())?;
    tx.execute("UPDATE roadmaps SET name = ?1, code = ?2, review_intervals = ?3 WHERE id = ?4", params![payload.name, payload.code, intervals, payload.id]).map_err(|e| e.to_string())?;
    let existing_ids: Vec<String> = {
        let mut stmt = tx.prepare("SELECT id FROM roadmap_steps WHERE roadmap_id = ?1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([&payload.id], |row| row.get(0)).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };
    let mut kept_ids = Vec::new();
    for (index, step) in payload.steps.iter().enumerate() {
        let checklist = step.checklist.clone().unwrap_or_else(|| vec!["Compreender os conceitos fundamentais".into()]);
        let checklist_state = step.checklist_state.clone().unwrap_or_else(|| vec![false; checklist.len()]);
        if let Some(step_id) = step.id.as_ref().filter(|id| existing_ids.contains(id)) {
            kept_ids.push(step_id.clone());
            tx.execute("UPDATE roadmap_steps SET title = ?1, description = ?2, checklist = ?3, checklist_state = ?4, sort_order = ?5 WHERE id = ?6 AND roadmap_id = ?7", params![step.title, step.description.clone().unwrap_or_default(), serde_json::to_string(&checklist).unwrap(), serde_json::to_string(&checklist_state).unwrap(), index as i64, step_id, payload.id]).map_err(|e| e.to_string())?;
        } else {
            let step_id = Uuid::new_v4().to_string();
            kept_ids.push(step_id.clone());
            let status = if index == 0 && existing_ids.is_empty() { "available" } else { "locked" };
            tx.execute("INSERT INTO roadmap_steps (id, roadmap_id, title, status, mastery, sort_order, description, checklist, checklist_state, timer_remaining) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8, 1500)", params![step_id, payload.id, step.title, status, index as i64, step.description.clone().unwrap_or_default(), serde_json::to_string(&checklist).unwrap(), serde_json::to_string(&checklist_state).unwrap()]).map_err(|e| e.to_string())?;
        }
    }
    for existing_id in existing_ids {
        if !kept_ids.contains(&existing_id) { tx.execute("DELETE FROM roadmap_steps WHERE id = ?1", [existing_id]).map_err(|e| e.to_string())?; }
    }
    sync_roadmap_summary(&tx, &payload.id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_step_progress(db: State<'_, Database>, payload: UpdateStepProgressPayload) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let (roadmap_id, sort_order): (String, i64) = tx.query_row("SELECT roadmap_id, sort_order FROM roadmap_steps WHERE id = ?1", [&payload.step_id], |row| Ok((row.get(0)?, row.get(1)?))).map_err(|e| e.to_string())?;
    let completed_at = if payload.status == "done" { Some(Utc::now().to_rfc3339()) } else { None };
    tx.execute("UPDATE roadmap_steps SET status = ?1, checklist_state = ?2, focus_seconds = ?3, timer_remaining = ?4, completed_at = COALESCE(?5, completed_at) WHERE id = ?6", params![payload.status, serde_json::to_string(&payload.checklist_state).unwrap(), payload.focus_seconds, payload.timer_remaining, completed_at, payload.step_id]).map_err(|e| e.to_string())?;
    if payload.status == "done" {
        tx.execute("UPDATE roadmap_steps SET status = 'available' WHERE roadmap_id = ?1 AND sort_order = ?2 AND status = 'locked'", params![roadmap_id, sort_order + 1]).map_err(|e| e.to_string())?;
        generate_reviews(&tx, &roadmap_id, &payload.step_id)?;
    }
    sync_roadmap_summary(&tx, &roadmap_id)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_review_occurrences(db: State<'_, Database>) -> Result<Vec<ReviewOccurrence>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT ro.id, ro.roadmap_id, r.name, ro.step_id, rs.title, ro.interval_days, ro.due_date, ro.status, rs.checklist, ro.checklist_state, ro.focus_seconds, ro.timer_remaining, ro.completed_at FROM review_occurrences ro JOIN roadmaps r ON r.id = ro.roadmap_id JOIN roadmap_steps rs ON rs.id = ro.step_id ORDER BY CASE WHEN ro.status = 'done' THEN 1 ELSE 0 END, ro.due_date, r.name, rs.sort_order").map_err(|e| e.to_string())?;
    let reviews = stmt.query_map([], |row| Ok(ReviewOccurrence { id: row.get(0)?, roadmap_id: row.get(1)?, roadmap_name: row.get(2)?, step_id: row.get(3)?, step_title: row.get(4)?, interval_days: row.get(5)?, due_date: row.get(6)?, status: row.get(7)?, checklist: parse_strings(row.get(8)?), checklist_state: parse_bools(row.get(9)?), focus_seconds: row.get(10)?, timer_remaining: row.get(11)?, completed_at: row.get(12)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(reviews)
}

#[tauri::command]
pub fn update_review_progress(db: State<'_, Database>, payload: UpdateReviewProgressPayload) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let completed_at = if payload.status == "done" { Some(Utc::now().to_rfc3339()) } else { None };
    conn.execute("UPDATE review_occurrences SET status = ?1, checklist_state = ?2, focus_seconds = ?3, timer_remaining = ?4, completed_at = ?5 WHERE id = ?6", params![payload.status, serde_json::to_string(&payload.checklist_state).unwrap(), payload.focus_seconds, payload.timer_remaining, completed_at, payload.review_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_roadmap_step(db: State<'_, Database>, payload: AddStepPayload) -> Result<RoadmapStep, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let step_id = Uuid::new_v4().to_string();
    let sort_order: i64 = conn.query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM roadmap_steps WHERE roadmap_id = ?1", [&payload.roadmap_id], |row| row.get(0)).map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO roadmap_steps (id, roadmap_id, title, status, mastery, sort_order) VALUES (?1, ?2, ?3, 'locked', 0, ?4)", params![step_id, payload.roadmap_id, payload.title, sort_order]).map_err(|e| e.to_string())?;
    Ok(RoadmapStep { id: step_id, roadmap_id: payload.roadmap_id, title: payload.title, status: "locked".into(), mastery: 0, sort_order, description: String::new(), checklist: vec!["Compreender os conceitos fundamentais".into()], checklist_state: vec![false], focus_seconds: 0, timer_remaining: 1500, completed_at: None })
}

#[tauri::command]
pub fn delete_roadmap(db: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM roadmaps WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_all_roadmaps(db: State<'_, Database>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM roadmaps", []).map_err(|e| e.to_string())?;
    Ok(())
}
