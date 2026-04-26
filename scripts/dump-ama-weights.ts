import {
  loadAmaModule,
  setAmaPreset,
  type AmaVariant,
} from '../src/ai/wasm-ama/wasm-loader';

// usage: npx tsx scripts/dump-ama-weights.ts [preset] [variant]
//   preset:  build (default) | gtr | ac | fast | freestyle
//   variant: default (default) | gtr-only

const KEYS = [
  'chain', 'y', 'key', 'chi',
  'shape', 'well', 'bump', 'form',
  'link_2', 'link_3', 'waste_14', 'side', 'nuisance',
  'tear', 'waste',
];

async function main() {
  const preset = process.argv[2] ?? 'build';
  const variant = (process.argv[3] ?? 'default') as AmaVariant;
  const m = await loadAmaModule(variant, preset);
  await setAmaPreset(variant, preset);
  const diag = m.cwrap('ama_diag_weight', 'number', ['number']);
  console.log(`# variant: ${variant}`);
  console.log(`# preset:  ${preset}`);
  for (let i = 0; i < KEYS.length; i++) {
    const v = diag(i);
    console.log(`${i.toString().padStart(2)} ${KEYS[i]!.padEnd(10)} = ${v}`);
  }
}

void main();
