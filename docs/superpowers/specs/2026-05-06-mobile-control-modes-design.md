# モバイル操作プリセット (Mobile Control Modes) 設計

- 作成日: 2026-05-06
- ステータス: Draft → User Review
- スコープ: ゲームプレイ中の操作(ぷよの移動・回転・落下)に絞ったモバイル操作性向上
- スコープ外: UI 動線(モード切替・リプレイ閲覧等)、視認性・レイアウト、効果音、Zen モード、左利き反転 — これらは継続して `docs/IDEAS.md` 側で温存

## 動機

スマホで遊んだとき、現状の Classic 操作(左右フリック=列移動 / 下フリック=softDrop / タップ=回転)が以下の理由で操作性を損ねていることがある:

1. 「狙いの列まで移動 → 回転 → ドロップ」と最低 3 動作が必要で、テンポが落ちる
2. 32px / 1 列のフリック量がデバイスごとに合わず、誤って 2 列動いたり 1 列も動かなかったりする
3. 左右フリックとタップ判定の閾値(200ms / 32px)がユーザーの好みに合うとは限らない

「もっと直接的に置きたい列を指定したい」「逆に物理ボタンを大きくして安定させたい」という要望が両立するため、**プリセットで切替えできるようにする** のが最良の解と判断した。

加えて `docs/IDEAS.md` で `useTapToDropEnabled` が `✅` 扱いになっているが実装が存在しない。今回の作業でこの不整合も解消する。

## 用語

- **プリセット (preset)**: 排他選択する操作スタイルの大枠。`Classic / TapToDrop / Drag` の 3 種。
- **チューニング (tuning)**: プリセット横断で効く細かい設定(フリック閾値、触覚バイブ等)。
- **commit**: 現在ぷよを盤面に確定させる操作(`useGameStore.commit`)。
- **プレビュー (preview)**: 指を押下中に「離したら commit される位置」を盤面に表示する状態。

## ユーザーモデル

ハンバーガーメニュー (`HamburgerMenu`) に「⚙ 操作設定」エントリを追加。タップで `ControlSettingsDialog` を開く(既存の `AnalysisDialog` / `ShareDialog` と同じヘッドレスダイアログパターン)。

ダイアログは 2 ブロック構成:

### A. 操作プリセット(排他ラジオ)

| 値 | 表示名 | 概要 |
|---|---|---|
| `classic` | Classic(現行) | フリック=移動, 下フリック=softDrop, タップ=回転 |
| `tap-to-drop` | Tap-to-Drop | 列を押している間ゴースト表示、離した瞬間に commit。回転は CW/CCW ボタンで行う |
| `drag` | Drag | 現在ぷよ周辺をつまんでドラッグ、離した列で commit。タップ回転は併用可 |

`classic` がデフォルト。既存ユーザーへの破壊的変更ゼロ。

### B. 詳細チューニング(共通)

| 設定 | 型 | 既定 | 効果 |
|---|---|---|---|
| `flickColPx` | `24 \| 32 \| 48` | `32` | Classic の 1 列あたりフリック閾値 / Drag の上下 softDrop 閾値 |
| `hapticEnabled` | `boolean` | `true`(デバイスが対応していれば実質有効) | commit / 連鎖発火時に `navigator.vibrate` |
| `buttonScaleLarge` | `boolean` | `false` | `Controls` のボタンを `py-3` → `py-4 text-lg` に拡大 |
| `holdRepeatEnabled` | `boolean` | `true` | 移動ボタン長押しで連続移動(初期 200ms 待機 → 80ms 間隔) |

永続化: `localStorage` に保存。キーは `puyo.control.mode` と `puyo.control.tuning.*`。

## 各プリセットの挙動

### Classic(変更なし)

`useGestures.ts` の現行実装そのまま。

- 左右フリック (`|dx| > flickColPx` かつ `|dx| > |dy|`) → `Math.round(dx / flickColPx)` 列ぶん `moveLeft` / `moveRight`
- 下フリック (`dy > flickColPx` かつ `dy > |dx|`) → `Math.round(dy / flickColPx)` 行ぶん `softDrop`
- タップ (`dt < 200ms` かつ移動が閾値未満) → 画面の左半分=`rotateCCW`, 右半分=`rotateCW`
- インタラクティブ要素(button / input 等)上のジェスチャーは抑制(`INTERACTIVE_SELECTOR`)

### TapToDrop

**核となる挙動:** 「盤面の列を **押している間** にゴーストプレビュー表示 → 指を離した瞬間に commit」。

ナイーブな「タップ=即落下」を採用しないのは、誤タップで意図しない手が打たれて取り返しがつかない事故を避けるため。プレス追従プレビュー方式なら、指を盤面外にスライドして離せばキャンセルできる。

詳細フロー:

1. `pointerdown` を盤面要素内で受けた瞬間に、`clientX` から **ターゲット列** を算出:
   `targetCol = clamp(floor((clientX - boardRect.left) / boardCellSize), 0, COLS-1)`
2. **既存の `src/ui/hooks/useAiPreview.ts` を流用** して `setPreviewMove({ axisCol: targetCol, rotation: game.current.rotation })` を呼ぶ。Board.tsx は既にこの値を読んでゴーストを描画しているので、描画パスを伸ばすだけで済む。
3. `pointermove` で指が動いたら列を再計算し、変化していれば `setPreviewMove(...)` を再発行(`useAiPreview` 内で同値比較済みなのでチャタリングは起きない)。
4. `pointerup` が **盤面内** で発生したら `commit({ axisCol: targetCol, rotation: game.current.rotation })` を呼び、その後 `setPreviewMove(null)` を呼んでクリア。
5. `pointerup` が **盤面外** または `pointercancel` が発生したら `setPreviewMove(null)` だけ呼んでキャンセル。
6. 上下方向の指移動や Y 距離は無視(キャンセル目的でしか使われない)。
7. 回転は `Controls` の **CW / CCW ボタン**(下記参照)で行う。フリック・タップ回転は **無効**。

**既知の制約:** プレビュー中に rotation を変えたいケース(指を置いたまま CCW ボタン押下)は、CCW ボタン押下が `INTERACTIVE_SELECTOR` ガードに引っかかって何もしない。MVP では「先に rotation を決めてから列を指定する」ワークフローを推奨し、UX 上の問題が出てから対処する。

### Drag

**核となる挙動:** 「現在ぷよを掴んでドラッグ、離した位置で commit」。TapToDrop と挙動は近いが、**ドラッグ開始のヒット判定が現在ぷよ周辺に限定** される点が違う。タップ回転とジェスチャー領域を共有できる。

詳細フロー:

1. `pointerdown` の列が `current.axisCol ± 1` の範囲(±1 列)に入っているか判定。範囲内なら **ドラッグモード開始**、範囲外なら **タップ回転モード**(Classic 互換)。
2. ドラッグモード:
   - TapToDrop と同じ列追従プレビュー (`previewMove`) を行う
   - 上下方向は `dy > flickColPx` で `softDrop`(押下開始からの累積距離で判定、複数行発火可)
   - `pointerup` 盤面内で commit、盤面外/cancel でキャンセル
3. タップ回転モード:
   - Classic と同じ「`pointerdown` → `pointerup` で `dt < 200ms` かつ移動閾値未満」のとき、画面の左半分=CCW / 右半分=CW
   - **ドラッグ昇格は実装しない**。範囲外開始の pointer は最後まで「タップ回転候補」のまま扱い、上記条件を満たさなければ無反応(誤操作になりにくい挙動を優先)

### モード(free / match / score)との関係

操作プリセットはモード横断で適用される。`score` モードで現状 CCW ボタンを出している既存仕様は、プリセット側の都合(TapToDrop / Drag は CCW を常時出したい)と統合する:

- `mode === 'score'` または `controlMode === 'tap-to-drop'` または `controlMode === 'drag'` のとき → CCW ボタンを表示
- それ以外 → 従来通り CW ボタンのみ

## 触覚フィードバック(プリセット横断)

- commit 確定時: `navigator.vibrate(15)`
- 連鎖発火 (chainStep が 2 以上に進む遷移): `navigator.vibrate(40)`
- 連鎖継続 (chainStep の増分): `navigator.vibrate(20)`
- `hapticEnabled === false` または `navigator.vibrate` 未対応の場合はノーオペ

副作用はゲームエンジン (`game/engine.ts`) には持ち込まない。UI 層に閉じる:

- 専用フック `useHaptics()` を `App.tsx` で初期化
- `useGameStore.subscribe` で必要な状態(`animatingSteps` の chainStep など)の変化を購読してバイブ発火
- 発火点をハブにすることで、将来の効果音実装も同じレイヤーに足せる

## ボタン拡大 / 長押し連続移動

### ボタン拡大

`Controls.tsx` の `cellBase` 文字列を `buttonScaleLarge` で切替:

- `false` (既定): `'py-3 rounded text-base touch-manipulation select-none disabled:opacity-50 disabled:cursor-not-allowed'`(現状)
- `true`: `'py-4 rounded text-lg touch-manipulation select-none disabled:opacity-50 disabled:cursor-not-allowed'`

### 長押し連続移動

新規フック `usePressRepeat(handler, opts)`:

- `opts: { initialDelayMs?: number = 200, intervalMs?: number = 80, enabled?: boolean }`
- 戻り値: `{ onPointerDown, onPointerUp, onPointerCancel, onPointerLeave }` を `<button>` に spread
- `pointerdown` で 1 度 handler 発火 → 200ms 待機 → 80ms 間隔で連射
- `pointerup`/`pointercancel`/`pointerleave` で停止
- `enabled === false` のとき: 連射せず単発のみ(初回 handler は走らせる、現状互換)

`Controls.tsx` の左右移動・softDrop ボタンに巻く。回転・commit・AI Best・Undo・Reset は連射しない(意味的に単発操作)。

## アーキテクチャと変更ファイル

### 新規

| パス | 役割 |
|---|---|
| `src/ui/hooks/useControlPrefs.ts` | 設定 singleton。`useUiPrefs.ts` と同じ singleton + listener + localStorage パターン。`useControlMode()` / `setControlMode()` / `useControlTuning()` / `setControlTuning(patch)` 等を export |
| `src/ui/components/ControlSettingsDialog/ControlSettingsDialog.tsx` | 設定ダイアログ。`ShareDialog` を参考にしたヘッドレスダイアログ |
| `src/ui/hooks/usePressRepeat.ts` | 長押し連続発火フック |
| `src/ui/feedback/haptics.ts` | `vibrateCommit()` / `vibrateChain(step)` を提供する薄い層 |
| `src/ui/hooks/useHaptics.ts` | ストア購読で commit / 連鎖を検知してバイブ呼び出し |
| `src/ui/hooks/useBoardRect.ts` | Board が登録する `() => DOMRect \| null` を保持する singleton。useGestures から clientX → 列換算に使う |

### 変更

| パス | 変更内容 |
|---|---|
| `src/ui/hooks/useGestures.ts` | `controlMode` を購読して `classic` / `tap-to-drop` / `drag` で分岐。`flickColPx` を tuning から取得。tap-to-drop / drag では `useAiPreview` の `setPreviewMove` を呼んで Board のゴーストを動かす |
| `src/ui/components/Board/Board.tsx` | ゴースト計算の `bestMove` ロジックを「`previewMove !== null` なら最優先(全モード共通でユーザーの move プレビュー扱い)、無ければ既存の free モード AI 候補トップ、replay 時は記録 move」の順に変更。プレビューには `boardRect` が必要なため Board が外向けに `getBoundingClientRect()` を提供する仕組み(下記)を用意 |
| `src/ui/components/Controls/Controls.tsx` | `controlMode` で CCW ボタンの表示条件を統合。`buttonScaleLarge` で `cellBase` 切替。移動・softDrop ボタンに `usePressRepeat` 適用 |
| `src/ui/components/HamburgerMenu/HamburgerMenu.tsx` | 「⚙ 操作設定」エントリと `ControlSettingsDialog` の open/close ステート |
| `src/App.tsx` | `useHaptics()` を呼ぶ |
| `src/i18n/translations.ts` | `Dict` インターフェイスに `controls.settings.*` キーを追加し、ja / en / zh / ko の 4 言語ぶん文字列を埋める(zh / ko は ja / en どちらかの英訳をベースに既存翻訳の流儀で追従) |

### Board の clientX → 列換算

`useGestures.ts` から「タップした clientX が盤面のどの列に当たるか」を計算する必要がある。Board の幅・位置は ResizeObserver で動的に変わるので、Board が外向けに `getBoundingClientRect()` の参照を提供する singleton 経由で渡す。

- 新規 `src/ui/hooks/useBoardRect.ts`(`useUiPrefs.ts` と同じ singleton + listener パターン)
  - `setBoardRectGetter(getter: () => DOMRect | null)`: Board が wrapperRef からの `() => wrapperRef.current?.getBoundingClientRect() ?? null` を登録
  - `getBoardRect(): DOMRect | null`: useGestures から呼ばれて現在の rect を取得
- Board.tsx は `useEffect` で `setBoardRectGetter` を一度だけ呼び、cleanup で `setBoardRectGetter(() => null)` を呼ぶ

### データフロー

```
[Hamburger ⚙] → ControlSettingsDialog
                    │
                    ├── setControlMode('tap-to-drop')      ──┐
                    └── setControlTuning({ flickColPx: 48 }) ─┤
                                                             ▼
                                              useControlPrefs (singleton + localStorage)
                                                             │
                              ┌──────────────────────────────┼─────────────────────────┐
                              ▼                              ▼                         ▼
                   useGestures (mode 分岐)            Controls (UI調整)          useHaptics (vibrate)
                              │
                              ▼
                   setPreviewMove({axisCol, rotation}) ───► useAiPreview (singleton)
                              │                                     │
                              │                                     ▼
                              │                          Board (ゴースト描画に流用)
                              ▼
                   store.commit({axisCol, rotation}) → 既存パイプライン
                              │
                              ▼
                   setPreviewMove(null) でクリア
```

## エラー処理 / エッジケース

- `localStorage` 利用不可(jsdom 等): `useUiPrefs.ts` と同様に try/catch で握りつぶし、メモリ singleton にフォールバック
- `navigator.vibrate` 未定義: `haptics.ts` で型ガード、無視
- TapToDrop でアニメーション中 (`animatingSteps.length > 0`) に `pointerdown` を受けた場合: `previewMove` も `commit` も呼ばない(既存 `commit` のガードを継承)
- pointer が `INTERACTIVE_SELECTOR` 上で開始した場合: 全プリセットで gesture を抑制(現状維持)
- TapToDrop で連続して同じ列をタップ commit する場合: `commit` 成功 → 次ぺアの spawn → 再 `pointerdown` で新しいプレビュー、と素直に動く
- 初回起動時に保存値なし: `classic` + 既定 tuning でブート

## テスト

| 対象 | テスト内容 |
|---|---|
| `useControlPrefs.test.ts` | localStorage 永続化、listener 通知、tuning patch のマージ |
| `usePressRepeat.test.ts` | fake timers で 200ms 待機 → 80ms 連射、`enabled=false` で単発、`pointerleave` で停止 |
| `useGestures.test.ts`(既存に追加) | `tap-to-drop` で `pointerdown`/`pointermove`/`pointerup` 合成 → `previewMove` / `commit` 呼出を検証。盤外 release で `cancelPreview` |
| `ControlSettingsDialog.test.tsx` | ラジオ切替で `useControlMode()` 更新、トグルで tuning 更新、永続化 |
| `useHaptics.test.ts` | `navigator.vibrate` をスパイし、commit / 連鎖イベントで呼ばれること、`hapticEnabled=false` で呼ばれないこと |
| Playwright E2E | TapToDrop プリセットを localStorage に書いた状態でロード → 盤面タップ → ぷよが落ちる、を 1 ケース追加 |

## 互換性

- デフォルトは `classic`。既存ユーザーは何もしなくても挙動変化なし。
- `score` モードで CCW ボタンを表示している既存仕様は維持(プリセット条件と OR で統合)。
- ストアには手を入れない。プレビューは既存 `useAiPreview` を流用するだけ。
- `commit` のシグネチャは変更しない。プレビュー解除はジェスチャーハンドラ側で `setPreviewMove(null)` を呼んで実現。

## YAGNI で除外したもの

- A/B/C/D を独立トグル化する案(矛盾組み合わせの排他処理が複雑)
- TapToDrop でプレビュー中の rotation 変更(MVP で実装、UX 問題が出たら対応)
- Drag からタップ回転への昇格(MVP では `current.axisCol ± 1` 開始ならドラッグ、それ以外なら回転、で固定)
- 効果音、Zen モード、左利き反転、キーバインド設定 — `docs/IDEAS.md` 側で温存

## マイグレーション / リスク

- 既存の Playwright スモークが Classic 前提なので、新規 E2E は localStorage 設定で TapToDrop に切替えてから起動する形にし、既存テストには触らない。
- `useGestures.ts` の分岐追加でリグレッションが起きないよう、Classic ケースの単体テストも追加する(現状 `__tests__` には gesture テストがないので新規で書く)。
