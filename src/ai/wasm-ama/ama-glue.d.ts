declare module './_glue/ama.js' {
  type LocateFile = (path: string) => string;
  interface AmaModuleInstance {
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
  type AmaModuleFactory = (config?: { locateFile?: LocateFile }) => Promise<AmaModuleInstance>;
  const factory: AmaModuleFactory;
  export default factory;
}
