import { useTranslation } from 'react-i18next';
import { localizedName } from '@3k/shared';
import { generalById } from '../../game/cardIndex';
import { discardTop, statusView } from '../../game/viewModel';
import type { TableState } from '../../game/viewTypes';
import { CardBack, CardFace } from './CardFace';

/**
 * The middle of the table: draw pile (count only — the pile itself is never
 * sent to any client, by design), discard pile (public; only the top card is
 * ever load-bearing), and the status line.
 *
 * The status line separates two things players constantly conflate: whose 回合
 * it is, and who the engine is *waiting on*. During a 杀 those are different
 * people, and the seat highlight alone doesn't say what's being asked.
 */
export function TableCenter({
  state,
  viewerId,
  playedCardId = null,
}: {
  state: TableState;
  viewerId: string | null;
  /** 6.3: the card that just hit the discard pile — it flies in rather than
   * blinking, because it's the card everyone is now answering. */
  playedCardId?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const status = statusView(state, viewerId);
  const top = discardTop(state);

  const nameOf = (playerId: string | null | undefined): string => {
    if (!playerId) return '—';
    const player = state.players[playerId];
    const general = player ? generalById(player.generalId) : undefined;
    return general ? localizedName(general, i18n.language) : (playerId ?? '—');
  };

  return (
    <div className="center">
      <div className="center__status">
        <span className="center__phase">{t(status.phaseKey)}</span>
        <span className="center__turn">
          {status.isViewerTurn ? t('ui.your_turn') : t('ui.player_turn', { player: nameOf(status.turnOwnerId) })}
        </span>
        {status.waitingOnId ? (
          <span className={`center__waiting ${status.isViewerWaitedOn ? 'center__waiting--you' : ''}`}>
            {t('ui.waiting_on', { player: nameOf(status.waitingOnId) })}
          </span>
        ) : null}
      </div>

      {/* 五谷丰登's face-up pool — public to the whole table, so EVERYONE
          watches the picks disappear, not just the player choosing (7.2). */}
      {state.revealed && state.revealed.length > 0 ? (
        <div className="center__piles">
          {state.revealed.map((cardId) => (
            <div className="pile" key={cardId}>
              <CardFace cardId={cardId} size="md" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="center__piles">
        <div className="pile">
          <CardBack size="md" />
          <span className="pile__label">
            {t('ui.draw_pile')} · {t('ui.cards_count', { n: state.drawPileCount })}
          </span>
        </div>
        <div className={`pile ${playedCardId && playedCardId === top ? 'fx-played' : ''}`}>
          {top ? <CardFace cardId={top} size="md" /> : <div className="card card--md card--empty" />}
          <span className="pile__label">
            {t('ui.discard_pile')} · {t('ui.cards_count', { n: state.discardPile.length })}
          </span>
        </div>
      </div>

      {state.gameOver ? (
        <div className="center__gameover">
          <strong>{t('ui.game_over')}</strong>
          <span>
            {t('ui.winners', {
              players: state.gameOver.winners.map((id) => nameOf(id)).join('、'),
            })}
          </span>
          <span className="badge badge--role">{t(`role.${state.gameOver.condition}`)}</span>
        </div>
      ) : null}
    </div>
  );
}
