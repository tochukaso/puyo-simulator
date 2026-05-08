import { isTauri } from '../ai/native-ama/tauri-bridge';
import type { GameMode } from './store';

// 候補手リスト・ゴースト・AI Best ボタンといった「AI ヒント系 UI」を出して
// よいかどうか。 free は web/Tauri を問わず常に許可。 match / score / daily は
// Tauri (= Android アプリ) ビルドでのみ許可する — モバイルでは盤面が小さく
// 手読みが辛く、 かつ ama-native が main thread で即応するため UX 的に出して
// 価値がある。 web 版はリーダーボード公平性を優先して従来どおり非表示。
//
// switch は exhaustive (`never` チェック付き)。 GameMode に新しい値を足したら
// この関数が型エラーで赤くなり、 「Tauri だから自動で AI ヒント許可」という
// 意図しない fall-through を防ぐ。
export function isAiAssistMode(mode: GameMode): boolean {
  switch (mode) {
    case 'free':
      return true;
    case 'match':
    case 'score':
    case 'daily':
      return isTauri();
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}
