# ぷよぷよトレーニングシミュレータ 設計書

- 作成日: 2026-04-24
- ステータス: ドラフト(ユーザレビュー待ち)
- 対象: 個人開発によるぷよぷよ連鎖構築のトレーニング用Webアプリ

## 1. 背景と目的

ぷよぷよの「どこに置くべきか」という判断力を鍛えるための練習ツールを作る。
機械学習(DQN)で「賢く置く」戦略を獲得させ、ユーザがプレイ中にAIの
推奨手をゴースト表示で参照できるようにする。

単なるゲームではなく、**ユーザ自身の上達を助ける教材としてのAI**という
位置付け。

## 2. ゴール / 非ゴール

### ゴール

- ぷよぷよ本家準拠の連鎖ルールをブラウザ上で再現
- スマホで快適に操作できるタッチ操作UI
- プレイ中、現在のツモに対するAIの推奨手をリアルタイムに可視化
- 候補手を複数提示し、「なぜそこか」の理由もある程度伝える
- フェーズ1としてヒューリスティックAI、フェーズ2としてDQNの両方を
  同じインターフェイスの背後に差し替え可能な形で実装

### 非ゴール

- 対人戦(おじゃまぷよ、相殺、ネットワーク対戦)は当面範囲外
- なぞぷよ等のパズルモードは範囲外
- モバイルネイティブアプリ化はしない(PWAで代替)

## 3. 決定事項サマリ

| 項目               | 決定内容                                                     |
| ------------------ | ------------------------------------------------------------ |
| プラットフォーム   | Webブラウザ (TypeScript + React + TensorFlow.js) + PWA       |
| 対応端末           | スマホメイン、PCレスポンシブ対応                             |
| インタラクション   | ユーザがプレイ、AIがアドバイス表示                           |
| 可視化             | ベスト手ゴースト + トップN候補リスト                         |
| AIの目的           | 1ゲームの総スコア最大化                                      |
| AI実装段階         | フェーズ1: ヒューリスティック / フェーズ2: Python事前学習DQN |
| 学習環境           | ローカルCPU(デバッグ) + Colab無料GPU(本番学習)               |
| 盤面               | 6列 × 13段(最上段は半透明で表示)                             |
| ツモ出現位置       | 左から3列目(col=2)の最上段                                   |
| ゲームオーバー条件 | ツモ出現位置が埋まっていて新しいツモが出せないとき           |
| ネクスト           | 2組先(NEXT + NEXT-NEXT)                                      |
| 操作(PC)           | キーボード                                                   |
| 操作(スマホ)       | 盤面上のタッチジェスチャー + 補助ボタン                      |
| タイミング         | ターン制(ユーザが置くまで時間停止)                           |

## 4. 全体アーキテクチャ

```
┌────────────────────────────────────────────────────────┐
│                    Web Browser (SPA / PWA)             │
│                                                        │
│  ┌──────────────────┐      ┌──────────────────────┐    │
│  │    View Layer    │      │   AI Layer           │    │
│  │  (React)         │      │  interface PuyoAI {  │    │
│  │                  │ ←─── │    suggest(state)    │    │
│  │  - Board         │      │    : Move[]          │    │
│  │  - NextQueue     │      │  }                   │    │
│  │  - GhostOverlay  │      │                      │    │
│  │  - CandidateList │      │  ├─ HeuristicAI      │    │
│  │  - Stats         │      │  │  (フェーズ1)       │    │
│  └──────────────────┘      │  └─ DqnAI            │    │
│         ↕                  │     (フェーズ2)       │    │
│  ┌──────────────────┐      │     TF.jsで重み読込   │    │
│  │  Game Core       │      └──────────────────────┘    │
│  │  (Pure TS)       │              ↑                   │
│  │                  │              │                   │
│  │  - GameState     │──────────────┘ 読み取り専用       │
│  │  - applyMove()   │                                  │
│  │  - resolveChain()│                                  │
│  │  - isGameOver()  │                                  │
│  └──────────────────┘                                  │
└────────────────────────────────────────────────────────┘
                            │
                ─────────── 別プロジェクト ────────────
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Training Pipeline (Python)            │
│                                                        │
│  - puyo/env.py       (ゲームロジックのPython移植)        │
│  - dqn/agent.py      (PyTorch)                         │
│  - dqn/train.py      (ローカル/Colab両対応)             │
│  - scripts/export_to_tfjs.py (重みをTF.js形式に変換)   │
└────────────────────────────────────────────────────────┘
```

### 原則

- **Game Core は純粋関数の集合**。GameState を受け取り新しい GameState を返す。
  React も TF.js も知らない。
- **AI はプラグイン**。`PuyoAI` を実装すればヒューリスティックでもDQNでも差し替え可能。
- **Python と TypeScript の整合性**は、`src/shared/specs/game_spec.json` に
  大量のテストケース(初期盤面 → 操作 → 期待盤面)を書き、両側から読んで
  テストすることで担保する。

## 5. ゲームコア(Game Core)

### 5.1 データモデル

```typescript
// ----- 基本型 -----
type Color = 'R' | 'B' | 'Y' | 'P'; // 赤/青/黄/紫
type Cell = Color | null; // null = 空マス
type Rotation = 0 | 1 | 2 | 3; // 0:上 1:右 2:下 3:左 (軸からの子方向)

// 盤面サイズ
const ROWS = 13; // うち row=0 が見えない天井段
const COLS = 6;
const VISIBLE_ROW_START = 1; // row=1..12 が通常表示域
const SPAWN_COL = 2; // 0-indexed、「左から3列目」

// ----- 盤面 -----
interface Field {
  readonly cells: ReadonlyArray<ReadonlyArray<Cell>>; // [ROWS][COLS]
}

// ----- ツモ -----
interface Pair {
  readonly axis: Color; // 軸ぷよ
  readonly child: Color; // 子ぷよ
}

interface ActivePair {
  readonly pair: Pair;
  readonly axisRow: number;
  readonly axisCol: number;
  readonly rotation: Rotation;
}

// ----- ゲーム全体 -----
interface GameState {
  readonly field: Field;
  readonly current: ActivePair | null;
  readonly nextQueue: ReadonlyArray<Pair>; // 先頭2つが NEXT/NEXT-NEXT
  readonly score: number;
  readonly chainCount: number; // 直近で発生した連鎖数
  readonly totalChains: number; // 累計
  readonly status: 'playing' | 'resolving' | 'gameover';
  readonly rngSeed: number;
}

// ----- 操作 -----
type Input =
  | { type: 'moveLeft' }
  | { type: 'moveRight' }
  | { type: 'rotateCW' }
  | { type: 'rotateCCW' }
  | { type: 'softDrop' }
  | { type: 'hardDrop' };

// ----- Move (AIが返す粒度) -----
interface Move {
  readonly axisCol: number;
  readonly rotation: Rotation;
  readonly score?: number;
  readonly reason?: string;
}
```

### 5.2 純粋関数群

```typescript
function createInitialState(seed: number): GameState;
function applyInput(state: GameState, input: Input): GameState;
function step(state: GameState): GameState;
function commitMove(state: GameState, move: Move): GameState;
function enumerateLegalMoves(state: GameState): Move[];
function resolveChain(field: Field): {
  finalField: Field;
  steps: ChainStep[];
  totalScore: number;
};

interface ChainStep {
  beforeField: Field;
  popped: Array<{ row: number; col: number; color: Color }>;
  afterGravity: Field;
  chainIndex: number;
  scoreDelta: number;
}
```

### 5.3 ゲームルール仕様

- **回転軸**: 軸ぷよを中心に子ぷよが回る本家仕様
- **壁蹴り**: 回転先が壁/ブロックで不可なら軸を1マスずらして再試行
- **クイックターン**: 両側が塞がれているときは180度回転を許可
- **ちぎり**: 軸と子が違う高さになる場合は連結解除してそれぞれ独立に落下
- **連結判定**: 4マス以上の同色連結を消去
- **連鎖**: 消去 → 重力 → 再度連結チェック、を繰り返す
- **スコア**: 本家式 `消去数 × (連鎖ボーナス + 連結ボーナス + 色数ボーナス) × 10`
- **ツモ生成**: シード付きPRNGで決定論的に生成(AI学習でのエピソード再現のため)
- **ゲームオーバー**: 出現位置(col=2, row=0)がすでに埋まっていて新ツモを置けないとき

### 5.4 最上段(row=0)の扱い

- 通常は落下途中のツモが一瞬通過する領域
- 置いたぷよは存在可能。UI上は opacity 0.5 で半透明表示
- col=2 の row=0 には「ここが埋まると終わり」を示す薄い枠を常時描画

## 6. AI層

### 6.1 共通インターフェイス

```typescript
interface PuyoAI {
  readonly name: string;
  readonly version: string;
  init(): Promise<void>;
  suggest(state: GameState, topK: number): Promise<Move[]>;
}
```

返り値は score 降順。UI は `moves[0]` をゴースト、`moves[0..topK]` を
候補リストに使う。

### 6.2 フェーズ1: HeuristicAI

評価関数 + beam search (depth=2) で上位候補を列挙する。

評価関数の項(初期重み):

| 項             | 意味                               | 符号            |
| -------------- | ---------------------------------- | --------------- |
| chainPotential | 今発火したら何連鎖か(ポテンシャル) | +               |
| heightBalance  | 列ごとの高低差(小さいほど良)       | −               |
| danger         | 3列目の高さ(高いほど危険)          | −               |
| connection     | 2〜3連結の種の多さ                 | +               |
| flatSurface    | 表面のでこぼこ具合                 | −               |
| uShape         | U字/GTR的な形ができているか        | +               |
| deathColor     | 消せなくなっている色の下敷きの数   | −               |
| immediateChain | 今連鎖を発火してしまうこと         | −(早発火を抑制) |

重みは `src/ai/heuristic/evaluator.ts` に定数化し、チューニング履歴と
根拠を `docs/ai-tuning.md` に残す。

**理由文生成**: 評価関数の各項のうち寄与が最大の項を文章化して `reason` に入れる。
例: 「3連鎖の種を作るため」「GTR形を維持するため」「3列目の高さを下げるため」。

### 6.3 フェーズ2: DqnAI

TF.jsで学習済みモデルをロードし、Q値ベクトルから候補を生成する。

**状態エンコーディング (TS/Python共通仕様)**

入力テンソル: 形状 `[13, 6, 7]`

| チャンネル | 内容                                  |
| ---------- | ------------------------------------- |
| 0          | 赤ぷよの存在マップ                    |
| 1          | 青ぷよの存在マップ                    |
| 2          | 黄ぷよの存在マップ                    |
| 3          | 紫ぷよの存在マップ                    |
| 4          | 空マスマップ                          |
| 5          | 現在のツモ情報(ブロードキャスト)      |
| 6          | ネクスト2組の色情報(ブロードキャスト) |

**出力**: 長さ22のQ値ベクトル。各インデックスは `(列, 回転)` の
合法組み合わせに対応する。

- 縦向き(軸上 or 軸下): 6列 × 2方向 = 12
- 横向き(軸左 or 軸右): 5列 × 2方向 = 10
- 合計: 22

`moveToActionIndex(move)` / `actionIndexToMove(idx, state)` は
TS/Python両側で同一の仕様で実装する。

**「なぜ」の説明**: Q値そのものを候補リストに表示(例: `Q=7.82`)。
自然言語の理由生成はフェーズ2の範囲外。

### 6.4 非同期モデル

- ツモ出現時(nextQueue変化時)に非同期で `suggest()` を呼ぶ
- 結果到着前はUIに「AI思考中…」を薄く表示
- ユーザ操作はAIの完了を待たない(先に動かせる)
- HeuristicAI/DqnAI ともに Web Worker 上で動かし、UI スレッドをブロックしない

## 7. UI層

### 7.1 レイアウト(レスポンシブ)

| ブレークポイント | 構成                            |
| ---------------- | ------------------------------- |
| sm (<640px)      | 縦1カラム(スマホメイン)         |
| md (<1024px)     | 縦2カラム(盤面左、サイドに情報) |
| lg (≥1024px)     | 横3カラム(盤面/NEXT/候補)       |

### 7.2 スマホ縦レイアウト

```
┌─────────────────────────────┐
│ Puyo Training       [AI ▼]  │  ヘッダー
├─────────────────────────────┤
│ NEXT NEXT-NEXT   Score      │  情報バー
│ [RB]   [YP]      12,480     │
├─────────────────────────────┤
│                             │
│                             │
│    ┌─ 6列×13段 盤面 ─┐       │  ~60-65vh
│    │                 │       │
│    │                 │       │
│    └─────────────────┘       │
│                             │
├─────────────────────────────┤
│  ↻CCW   [   ↓ 確定   ]      │  補助ボタン
├─────────────────────────────┤
│ [ AI候補 (5) ▲ ]            │  引き出しハンドル
└─────────────────────────────┘
```

### 7.3 タッチジェスチャー(盤面上)

| ジェスチャー   | 動作                                             |
| -------------- | ------------------------------------------------ |
| 左/右スワイプ  | 1列左/右に移動(40px/列で複数可)                  |
| シングルタップ | 時計回り回転                                     |
| ダブルタップ   | 反時計回り回転(誤操作防止のため補助ボタンも併設) |
| 下スワイプ     | ハードドロップ                                   |
| 長押し(0.5s)   | ソフトドロップ継続、離すと停止                   |
| 上スワイプ     | AI候補リスト展開                                 |

Pointer Events でマウス/タッチ/ペンを統一。補助ボタン `↻CCW` と
`↓確定` は常設。

### 7.4 キーボード操作(PC)

| キー   | 動作                     |
| ------ | ------------------------ |
| ← / →  | 左右移動                 |
| ↑ or X | 時計回り回転             |
| Z      | 反時計回り回転           |
| ↓      | ソフトドロップ           |
| Space  | ハードドロップ           |
| H      | ヒント表示切替           |
| N      | 候補リスト切替           |
| R      | リセット(確認ダイアログ) |
| Esc    | ポーズ                   |

### 7.5 AIアドバイスの見せ方

- **ゴースト**: ベスト手の最終位置に該当色のぷよを opacity 0.4 +
  破線アウトラインで表示。軸に「1」、子に「2」の小さな数字
- **候補リスト**(引き出し): 上位5手を列挙
  - カードに `順位 / 列+回転 / スコア or Q値 / 理由` を表示
  - カードタップ → ゴーストがその候補に切り替わる
  - `[実行]` ボタン → 自動着手(設定でOFF可能)
- ユーザがツモを操作するとゴーストは一時非表示(操作を邪魔しない)

### 7.6 連鎖アニメーション

`ChainStep[]` を順再生:

1. 消去対象フラッシュ(0.3s)
2. 消去とスコア加算、「n連鎖!」表示
3. 重力落下(0.2s)
4. 次ステップへ

再生速度: 0.5x / 1x / 2x / スキップ を設定から選択可。

### 7.7 描画戦略

- 盤面は **Canvas API 直描き**(SVGはノード増で重い、PixiJSはオーバー)
- それ以外(パネル、候補リスト等)は React + Tailwind
- 状態管理は Zustand

### 7.8 モバイル固有の配慮

- タップ領域 最小44×44px
- `env(safe-area-inset-*)` でセーフエリア対応
- Wake Lock API で画面スリープ抑止(任意)
- `user-scalable=no` でピンチズーム抑止
- `navigator.vibrate(10)` で着地ハプティクス(対応端末のみ)
- 横向きは md/lg レイアウトに切り替え

## 8. PWA

- `manifest.webmanifest`: アイコン、テーマカラー、display: standalone
- Service Worker: アプリシェルをキャッシュ、オフライン起動可
- モデルファイル(`/models/dqn-v1/*`)は Cache API で個別管理し、
  バージョン更新時のみ差分取得
- iOS Safari の Add to Home Screen 用に splash screen 画像を準備
- 実装: `vite-plugin-pwa` (Workbox ベース)

## 9. 機械学習パイプライン(Phase 5以降)

### 9.1 環境・アルゴリズム

- 言語: Python 3.11+
- フレームワーク: PyTorch
- アルゴリズム: DQN(Double DQN + Prioritized Experience Replay を基本)
- 状態/行動空間: 7章の `DqnAI` と同一仕様

### 9.2 学習フロー

1. **ローカルCPUデバッグ**(このMac想定): エピソード数百〜数千で
   正しく学習できるか動作確認
2. **Google Colab 無料枠(T4 GPU)** で本格学習
3. 必要なら Colab Pro / vast.ai / RunPod に拡張

`train.py` は `--device auto` で CPU/GPU を自動判定。
同じコードがローカルでもColabでも動く。`notebooks/train_colab.ipynb` は
Colabでボタン1つで起動できるラッパ。

### 9.3 Python ↔ TypeScript 整合性

- `src/shared/specs/game_spec.json` にテストケース(初期盤面・操作列・
  期待盤面)を記述
- TS側は `game_spec.test.ts` で読み、Python側は `test_game_spec.py` で読む
- CIで両方実行、どちらかが落ちたら即検知

### 9.4 モデル変換・配信

- PyTorch → ONNX → TF.js の変換スクリプト(`scripts/export_to_tfjs.py`)
- 出力物は `public/models/dqn-vN/{model.json, weights.bin}`
- バージョンはディレクトリ名に含め、複数モデルの切替を可能にする
- モデルサイズ目標: ≤ 2 MB(モバイル初回ロード考慮)

## 10. 開発フェーズ

| #   | フェーズ               | 目安   | 主なアウトプット                               |
| --- | ---------------------- | ------ | ---------------------------------------------- |
| 0   | プロジェクト基盤       | 0.5日  | Vite + React + TS + PWA + CI                   |
| 1   | ゲームコア             | 2-3日  | 純粋関数群、game_spec.jsonテスト               |
| 2   | UI基本                 | 2-3日  | Canvas盤面、レスポンシブレイアウト、連鎖アニメ |
| 3   | 入力                   | 1-2日  | タッチジェスチャー、キーボード、補助ボタン     |
| 4   | ヒューリスティックAI   | 2-3日  | HeuristicAI + 候補UI → **MVP完成**             |
| 5   | Python学習パイプライン | 3-5日  | env.py, dqn agent, train.py                    |
| 6   | DQN学習                | 数日〜 | 学習済みモデル                                 |
| 7   | TF.js統合              | 1-2日  | DqnAI、切替UI                                  |
| 8   | 仕上げ                 | 1-2日  | アクセシビリティ、デプロイ                     |

**MVP は Phase 4 完了時点**。ここで公開してフィードバックを集めることも可能。
Phase 5 以降は ML 強化として独立した別トラックで進められる。

## 11. ファイル/ディレクトリ構成

```
puyo-simulator/
├─ README.md
├─ LICENSE
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ index.html
│
├─ public/
│  ├─ manifest.webmanifest
│  ├─ icons/
│  └─ models/
│     └─ dqn-v1/                # Phase 7 で追加
│        ├─ model.json
│        └─ weights.bin
│
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx
│  │
│  ├─ game/                     # 純粋ロジック、副作用なし
│  │  ├─ types.ts
│  │  ├─ constants.ts
│  │  ├─ rng.ts
│  │  ├─ field.ts
│  │  ├─ rotation.ts
│  │  ├─ chain.ts
│  │  ├─ moves.ts
│  │  ├─ state.ts
│  │  └─ __tests__/
│  │     ├─ chain.test.ts
│  │     ├─ rotation.test.ts
│  │     └─ game_spec.test.ts
│  │
│  ├─ ai/
│  │  ├─ types.ts               # PuyoAI インターフェイス
│  │  ├─ heuristic/
│  │  │  ├─ evaluator.ts
│  │  │  ├─ search.ts
│  │  │  ├─ reason.ts
│  │  │  └─ index.ts
│  │  ├─ dqn/                   # Phase 7
│  │  │  ├─ encoder.ts
│  │  │  ├─ action.ts
│  │  │  └─ index.ts
│  │  └─ worker/
│  │     └─ ai.worker.ts
│  │
│  ├─ ui/
│  │  ├─ components/
│  │  │  ├─ Board/
│  │  │  ├─ NextQueue/
│  │  │  ├─ AiPanel/
│  │  │  ├─ CandidateList/
│  │  │  ├─ Stats/
│  │  │  └─ Controls/
│  │  ├─ hooks/
│  │  │  ├─ useGameLoop.ts
│  │  │  ├─ useAiSuggestion.ts
│  │  │  ├─ useGestures.ts
│  │  │  └─ useKeyboard.ts
│  │  ├─ layouts/
│  │  │  ├─ MobileLayout.tsx
│  │  │  └─ DesktopLayout.tsx
│  │  └─ App.tsx
│  │
│  └─ shared/
│     └─ specs/
│        └─ game_spec.json      # TS/Python 共通テストケース
│
├─ python/                      # Phase 5+
│  ├─ pyproject.toml
│  ├─ puyo/
│  │  ├─ env.py
│  │  ├─ rng.py
│  │  └─ chain.py
│  ├─ dqn/
│  │  ├─ agent.py
│  │  ├─ network.py
│  │  ├─ replay.py
│  │  └─ train.py
│  ├─ scripts/
│  │  ├─ train_local.sh
│  │  └─ export_to_tfjs.py
│  ├─ notebooks/
│  │  └─ train_colab.ipynb
│  └─ tests/
│     └─ test_game_spec.py
│
├─ docs/
│  └─ superpowers/
│     └─ specs/
│        └─ 2026-04-24-puyo-simulator-design.md
│
└─ .github/
   └─ workflows/
      ├─ ci.yml
      └─ deploy.yml
```

## 12. 技術スタック

| 領域           | 選定                                        |
| -------------- | ------------------------------------------- |
| ビルド         | Vite                                        |
| フレームワーク | React 18+ (関数コンポーネント + Hooks)      |
| 言語           | TypeScript 5+ (strict mode)                 |
| スタイル       | Tailwind CSS                                |
| 盤面描画       | Canvas API                                  |
| 状態管理       | Zustand                                     |
| テスト         | Vitest + React Testing Library + Playwright |
| AI(推論)       | TensorFlow.js (WebGL backend)               |
| AI(学習)       | Python 3.11+ + PyTorch                      |
| PWA            | vite-plugin-pwa (Workbox)                   |
| CI/CD          | GitHub Actions                              |
| デプロイ       | GitHub Pages または Cloudflare Pages        |

## 13. テスト戦略

- **ゲームコア**: Vitest で単体テスト。`game_spec.json` にエッジケース
  (壁蹴り、クイックターン、連鎖、ちぎり、ゲームオーバー判定など)を
  大量に記述し、TS/Python両方から読む
- **AI層**: 既知の盤面に対して最善手が正しくTop1に来るかをテスト
  (例: 「発火すれば4連鎖」の盤面で発火手が1位か)
- **UI層**: コンポーネントは React Testing Library、E2Eは Playwright で
  主要フロー(操作→着地→連鎖)を1本
- **Python側**: pytest。学習パイプラインは smoke test
  (数百エピソードで報酬が上がる傾向を確認)

## 14. リスクと対策

| リスク                                         | 対策                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 本家準拠ルールの詳細(スコア係数など)が仕様揺れ | 実装前に公開されている仕様まとめを一箇所集めて `docs/puyo-rules.md` に書き出す                 |
| TS/Python ロジック二重管理                     | `game_spec.json` を Single Source of Truth とし、両側でテスト                                  |
| モバイルWebGLの推論速度                        | Phase 6でモデルサイズとレイテンシをベンチし、必要なら蒸留/量子化                               |
| DQN学習がローカルPCで現実的でない              | 早期にColabで回す段取りを作り、ローカルは動作確認のみに絞る                                    |
| 学習したAIが強くならない                       | HeuristicAI をベースラインに必ず勝てるかで評価。勝てなければ報酬設計・ネットワーク構造を見直し |
| PWAモデル更新時のキャッシュ汚染                | モデルはバージョン別ディレクトリで管理、古いモデルは Cache API から明示削除                    |

## 15. オープン事項(今後詰める)

- 本家スコア式の厳密な係数(連鎖ボーナス表、連結ボーナス表、色数ボーナス表)
- 評価関数の初期重みの具体値(HeuristicAI実装時にチューニング)
- DQNハイパーパラメータ(バッチサイズ、学習率、γ、ε-greedyスケジュール)
- モデルのネットワーク構造詳細(初期案: Conv2D×2 + Dense×2 の小規模CNN)
- ホスティング先の最終決定(GitHub Pages / Cloudflare Pages)

これらは実装フェーズ中に確定させて個別のドキュメント or コードコメントに残す。
