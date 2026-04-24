import { Board } from './ui/components/Board/Board';
import { NextQueue } from './ui/components/NextQueue/NextQueue';
import { Stats } from './ui/components/Stats/Stats';
import { Controls } from './ui/components/Controls/Controls';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center gap-4 py-4">
      <Stats />
      <NextQueue />
      <Board />
      <Controls />
    </div>
  );
}
