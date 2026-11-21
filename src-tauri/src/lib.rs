pub mod agent_tools;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            agent_tools::agent_fs_read_file,
            agent_tools::agent_fs_write_file,
            agent_tools::agent_fs_move_path,
            agent_tools::agent_fs_delete_path,
            agent_tools::agent_fs_list_dir,
            agent_tools::agent_terminal_exec
        ])
        .run(tauri::generate_context())
        .expect("erro ao iniciar a aplicação tauri");
}
