use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use serde::Deserialize;
use tauri::{command, AppHandle, Manager};

use crate::ama_ffi::{ensure_init, suggest, AmaError, Suggestion};

// Embed config.json at compile time so we don't depend on bundle.resources
// path resolution at runtime. On Android, app.path().resource_dir() returns
// an `asset://localhost/...` virtual URI that ama's C++ fopen cannot read.
// Writing a real file under app_local_data_dir keeps a single uniform path
// across desktop and mobile.
const AMA_CONFIG_BYTES: &[u8] = include_bytes!("../vendor/ama/config.json");

static CONFIG_PATH: OnceLock<PathBuf> = OnceLock::new();
static CONFIG_PATH_INIT: Mutex<()> = Mutex::new(());

fn ensure_config_extracted(app: &AppHandle) -> Result<&'static PathBuf, String> {
    if let Some(p) = CONFIG_PATH.get() {
        return Ok(p);
    }
    // Serialize cold-start extraction so a second concurrent ama_suggest
    // doesn't observe a half-written config file or race the temp-rename.
    let _guard = CONFIG_PATH_INIT
        .lock()
        .map_err(|_| "CONFIG_PATH_INIT poisoned".to_string())?;
    if let Some(p) = CONFIG_PATH.get() {
        return Ok(p);
    }
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("app_local_data_dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all: {e}"))?;
    let path = dir.join("ama-config.json");
    let needs_write = match fs::read(&path) {
        Ok(existing) => existing != AMA_CONFIG_BYTES,
        Err(_) => true,
    };
    if needs_write {
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, AMA_CONFIG_BYTES)
            .map_err(|e| format!("write {}: {e}", tmp.display()))?;
        fs::rename(&tmp, &path)
            .map_err(|e| format!("rename {} -> {}: {e}", tmp.display(), path.display()))?;
    }
    let _ = CONFIG_PATH.set(path);
    Ok(CONFIG_PATH.get().unwrap())
}

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
    let config_path = ensure_config_extracted(&app)?;

    ensure_init(&input.preset, config_path)
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
