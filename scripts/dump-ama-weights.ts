import { loadAmaModule } from '../src/ai/wasm-ama/wasm-loader';

const KEYS = [
  'chain', 'y', 'key', 'chi',
  'shape', 'well', 'bump', 'form',
  'link_2', 'link_3', 'waste_14', 'side', 'nuisance',
  'tear', 'waste',
];

async function main() {
  const m = await loadAmaModule();
  const diag = m.cwrap('ama_diag_weight', 'number', ['number']);
  for (let i = 0; i < KEYS.length; i++) {
    const v = diag(i);
    console.log(`${i.toString().padStart(2)} ${KEYS[i]!.padEnd(10)} = ${v}`);
  }
}

void main();
