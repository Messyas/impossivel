use serde::{Deserialize, Serialize};

// ── Generic Pagination Models ──────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedResponse<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<String>,
    pub prev_cursor: Option<String>,
    pub has_more: bool,
    pub total_count: i64,
    pub page: i64,
    pub total_pages: i64,
    pub per_page: i64,
}

#[derive(Debug, Deserialize, Default)]
pub struct PaginationQueryPayload {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub cursor: Option<String>,
}

// ── Tasks ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub group_name: String,
    pub subject: String,
    pub duration: i64,
    pub priority: String,
    pub done: bool,
    pub due: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTaskPayload {
    pub title: String,
    pub group_name: Option<String>,
    pub subject: Option<String>,
    pub duration: Option<i64>,
    pub priority: Option<String>,
    pub due: Option<String>,
}

// ── Roadmaps ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Roadmap {
    pub id: String,
    pub name: String,
    pub code: String,
    pub progress: i64,
    pub hours: f64,
    pub streak: i64,
    pub next_step: Option<String>,
    pub review_intervals: Vec<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoadmapStep {
    pub id: String,
    pub roadmap_id: String,
    pub title: String,
    pub status: String,
    pub mastery: i64,
    pub sort_order: i64,
    pub description: String,
    pub checklist: Vec<String>,
    pub checklist_state: Vec<bool>,
    pub focus_seconds: i64,
    pub timer_remaining: i64,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoadmapWithSteps {
    #[serde(flatten)]
    pub roadmap: Roadmap,
    pub steps: Vec<RoadmapStep>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoadmapPayload {
    pub name: String,
    pub code: Option<String>,
    pub steps: Vec<CreateStepPayload>,
    pub review_intervals: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRoadmapPayload {
    pub id: String,
    pub name: String,
    pub code: String,
    pub steps: Vec<CreateStepPayload>,
    pub review_intervals: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateStepPayload {
    pub id: Option<String>,
    pub title: String,
    pub status: Option<String>,
    pub description: Option<String>,
    pub checklist: Option<Vec<String>>,
    pub checklist_state: Option<Vec<bool>>,
    pub focus_seconds: Option<i64>,
    pub timer_remaining: Option<i64>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddStepPayload {
    pub roadmap_id: String,
    pub title: String,
    #[allow(dead_code)]
    pub after_step_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewOccurrence {
    pub id: String,
    pub roadmap_id: String,
    pub roadmap_name: String,
    pub step_id: String,
    pub step_title: String,
    pub interval_days: i64,
    pub due_date: String,
    pub status: String,
    pub checklist: Vec<String>,
    pub checklist_state: Vec<bool>,
    pub focus_seconds: i64,
    pub timer_remaining: i64,
    pub completed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateStepProgressPayload {
    pub step_id: String,
    pub status: String,
    pub checklist_state: Vec<bool>,
    pub focus_seconds: i64,
    pub timer_remaining: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateReviewProgressPayload {
    pub review_id: String,
    pub status: String,
    pub checklist_state: Vec<bool>,
    pub focus_seconds: i64,
    pub timer_remaining: i64,
}

// ── Notes ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub category: String,
    pub link: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNotePayload {
    pub id: String,
    pub title: Option<String>,
    pub category: Option<String>,
    pub link: Option<String>,
    pub content: Option<String>,
}

// ── Accounts ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub service: String,
    pub label: String,
    pub email: String,
    pub username: Option<String>,
    pub purpose: String,
    pub status: String,
    pub free_tier: String,
    pub last_used: String,
    pub plan: String,
    pub in_use: bool,
    pub notes: Option<String>,
    pub tags: Vec<String>,
    pub credits: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credential {
    pub id: String,
    pub account_id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub cred_type: String,
    pub secret_masked: String,
    pub active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountWithCredentials {
    #[serde(flatten)]
    pub account: Account,
    pub credentials: Vec<Credential>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAccountPayload {
    pub id: Option<String>,
    pub service: String,
    pub label: String,
    pub email: String,
    pub username: Option<String>,
    pub purpose: Option<String>,
    pub status: Option<String>,
    pub free_tier: Option<String>,
    pub plan: Option<String>,
    pub in_use: Option<bool>,
    pub notes: Option<String>,
    pub tags: Option<Vec<String>>,
    pub credits: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddCredentialPayload {
    pub account_id: String,
    pub label: String,
    pub cred_type: Option<String>,
    pub secret: String,
}

// ── Preferences ────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferences {
    pub name: String,
    pub avatar: String,
    pub theme: String,
    pub font: String,
    pub locale: String,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            name: "Alex Morgan".into(),
            avatar: String::new(),
            theme: "system".into(),
            font: "geist".into(),
            locale: "pt-BR".into(),
        }
    }
}

// ── Focus Sessions ─────────────────────────────────────

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FocusSession {
    pub id: String,
    pub title: String,
    pub duration_seconds: i64,
    pub started_at: String,
    pub completed: bool,
}

#[derive(Debug, Deserialize)]
pub struct FocusSessionPayload {
    pub title: String,
    pub duration_seconds: i64,
    pub completed: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct FocusStats {
    pub total_hours: f64,
    pub sessions_completed: i64,
    pub daily: Vec<DailyFocus>,
}

#[derive(Debug, Serialize)]
pub struct DailyFocus {
    pub date: String,
    pub hours: f64,
}

// ── Pre-Calculated Dashboard Analytics ────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardAnalytics {
    pub focus_time_minutes: i64,
    pub completed_sessions: i64,
    pub execution_rate: i64,
    pub reviews_on_time: i64,
    pub daily_focus_json: String,
    pub subject_study_json: String,
    pub planned_vs_actual_json: String,
    pub updated_at: String,
}
