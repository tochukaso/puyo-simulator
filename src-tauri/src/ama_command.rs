use serde::Deserialize;
use tauri::{command, AppHandle, Manager};

use crate::ama_ffi::{ensure_init, suggest, AmaError, Suggestion};

#[derive(Debug, Deserialize)]
pub struct SuggestInput {
    /// Weight preset name (e.g. "build", "gtr", "kaidan"). Drives which
    /// shape-pattern set ama is biased toward — same surface as the WASM path.
    /// Default to "build" by serde if omitted.
    #[serde(default = "default_preset")]
    pub preset: String,
    pub field: String,
    pub current: [String; 2],
    pub next1: [String; 2],
    pub next2: [String; 2],
}

fn default_preset() -> String {
    "build".to_string()
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

    ensure_init(&input.preset, &config_path)
        .map_err(|e| format!("{e} (preset={}, config_path={})", input.preset, config_path.display()))?;

    if input.field.len() != 78 {
        return Err("field must be exactly 78 chars".into());
    }
    if !input.field.is_ascii() {
        return Err("field must be ASCII".into());
    }

    let mut field = [0u8; 78];
    field.copy_from_slice(input.field.as_bytes());

    // Each piece slot must be exactly one ASCII char from the puyo color set
    // (or '.' for empty). Reject silently-truncated multi-char strings, empty
    // strings, and non-color bytes before they reach C++ where the to_ama
    // mapping would just downgrade them to NONE.
    fn parse_piece_char(s: &str) -> Result<u8, String> {
        if s.len() != 1 || !s.is_ascii() {
            return Err(format!("piece char must be exactly 1 ASCII char, got {s:?}"));
        }
        let b = s.as_bytes()[0];
        match b {
            b'R' | b'G' | b'B' | b'Y' | b'P' | b'.' => Ok(b),
            _ => Err(format!("invalid piece char: {s:?}")),
        }
    }

    let cur = (parse_piece_char(&input.current[0])?, parse_piece_char(&input.current[1])?);
    let n1  = (parse_piece_char(&input.next1[0])?,   parse_piece_char(&input.next1[1])?);
    let n2  = (parse_piece_char(&input.next2[0])?,   parse_piece_char(&input.next2[1])?);

    let result = tokio::task::spawn_blocking(move || suggest(&field, cur, n1, n2))
        .await
        .map_err(|e| format!("join: {e}"))?
        .map_err(|e: AmaError| e.to_string())?;

    Ok(result)
}
