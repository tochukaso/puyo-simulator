import { useKeyboard } from './ui/hooks/useKeyboard';
import { Board } from './ui/components/Board/Board';
import { NextQueue } from './ui/components/NextQueue/NextQueue';
import { Stats } from './ui/components/Stats/Stats';
import { Controls } from './ui/components/Controls/Controls';

export default function App() {
  useKeyboard();
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="p-3 border-b border-slate-800 text-lg">Puyo Training</header>
      <div className="flex-1 flex flex-col items-center gap-3 p-3 lg:flex-row lg:items-start lg:justify-center">
        <div className="flex flex-col items-center gap-3 w-full max-w-sm">
          <div className="flex gap-4 items-center justify-between w-full">
            <NextQueue />
            <Stats />
          </div>
          <Board />
          <Controls />
        </div>
      </div>
    </div>
  );
}
