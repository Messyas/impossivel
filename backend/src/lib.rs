mod commands;
mod crypto;
mod db;
mod mcp;
mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = db::init_database().expect("Failed to initialize database");
    let mcp_database = database.clone();

    tauri::Builder::default()
        .manage(database)
        .manage(mcp::McpRuntime::default())
        .setup(move |app| {
            mcp::start(app.handle().clone(), mcp_database);
            Ok(())
        })
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
            commands::roadmaps::update_roadmap,
            commands::roadmaps::update_step_progress,
            commands::roadmaps::get_review_occurrences,
            commands::roadmaps::update_review_progress,
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
            commands::knowledge::list_maps,
            commands::knowledge::create_knowledge_map,
            commands::knowledge::rename_knowledge_map,
            commands::knowledge::delete_knowledge_map,
            commands::knowledge::get_knowledge_map,
            commands::knowledge::save_knowledge_map,
            commands::knowledge::search_knowledge_steps,
            commands::knowledge::list_knowledge_roadmaps,
            mcp::get_agent_settings,
            mcp::set_agent_enabled,
            mcp::set_agent_port,
            mcp::generate_agent_token,
            mcp::revoke_agent_token,
            mcp::list_agent_tokens,
            mcp::get_agent_history,
            mcp::get_pending_deletions,
            mcp::resolve_pending_deletion,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Study/OS");
}
