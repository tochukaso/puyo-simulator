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

// Variant = which WASM binary to load.
//   'default'  : ama.wasm — standard ama (form::list = { GTR, FRON, SGTR })
//   'gtr-only' : ama-gtr.wasm — training build (form::list = { GTR } only;
//                a GTR-building AI)
export type AmaVariant = 'default' | 'gtr-only';

interface VariantPaths {
  // URL for browser fetch (public/wasm/...)
  glueUrl: string;
  // Absolute path for node
  glueRel: string; // src/ai/wasm-ama/_glue/<file>
  wasmRel: string; // public/wasm/<file>
}

const VARIANT_PATHS: Readonly<Record<AmaVariant, VariantPaths>> = {
  default: {
    glueUrl: '/wasm/ama.js',
    glueRel: 'src/ai/wasm-ama/_glue/ama.js',
    wasmRel: 'public/wasm/ama.wasm',
  },
  'gtr-only': {
    glueUrl: '/wasm/ama-gtr.js',
    glueRel: 'src/ai/wasm-ama/_glue/ama-gtr.js',
    wasmRel: 'public/wasm/ama-gtr.wasm',
  },
};

const cached: Partial<Record<AmaVariant, Promise<AmaModule>>> = {};
const currentPresetByVariant: Partial<Record<AmaVariant, string>> = {};

function isVitest(): boolean {
  return typeof process !== 'undefined' && process.env.VITEST === 'true';
}

function isBrowser(): boolean {
  // Browser main: window + self defined.
  // Browser/dedicated worker: self defined, window undefined.
  // Node: neither defined.
  // Vitest (jsdom): both defined AND process defined — gated by VITEST env.
  if (isVitest()) return false;
  return typeof self !== 'undefined' && typeof process === 'undefined';
}

async function loadFactoryAndPaths(variant: AmaVariant): Promise<{
  factory: AmaModuleFactory;
  nodeWasmPath: string | null;
  browserWasmUrl: string;
}> {
  const paths = VARIANT_PATHS[variant];
  if (isBrowser()) {
    // Fetch the glue from public/wasm/ directly (without going through the Vite import path).
    // Any Vite-aware import (even ?url) hangs in worker context. fetch +
    // Blob URL bypasses Vite entirely.
    console.log(`[ama-wasm:${variant}] step 1: fetching ${paths.glueUrl}`);
    const res = await fetch(paths.glueUrl);
    if (!res.ok) {
      throw new Error(`failed to fetch ama glue (${variant}): ${res.status} ${res.statusText}`);
    }
    const code = await res.text();
    console.log(`[ama-wasm:${variant}] step 2: glue text fetched (${code.length} bytes)`);

    const blob = new Blob([code], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    console.log(`[ama-wasm:${variant}] step 3: blob URL created`);

    try {
      console.log(`[ama-wasm:${variant}] step 4: dynamic-importing blob URL`);
      const mod = (await import(/* @vite-ignore */ blobUrl)) as {
        default: AmaModuleFactory;
      };
      console.log(`[ama-wasm:${variant}] step 5: blob imported, factory type = ${typeof mod.default}`);
      return {
        factory: mod.default,
        nodeWasmPath: null,
        browserWasmUrl: paths.glueUrl.replace(/\.js$/, '.wasm'),
      };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const jsPath = resolve(process.cwd(), paths.glueRel);
  const wasmPath = resolve(process.cwd(), paths.wasmRel);
  const mod = (await import(/* @vite-ignore */ pathToFileURL(jsPath).href)) as {
    default: AmaModuleFactory;
  };
  return {
    factory: mod.default,
    nodeWasmPath: wasmPath,
    browserWasmUrl: paths.glueUrl.replace(/\.js$/, '.wasm'),
  };
}

export const DEFAULT_PRESET = 'build';
export const DEFAULT_VARIANT: AmaVariant = 'default';

export function loadAmaModule(
  variant: AmaVariant = DEFAULT_VARIANT,
  preset: string = DEFAULT_PRESET,
): Promise<AmaModule> {
  let p = cached[variant];
  if (!p) {
    p = (async () => {
      console.log(`[ama-wasm:${variant}] loadAmaModule: loading factory…`);
      const t0 = performance.now();
      const { factory, nodeWasmPath, browserWasmUrl } = await loadFactoryAndPaths(variant);
      console.log(`[ama-wasm:${variant}] factory loaded in ${(performance.now() - t0).toFixed(0)}ms`);

      const t1 = performance.now();
      const Module = await factory({
        locateFile: (path: string) => {
          if (!path.endsWith('.wasm')) return path;
          const url = nodeWasmPath ?? browserWasmUrl;
          console.log(`[ama-wasm:${variant}] locateFile -> ${url}`);
          return url;
        },
      });
      console.log(`[ama-wasm:${variant}] WASM instantiated in ${(performance.now() - t1).toFixed(0)}ms`);

      const t2 = performance.now();
      const initRet = Module.ccall('ama_init_preset', 'number', ['string'], [preset]);
      console.log(`[ama-wasm:${variant}] ama_init_preset(${preset}) returned ${initRet} in ${(performance.now() - t2).toFixed(0)}ms`);
      if (initRet < 0) {
        throw new Error(`ama_init_preset(${preset}) failed on ${variant}: ${initRet}`);
      }
      if (initRet === 0) {
        throw new Error(`ama_init_preset(${preset}) read empty weight on ${variant}`);
      }
      currentPresetByVariant[variant] = preset;
      return Module;
    })();
    cached[variant] = p;
  }
  return p;
}

// Switch g_weight on the given variant's loaded WASM to a different preset.
// Each variant has its own currentPreset state since they're separate Modules.
export async function setAmaPreset(
  variant: AmaVariant,
  preset: string,
): Promise<number> {
  const m = await loadAmaModule(variant, preset);
  if (preset === currentPresetByVariant[variant]) return -1;
  const ret = m.ccall('ama_init_preset', 'number', ['string'], [preset]);
  console.log(`[ama-wasm:${variant}] setAmaPreset(${preset}) -> ${ret}`);
  if (ret < 0) throw new Error(`ama_init_preset(${preset}) failed on ${variant}: ${ret}`);
  if (ret === 0) throw new Error(`ama_init_preset(${preset}) read empty weight on ${variant}`);
  currentPresetByVariant[variant] = preset;
  return ret;
}

export function getAmaPreset(variant: AmaVariant = DEFAULT_VARIANT): string {
  return currentPresetByVariant[variant] ?? DEFAULT_PRESET;
}

export function _resetAmaModuleCache(): void {
  for (const k of Object.keys(cached) as AmaVariant[]) {
    delete cached[k];
    delete currentPresetByVariant[k];
  }
}
