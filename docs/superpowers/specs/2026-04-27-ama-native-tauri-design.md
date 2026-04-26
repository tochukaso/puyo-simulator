# ama ネイティブ高速化(Tauri 2 + Rust FFI)設計仕様

**作成日**: 2026-04-27
**ブランチ**: 未作成(plan で確定)
**前提**: Phase C(`ama (WASM)`)完了済、`public/wasm/ama.wasm` を本番投入中

## 1. ゴール と スコープ

### 1.1 ゴール

`ama` の **強さを 100% 維持したまま**(beam width=250 / depth=16、preset=`build`)、Intel Mac と Android で **1 手 suggestion レイテンシ < 500ms** を達成する。既存 PWA 経路 `ama (WASM)` は維持し、ネイティブアプリ経路を **新規追加**(置き換えではない)。

### 1.2 受け入れ基準

| 指標 | 目標 | gating |
| --- | --- | --- |
| Intel Mac (Tauri) p99 1 手レイテンシ | < 400ms | < 500ms |
| Apple Silicon Mac (Tauri) p99 | < 300ms | < 500ms |
| Android arm64 中位機 (Tauri) p99 | < 700ms | < 800ms |
| ama-native CLI vs Tauri Native 同手率(x86_64) | 100% | 100% |
| ama-native CLI vs Tauri Native 同手率(arm64 sse2neon) | ≥ 99% | ≥ 95% |
| ama-wasm vs ama-native B/A ratio (eval) | 0.98 - 1.02 | 0.95 - 1.05 |

### 1.3 スコープ

**含む**
- Tauri 2 アプリ:macOS Universal(Intel + Apple Silicon)+ Android arm64
- ama の C++ をネイティブビルド(`tools/native_api.cpp` 追加、`tools/sse2neon.h` で arm64 NEON 対応)、静的ライブラリ `libama_native.a` 出力
- Rust 側 FFI ラッパー(`unsafe extern "C"` 直叩き、cxx 不採用)
- TS 側 `NativeAmaAI` 実装、Tauri 環境のみ Header セレクタに表示
- Web ① 最適化(限定スコープ:wasm-simd128 確認、preload、Worker 常駐化のみ)
- ライセンス自動収集 CI 整備

**含まない**
- iOS 対応(将来 Phase)
- Windows / Linux ネイティブ
- マルチスレッド WASM(SAB + COOP/COEP)…工数大、リターン中、Tauri 案内で代替
- Rust 全書き換え
- アルゴリズム差し替え、サーバ推論
- ama 上流の本体改造(`tools/` 追加と `core/def.h` の PEXT ガード追加のみ)

### 1.4 確定済み判断(brainstorming Q&A 抜粋)

| Q | 決定 | 理由 |
| --- | --- | --- |
| Q1 速度目標 | 1 手 < 500ms(Intel Mac + Android) | UX 上の体感閾値 |
| Q2 強さ | 100% 維持(beam パラメータ据え置き) | ユーザー要求 |
| Q3 配布形態 | Web ① + ネイティブアプリ化 | PWA は保険、本命はアプリ |
| Q4 フレームワーク | Tauri 2 + Rust FFI(手書き extern "C") | macOS/Android コード共有率最大、依存最小 |
| Q5 ライブラリリンク | 静的(.a) | 配布が単純、性能同等 |
| Q6 SIMD 戦略 | sse2neon.h で arm64 統一 | Apple Silicon と Android で共通基盤 |
| Q7 Worker | Native 経路は Worker 経由しない | Worker → invoke の互換性懸念回避 |
| Q8 cxx クレート | 不採用、手書き extern "C" | 構造体共有不要、ビルド設定が単純 |
| Q9 Web ① の範囲 | preload + Worker 常駐化のみ | マルチスレッド WASM は ROI 悪 |

## 2. アーキテクチャ全景

```
┌────────────────────────────────────────────────────────────────────┐
│ ama リポ (/Users/yasumitsuomori/git/ama, MIT)                      │
│  + tools/native_api.cpp     (新規) extern "C" 関数 1 個            │
│  + tools/sse2neon.h         (新規) SSE→NEON 変換ヘッダ(MIT)       │
│  + makefile target: native  (新規) 静的ライブラリ生成              │
│      x86_64-apple-darwin / aarch64-apple-darwin / aarch64-linux-android │
└─────────────────────┬──────────────────────────────────────────────┘
                      │ make native (各ターゲット)
                      ▼
              libama_native.a (3 ターゲット分)

┌────────────────────────────────────────────────────────────────────┐
│ puyo-simulator                                                     │
│                                                                    │
│  src-tauri/                  (新規) Tauri 2 プロジェクト           │
│   ├ Cargo.toml               tauri 依存のみ(cxx 不要)             │
│   ├ tauri.conf.json          macOS + Android 設定                  │
│   ├ build.rs                 静的ライブラリの link search 設定      │
│   ├ vendor/ama/              4 ターゲットの .a + config.json       │
│   └ src/                                                           │
│      ├ main.rs / lib.rs      Tauri エントリ + command 登録         │
│      ├ ama_ffi.rs            unsafe extern "C" + safe ラッパー     │
│      └ ama_command.rs        Tauri command(spawn_blocking)        │
│                                                                    │
│  src/ai/native-ama/          (新規)                                │
│   ├ native-ama-ai.ts         NativeAmaAI(PuyoAI 準拠)              │
│   └ tauri-bridge.ts          invoke ラッパー + isTauri() 判定      │
│                                                                    │
│  src/ai/types.ts             (修正) AiKind に 'ama-native' 追加    │
│  src/ai/index.ts             (修正) Native 経路は Worker 経由しない│
│  src/ai/worker/ai.worker.ts  (現状維持) heuristic / ml / wasm のみ │
│  src/ui/components/Header    (修正) isTauri() 環境のみ ama-native  │
│                                                                    │
│  scripts/build-ama-native.sh (新規) make native + Android NDK      │
│  scripts/collect-licenses.sh (新規) npm + cargo の license 収集    │
│  third-party/                (新規) 集約された LICENSE/NOTICE      │
└────────────────────────────────────────────────────────────────────┘
```

### 2.1 データフロー(1 手 suggestion / Native 経路)

1. UI が `useAiSuggestion` を購読 → `kind === 'ama-native'` を検出
2. **Worker を経由せず main thread から直接** `invoke('ama_suggest', { input: { field, current, next1, next2 }})`
3. Rust 側 `ama_command::ama_suggest` が `tokio::task::spawn_blocking` で C++ ama を呼ぶ(UI 非ブロック)
4. C++ `ama_native_suggest()` が `Field` 復元 → `beam::search_multi` → 最良候補を返す
5. Rust が結果を構造体で TS に返す(`{ axisCol, rotation, score, expectedChain }`)
6. UI overlay 表示

### 2.2 データフロー(現状の Web 経路、変更なし)

Tauri 環境以外では `WasmAmaAI` を使う既存パスを維持。`tauri-bridge.ts` の `isTauri()` で `window.__TAURI_INTERNALS__` の有無を判定。

### 2.3 採用した設計判断(再掲)

- **同一プロセス FFI**:sidecar 子プロセス案不採用。JSON シリアライズ + パイプ I/O のオーバーヘッド(数十 ms)を避ける
- **静的リンク**:動的(.dylib / .so)は rpath / jniLibs 配置が複雑。本件は単一バイナリで十分
- **手書き extern "C"**:cxx クレートは構造体共有が売りだが本件不要、ビルド設定単純化
- **Native 経路 Worker 非経由**:Web Worker からの Tauri invoke は互換性未確認。main thread + spawn_blocking で UI ブロック回避

## 3. ama 側の追加(C++)

### 3.1 `tools/native_api.cpp`(新規)

`tools/wasm_api.cpp` の双子。Emscripten 系 include を外し、`EMSCRIPTEN_KEEPALIVE` を `__attribute__((visibility("default")))` に置換しただけ。`ama_native_init_preset(preset, config_path)` と `ama_native_suggest(field, ca, cc, n1a, n1c, n2a, n2c, out)` の 2 関数を export。

```cpp
#define API_EXPORT __attribute__((visibility("default")))

extern "C" {

API_EXPORT
int ama_native_init_preset(const char* preset_name, const char* config_path) {
    std::ifstream f(config_path);
    if (!f.good()) return -1;
    nlohmann::json js; f >> js;
    if (!js.contains(preset_name)) return -2;
    from_json(js[preset_name], g_weight);
    g_inited = true;
    return 0;
}

API_EXPORT
int ama_native_suggest(
    const char* field_chars,
    char ca, char cc, char n1a, char n1c, char n2a, char n2c,
    uint8_t* out
) {
    // wasm_api.cpp の ama_suggest と同等内容を流用
    // out レイアウト: [axisCol, rotation, score(int32 LE), expectedChain, _]
}

}
```

### 3.2 `tools/sse2neon.h`(新規)

[DLTcollab/sse2neon](https://github.com/DLTcollab/sse2neon)(MIT)を 1 ファイル同梱。ama で使う SSE intrinsic(`_mm_load_si128` `_mm_and_si128` `_mm_test_all_zeros` `_mm_testz_si128` 等)はすべてカバー。`_pext_u32` だけ NEON 等価がないので `core/def.h` を `#ifdef PEXT` ガード(WASM ビルド時に当てた patch がそのまま流用可能)。

ライセンス: `LICENSES/sse2neon-MIT.txt` 同梱。

### 3.3 `makefile` の native target

```makefile
NATIVE_CXX = clang++
NATIVE_CXXFLAGS_BASE = -DNDEBUG -std=c++20 -O3 -flto -fvisibility=hidden \
                      -fPIC -DSSE2NEON_PRECISE_MINMAX

CXXFLAGS_X86_DARWIN  = -arch x86_64  -msse4.1 -mbmi2
CXXFLAGS_ARM_DARWIN  = -arch arm64   -include tools/sse2neon.h
CXXFLAGS_ARM_ANDROID = --target=aarch64-linux-android24 -include tools/sse2neon.h

native-x86-darwin:
	$(NATIVE_CXX) $(NATIVE_CXXFLAGS_BASE) $(CXXFLAGS_X86_DARWIN) \
		$(SRC_NATIVE) tools/native_api.cpp \
		-c -o bin/native/x86-darwin/ama_native.o
	ar rcs bin/native/x86-darwin/libama_native.a bin/native/x86-darwin/*.o

# native-arm-darwin / native-arm-android も同様に定義
```

`SRC_NATIVE` は WASM ビルドの `SRC_DUMP` と同じ(`core/*.cpp ai/*.cpp ai/search/*.cpp ai/search/beam/*.cpp`)。

### 3.4 ama upstream への変更最小化

- 既存コードに **触らない** のが原則
- 例外: `core/def.h` の `_pext_u32` を `#ifdef PEXT` でガード(WASM ビルドの既存 patch を再利用)
- `lib/nlohmann/json.hpp`(MIT)、`lib/rapidhash/rapidhash.h`(BSD-2-Clause)は既存依存をそのまま使う

## 4. Rust(Tauri 2)層

### 4.1 ディレクトリ構成

```
src-tauri/
├ Cargo.toml
├ tauri.conf.json
├ build.rs
├ vendor/ama/
│  ├ x86_64-apple-darwin/libama_native.a
│  ├ aarch64-apple-darwin/libama_native.a
│  ├ aarch64-linux-android/libama_native.a
│  └ config.json
├ src/
│  ├ main.rs
│  ├ lib.rs
│  ├ ama_ffi.rs            # unsafe extern "C" + safe ラッパー
│  ├ ama_command.rs        # Tauri command(async + spawn_blocking)
│  └ bin/golden_replay.rs  # ゴールデンファイル比較バイナリ(テスト用)
├ icons/
└ gen/android/             # tauri android init で生成、gitignore
```

### 4.2 `Cargo.toml`

```toml
[package]
name = "puyo-trainer-tauri"
version = "0.1.0"
edition = "2021"

[lib]
name = "puyo_trainer_tauri_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
strip = true
```

cxx は不採用、依存最小。

### 4.3 `build.rs`

```rust
use std::env;
use std::path::PathBuf;

fn main() {
    tauri_build::build();

    let target = env::var("TARGET").unwrap();
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let lib_dir = manifest.join("vendor/ama").join(&target);

    if !lib_dir.join("libama_native.a").exists() {
        panic!("missing libama_native.a for target {target} at {lib_dir:?}");
    }

    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=static=ama_native");
    println!("cargo:rustc-link-lib=c++");
    println!("cargo:rerun-if-changed=vendor/ama");
}
```

### 4.4 `src/ama_ffi.rs`

`unsafe extern "C"` 宣言と safe ラッパー。`OnceLock` で初期化を 1 回に制限。FFI 境界での raw pointer は最小化、`field: &[u8; 78]` でサイズ保証、`out` はスタック上の固定配列。

```rust
unsafe extern "C" {
    fn ama_native_init_preset(preset: *const c_char, config_path: *const c_char) -> c_int;
    fn ama_native_suggest(
        field_chars: *const c_char,
        ca: c_char, cc: c_char, n1a: c_char, n1c: c_char, n2a: c_char, n2c: c_char,
        out: *mut u8,
    ) -> c_int;
}

static INIT_RESULT: OnceLock<Result<(), i32>> = OnceLock::new();

pub fn ensure_init(preset: &str, config_path: &Path) -> Result<(), AmaError> { /* ... */ }

#[derive(Debug, Clone, serde::Serialize)]
pub struct Suggestion {
    pub axis_col: u8,
    pub rotation: u8,
    pub score: i32,
    pub expected_chain: u8,
}

pub fn suggest(
    field: &[u8; 78],
    cur: (u8, u8), n1: (u8, u8), n2: (u8, u8),
) -> Result<Suggestion, AmaError> { /* ... */ }
```

### 4.5 `src/ama_command.rs`

```rust
#[derive(Debug, Deserialize)]
pub struct SuggestInput {
    pub field: String,         // 78 chars
    pub current: [String; 2],
    pub next1: [String; 2],
    pub next2: [String; 2],
}

#[command]
pub async fn ama_suggest(
    app: AppHandle,
    input: SuggestInput,
) -> Result<Suggestion, String> {
    let config_path = app.path().resource_dir()
        .map_err(|e| e.to_string())?
        .join("config.json");

    ensure_init("build", &config_path).map_err(|e| e.to_string())?;

    // 入力検証 + 78 char バッファ構築
    let mut field = [0u8; 78];
    field.copy_from_slice(input.field.as_bytes());
    let cur = (input.current[0].as_bytes()[0], input.current[1].as_bytes()[0]);
    let n1  = (input.next1[0].as_bytes()[0],   input.next1[1].as_bytes()[0]);
    let n2  = (input.next2[0].as_bytes()[0],   input.next2[1].as_bytes()[0]);

    tokio::task::spawn_blocking(move || suggest(&field, cur, n1, n2))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e: AmaError| e.to_string())
}
```

### 4.6 `tauri.conf.json` の要点

```json
{
  "productName": "Puyo Trainer",
  "identifier": "com.example.puyotrainer",
  "build": {
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg", "apk", "aab"],
    "resources": ["vendor/ama/config.json", "../third-party/"]
  }
}
```

`productName` と `identifier` はリブランド時に bundle id を変えると Mac 側で別アプリ扱いになるため、**実装着手前に確定**。

## 5. TypeScript 統合層

### 5.1 ファイル配置

```
src/ai/native-ama/
├ tauri-bridge.ts           # invoke ラッパー + isTauri()
├ native-ama-ai.ts          # NativeAmaAI(PuyoAI 準拠)
└ __tests__/
   └ ama-native-golden.test.ts

src/ai/types.ts                  # AiKind に 'ama-native' 追加
src/ai/index.ts                  # AI ファクトリ(Native 経路は Worker 経由しない)
src/ui/components/Header/...     # isTauri() で ama-native option 出し分け
```

### 5.2 `tauri-bridge.ts`

```typescript
import { invoke as tauriInvoke } from '@tauri-apps/api/core';

export interface NativeSuggestion {
  axisCol: number;
  rotation: number;
  score: number;
  expectedChain: number;
}

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window;
}

export async function invokeAmaSuggest(
  input: NativeSuggestInput,
): Promise<NativeSuggestion> {
  return await tauriInvoke<NativeSuggestion>('ama_suggest', { input });
}
```

### 5.3 `native-ama-ai.ts`

```typescript
export class NativeAmaAI implements PuyoAI {
  readonly name = 'ama-native';
  readonly version = 'ama-native-build-v1';

  static isAvailable(): boolean {
    return isTauri();
  }

  async init(): Promise<void> { /* Rust 側 OnceLock で no-op */ }

  async suggest(state: GameState, topK: number): Promise<Move[]> {
    if (!state.current) return [];
    const result = await this.callSuggest(state);
    if (!result) return [];
    return [{
      axisCol: result.axisCol,
      rotation: result.rotation as Rotation,
      score: result.score | 0,
    }].slice(0, topK);
  }

  async suggestWithScores(state, _topK) { /* ... */ }
  private async callSuggest(state): Promise<NativeSuggestion | null> { /* ... */ }
  dispose(): void { /* Rust 側でプロセスライフタイム維持 */ }
}
```

### 5.4 `AiKind` 拡張

```typescript
export type AiKind =
  | 'heuristic'
  | 'ml-policy-ai'
  | 'ml-ama-v1'
  | 'ml-ama-v2-search'
  | 'ama-wasm'
  | 'ama-native';   // 追加
```

### 5.5 ファクトリと Worker の取扱い

Native 経路は **Worker を経由しない**。`getAi(kind)` で kind に応じて分岐:

```typescript
export async function getAi(kind: AiKind): Promise<PuyoAI> {
  if (kind === 'ama-native') {
    if (!NativeAmaAI.isAvailable()) {
      console.warn('[ai] ama-native unavailable, fallback to ama-wasm');
      return getAiViaWorker('ama-wasm');
    }
    return new NativeAmaAI();
  }
  return getAiViaWorker(kind);
}
```

`useAiSuggestion` の差分は最小化(分岐 1 箇所)。Native 経路は main thread から直接 `invoke`、Rust 側 `spawn_blocking` で UI ブロックを回避。

### 5.6 セレクタ UI

```tsx
{NativeAmaAI.isAvailable() && (
  <option value="ama-native">ama (Native) ⚡</option>
)}
```

Tauri アプリ起動時のデフォルトは `ama-native`。Web ブラウザでは選択肢自体出ない。

### 5.7 設定永続化と fallback

- `localStorage` の AI 選択は kind 文字列で保存
- Tauri アプリで `ama-native` を選んだ後 PWA に切り戻したら `isAvailable()` チェックで `ama-wasm` に自動 fallback
- `ama-native` の invoke 失敗時は overlay に toast 表示し kind を `ama-wasm` に切替、3 連続失敗で `ama-native` 再選択を一時無効化

## 6. Web ① 最適化(限定スコープ)

ネイティブが本命。Web ① は PWA 専用ユーザーへの保険として **最小限の介入**に留める。

### 6.1 採用 / 不採用

| 項目 | 採用 | 理由 |
| --- | --- | --- |
| wasm-simd128 真化の確認 | ✅ | 実測で `v128`/`f32x4`/`i32x4` opcode 出現を確認、ビルドフラグ精査 |
| WASM プリロード | ✅ | `index.html` の `<link rel="modulepreload">` + `<link rel="preload" as="fetch">` |
| Worker 常駐化レビュー | ✅ | 二重生成・dispose 漏れの軽微 fix |
| マルチスレッド WASM(SAB) | ❌ | COOP/COEP headers 必須、Cloudflare Workers 設定改修、ROI 悪 |
| WebGPU 化 | ❌ | アルゴリズム書き換え必須 |
| beam パラメータ縮小 | ❌ | 強さ 100% 維持(Q2)に違反 |

### 6.2 期待到達点(Intel Mac PWA)

- 現状: 1 手 1500〜3000ms(推定)
- ① 後: 1 手 800〜2000ms
- **PWA だけでは 500ms に届かない見込み**(設計の前提どおり、ネイティブアプリで吸収)

### 6.3 PR 分離方針

- ② Tauri アプリ化 とは **完全に別 PR**
- マージ順は ① → ② を推奨(リスク小→大)
- ① 投入後の実測で改善が不十分なら、別途「Phase 1.5: マルチスレッド WASM」を再ブレインストーミング(将来課題)

## 7. ビルド・配布・CI

### 7.1 npm scripts

```jsonc
{
  "scripts": {
    "build:ama-wasm": "bash scripts/build-ama-wasm.sh",            // 既存
    "build:ama-native": "bash scripts/build-ama-native.sh",        // 新規
    "build:ama-native:all": "bash scripts/build-ama-native.sh --all-targets",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:dev:android": "tauri android dev",
    "tauri:build": "tauri build",
    "tauri:build:android": "tauri android build"
  }
}
```

### 7.2 `scripts/build-ama-native.sh`

ホスト現用ターゲットのみ / 単一指定 / 全ターゲットの 3 モード。`AMA_REPO` 環境変数 + Android NDK は `ANDROID_NDK_HOME` を見る。生成された `.a` を `src-tauri/vendor/ama/<target>/` に配置、`config.json` も同階層へ。

### 7.3 git 管理

| パス | 管理 | 理由 |
| --- | --- | --- |
| `src-tauri/vendor/ama/*/libama_native.a` | commit | `public/wasm/*.wasm` と同じ哲学、再現性 + CI 簡素化 |
| `src-tauri/vendor/ama/config.json` | commit | プリセット重み |
| `src-tauri/gen/android/` | gitignore | Tauri 自動生成 |
| `src-tauri/target/` | gitignore | Cargo 成果物 |
| `.gitattributes` に `*.a binary` 追加 | — | diff 抑制 |

### 7.4 ライセンス自動収集

```bash
# scripts/collect-licenses.sh
npx license-checker --production --json --out third-party/npm-licenses.json
(cd src-tauri && cargo about generate about.hbs > ../third-party/rust-licenses.html)
cp LICENSES/ama-MIT.txt        third-party/
cp LICENSES/sse2neon-MIT.txt   third-party/
cp LICENSES/nlohmann-MIT.txt   third-party/
cp LICENSES/rapidhash-BSD2.txt third-party/
cp LICENSES/tauri-NOTICE.txt   third-party/    # Apache-2.0 NOTICE
cp LICENSES/tfjs-NOTICE.txt    third-party/    # Apache-2.0 NOTICE
```

`third-party/` を Web ビルドと Tauri ビルドの両方に同梱。About / README から「Open Source Licenses」リンクで参照させる。

### 7.5 CI(GitHub Actions)

`.github/workflows/ci.yml` に追加:

| job | 実行条件 | 内容 |
| --- | --- | --- |
| `web` | 全 PR(既存) | npm test / build / e2e |
| `tauri-macos` | `feature/tauri-*` + release tag | macOS Universal ビルド |
| `tauri-android` | `feature/tauri-*` + release tag | Android arm64 ビルド |
| `license-check` | 全 PR | license-checker(GPL/AGPL/LGPL を fail)、`cargo deny check licenses` |

### 7.6 Cloudflare Workers との関係

- Tauri アプリ追加後も **Cloudflare Workers + PWA は維持**
- Tauri アプリの WebView も同一 React アプリを `frontendDist: "../dist"` で読む
- COOP/COEP headers は Section 6 でマルチスレッド WASM 不採用としたため **追加不要**

### 7.7 配布形態

| 形態 | macOS | Android | コスト |
| --- | --- | --- | --- |
| **A. GitHub Releases**(自分用 / 限定) | 未署名 .app(右クリック→開く) | 未署名 .apk(設定で許可) | 0 円 |
| **B. 署名のみ**(限定配布) | Apple Developer ID 署名 .app | 自己署名 .apk | $99/年(Apple) |
| **C. ストア公開**(本格商用) | Mac App Store / Notarized .dmg | Google Play | $99/年 + $25 一回 + 審査 |

設計上 **A** をデフォルトに、商用化時に B/C へ移行可能な構造。

### 7.8 自動更新

Tauri 2 updater plugin は **将来的有効化**(現時点スコープ外)。当面は GitHub Releases から手動 DL。

## 8. テスト戦略

### 8.1 レイヤー全景

| # | レイヤー | 範囲 |
| --- | --- | --- |
| ① | C++ ユニット(ama 側) | 既存 `test/` を native ビルドでも実行、sse2neon 経由でも検証 |
| ② | Rust ユニット | `ama_ffi.rs` の `#[cfg(test)]` で `libama_native.a` を実呼び |
| ③ | Native ゴールデンファイル比較 | 既存 `ama_golden.jsonl` を Rust `golden_replay` バイナリで再生 |
| ④ | クロス経路比較(eval-ai) | ama-wasm vs ama-native の B/A ratio + 同手率 + レイテンシ |
| ⑤ | E2E(手動) | Tauri WebView 上で UI 動作確認、CI 自動化はスコープ外 |
| ⑥ | パフォーマンスベンチ | `bench-ama.ts` で実機計測、マイルストーンごとに記録 |

### 8.2 ゴールデンファイル gating

| ターゲット | gating | 理由 |
| --- | --- | --- |
| x86_64-apple-darwin | = 100% | SSE 直叩き、ama-native CLI と完全一致するはず |
| aarch64-apple-darwin | ≥ 99%(目標 100%) | sse2neon 経由、稀に rounding 差 |
| aarch64-linux-android | ≥ 99%(目標 100%) | 同上 |

### 8.3 パフォーマンスゲート

| 環境 | 経路 | 目標 p99 | gating p99 |
| --- | --- | --- | --- |
| Intel Mac (Tauri) | ama-native | < 400ms | < 500ms |
| Apple Silicon (Tauri) | ama-native | < 300ms | < 500ms |
| Android arm64 中位機 (Tauri) | ama-native | < 700ms | < 800ms |
| Intel Mac PWA | ama-wasm | (参考値) | gating なし |

`scripts/bench-ama.ts` で 100 局面の p50/p90/p99/max/mean を出力。CI では走らせず、マイルストーンごとに **手動実行**して `docs/superpowers/progress/` に記録。

### 8.4 ライセンス検証

- `npx license-checker --production --failOn 'GPL;AGPL;LGPL'`
- `cargo deny check licenses`(deny.toml で許可ライセンスのホワイトリスト)
- 全 PR の CI で実行

### 8.5 テスト追加対象

| ファイル | 追加 / 修正 |
| --- | --- |
| `src/ai/native-ama/__tests__/ama-native-golden.test.ts` | 新規 |
| `src-tauri/src/bin/golden_replay.rs` | 新規 |
| `src-tauri/src/ama_ffi.rs` の `#[cfg(test)]` | 新規 |
| `scripts/eval-ai.ts` | `ama-native` 種別追加 |
| `scripts/bench-ama.ts` | 新規 |
| `.github/workflows/ci.yml` | tauri-macos / tauri-android / license-check job 追加 |
| `e2e/tauri-manual-checklist.md` | 新規(手動確認手順)|
| `docs/superpowers/progress/` | ベンチ結果ログ |

## 9. ライセンスと商用配布

### 9.1 全コンポーネントのライセンス

| コンポーネント | ライセンス | 商用 | 同梱要件 |
| --- | --- | --- | --- |
| ama (citrus610/ama) | MIT | ✅ | コピーライト保持 |
| nlohmann/json(ama 内) | MIT | ✅ | 同上 |
| rapidhash(ama 内) | BSD 2-Clause | ✅ | 著作権表示 + 免責通知 |
| sse2neon(新規追加) | MIT | ✅ | コピーライト保持 |
| Tauri 2 | Apache-2.0 / MIT | ✅ | NOTICE 同梱 |
| Rust crates(tauri/tokio/serde/thiserror) | MIT / Apache-2.0 | ✅ | 通知保持 |
| React 19 / Zustand / Vite / vite-plugin-pwa | MIT | ✅ | 通知保持 |
| @tensorflow/tfjs | Apache-2.0 | ✅ | NOTICE 同梱 |

**GPL / AGPL / LGPL の混入なし**、クローズドソース配布も可能。

### 9.2 知的財産リスク(ソフトウェアライセンス外)

「ぷよぷよ」関連の名称・キャラクター・効果音・グラフィックは **SEGA(旧 Compile)の登録商標 / 著作権**。商用配布時のリスク:

| 項目 | リスク |
| --- | --- |
| ゲームルール(連鎖、4 つ消し) | ✅ なし(著作権の対象外)|
| 「ぷよぷよ」「Puyo」名称 | 🚨 **製品名・URL に使うと商標権侵害**の可能性 |
| キャラクター流用 | 🚨 一発アウト |
| 効果音・BGM 流用 | 🚨 一発アウト |
| 公式グラフィック流用 | 🚨 一発アウト |
| 自作グラフィック(現プロダクト) | ✅ コード確認上問題なし |

**商用化前のアクション**:
- 製品名から「Puyo」を外す方向でリブランド検討(Phase 別に切出し、本設計のスコープ外)
- アプリ内 UI から「ぷよ」表記を排除または別語彙に
- 弁理士相談(費用 5〜10 万円程度)

## 10. リスクと事前緩和策

| # | リスク | 影響 | 緩和策 |
| --- | --- | --- | --- |
| 1 | Tauri 2 Android + 静的リンク C++ の実例少ない | 詰まると Phase ② 全停止 | **Phase 0 で `return 42;` 最小再現を先行**、ama 組み込みはその後 |
| 2 | sse2neon で稀に SIMD 結果差(arm64) | ゴールデン同手率 99% 程度 | gating を x86_64=100% / arm64≥99% に分離 |
| 3 | Worker からの Tauri invoke 不可 | アーキテクチャ要修正 | Native 経路は **main thread 直 invoke** で設計済み |
| 4 | Rust 学習コスト過小評価 | 工数膨張(2x) | 工数見積りを **2〜3 週間**(楽観値の 2〜3 倍)で計画 |
| 5 | macOS 配布で「壊れたアプリ」警告 | ユーザー導入摩擦 | A 案(未署名)では README に「右クリック→開く」手順を明記。商用は B/C で署名 |
| 6 | Android NDK + cargo cross-compile の詰まり | ビルド不可 | `cargo-ndk` または Tauri 公式の Android セットアップ手順に従う、Phase 0 で先行検証 |
| 7 | ama upstream 更新で `tools/native_api.cpp` がビルド不可 | 後日メンテコスト | ama 側変更は最小化(既存ヘッダのみ参照、core/beam 内部に触らない)|
| 8 | license-check CI に新 dep を追加し忘れる | 配布物の通知漏れ | `collect-licenses.sh` を CI で常に実行、差分が出たら fail |
| 9 | 商標問題で名称変更が必要になる | リブランド作業 | `productName` / `identifier` を **plan 段階で確定**、後日変更しない |
| 10 | ama-wasm と ama-native の保守 2x | 上流更新時の作業重複 | 両方を 1 つの再ビルドスクリプトで連動、ゴールデンファイルは共通化 |

## 11. 実装順序(plan で task 分解)

1. **Phase 0**: Tauri 2 macOS 最小再現(ama 組み込まず Rust 関数 `return 42` を invoke)
2. Phase 0: Tauri 2 Android 最小再現(同上)
3. ama 側に `tools/sse2neon.h` 同梱、`core/def.h` PEXT ガード追加(必要なら)
4. ama 側 `tools/native_api.cpp` 実装、`makefile` の native target 追加
5. `make native-x86-darwin` でホスト用 `.a` をビルド、Rust から呼べることを確認
6. `aarch64-apple-darwin` / `aarch64-linux-android` のクロスビルドを確立
7. `src-tauri/` プロジェクト整備、`build.rs` で `.a` を link、`ama_ffi.rs` 実装
8. Rust unit test(`ama_ffi.rs`)で実 ama を呼んで動作確認
9. `golden_replay` バイナリを実装、既存 `ama_golden.jsonl` で同手率検証
10. Tauri command(`ama_command.rs`)実装、Tauri dev で TS 側から invoke 動作確認
11. TS 側 `NativeAmaAI` 実装、AI ファクトリで Native 経路を Worker 非経由に分岐
12. Header セレクタ修正、`isTauri()` 環境のみ option 表示
13. macOS .app ビルド成功、手動 E2E チェックリスト実施
14. Android arm64 ビルド成功、Android 実機 / エミュレータでベンチ
15. eval-ai と bench-ama の Native 種別追加、レイテンシ実測 → ゲート判定
16. `scripts/collect-licenses.sh` 整備、`third-party/` を Web/Tauri 両方に同梱
17. CI に `tauri-macos` / `tauri-android` / `license-check` job 追加
18. README に Tauri ビルド手順追記、リスク事項明記
19. **別 PR として Web ① 最適化**(simd128 確認 + preload + Worker 常駐化)

## 12. 完了条件(Done definition)

- [ ] `src-tauri/vendor/ama/{x86_64-apple-darwin,aarch64-apple-darwin,aarch64-linux-android}/libama_native.a` がビルドされ commit されている
- [ ] `LICENSES/{ama,sse2neon,nlohmann}-MIT.txt`、`LICENSES/rapidhash-BSD2.txt`、Apache-2.0 NOTICE が `LICENSES/` と `third-party/` に配置されている
- [ ] README に Tauri アプリのビルド手順、商用配布時の知財リスク、再ビルド手順が記載されている
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` が pass
- [ ] `npm test` で `ama-native-golden.test.ts` が pass(同手率 x86_64=100% / arm64≥99%)
- [ ] `npm run eval -- --a ama-wasm --b ama-native --games 100` で B/A ratio が 0.95-1.05
- [ ] `tsx scripts/bench-ama.ts --kind ama-native --runs 100` の p99 が:
    - Intel Mac < 500ms
    - Apple Silicon Mac < 500ms
    - Android arm64 中位機 < 800ms
- [ ] macOS .app と Android .apk が `npm run tauri:build` / `tauri:build:android` で生成され、Header セレクタに `ama (Native) ⚡` が表示される
- [ ] CI に `license-check` が追加され、GPL/AGPL/LGPL を含む新 dep を fail させる
- [ ] Web ①(別 PR)で `<link rel="preload">` 追加、Worker 二重生成が無いこと確認、`wasm-objdump` で simd128 opcode 出現確認

## 13. オープン項目(plan / 実装中に確定)

- `productName` と `identifier`(リブランド方針確定後)
- ama upstream に `tools/native_api.cpp` を上流 PR にするか、ローカル patch 運用にするか
- Android のビルド対象 API レベル(`android-24` 仮)
- `cargo-about` の `about.hbs` テンプレート整備
- 失敗時のユーザー向けメッセージ(toast コピー、英 / 日)
