mod commands;
mod crypto;
mod db;
mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = db::init_database().expect("Failed to initialize database");

    tauri::Builder::default()
        .manage(database)
        .invoke_handler(tauri::generate_handler![
            // Tasks
            commands::tasks::get_tasks,
            commands::tasks::create_task,
            commands::tasks::toggle_task,
            commands::tasks::delete_task,
            commands::tasks::clear_all_tasks,
            // Roadmaps
            commands::roadmaps::get_roadmaps,
            commands::roadmaps::create_roadmap,
            commands::roadmaps::add_roadmap_step,
            commands::roadmaps::delete_roadmap,
            commands::roadmaps::clear_all_roadmaps,
            // Notes
            commands::notes::get_notes,
            commands::notes::create_note,
            commands::notes::update_note,
            commands::notes::delete_note,
            commands::notes::clear_all_notes,
            // Accounts
            commands::accounts::get_accounts,
            commands::accounts::create_account,
            commands::accounts::archive_account,
            commands::accounts::delete_account,
            commands::accounts::clear_all_accounts,
            commands::accounts::toggle_account_use,
            commands::accounts::add_credential,
            commands::accounts::reveal_credential,
            commands::accounts::remove_credential,
            // Preferences
            commands::preferences::get_preferences,
            commands::preferences::update_preferences,
            commands::preferences::reset_preferences,
            // Focus
            commands::focus::log_focus_session,
            commands::focus::get_focus_stats,
            // Pre-calculated Dashboard Analytics
            commands::analytics::get_dashboard_analytics,
            commands::analytics::recalculate_dashboard_analytics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Study/OS");
}
