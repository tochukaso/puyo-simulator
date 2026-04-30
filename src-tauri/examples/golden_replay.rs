use app_lib::ama_ffi::{ensure_init, suggest};
use serde::Deserialize;
use std::env;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[derive(Deserialize)]
struct Expected {
    #[serde(rename = "axisCol")]
    axis_col: u8,
    rotation: u8,
}

#[derive(Deserialize)]
struct Row {
    field: Vec<String>,
    #[serde(rename = "currentAxis")]
    current_axis: String,
    #[serde(rename = "currentChild")]
    current_child: String,
    #[serde(rename = "next1Axis")]
    next1_axis: String,
    #[serde(rename = "next1Child")]
    next1_child: String,
    #[serde(rename = "next2Axis")]
    next2_axis: String,
    #[serde(rename = "next2Child")]
    next2_child: String,
    expected: Expected,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let jsonl_path = args.get(1).expect("usage: golden_replay <path.jsonl>");

    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let config = manifest.join("vendor/ama/config.json");
    ensure_init("build", &config).expect("init failed");

    let f = File::open(jsonl_path).expect("open jsonl");
    let reader = BufReader::new(f);

    let mut total = 0usize;
    let mut matched = 0usize;

    for line in reader.lines() {
        let line = line.expect("read");
        if line.trim().is_empty() {
            continue;
        }
        let row: Row = serde_json::from_str(&line).expect("parse");

        let mut field = [b'.'; 78];
        for (r, row_str) in row.field.iter().enumerate() {
            let bytes = row_str.as_bytes();
            for c in 0..6 {
                field[r * 6 + c] = bytes.get(c).copied().unwrap_or(b'.');
            }
        }

        let cur = (row.current_axis.as_bytes()[0], row.current_child.as_bytes()[0]);
        let n1  = (row.next1_axis.as_bytes()[0],   row.next1_child.as_bytes()[0]);
        let n2  = (row.next2_axis.as_bytes()[0],   row.next2_child.as_bytes()[0]);

        let result = suggest(&field, cur, n1, n2).expect("suggest");
        if result.axis_col == row.expected.axis_col && result.rotation == row.expected.rotation {
            matched += 1;
        }
        total += 1;
    }

    let rate = if total > 0 { matched as f64 / total as f64 } else { 0.0 };
    println!("total={total} matched={matched} match_rate={rate:.4}");
}
