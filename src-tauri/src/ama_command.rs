use serde::Deserialize;
use tauri::{command, AppHandle, Manager};

use crate::ama_ffi::{ensure_init, suggest, AmaError, Suggestion};

#[derive(Debug, Deserialize)]
pub struct SuggestInput {
    pub field: String,
    pub current: [String; 2],
    pub next1: [String; 2],
    pub next2: [String; 2],
}

#[command]
pub async fn ama_suggest(
    app: AppHandle,
    input: SuggestInput,
) -> Result<Suggestion, String> {
    // tauri.conf.json declares `vendor/ama/config.json` in bundle.resources, so
    // the bundler preserves that path under resource_dir() (e.g.
    // .app/Contents/Resources/vendor/ama/config.json). Don't strip the prefix —
    // earlier code used join("config.json") and silently failed init in production.
    let config_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir: {e}"))?
        .join("vendor/ama/config.json");

    ensure_init("build", &config_path)
        .map_err(|e| format!("{e} (config_path={})", config_path.display()))?;

    if input.field.len() != 78 {
        return Err("field must be exactly 78 chars".into());
    }
    if !input.field.is_ascii() {
        return Err("field must be ASCII".into());
    }

    let mut field = [0u8; 78];
    field.copy_from_slice(input.field.as_bytes());

    fn first_byte(s: &str) -> Result<u8, String> {
        s.as_bytes().first().copied().ok_or_else(|| "empty pair char".into())
    }

    let cur = (first_byte(&input.current[0])?, first_byte(&input.current[1])?);
    let n1  = (first_byte(&input.next1[0])?,   first_byte(&input.next1[1])?);
    let n2  = (first_byte(&input.next2[0])?,   first_byte(&input.next2[1])?);

    let result = tokio::task::spawn_blocking(move || suggest(&field, cur, n1, n2))
        .await
        .map_err(|e| format!("join: {e}"))?
        .map_err(|e: AmaError| e.to_string())?;

    Ok(result)
}
