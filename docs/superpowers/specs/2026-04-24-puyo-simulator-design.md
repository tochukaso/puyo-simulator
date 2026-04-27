# Puyo Puyo Training Simulator Design Document

- Created: 2026-04-24
- Status: Draft (awaiting user review)
- Scope: A personal-project web app for training Puyo Puyo chain-building skills

## 1. Background and Purpose

The goal is to build a practice tool for sharpening the "where should I place this?" judgment in Puyo Puyo.
We use machine learning (DQN) to acquire a "place wisely" strategy, and during play the user can refer to the AI's
recommended moves shown as a ghost overlay.

This is not just a game; it is positioned as **an AI that serves as study material to help the user themselves
improve**.

## 2. Goals / Non-Goals

### Goals

- Reproduce the official Puyo Puyo chain rules in the browser
- A touch-friendly UI that is comfortable to operate on a smartphone
- During play, visualize the AI's recommended move for the current pair in real time
- Present multiple candidate moves and convey, to a degree, the rationale for "why there"
- Implement Phase 1 with a heuristic AI and Phase 2 with a DQN, both swappable behind the same interface

### Non-Goals

- Versus play (garbage puyos, offset/counter, network play) is out of scope for now
- Puzzle modes such as Nazo Puyo are out of scope
- No native mobile app (the PWA serves as a substitute)

## 3. Decision Summary

| Item                | Decision                                                                  |
| ------------------- | ------------------------------------------------------------------------- |
| Platform            | Web browser (TypeScript + React + TensorFlow.js) + PWA                    |
| Target devices      | Smartphone first, with responsive support for PC                          |
| Interaction         | User plays; AI displays advice                                            |
| Visualization       | Best-move ghost + top-N candidate list                                    |
| AI objective        | Maximize total score over a single game                                   |
| AI implementation   | Phase 1: heuristic / Phase 2: Python pre-trained DQN                      |
| Training environment| Local CPU (debugging) + Colab free-tier GPU (production training)         |
| Field               | 6 columns x 13 rows (the top row is rendered semi-transparent)            |
| Pair spawn position | Top row of the 3rd column from the left (col=2)                           |
| Game-over condition | The spawn cell is occupied so a new pair cannot be placed                 |
| Next queue          | Two pairs ahead (NEXT + NEXT-NEXT)                                        |
| Controls (PC)       | Keyboard                                                                  |
| Controls (mobile)   | Touch gestures on the field + auxiliary buttons                           |
| Timing              | Turn-based (time stops until the user places a pair)                      |

## 4. Overall Architecture

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
│  │  - Stats         │      │  │  (Phase 1)        │    │
│  └──────────────────┘      │  └─ DqnAI            │    │
│         ↕                  │     (Phase 2)        │    │
│  ┌──────────────────┐      │     loads weights    │    │
│  │  Game Core       │      │     via TF.js        │    │
│  │  (Pure TS)       │      └──────────────────────┘    │
│  │                  │              ↑                   │
│  │  - GameState     │              │                   │
│  │  - applyMove()   │──────────────┘ read-only         │
│  │  - resolveChain()│                                  │
│  │  - isGameOver()  │                                  │
│  └──────────────────┘                                  │
└────────────────────────────────────────────────────────┘
                            │
                ─────────── separate project ──────────
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Training Pipeline (Python)            │
│                                                        │
│  - puyo/env.py       (Python port of game logic)       │
│  - dqn/agent.py      (PyTorch)                         │
│  - dqn/train.py      (works locally and on Colab)      │
│  - scripts/export_to_tfjs.py (convert weights to TF.js)│
└────────────────────────────────────────────────────────┘
```

### Principles

- **The Game Core is a set of pure functions.** It takes a GameState and returns a new GameState.
  It knows nothing about React or TF.js.
- **AIs are plugins.** Anything that implements `PuyoAI` — heuristic or DQN — can be swapped in.
- **Consistency between Python and TypeScript** is guaranteed by writing a large set of test cases
  (initial field -> operations -> expected field) into `src/shared/specs/game_spec.json`, then
  reading and testing them from both sides.

## 5. Game Core

### 5.1 Data Model

```typescript
// ----- Basic types -----
type Color = 'R' | 'B' | 'Y' | 'P'; // Red / Blue / Yellow / Purple
type Cell = Color | null; // null = empty cell
type Rotation = 0 | 1 | 2 | 3; // 0:up 1:right 2:down 3:left (direction of child relative to axis)

// Board size
const ROWS = 13; // row=0 is the invisible ceiling row
const COLS = 6;
const VISIBLE_ROW_START = 1; // row=1..12 is the regular display area
const SPAWN_COL = 2; // 0-indexed; "the 3rd column from the left"

// ----- Field -----
interface Field {
  readonly cells: ReadonlyArray<ReadonlyArray<Cell>>; // [ROWS][COLS]
}

// ----- Pair -----
interface Pair {
  readonly axis: Color; // axis puyo
  readonly child: Color; // child puyo
}

interface ActivePair {
  readonly pair: Pair;
  readonly axisRow: number;
  readonly axisCol: number;
  readonly rotation: Rotation;
}

// ----- Whole game -----
interface GameState {
  readonly field: Field;
  readonly current: ActivePair | null;
  readonly nextQueue: ReadonlyArray<Pair>; // first two are NEXT/NEXT-NEXT
  readonly score: number;
  readonly chainCount: number; // number of chains in the most recent resolution
  readonly totalChains: number; // cumulative
  readonly status: 'playing' | 'resolving' | 'gameover';
  readonly rngSeed: number;
}

// ----- Inputs -----
type Input =
  | { type: 'moveLeft' }
  | { type: 'moveRight' }
  | { type: 'rotateCW' }
  | { type: 'rotateCCW' }
  | { type: 'softDrop' }
  | { type: 'hardDrop' };

// ----- Move (the granularity returned by the AI) -----
interface Move {
  readonly axisCol: number;
  readonly rotation: Rotation;
  readonly score?: number;
  readonly reason?: string;
}
```

### 5.2 Pure Functions

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

### 5.3 Game Rule Specification

- **Rotation axis**: the child rotates around the axis puyo, matching the official spec
- **Wall kick**: if rotation is blocked by a wall or block, shift the axis by one cell and retry
- **Quick turn**: when both sides are blocked, allow a 180-degree rotation
- **Split (chigiri)**: if the axis and child end up at different heights, break the connection and let them fall independently
- **Group detection**: erase same-color connected groups of 4 or more
- **Chain**: repeat erase -> gravity -> re-check for connected groups
- **Scoring**: official formula `erased count x (chain bonus + group bonus + color bonus) x 10`
- **Pair generation**: deterministic generation via a seeded PRNG (so episodes are reproducible during AI training)
- **Game over**: when the spawn position (col=2, row=0) is already occupied and a new pair cannot be placed

### 5.4 Handling of the Top Row (row=0)

- Normally this is the area a falling pair passes through momentarily
- Placed puyos may exist there. In the UI they are drawn semi-transparently with opacity 0.5
- A faint border is always drawn at col=2 / row=0 to indicate "the game ends if this fills up"

## 6. AI Layer

### 6.1 Common Interface

```typescript
interface PuyoAI {
  readonly name: string;
  readonly version: string;
  init(): Promise<void>;
  suggest(state: GameState, topK: number): Promise<Move[]>;
}
```

The return value is sorted by score in descending order. The UI uses `moves[0]` for the ghost and
`moves[0..topK]` for the candidate list.

### 6.2 Phase 1: HeuristicAI

Enumerates the top candidates using an evaluation function plus beam search (depth=2).

Evaluator terms (initial weights):

| Term           | Meaning                                              | Sign                          |
| -------------- | ---------------------------------------------------- | ----------------------------- |
| chainPotential | How many chains would fire if triggered now          | +                             |
| heightBalance  | Per-column height variation (smaller is better)      | -                             |
| danger         | Height of column 3 (taller is more dangerous)        | -                             |
| connection     | Number of 2- to 3-puyo seed groups                   | +                             |
| flatSurface    | Bumpiness of the top surface                         | -                             |
| uShape         | Whether a U-shape / GTR-like structure is forming    | +                             |
| deathColor     | Number of buried puyos of a color that can no longer be cleared | -                  |
| immediateChain | Penalty for triggering a chain right now             | - (suppresses early ignition) |

The weights are defined as constants in `src/ai/heuristic/evaluator.ts`, and the tuning history and
rationale are kept in `docs/ai-tuning.md`.

**Reason text generation**: for each candidate, the evaluator term with the largest contribution is
turned into a sentence and stored in `reason`. Examples: "to build a 3-chain seed", "to maintain the
GTR shape", "to lower the height of column 3".

### 6.3 Phase 2: DqnAI

Loads a trained model with TF.js and generates candidates from the Q-value vector.

**State encoding (shared spec for TS and Python)**

Input tensor: shape `[13, 6, 7]`

| Channel | Contents                                       |
| ------- | ---------------------------------------------- |
| 0       | Presence map of red puyos                      |
| 1       | Presence map of blue puyos                     |
| 2       | Presence map of yellow puyos                   |
| 3       | Presence map of purple puyos                   |
| 4       | Empty-cell map                                 |
| 5       | Current pair info (broadcast)                  |
| 6       | Color info of the next two pairs (broadcast)   |

**Output**: a Q-value vector of length 22. Each index corresponds to a legal `(column, rotation)`
combination.

- Vertical (axis above or below): 6 columns x 2 directions = 12
- Horizontal (axis left or right): 5 columns x 2 directions = 10
- Total: 22

`moveToActionIndex(move)` / `actionIndexToMove(idx, state)` are implemented to the same spec on
both the TS and Python sides.

**"Why" explanation**: the Q value itself is shown in the candidate list (e.g. `Q=7.82`).
Natural-language reason generation is out of scope for Phase 2.

### 6.4 Asynchronous Model

- Call `suggest()` asynchronously when a pair appears (when nextQueue changes)
- Show a faint "AI thinking..." indicator in the UI until results arrive
- User input does not wait for the AI to finish (the user can act first)
- Both HeuristicAI and DqnAI run on a Web Worker so the UI thread is not blocked

## 7. UI Layer

### 7.1 Layout (Responsive)

| Breakpoint   | Composition                                                |
| ------------ | ---------------------------------------------------------- |
| sm (<640px)  | Single column, vertical (mobile-first)                     |
| md (<1024px) | Two columns, vertical (board on the left, info on the side)|
| lg (>=1024px)| Three columns, horizontal (board / NEXT / candidates)      |

### 7.2 Mobile Portrait Layout

```
┌─────────────────────────────┐
│ Puyo Training       [AI ▼]  │  Header
├─────────────────────────────┤
│ NEXT NEXT-NEXT   Score      │  Info bar
│ [RB]   [YP]      12,480     │
├─────────────────────────────┤
│                             │
│                             │
│   ┌─ 6-col x 13-row field ┐ │  ~60-65vh
│   │                       │ │
│   │                       │ │
│   └───────────────────────┘ │
│                             │
├─────────────────────────────┤
│  ↻CCW   [   ↓ Confirm   ]   │  Auxiliary buttons
├─────────────────────────────┤
│ [ AI Candidates (5) ▲ ]     │  Drawer handle
└─────────────────────────────┘
```

### 7.3 Touch Gestures (on the Field)

| Gesture                | Action                                                                |
| ---------------------- | --------------------------------------------------------------------- |
| Swipe left / right     | Move one column left / right (40px per column, multiple columns OK)   |
| Single tap             | Rotate clockwise                                                      |
| Double tap             | Rotate counterclockwise (an auxiliary button is also provided to avoid mistaps) |
| Swipe down             | Hard drop                                                             |
| Long press (0.5s)      | Continuous soft drop; stops when released                             |
| Swipe up               | Expand the AI candidate list                                          |

Pointer Events unify mouse / touch / pen. The auxiliary buttons `↻CCW` and `↓ Confirm`
are always present.

### 7.4 Keyboard Controls (PC)

| Key    | Action                              |
| ------ | ----------------------------------- |
| ← / →  | Move left / right                   |
| ↑ or X | Rotate clockwise                    |
| Z      | Rotate counterclockwise             |
| ↓      | Soft drop                           |
| Space  | Hard drop                           |
| H      | Toggle hint display                 |
| N      | Toggle candidate list               |
| R      | Reset (with confirmation dialog)    |
| Esc    | Pause                               |

### 7.5 Presenting AI Advice

- **Ghost**: the best move's final placement is drawn at opacity 0.4 with a dashed outline in the
  appropriate colors. A small "1" is shown on the axis and "2" on the child.
- **Candidate list** (drawer): the top 5 moves are listed
  - Each card shows `rank / column + rotation / score or Q value / reason`
  - Tapping a card switches the ghost to that candidate
  - An `[Execute]` button auto-places the move (can be turned off in settings)
- The ghost is temporarily hidden while the user is moving the pair (so it does not get in the way)

### 7.6 Chain Animation

Replay `ChainStep[]` in order:

1. Flash the cells about to be erased (0.3s)
2. Erase and add to the score; show "n-chain!"
3. Gravity falls (0.2s)
4. Move to the next step

Playback speed: 0.5x / 1x / 2x / skip — selectable from settings.

### 7.7 Rendering Strategy

- The field is **drawn directly with the Canvas API** (SVG is heavy due to many nodes; PixiJS is overkill)
- Everything else (panels, candidate list, etc.) uses React + Tailwind
- State management uses Zustand

### 7.8 Mobile-Specific Considerations

- Minimum tap target: 44x44px
- Honor safe areas with `env(safe-area-inset-*)`
- Optionally use the Wake Lock API to prevent screen sleep
- Disable pinch-zoom with `user-scalable=no`
- Provide haptic feedback on landing via `navigator.vibrate(10)` (only on supported devices)
- In landscape, switch to the md/lg layout

## 8. PWA

- `manifest.webmanifest`: icons, theme color, display: standalone
- Service Worker: caches the app shell, allowing offline launch
- Model files (`/models/dqn-v1/*`) are managed individually with the Cache API, fetching diffs only
  on version updates
- Prepare splash screen images for iOS Safari "Add to Home Screen"
- Implementation: `vite-plugin-pwa` (Workbox-based)

## 9. Machine Learning Pipeline (Phase 5 onward)

### 9.1 Environment and Algorithm

- Language: Python 3.11+
- Framework: PyTorch
- Algorithm: DQN (Double DQN + Prioritized Experience Replay as the baseline)
- State / action space: identical spec to `DqnAI` in section 7

### 9.2 Training Flow

1. **Local CPU debugging** (assumed to be this Mac): verify that learning works correctly with
   a few hundred to a few thousand episodes
2. **Full training on Google Colab free tier (T4 GPU)**
3. If needed, scale out to Colab Pro / vast.ai / RunPod

`train.py` auto-detects CPU/GPU via `--device auto`.
The same code runs locally and on Colab. `notebooks/train_colab.ipynb` is a wrapper that lets you
launch training on Colab with a single click.

### 9.3 Python <-> TypeScript Consistency

- `src/shared/specs/game_spec.json` describes test cases (initial field, operation sequence,
  expected field)
- The TS side reads it via `game_spec.test.ts`; the Python side reads it via `test_game_spec.py`
- CI runs both, so a regression on either side is detected immediately

### 9.4 Model Conversion and Delivery

- Conversion script PyTorch -> ONNX -> TF.js (`scripts/export_to_tfjs.py`)
- Output goes to `public/models/dqn-vN/{model.json, weights.bin}`
- The version is included in the directory name so multiple models can be switched
- Target model size: <= 2 MB (to keep the initial mobile load light)

## 10. Development Phases

| #   | Phase                       | Estimate     | Key Outputs                                              |
| --- | --------------------------- | ------------ | -------------------------------------------------------- |
| 0   | Project foundation          | 0.5 day      | Vite + React + TS + PWA + CI                             |
| 1   | Game core                   | 2-3 days     | Pure functions, game_spec.json tests                     |
| 2   | UI basics                   | 2-3 days     | Canvas board, responsive layout, chain animation         |
| 3   | Input                       | 1-2 days     | Touch gestures, keyboard, auxiliary buttons              |
| 4   | Heuristic AI                | 2-3 days     | HeuristicAI + candidate UI -> **MVP complete**           |
| 5   | Python training pipeline    | 3-5 days     | env.py, dqn agent, train.py                              |
| 6   | DQN training                | several days+| Trained model                                            |
| 7   | TF.js integration           | 1-2 days     | DqnAI, switching UI                                      |
| 8   | Polish                      | 1-2 days     | Accessibility, deployment                                |

**The MVP is reached at the end of Phase 4.** It is possible to release at this point and gather
feedback. Phase 5 onward can proceed as an independent ML-enhancement track.

## 11. File / Directory Layout

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
│     └─ dqn-v1/                # added in Phase 7
│        ├─ model.json
│        └─ weights.bin
│
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx
│  │
│  ├─ game/                     # pure logic, no side effects
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
│  │  ├─ types.ts               # PuyoAI interface
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
│        └─ game_spec.json      # shared TS/Python test cases
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

## 12. Tech Stack

| Area                | Choice                                          |
| ------------------- | ----------------------------------------------- |
| Build               | Vite                                            |
| Framework           | React 18+ (function components + Hooks)         |
| Language            | TypeScript 5+ (strict mode)                     |
| Styling             | Tailwind CSS                                    |
| Field rendering     | Canvas API                                      |
| State management    | Zustand                                         |
| Tests               | Vitest + React Testing Library + Playwright     |
| AI (inference)      | TensorFlow.js (WebGL backend)                   |
| AI (training)       | Python 3.11+ + PyTorch                          |
| PWA                 | vite-plugin-pwa (Workbox)                       |
| CI/CD               | GitHub Actions                                  |
| Hosting             | GitHub Pages or Cloudflare Pages                |

## 13. Test Strategy

- **Game core**: unit-test with Vitest. Write a large number of edge cases (wall kick, quick turn,
  chain, split, game-over detection, etc.) into `game_spec.json` and read them from both TS and Python.
- **AI layer**: test that, for known fields, the best move is correctly returned at the top
  (e.g., on a field where "firing yields a 4-chain", the firing move ranks #1).
- **UI layer**: test components with React Testing Library; cover the main flow (input -> landing
  -> chain) with one Playwright E2E test.
- **Python side**: pytest. The training pipeline gets a smoke test (verifying that reward
  trends upward over a few hundred episodes).

## 14. Risks and Mitigations

| Risk                                                              | Mitigation                                                                                                                          |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| The detailed official rules (score coefficients, etc.) are unstable | Before implementing, gather published rule summaries in one place and write them out in `docs/puyo-rules.md`                       |
| Duplicated TS/Python logic management                             | Treat `game_spec.json` as the single source of truth and test from both sides                                                        |
| Inference speed of mobile WebGL                                   | In Phase 6 benchmark model size and latency, and apply distillation/quantization if needed                                          |
| DQN training is impractical on a local PC                         | Set up a Colab pipeline early and use the local machine only for sanity checks                                                       |
| The trained AI does not get strong                                | Evaluate by whether it can reliably beat HeuristicAI as a baseline; if it cannot, revisit reward design and network architecture     |
| Cache pollution when updating the PWA model                       | Manage models in version-specific directories and explicitly delete old ones from the Cache API                                      |

## 15. Open Questions (to be resolved later)

- Exact coefficients of the official scoring formula (chain bonus table, group bonus table, color count bonus table)
- Concrete initial weights for the evaluation function (to be tuned when implementing HeuristicAI)
- DQN hyperparameters (batch size, learning rate, gamma, epsilon-greedy schedule)
- Detailed network architecture of the model (initial proposal: a small CNN with Conv2D x 2 + Dense x 2)
- Final hosting choice (GitHub Pages / Cloudflare Pages)

These will be finalized during the implementation phases and documented in dedicated documents or
code comments.
