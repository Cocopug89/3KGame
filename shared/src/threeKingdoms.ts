// Task 5.1 — the handful of facts about the game that both sides need to agree
// on before a client can even connect.
//
// Deliberately tiny. The *rules* live on the server (server/src/bgio/game.ts)
// and must never ship to the browser; the *view shape* the client renders is
// mirrored in client/src/game/viewTypes.ts (task 6.1). What's left — and what
// belongs here — is the handshake: the name the server registers the game
// under and the client connects with (a drift between the two shows up only as
// a silent "match not found"), and the player bounds the lobby validates
// against.

export const THREE_KINGDOMS_GAME_NAME = 'three-kingdoms-kill';
export const THREE_KINGDOMS_MIN_PLAYERS = 4;
export const THREE_KINGDOMS_MAX_PLAYERS = 8;

/**
 * Every stage the server puts a player into, and the moves that stage accepts
 * (server/src/bgio/game.ts's `turn.stages`).
 *
 * Shared because boardgame.io's client dispatches a move *by name* into a stage
 * *by name*, and its local game config has to declare both or the move is
 * silently never sent. Writing the names out twice — once per side — makes a
 * typo look exactly like a server that ignored you. The client builds its
 * skeleton game from this map (client/src/lobby/clientGame.ts), and a server
 * test asserts the real game's stages still match it
 * (server/test/bgio/stages.test.ts), so the two can't drift apart quietly.
 *
 * The rules stay on the server: this is a list of *names*, not behaviour.
 */
export const THREE_KINGDOMS_STAGE_MOVES = {
  chooseGeneral: ['chooseGeneral'],
  // `useSkill` is an ACTIVE skill (制衡, 仁德, 观星…) — the third face of a Skill
  // (docs/skill-trigger-design.md §1), started by its owner in their own action
  // phase, and resolved through the same CardEffect machinery a card is.
  act: ['playCard', 'pass', 'useSkill'],
  // The card-demand protocol (docs/skill-trigger-design.md §5): "supply `count`
  // cards of kind K, or don't." 杀→闪, 决斗→杀, 濒死→桃 and trick→无懈可击 ALL come
  // through here as of task 4.1b — `respondDodge` and `respondPeach` were
  // deleted, not rewritten, which is the whole return on 3.2 having built the
  // nullification chain as a demand from day one.
  demandCard: ['supplyCards'],
  // Pointing at one of another player's cards — 过河拆桥/顺手牵羊 (task 3.3). The
  // request carries opaque hand SLOTS, not card ids: the attacker is not
  // entitled to the victim's hand (judgement-nullification-design §5).
  chooseCard: ['chooseCard'],
  // An optional trigger's yes/no (§3.4). One request, no more.
  confirmSkill: ['respondSkill'],
  // One player, two eligible triggers on one event (§3.1 step 3) — they choose
  // the order. Cold path: no Standard general reaches it.
  orderTriggers: ['orderTriggers'],
  discard: ['discard'],
  // Task 4.3 (Batch B): a trigger's effect() asking something neither
  // confirmSkill nor chooseCard covers — pick one of a short LABELLED list
  // (刚烈, 洛神), or pick a PLAYER rather than a card (突袭).
  chooseOption: ['chooseOption'],
  choosePlayer: ['choosePlayer'],
  // Task 4.4 (Batch C): each is one skill's own request kind, answered by a
  // single move that only that stage accepts — 观星 (arrange the top cards),
  // 郭嘉's retrial redraw, 遗计's two-card distribution, 流离's redirect, and
  // 反间's suit declaration.
  guanxing: ['arrangeCards'],
  guicaiRetrial: ['submitRetrial'],
  yijiDistribute: ['distributeCards'],
  liuliRedirect: ['redirectStrike'],
  declareSuit: ['declareSuit'],
} as const;

export type ThreeKingdomsStage = keyof typeof THREE_KINGDOMS_STAGE_MOVES;

export const STAGE_CHOOSE_GENERAL: ThreeKingdomsStage = 'chooseGeneral';
export const MOVE_CHOOSE_GENERAL = 'chooseGeneral';
