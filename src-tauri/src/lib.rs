pub mod ama_ffi;
mod ama_command;

#[tauri::command]
fn ping() -> i32 {
    42
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // tauri-plugin-dialog: native confirm/ask dialogs. Required because
    // WKWebView's window.confirm() is a silent no-op in Tauri 2 by default,
    // which breaks Reset / Resign / Edit-clear / Match→Edit transitions in
    // the bundled .app. Browser PWA still uses window.confirm.
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![ping, ama_command::ama_suggest])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
