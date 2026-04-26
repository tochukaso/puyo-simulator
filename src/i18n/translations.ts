export type Lang = 'ja' | 'en' | 'zh' | 'ko';

export const LANGUAGES: readonly Lang[] = ['ja', 'en', 'zh', 'ko'] as const;

export const LANGUAGE_LABELS: Record<Lang, string> = {
  ja: '日本語',
  en: 'English',
  zh: '中文',
  ko: '한국어',
};

export interface Dict {
  'app.title': string;
  'header.ghost': string;
  'header.ai': string;
  'header.language': string;
  'stats.score': string;
  'stats.chain': string;
  'stats.max': string;
  'stats.total': string;
  'stats.gameOver': string;
  'controls.rotateCcw': string;
  'controls.commit': string;
  'controls.aiBest': string;
  'controls.aiBestTitle': string;
  'controls.aiThinking': string;
  'controls.undo': string;
  'controls.undoAria': string;
  'controls.undoStepsLabel': string;
  'controls.stepsOption': string;
  'controls.reset': string;
  'controls.resetConfirm': string;
  'candidates.title': string;
  'candidates.loading': string;
  'candidates.thinking': string;
  'candidates.colRot': string;
  'candidates.execute': string;
  'board.chain': string;
}

export const translations: Record<Lang, Dict> = {
  ja: {
    'app.title': 'ぷよトレーニング',
    'header.ghost': 'ゴースト',
    'header.ai': 'AI',
    'header.language': '言語',
    'stats.score': 'スコア',
    'stats.chain': '連鎖',
    'stats.max': '最大',
    'stats.total': '合計',
    'stats.gameOver': 'ゲームオーバー',
    'controls.rotateCcw': '↻ 左回転',
    'controls.commit': '↓ 確定',
    'controls.aiBest': '★ AI最善',
    'controls.aiBestTitle': 'AI最善手: 列{col} / 回転{rot}',
    'controls.aiThinking': 'AI 思考中…',
    'controls.undo': '↶ 戻る',
    'controls.undoAria': '{n} 手戻る',
    'controls.undoStepsLabel': '戻る手数',
    'controls.stepsOption': '{n} 手',
    'controls.reset': 'リセット',
    'controls.resetConfirm': 'リセットしますか?',
    'candidates.title': 'AI候補',
    'candidates.loading': '{aiKind} 読み込み中…',
    'candidates.thinking': '(思考中)',
    'candidates.colRot': '列{col} / 回転{rot}',
    'candidates.execute': '実行',
    'board.chain': '{n}れんさ!',
  },
  en: {
    'app.title': 'Puyo Training',
    'header.ghost': 'Ghost',
    'header.ai': 'AI',
    'header.language': 'Language',
    'stats.score': 'Score',
    'stats.chain': 'Chain',
    'stats.max': 'Max',
    'stats.total': 'Total',
    'stats.gameOver': 'GAME OVER',
    'controls.rotateCcw': '↻ CCW',
    'controls.commit': '↓ Drop',
    'controls.aiBest': '★ AI Best',
    'controls.aiBestTitle': 'AI best: col {col} / rot {rot}',
    'controls.aiThinking': 'AI thinking…',
    'controls.undo': '↶ Undo',
    'controls.undoAria': 'Undo {n} step(s)',
    'controls.undoStepsLabel': 'Undo steps',
    'controls.stepsOption': '{n}',
    'controls.reset': 'Reset',
    'controls.resetConfirm': 'Reset?',
    'candidates.title': 'AI candidates',
    'candidates.loading': 'Loading {aiKind}…',
    'candidates.thinking': '(thinking)',
    'candidates.colRot': 'col {col} / rot {rot}',
    'candidates.execute': 'Apply',
    'board.chain': '{n} chain!',
  },
  zh: {
    'app.title': '噗哟训练',
    'header.ghost': '幽灵预览',
    'header.ai': 'AI',
    'header.language': '语言',
    'stats.score': '得分',
    'stats.chain': '连锁',
    'stats.max': '最大',
    'stats.total': '合计',
    'stats.gameOver': '游戏结束',
    'controls.rotateCcw': '↻ 左旋',
    'controls.commit': '↓ 确定',
    'controls.aiBest': '★ AI最佳',
    'controls.aiBestTitle': 'AI最佳: 列{col} / 旋转{rot}',
    'controls.aiThinking': 'AI 思考中…',
    'controls.undo': '↶ 撤销',
    'controls.undoAria': '撤销 {n} 步',
    'controls.undoStepsLabel': '撤销步数',
    'controls.stepsOption': '{n} 步',
    'controls.reset': '重置',
    'controls.resetConfirm': '确定要重置吗?',
    'candidates.title': 'AI候选',
    'candidates.loading': '{aiKind} 加载中…',
    'candidates.thinking': '(思考中)',
    'candidates.colRot': '列{col} / 旋转{rot}',
    'candidates.execute': '执行',
    'board.chain': '{n}连锁!',
  },
  ko: {
    'app.title': '뿌요 트레이닝',
    'header.ghost': '고스트',
    'header.ai': 'AI',
    'header.language': '언어',
    'stats.score': '점수',
    'stats.chain': '연쇄',
    'stats.max': '최대',
    'stats.total': '합계',
    'stats.gameOver': '게임 오버',
    'controls.rotateCcw': '↻ 좌회전',
    'controls.commit': '↓ 확정',
    'controls.aiBest': '★ AI 최선',
    'controls.aiBestTitle': 'AI 최선수: 열 {col} / 회전 {rot}',
    'controls.aiThinking': 'AI 생각 중…',
    'controls.undo': '↶ 되돌리기',
    'controls.undoAria': '{n}수 되돌리기',
    'controls.undoStepsLabel': '되돌릴 수',
    'controls.stepsOption': '{n}수',
    'controls.reset': '초기화',
    'controls.resetConfirm': '초기화하시겠습니까?',
    'candidates.title': 'AI 후보',
    'candidates.loading': '{aiKind} 로딩 중…',
    'candidates.thinking': '(생각 중)',
    'candidates.colRot': '열 {col} / 회전 {rot}',
    'candidates.execute': '실행',
    'board.chain': '{n}연쇄!',
  },
};
