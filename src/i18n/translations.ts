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
  'header.ceiling': string;
  'header.trainer': string;
  'header.trainerOff': string;
  'header.trainerGtr': string;
  'header.trainerKaidan': string;
  'header.gameMode': string;
  'header.modeFree': string;
  'header.modeMatch': string;
  'header.modeScore': string;
  'header.turnLimit': string;
  'header.turnUnlimited': string;
  'controls.rotateCcw': string;
  'match.quit': string;
  'match.quitConfirm': string;
  'match.scoreFinal': string;
  'match.shareReplay': string;
  'share.replayTitle': string;
  'share.replayCopy': string;
  'share.replayNote': string;
  'share.serverSubmit': string;
  'share.serverUploading': string;
  'share.serverRetry': string;
  'share.serverShortReady': string;
  'share.serverFailed': string;
  'match.turn': string;
  'match.remaining': string;
  'match.you': string;
  'match.ama': string;
  'match.viewYou': string;
  'match.viewAi': string;
  'match.scrub': string;
  'match.playerScrub': string;
  'match.youWin': string;
  'match.amaWin': string;
  'match.draw': string;
  'match.rematch': string;
  'match.save': string;
  'match.saved': string;
  'match.records': string;
  'match.deleteRecord': string;
  'match.resign': string;
  'match.resignConfirm': string;
  'match.playChain': string;
  'match.playChainTitle': string;
  'match.stepBackTitle': string;
  'match.stepForwardTitle': string;
  'match.viewingRecord': string;
  'match.exitReplay': string;
  'records.button': string;
  'records.title': string;
  'records.close': string;
  'records.loading': string;
  'records.empty': string;
  'records.replay': string;
  'records.replayTitle': string;
  'records.note': string;
  'edit.edit': string;
  'edit.editing': string;
  'edit.apply': string;
  'edit.cancel': string;
  'edit.clear': string;
  'edit.clearConfirm': string;
  'edit.matchExitConfirm': string;
  'edit.erase': string;
  'edit.garbage': string;
  'edit.color.R': string;
  'edit.color.B': string;
  'edit.color.Y': string;
  'edit.color.P': string;
  'edit.pair.current': string;
  'edit.pair.next1': string;
  'edit.pair.next2': string;
  'share.button': string;
  'share.title': string;
  'share.close': string;
  'share.copy': string;
  'share.copied': string;
  'share.note': string;
  'share.unavailable': string;
  'header.language': string;
  'stats.score': string;
  'stats.chain': string;
  'stats.max': string;
  'stats.total': string;
  'stats.gameOver': string;
  'stats.aiMatch': string;
  'stats.aiMatchTitle': string;
  'stats.aiAvg': string;
  'stats.aiAvgTitle': string;
  'stats.analyze': string;
  'stats.analyzing': string;
  'stats.analyzeTitle': string;
  'menu.toggle': string;
  'analysis.title': string;
  'analysis.close': string;
  'analysis.start': string;
  'analysis.reanalyze': string;
  'analysis.analyzing': string;
  'analysis.noMoves': string;
  'analysis.matchInProgress': string;
  'analysis.notAnalyzedYet': string;
  'analysis.note': string;
  'controls.moveLeft': string;
  'controls.moveRight': string;
  'controls.softDrop': string;
  'controls.rotateCw': string;
  'controls.commit': string;
  'controls.aiBest': string;
  'controls.aiBestTitle': string;
  'controls.aiThinking': string;
  'controls.undo': string;
  'controls.undoAria': string;
  'controls.reset': string;
  'controls.resetConfirm': string;
  'candidates.title': string;
  'candidates.loading': string;
  'candidates.thinking': string;
  'candidates.colRot': string;
  'candidates.execute': string;
  'candidates.collapse': string;
  'candidates.expand': string;
  'board.chain': string;
  'menu.manual': string;
}

export const translations: Record<Lang, Dict> = {
  ja: {
    'app.title': 'GTR トレーニング',
    'header.ghost': 'ゴースト',
    'header.ceiling': '天井',
    'header.trainer': 'テンプレ',
    'header.trainerOff': 'なし',
    'header.trainerGtr': 'GTR',
    'header.trainerKaidan': '階段',
    'header.gameMode': 'モード',
    'header.modeFree': 'フリー',
    'header.modeMatch': '対amaスコア勝負',
    'header.modeScore': 'スコアアタック',
    'header.turnLimit': '手数',
    'header.turnUnlimited': '無制限',
    'controls.rotateCcw': '↺ 左回転',
    'match.quit': '終了',
    'match.quitConfirm': '本当にゲームを終了しますか? 現在のスコアで確定します。',
    'match.scoreFinal': '最終スコア',
    'match.shareReplay': 'リプレイを共有',
    'share.replayTitle': 'リプレイを共有',
    'share.replayCopy': 'URLをコピー',
    'share.replayNote': 'この URL を開くと、同じ seed と同じ手順でリプレイが再生されます。',
    'share.serverSubmit': 'サーバに送信して短縮 URL を取得',
    'share.serverUploading': '送信中…',
    'share.serverRetry': '送信失敗 — 再試行',
    'share.serverShortReady': '短縮 URL を取得しました。上の URL をコピーしてください。',
    'share.serverFailed': 'サーバ送信に失敗しました。長い URL は引き続き使えます。',
    'match.turn': 'ターン',
    'match.remaining': '残り{n}',
    'match.you': 'あなた',
    'match.ama': 'ama',
    'match.viewYou': '自分の盤面',
    'match.viewAi': 'amaの盤面',
    'match.scrub': 'amaヒストリー',
    'match.playerScrub': '自分のヒストリー',
    'match.youWin': '勝利!',
    'match.amaWin': 'amaの勝ち',
    'match.draw': '引き分け',
    'match.rematch': '再戦',
    'match.save': '保存',
    'match.saved': '保存済み',
    'match.records': '保存した対戦',
    'match.deleteRecord': 'レコードを削除',
    'match.resign': '投了',
    'match.resignConfirm': '本当に投了しますか? このマッチは ama の勝利として終了します。',
    'match.playChain': '▶ 再生',
    'match.playChainTitle': 'このターンの連鎖をアニメーションで再生',
    'match.stepBackTitle': '1手前に戻る',
    'match.stepForwardTitle': '1手先に進む',
    'match.viewingRecord': '保存した対戦をリプレイ表示中',
    'match.exitReplay': 'リプレイ終了',
    'records.button': '保存した対戦',
    'records.title': '保存した対戦',
    'records.close': '閉じる',
    'records.loading': '読み込み中…',
    'records.empty': 'まだ保存された対戦はありません。マッチ終了後に「保存」を押すと残せます。',
    'records.replay': '▶ 再生',
    'records.replayTitle': 'この対戦をリプレイ表示する',
    'records.note': '再生を押すと、ヒストリーを使って盤面と連鎖を見返せます。再戦すると現在の対戦表示は破棄されます。',
    'edit.edit': '編集',
    'edit.editing': '編集中',
    'edit.apply': '適用',
    'edit.cancel': 'キャンセル',
    'edit.clear': '盤面クリア',
    'edit.clearConfirm': '盤面を全て消しますか?',
    'edit.matchExitConfirm': 'マッチを終了して編集モードに入りますか? (現在のマッチは中断されます)',
    'edit.erase': '消去',
    'edit.garbage': 'おじゃま',
    'edit.color.R': '赤',
    'edit.color.B': '青',
    'edit.color.Y': '黄',
    'edit.color.P': '緑',
    'edit.pair.current': '現在',
    'edit.pair.next1': 'NEXT',
    'edit.pair.next2': 'NEXT2',
    'share.button': '共有',
    'share.title': '盤面を共有',
    'share.close': '閉じる',
    'share.copy': 'URLをコピー',
    'share.copied': 'コピーしました',
    'share.note': 'この URL を開くと、現在の盤面 (フィールド + 現在ペア + NEXT2 つ) で再開できます。スコアや履歴は引き継がれません。',
    'share.unavailable': '現在は共有できません(操作可能なペアが無いため)。',
    'header.language': '言語',
    'stats.score': 'スコア',
    'stats.chain': '連鎖',
    'stats.max': '最大',
    'stats.total': '合計',
    'stats.gameOver': 'ゲームオーバー',
    'stats.aiMatch': 'AI一致',
    'stats.aiMatchTitle': '自分の手がAI最善手と一致した割合 (AI Best ボタン経由は除外)',
    'stats.aiAvg': 'AI評価',
    'stats.aiAvgTitle': '自分の手のAI評価値 (AI最善のスコアを100%として)。AI上位5候補に入った手のみ平均',
    'stats.analyze': '解析',
    'stats.analyzing': '解析中…',
    'stats.analyzeTitle': '今までの自分の手を ama に再評価させ、AI 一致率と AI 評価値を算出します。手数によっては数秒〜数十秒かかります。',
    'menu.toggle': 'メニュー',
    'analysis.title': '解析結果',
    'analysis.close': '閉じる',
    'analysis.start': '解析を開始',
    'analysis.reanalyze': '再解析',
    'analysis.analyzing': '解析中… しばらくお待ちください',
    'analysis.noMoves': 'まだ解析できる手がありません。',
    'analysis.matchInProgress': 'マッチが終了してから解析できます。',
    'analysis.notAnalyzedYet': 'まだ解析していません。',
    'analysis.note': 'AI 一致 = 自分の手が ama の最善手と一致した割合。AI 評価 = 自分の手が ama の最善手のスコアに対して何 % だったかの平均(top 5 に入った手のみ)。',
    'controls.moveLeft': '← 左',
    'controls.moveRight': '右 →',
    'controls.softDrop': '↓ 1段下',
    'controls.rotateCw': '↻ 右回転',
    'controls.commit': '↓ 確定',
    'controls.aiBest': '★ AI最善',
    'controls.aiBestTitle': 'AI最善手: 列{col} / 回転{rot}',
    'controls.aiThinking': 'AI 思考中…',
    'controls.undo': '↶ 戻る',
    'controls.undoAria': '{n} 手戻る',
    'controls.reset': 'リセット',
    'controls.resetConfirm': 'リセットしますか?',
    'candidates.title': 'AI候補',
    'candidates.loading': '{aiKind} 読み込み中…',
    'candidates.thinking': '(思考中)',
    'candidates.colRot': '列{col} / 回転{rot}',
    'candidates.execute': '実行',
    'candidates.collapse': '候補を折りたたむ',
    'candidates.expand': '候補を展開',
    'board.chain': '{n}れんさ!',
    'menu.manual': 'マニュアル',
  },
  en: {
    'app.title': 'GTR Training',
    'header.ghost': 'Ghost',
    'header.ceiling': 'Ceiling',
    'header.trainer': 'Template',
    'header.trainerOff': 'None',
    'header.trainerGtr': 'GTR',
    'header.trainerKaidan': 'Staircase',
    'header.gameMode': 'Mode',
    'header.modeFree': 'Free',
    'header.modeMatch': 'Score vs ama',
    'header.modeScore': 'Score attack',
    'header.turnLimit': 'Turns',
    'header.turnUnlimited': 'Unlimited',
    'controls.rotateCcw': '↺ CCW',
    'match.quit': 'Quit',
    'match.quitConfirm': 'End this run now? The current score will be locked in.',
    'match.scoreFinal': 'Final score',
    'match.shareReplay': 'Share replay',
    'share.replayTitle': 'Share replay',
    'share.replayCopy': 'Copy URL',
    'share.replayNote': "Opening this URL replays the same seed and the same move sequence.",
    'share.serverSubmit': 'Send to server for short URL',
    'share.serverUploading': 'Uploading…',
    'share.serverRetry': 'Upload failed — retry',
    'share.serverShortReady': 'Short URL ready. Copy the URL above.',
    'share.serverFailed': 'Server upload failed. The long URL still works.',
    'match.turn': 'Turn',
    'match.remaining': '{n} left',
    'match.you': 'You',
    'match.ama': 'ama',
    'match.viewYou': 'Your board',
    'match.viewAi': "ama's board",
    'match.scrub': 'ama history',
    'match.playerScrub': 'your history',
    'match.youWin': 'You win!',
    'match.amaWin': 'ama wins',
    'match.draw': 'Draw',
    'match.rematch': 'Rematch',
    'match.save': 'Save',
    'match.saved': 'Saved',
    'match.records': 'Saved matches',
    'match.deleteRecord': 'Delete record',
    'match.resign': 'Resign',
    'match.resignConfirm': 'Resign this match? It will end as a loss for you.',
    'match.playChain': '▶ Replay',
    'match.playChainTitle': "Replay this turn's chain animation",
    'match.stepBackTitle': 'Step back one move',
    'match.stepForwardTitle': 'Step forward one move',
    'match.viewingRecord': 'Viewing a saved match',
    'match.exitReplay': 'Exit replay',
    'records.button': 'Saved matches',
    'records.title': 'Saved matches',
    'records.close': 'Close',
    'records.loading': 'Loading…',
    'records.empty': 'No saved matches yet. Press "Save" after a match ends to keep it here.',
    'records.replay': '▶ Replay',
    'records.replayTitle': 'Replay this match',
    'records.note': 'Press Replay to scrub through turns and re-watch chains. Starting a new match clears this view.',
    'edit.edit': 'Edit',
    'edit.editing': 'Editing',
    'edit.apply': 'Apply',
    'edit.cancel': 'Cancel',
    'edit.clear': 'Clear',
    'edit.clearConfirm': 'Clear the entire field?',
    'edit.matchExitConfirm': 'End the current match and enter edit mode? (the match will be aborted)',
    'edit.erase': 'Erase',
    'edit.garbage': 'Garbage',
    'edit.color.R': 'Red',
    'edit.color.B': 'Blue',
    'edit.color.Y': 'Yellow',
    'edit.color.P': 'Green',
    'edit.pair.current': 'Current',
    'edit.pair.next1': 'Next',
    'edit.pair.next2': 'Next 2',
    'share.button': 'Share',
    'share.title': 'Share board',
    'share.close': 'Close',
    'share.copy': 'Copy URL',
    'share.copied': 'Copied!',
    'share.note': "Opening this URL recreates the current board (field + current pair + 2 NEXT pairs). Score and history aren't carried over.",
    'share.unavailable': 'Cannot share right now (no active pair).',
    'header.language': 'Language',
    'stats.score': 'Score',
    'stats.chain': 'Chain',
    'stats.max': 'Max',
    'stats.total': 'Total',
    'stats.gameOver': 'GAME OVER',
    'stats.aiMatch': 'AI match',
    'stats.aiMatchTitle': "How often your move matched the AI's best (AI Best button excluded)",
    'stats.aiAvg': 'AI eval',
    'stats.aiAvgTitle': "Your move's AI evaluation, with the AI's best as 100%. Averaged over moves that fell within the AI's top 5",
    'stats.analyze': 'Analyze',
    'stats.analyzing': 'Analyzing…',
    'stats.analyzeTitle': 'Re-evaluate every move you played with ama, then compute AI match% and AI eval%. Takes a few seconds for short games.',
    'menu.toggle': 'Menu',
    'analysis.title': 'Analysis result',
    'analysis.close': 'Close',
    'analysis.start': 'Run analysis',
    'analysis.reanalyze': 'Re-analyze',
    'analysis.analyzing': 'Analyzing… please wait',
    'analysis.noMoves': 'No moves to analyze yet.',
    'analysis.matchInProgress': 'Available after the match ends.',
    'analysis.notAnalyzedYet': 'Not analyzed yet.',
    'analysis.note': "AI match = how often your move matched ama's best. AI eval = average of your move's score vs ama's best (only counts moves that fell within ama's top 5).",
    'controls.moveLeft': '← Left',
    'controls.moveRight': 'Right →',
    'controls.softDrop': '↓ Down',
    'controls.rotateCw': '↻ CW',
    'controls.commit': '↓ Drop',
    'controls.aiBest': '★ AI Best',
    'controls.aiBestTitle': 'AI best: col {col} / rot {rot}',
    'controls.aiThinking': 'AI thinking…',
    'controls.undo': '↶ Undo',
    'controls.undoAria': 'Undo {n} step(s)',
    'controls.reset': 'Reset',
    'controls.resetConfirm': 'Reset?',
    'candidates.title': 'AI candidates',
    'candidates.loading': 'Loading {aiKind}…',
    'candidates.thinking': '(thinking)',
    'candidates.colRot': 'col {col} / rot {rot}',
    'candidates.execute': 'Go',
    'candidates.collapse': 'Collapse candidates',
    'candidates.expand': 'Expand candidates',
    'board.chain': '{n} chain!',
    'menu.manual': 'Manual',
  },
  zh: {
    'app.title': 'GTR 训练',
    'header.ghost': '幽灵预览',
    'header.ceiling': '顶部',
    'header.trainer': '模板',
    'header.trainerOff': '无',
    'header.trainerGtr': 'GTR',
    'header.trainerKaidan': '阶梯',
    'header.gameMode': '模式',
    'header.modeFree': '自由',
    'header.modeMatch': '与ama比分',
    'header.modeScore': '分数挑战',
    'header.turnLimit': '手数',
    'header.turnUnlimited': '无限',
    'controls.rotateCcw': '↺ 左旋',
    'match.quit': '结束',
    'match.quitConfirm': '确定要结束本局?当前分数将被锁定。',
    'match.scoreFinal': '最终分数',
    'match.shareReplay': '分享回放',
    'share.replayTitle': '分享回放',
    'share.replayCopy': '复制链接',
    'share.replayNote': '打开此链接会以相同的 seed 和落点序列回放。',
    'share.serverSubmit': '上传到服务器获取短链接',
    'share.serverUploading': '上传中…',
    'share.serverRetry': '上传失败 — 重试',
    'share.serverShortReady': '已生成短链接，请复制上方的 URL。',
    'share.serverFailed': '上传到服务器失败，长链接仍可用。',
    'match.turn': '回合',
    'match.remaining': '剩余{n}',
    'match.you': '你',
    'match.ama': 'ama',
    'match.viewYou': '你的棋盘',
    'match.viewAi': 'ama的棋盘',
    'match.scrub': 'ama历史',
    'match.playerScrub': '我的历史',
    'match.youWin': '你赢了!',
    'match.amaWin': 'ama获胜',
    'match.draw': '平局',
    'match.rematch': '再战',
    'match.save': '保存',
    'match.saved': '已保存',
    'match.records': '已保存的对战',
    'match.deleteRecord': '删除记录',
    'match.resign': '认输',
    'match.resignConfirm': '确定要认输吗？本场对战将记为 ama 胜利。',
    'match.playChain': '▶ 回放',
    'match.playChainTitle': '回放本回合的连锁动画',
    'match.stepBackTitle': '回退一步',
    'match.stepForwardTitle': '前进一步',
    'match.viewingRecord': '正在回放已保存的对战',
    'match.exitReplay': '退出回放',
    'records.button': '已保存的对战',
    'records.title': '已保存的对战',
    'records.close': '关闭',
    'records.loading': '加载中…',
    'records.empty': '还没有保存的对战。对战结束后按"保存"即可记录。',
    'records.replay': '▶ 回放',
    'records.replayTitle': '回放此对战',
    'records.note': '按回放可逐回合查看棋盘并重看连锁。开始新对战会清除当前视图。',
    'edit.edit': '编辑',
    'edit.editing': '编辑中',
    'edit.apply': '应用',
    'edit.cancel': '取消',
    'edit.clear': '清空',
    'edit.clearConfirm': '清空整个棋盘?',
    'edit.matchExitConfirm': '结束当前对战并进入编辑模式?(当前对战将被中断)',
    'edit.erase': '橡皮',
    'edit.garbage': '杂质',
    'edit.color.R': '红',
    'edit.color.B': '蓝',
    'edit.color.Y': '黄',
    'edit.color.P': '绿',
    'edit.pair.current': '当前',
    'edit.pair.next1': 'NEXT',
    'edit.pair.next2': 'NEXT2',
    'share.button': '分享',
    'share.title': '分享棋盘',
    'share.close': '关闭',
    'share.copy': '复制链接',
    'share.copied': '已复制',
    'share.note': '打开此链接可恢复当前棋盘 (场地 + 当前方块 + 2 个 NEXT)。分数和历史不会传递。',
    'share.unavailable': '当前无法分享 (没有可操作的方块)。',
    'header.language': '语言',
    'stats.score': '得分',
    'stats.chain': '连锁',
    'stats.max': '最大',
    'stats.total': '合计',
    'stats.gameOver': '游戏结束',
    'stats.aiMatch': 'AI一致',
    'stats.aiMatchTitle': '你的落点与AI最佳手一致的比例 (不计AI最佳按钮)',
    'stats.aiAvg': 'AI评分',
    'stats.aiAvgTitle': '你的落点的AI评分 (以AI最佳为100%)。仅平均落入AI前5候选的手',
    'stats.analyze': '解析',
    'stats.analyzing': '解析中…',
    'stats.analyzeTitle': '让 ama 重新评估你的每一手，计算 AI 一致率和 AI 评分。手数多时可能需要几秒到几十秒。',
    'menu.toggle': '菜单',
    'analysis.title': '解析结果',
    'analysis.close': '关闭',
    'analysis.start': '开始解析',
    'analysis.reanalyze': '重新解析',
    'analysis.analyzing': '解析中… 请稍候',
    'analysis.noMoves': '尚无可解析的落点。',
    'analysis.matchInProgress': '对战结束后可解析。',
    'analysis.notAnalyzedYet': '尚未解析。',
    'analysis.note': 'AI 一致 = 你的落点与 ama 最佳手一致的比例。AI 评分 = 你的落点对 ama 最佳分数的占比平均(仅统计落入 top 5 的手)。',
    'controls.moveLeft': '← 左移',
    'controls.moveRight': '右移 →',
    'controls.softDrop': '↓ 下移',
    'controls.rotateCw': '↻ 右旋',
    'controls.commit': '↓ 确定',
    'controls.aiBest': '★ AI最佳',
    'controls.aiBestTitle': 'AI最佳: 列{col} / 旋转{rot}',
    'controls.aiThinking': 'AI 思考中…',
    'controls.undo': '↶ 撤销',
    'controls.undoAria': '撤销 {n} 步',
    'controls.reset': '重置',
    'controls.resetConfirm': '确定要重置吗?',
    'candidates.title': 'AI候选',
    'candidates.loading': '{aiKind} 加载中…',
    'candidates.thinking': '(思考中)',
    'candidates.colRot': '列{col} / 旋转{rot}',
    'candidates.execute': '执行',
    'candidates.collapse': '折叠候选',
    'candidates.expand': '展开候选',
    'board.chain': '{n}连锁!',
    'menu.manual': '使用手册',
  },
  ko: {
    'app.title': 'GTR 트레이닝',
    'header.ghost': '고스트',
    'header.ceiling': '천장',
    'header.trainer': '템플릿',
    'header.trainerOff': '없음',
    'header.trainerGtr': 'GTR',
    'header.trainerKaidan': '계단',
    'header.gameMode': '모드',
    'header.modeFree': '자유',
    'header.modeMatch': 'ama 점수 대결',
    'header.modeScore': '스코어 어택',
    'header.turnLimit': '수',
    'header.turnUnlimited': '무제한',
    'controls.rotateCcw': '↺ 좌회전',
    'match.quit': '종료',
    'match.quitConfirm': '정말 종료할까요? 현재 점수로 확정됩니다.',
    'match.scoreFinal': '최종 점수',
    'match.shareReplay': '리플레이 공유',
    'share.replayTitle': '리플레이 공유',
    'share.replayCopy': 'URL 복사',
    'share.replayNote': '이 URL 을 열면 같은 seed 와 같은 수순으로 리플레이가 재생됩니다.',
    'share.serverSubmit': '서버에 전송해 짧은 URL 받기',
    'share.serverUploading': '전송 중…',
    'share.serverRetry': '전송 실패 — 다시 시도',
    'share.serverShortReady': '짧은 URL 이 준비되었습니다. 위의 URL 을 복사하세요.',
    'share.serverFailed': '서버 전송에 실패했습니다. 긴 URL 은 계속 사용할 수 있습니다.',
    'match.turn': '턴',
    'match.remaining': '{n}수 남음',
    'match.you': '당신',
    'match.ama': 'ama',
    'match.viewYou': '내 보드',
    'match.viewAi': 'ama 보드',
    'match.scrub': 'ama 기록',
    'match.playerScrub': '내 기록',
    'match.youWin': '승리!',
    'match.amaWin': 'ama 승',
    'match.draw': '무승부',
    'match.rematch': '재대결',
    'match.save': '저장',
    'match.saved': '저장됨',
    'match.records': '저장된 대전',
    'match.deleteRecord': '기록 삭제',
    'match.resign': '기권',
    'match.resignConfirm': '정말 기권하시겠습니까? 이 매치는 ama 승리로 종료됩니다.',
    'match.playChain': '▶ 재생',
    'match.playChainTitle': '이 턴의 연쇄 애니메이션을 재생',
    'match.stepBackTitle': '한 수 전으로',
    'match.stepForwardTitle': '한 수 앞으로',
    'match.viewingRecord': '저장된 대전을 리플레이 보기 중',
    'match.exitReplay': '리플레이 종료',
    'records.button': '저장된 대전',
    'records.title': '저장된 대전',
    'records.close': '닫기',
    'records.loading': '불러오는 중…',
    'records.empty': '아직 저장된 대전이 없습니다. 대전 종료 후 "저장"을 누르면 여기에 남습니다.',
    'records.replay': '▶ 재생',
    'records.replayTitle': '이 대전을 리플레이 보기',
    'records.note': '재생을 누르면 턴별 보드와 연쇄를 다시 볼 수 있습니다. 새 대전을 시작하면 현재 화면은 지워집니다.',
    'edit.edit': '편집',
    'edit.editing': '편집 중',
    'edit.apply': '적용',
    'edit.cancel': '취소',
    'edit.clear': '비우기',
    'edit.clearConfirm': '필드를 전부 비울까요?',
    'edit.matchExitConfirm': '대전을 종료하고 편집 모드로 들어갈까요? (현재 대전은 중단됩니다)',
    'edit.erase': '지우기',
    'edit.garbage': '방해',
    'edit.color.R': '빨강',
    'edit.color.B': '파랑',
    'edit.color.Y': '노랑',
    'edit.color.P': '초록',
    'edit.pair.current': '현재',
    'edit.pair.next1': 'NEXT',
    'edit.pair.next2': 'NEXT2',
    'share.button': '공유',
    'share.title': '보드 공유',
    'share.close': '닫기',
    'share.copy': 'URL 복사',
    'share.copied': '복사됨',
    'share.note': '이 URL 을 열면 현재 보드 (필드 + 현재 페어 + NEXT 2 개) 가 복원됩니다. 점수와 기록은 이어지지 않습니다.',
    'share.unavailable': '지금은 공유할 수 없습니다 (조작 가능한 페어가 없음).',
    'header.language': '언어',
    'stats.score': '점수',
    'stats.chain': '연쇄',
    'stats.max': '최대',
    'stats.total': '합계',
    'stats.gameOver': '게임 오버',
    'stats.aiMatch': 'AI 일치',
    'stats.aiMatchTitle': '당신의 수가 AI의 최선수와 일치한 비율 (AI Best 버튼 제외)',
    'stats.aiAvg': 'AI 평가',
    'stats.aiAvgTitle': '당신의 수의 AI 평가값 (AI 최선의 점수를 100%). AI 상위 5 후보에 든 수만 평균',
    'stats.analyze': '해석',
    'stats.analyzing': '해석 중…',
    'stats.analyzeTitle': '지금까지의 수를 ama 가 다시 평가해 AI 일치율과 AI 평가값을 계산합니다. 수가 많으면 수 초~수십 초 걸릴 수 있습니다.',
    'menu.toggle': '메뉴',
    'analysis.title': '해석 결과',
    'analysis.close': '닫기',
    'analysis.start': '해석 시작',
    'analysis.reanalyze': '재해석',
    'analysis.analyzing': '해석 중… 잠시 기다려 주세요',
    'analysis.noMoves': '아직 해석할 수가 없습니다.',
    'analysis.matchInProgress': '매치가 끝난 뒤 해석할 수 있습니다.',
    'analysis.notAnalyzedYet': '아직 해석하지 않았습니다.',
    'analysis.note': 'AI 일치 = 당신의 수가 ama 의 최선수와 일치한 비율. AI 평가 = ama 의 최선수 점수에 대한 비율 평균 (top 5 에 든 수만 합산).',
    'controls.moveLeft': '← 좌',
    'controls.moveRight': '우 →',
    'controls.softDrop': '↓ 한칸',
    'controls.rotateCw': '↻ 우회전',
    'controls.commit': '↓ 확정',
    'controls.aiBest': '★ AI 최선',
    'controls.aiBestTitle': 'AI 최선수: 열 {col} / 회전 {rot}',
    'controls.aiThinking': 'AI 생각 중…',
    'controls.undo': '↶ 되돌리기',
    'controls.undoAria': '{n}수 되돌리기',
    'controls.reset': '초기화',
    'controls.resetConfirm': '초기화하시겠습니까?',
    'candidates.title': 'AI 후보',
    'candidates.loading': '{aiKind} 로딩 중…',
    'candidates.thinking': '(생각 중)',
    'candidates.colRot': '열 {col} / 회전 {rot}',
    'candidates.execute': '실행',
    'candidates.collapse': '후보 접기',
    'candidates.expand': '후보 펴기',
    'board.chain': '{n}연쇄!',
    'menu.manual': '매뉴얼',
  },
};
