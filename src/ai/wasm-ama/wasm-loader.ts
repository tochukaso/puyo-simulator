export interface AmaModule {
  ccall(name: string, retType: string | null, argTypes: string[], args: unknown[]): number;
  cwrap(
    name: string,
    retType: string | null,
    argTypes: string[],
  ): (...args: unknown[]) => number;
  HEAPU8: Uint8Array;
  _malloc(n: number): number;
  _free(ptr: number): void;
}

type AmaModuleFactory = (config?: {
  locateFile?: (path: string) => string;
}) => Promise<AmaModule>;

// 単一の WASM バイナリ。form 集合 (GTR / FRON / SGTR / KAIDAN) は
// 実行時に preset の "forms" で切り替えるので、別ビルドは不要。
const PATHS = {
  glueUrl: '/wasm/ama.js',
  glueRel: 'src/ai/wasm-ama/_glue/ama.js',
  wasmRel: 'public/wasm/ama.wasm',
} as const;

let cached: Promise<AmaModule> | null = null;
let currentPreset: string | null = null;

function isVitest(): boolean {
  return typeof process !== 'undefined' && process.env.VITEST === 'true';
}

function isBrowser(): boolean {
  if (isVitest()) return false;
  return typeof self !== 'undefined' && typeof process === 'undefined';
}

async function loadFactoryAndPaths(): Promise<{
  factory: AmaModuleFactory;
  nodeWasmPath: string | null;
  browserWasmUrl: string;
}> {
  if (isBrowser()) {
    console.log(`[ama-wasm] step 1: fetching ${PATHS.glueUrl}`);
    const res = await fetch(PATHS.glueUrl);
    if (!res.ok) {
      throw new Error(`failed to fetch ama glue: ${res.status} ${res.statusText}`);
    }
    const code = await res.text();
    console.log(`[ama-wasm] step 2: glue text fetched (${code.length} bytes)`);

    const blob = new Blob([code], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    console.log(`[ama-wasm] step 3: blob URL created`);

    try {
      console.log(`[ama-wasm] step 4: dynamic-importing blob URL`);
      const mod = (await import(/* @vite-ignore */ blobUrl)) as {
        default: AmaModuleFactory;
      };
      console.log(`[ama-wasm] step 5: blob imported, factory type = ${typeof mod.default}`);
      return {
        factory: mod.default,
        nodeWasmPath: null,
        browserWasmUrl: PATHS.glueUrl.replace(/\.js$/, '.wasm'),
      };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const jsPath = resolve(process.cwd(), PATHS.glueRel);
  const wasmPath = resolve(process.cwd(), PATHS.wasmRel);
  const mod = (await import(/* @vite-ignore */ pathToFileURL(jsPath).href)) as {
    default: AmaModuleFactory;
  };
  return {
    factory: mod.default,
    nodeWasmPath: wasmPath,
    browserWasmUrl: PATHS.glueUrl.replace(/\.js$/, '.wasm'),
  };
}

export const DEFAULT_PRESET = 'build';

export function loadAmaModule(preset: string = DEFAULT_PRESET): Promise<AmaModule> {
  if (!cached) {
    cached = (async () => {
      console.log(`[ama-wasm] loadAmaModule: loading factory…`);
      const t0 = performance.now();
      const { factory, nodeWasmPath, browserWasmUrl } = await loadFactoryAndPaths();
      console.log(`[ama-wasm] factory loaded in ${(performance.now() - t0).toFixed(0)}ms`);

      const t1 = performance.now();
      const Module = await factory({
        locateFile: (path: string) => {
          if (!path.endsWith('.wasm')) return path;
          const url = nodeWasmPath ?? browserWasmUrl;
          console.log(`[ama-wasm] locateFile -> ${url}`);
          return url;
        },
      });
      console.log(`[ama-wasm] WASM instantiated in ${(performance.now() - t1).toFixed(0)}ms`);

      const t2 = performance.now();
      const initRet = Module.ccall('ama_init_preset', 'number', ['string'], [preset]);
      console.log(`[ama-wasm] ama_init_preset(${preset}) returned ${initRet} in ${(performance.now() - t2).toFixed(0)}ms`);
      if (initRet < 0) {
        throw new Error(`ama_init_preset(${preset}) failed: ${initRet}`);
      }
      if (initRet === 0) {
        throw new Error(`ama_init_preset(${preset}) read empty weight`);
      }
      currentPreset = preset;
      return Module;
    })();
  }
  return cached;
}

// 既にロード済みの WASM の g_weight (と form active_mask) を別 preset に切り替える。
export async function setAmaPreset(preset: string): Promise<number> {
  const m = await loadAmaModule(preset);
  if (preset === currentPreset) return -1;
  const ret = m.ccall('ama_init_preset', 'number', ['string'], [preset]);
  console.log(`[ama-wasm] setAmaPreset(${preset}) -> ${ret}`);
  if (ret < 0) throw new Error(`ama_init_preset(${preset}) failed: ${ret}`);
  if (ret === 0) throw new Error(`ama_init_preset(${preset}) read empty weight`);
  currentPreset = preset;
  return ret;
}

export function getAmaPreset(): string {
  return currentPreset ?? DEFAULT_PRESET;
}

export function _resetAmaModuleCache(): void {
  cached = null;
  currentPreset = null;
}
