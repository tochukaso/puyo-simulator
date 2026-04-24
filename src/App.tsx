import { Board } from './ui/components/Board/Board';
import { NextQueue } from './ui/components/NextQueue/NextQueue';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center gap-4 py-4">
      <NextQueue />
      <Board />
    </div>
  );
}
