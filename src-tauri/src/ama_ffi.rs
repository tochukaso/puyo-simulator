use std::ffi::CString;
use std::os::raw::{c_char, c_int};
use std::path::Path;
use std::sync::OnceLock;

use thiserror::Error;

unsafe extern "C" {
    fn ama_native_init_preset(preset: *const c_char, config_path: *const c_char) -> c_int;
    fn ama_native_suggest(
        field_chars: *const c_char,
        ca: c_char,
        cc: c_char,
        n1a: c_char,
        n1c: c_char,
        n2a: c_char,
        n2c: c_char,
        out: *mut u8,
    ) -> c_int;
}

#[derive(Debug, Error)]
pub enum AmaError {
    #[error("ama init failed: code {0}")]
    InitFailed(i32),
    #[error("ama suggest failed: code {0}")]
    SuggestFailed(i32),
    #[error("invalid input: {0}")]
    InvalidInput(&'static str),
}

// Use camelCase on the wire so the TS NativeSuggestion type can read fields
// directly (axisCol / expectedChain). The internal Rust names stay snake_case
// per Rust convention.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub axis_col: u8,
    pub rotation: u8,
    pub score: i32,
    pub expected_chain: u8,
}

static INIT_RESULT: OnceLock<Result<(), i32>> = OnceLock::new();

pub fn ensure_init(preset: &str, config_path: &Path) -> Result<(), AmaError> {
    let result = INIT_RESULT.get_or_init(|| {
        let preset_c = match CString::new(preset) {
            Ok(s) => s,
            Err(_) => return Err(-100),
        };
        let path_str = config_path.to_string_lossy();
        let path_c = match CString::new(path_str.as_bytes()) {
            Ok(s) => s,
            Err(_) => return Err(-101),
        };
        let ret = unsafe {
            ama_native_init_preset(preset_c.as_ptr(), path_c.as_ptr())
        };
        if ret == 0 { Ok(()) } else { Err(ret) }
    });
    match result {
        Ok(()) => Ok(()),
        Err(code) => Err(AmaError::InitFailed(*code)),
    }
}

pub fn suggest(
    field: &[u8; 78],
    cur: (u8, u8),
    n1: (u8, u8),
    n2: (u8, u8),
) -> Result<Suggestion, AmaError> {
    let mut out = [0u8; 8];
    let ret = unsafe {
        ama_native_suggest(
            field.as_ptr() as *const c_char,
            cur.0 as c_char, cur.1 as c_char,
            n1.0 as c_char,  n1.1 as c_char,
            n2.0 as c_char,  n2.1 as c_char,
            out.as_mut_ptr(),
        )
    };
    if ret < 0 {
        return Err(AmaError::SuggestFailed(ret));
    }
    let score = i32::from_le_bytes([out[2], out[3], out[4], out[5]]);
    Ok(Suggestion {
        axis_col: out[0],
        rotation: out[1],
        score,
        expected_chain: out[6],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn config_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("vendor/ama/config.json")
    }

    #[test]
    fn init_then_suggest_empty_field() {
        ensure_init("build", &config_path()).expect("init");

        let field = [b'.'; 78];
        let result = suggest(&field, (b'R', b'B'), (b'Y', b'P'), (b'R', b'Y'))
            .expect("suggest");

        assert!(result.axis_col < 6, "axis_col {} out of range", result.axis_col);
        assert!(result.rotation < 4, "rotation {} out of range", result.rotation);
    }

    #[test]
    fn double_init_idempotent() {
        ensure_init("build", &config_path()).expect("init 1");
        ensure_init("build", &config_path()).expect("init 2");
    }
}
