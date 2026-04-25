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
    const mod = (await import(/* @vite-ignore */ '/wasm/ama.js')) as {
      default: AmaModuleFactory;
    };
    return { factory: mod.default, nodeWasmPath: null };
  }
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  const jsPath = resolve(process.cwd(), 'public/wasm/ama.js');
  const wasmPath = resolve(process.cwd(), 'public/wasm/ama.wasm');
  const mod = (await import(/* @vite-ignore */ pathToFileURL(jsPath).href)) as {
    default: AmaModuleFactory;
  };
  return { factory: mod.default, nodeWasmPath: wasmPath };
}

export function loadAmaModule(): Promise<AmaModule> {
  if (!cached) {
    cached = (async () => {
      const { factory, nodeWasmPath } = await loadFactoryAndPaths();
      const Module = await factory({
        locateFile: (path: string) => {
          if (!path.endsWith('.wasm')) return path;
          return nodeWasmPath ?? '/wasm/ama.wasm';
        },
      });
      const initRet = Module.ccall('ama_init', 'number', [], []);
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
