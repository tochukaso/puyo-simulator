import { loadAmaModule, setAmaPreset } from '../src/ai/wasm-ama/wasm-loader';

// usage: npx tsx scripts/dump-ama-weights.ts [preset]
//   preset:  build (default) | gtr | kaidan | ac | fast | freestyle

const KEYS = [
  'chain', 'y', 'key', 'chi',
  'shape', 'well', 'bump', 'form',
  'link_2', 'link_3', 'waste_14', 'side', 'nuisance',
  'tear', 'waste',
];

async function main() {
  const preset = process.argv[2] ?? 'build';
  const m = await loadAmaModule(preset);
  await setAmaPreset(preset);
  const diag = m.cwrap('ama_diag_weight', 'number', ['number']);
  console.log(`# preset: ${preset}`);
  for (let i = 0; i < KEYS.length; i++) {
    const v = diag(i);
    console.log(`${i.toString().padStart(2)} ${KEYS[i]!.padEnd(10)} = ${v}`);
  }
}

void main();
