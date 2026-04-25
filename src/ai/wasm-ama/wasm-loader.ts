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

let cached: Promise<AmaModule> | null = null;

function isVitest(): boolean {
  return typeof process !== 'undefined' && process.env.VITEST === 'true';
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && !isVitest();
}

async function loadFactoryAndPaths(): Promise<{
  factory: AmaModuleFactory;
  nodeWasmPath: string | null;
}> {
  if (isBrowser()) {
    // Fetch the glue from /public/wasm/ama.js directly (no Vite import path).
    // Any Vite-aware import (even ?url) hangs in worker context. fetch +
    // Blob URL bypasses Vite entirely.
    console.log('[ama-wasm] step 1: fetching /wasm/ama.js');
    const res = await fetch('/wasm/ama.js');
    if (!res.ok) {
      throw new Error(`failed to fetch ama glue: ${res.status} ${res.statusText}`);
    }
    const code = await res.text();
    console.log(`[ama-wasm] step 2: glue text fetched (${code.length} bytes)`);

    const blob = new Blob([code], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    console.log(`[ama-wasm] step 3: blob URL created`);

    try {
      console.log('[ama-wasm] step 4: dynamic-importing blob URL');
      const mod = (await import(/* @vite-ignore */ blobUrl)) as {
        default: AmaModuleFactory;
      };
      console.log(`[ama-wasm] step 5: blob imported, factory type = ${typeof mod.default}`);
      return { factory: mod.default, nodeWasmPath: null };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const jsPath = resolve(process.cwd(), 'src/ai/wasm-ama/_glue/ama.js');
  const wasmPath = resolve(process.cwd(), 'public/wasm/ama.wasm');
  const mod = (await import(/* @vite-ignore */ pathToFileURL(jsPath).href)) as {
    default: AmaModuleFactory;
  };
  return { factory: mod.default, nodeWasmPath: wasmPath };
}

export function loadAmaModule(): Promise<AmaModule> {
  if (!cached) {
    cached = (async () => {
      console.log('[ama-wasm] loadAmaModule: loading factory…');
      const t0 = performance.now();
      const { factory, nodeWasmPath } = await loadFactoryAndPaths();
      console.log(`[ama-wasm] factory loaded in ${(performance.now() - t0).toFixed(0)}ms`);

      const t1 = performance.now();
      const Module = await factory({
        locateFile: (path: string) => {
          if (!path.endsWith('.wasm')) return path;
          const url = nodeWasmPath ?? '/wasm/ama.wasm';
          console.log(`[ama-wasm] locateFile -> ${url}`);
          return url;
        },
      });
      console.log(`[ama-wasm] WASM instantiated in ${(performance.now() - t1).toFixed(0)}ms`);

      const t2 = performance.now();
      const initRet = Module.ccall('ama_init', 'number', [], []);
      console.log(`[ama-wasm] ama_init returned ${initRet} in ${(performance.now() - t2).toFixed(0)}ms`);
      if (initRet !== 0) {
        throw new Error(`ama_init failed: ${initRet}`);
      }
      return Module;
    })();
  }
  return cached;
}

export function _resetAmaModuleCache(): void {
  cached = null;
}
