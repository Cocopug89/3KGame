import { useTranslation } from 'react-i18next';
import { localizedName } from '@3k/shared';
import { generalById } from '../../game/cardIndex';
import { handSize, roleI18nKey, type SeatView } from '../../game/viewModel';
import { EquipmentZone } from './EquipmentZone';
import { HpBar } from './HpBar';
import { JudgementZone } from './JudgementZone';

/**
 * One seat: general, role (only if we're allowed to know it), HP, hand count,
 * equipment, judgement zone.
 *
 * Three states are visually distinct on purpose, because misreading any of them
 * costs a game: whose turn it is (the 回合 owner), who the engine is actually
 * blocked on (which is often NOT the turn owner — a 杀 asks its target for a
 * 闪), and who is dying vs. dead.
 *
 * There are no player *names* yet — seating and identity land in Phase 5, so a
 * seat is identified by its general and its seat number.
 */
interface PlayerSeatProps {
  seatView: SeatView;
  compact?: boolean;
  /** Targeting (6.2): this seat is a legal candidate for the selected card. */
  targetable?: boolean;
  targeted?: boolean;
  onTarget?: (playerId: string) => void;
  /** 6.3: a short-lived animation class from the state diff (fx-damage, fx-death…). */
  fxClass?: string;
}

export function PlayerSeat({
  seatView,
  compact = false,
  targetable = false,
  targeted = false,
  onTarget,
  fxClass,
}: PlayerSeatProps) {
  const { t, i18n } = useTranslation();
  const { player, isViewer, isTurnOwner, isWaitingOn, isDying: dying } = seatView;
  const dead = !player.alive;

  const general = generalById(player.generalId);
  const generalName = general ? localizedName(general, i18n.language) : player.generalId;
  const roleKey = roleI18nKey(player, isViewer);

  const pickable = targetable && onTarget != null;

  return (
    <div
      className={[
        'seat',
        compact ? 'seat--compact' : '',
        isViewer ? 'seat--viewer' : '',
        isTurnOwner ? 'seat--turn' : '',
        isWaitingOn ? 'seat--waiting' : '',
        dying ? 'seat--dying' : '',
        dead ? 'seat--dead' : '',
        pickable ? 'seat--targetable' : '',
        targeted ? 'seat--targeted' : '',
        fxClass ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role={pickable ? 'button' : undefined}
      tabIndex={pickable ? 0 : undefined}
      onClick={pickable ? () => onTarget(seatView.playerId) : undefined}
    >
      <div className="seat__head">
        <span className="seat__general">{generalName}</span>
        <span className="seat__seatno">{t('ui.seat', { seat: player.seat + 1 })}</span>
        {isViewer ? <span className="badge badge--you">{t('ui.you')}</span> : null}
      </div>

      <div className="seat__meta">
        <span className={`badge badge--role ${roleKey ? `badge--${roleKey.split('.')[1]}` : ''}`}>
          {roleKey ? t(roleKey) : t('ui.role_unknown')}
        </span>
        {general ? <span className={`badge badge--kingdom badge--${general.kingdom}`}>{t(`kingdom.${general.kingdom}`)}</span> : null}
        <span className="seat__hand-count">
          {t('ui.hand')} · {t('ui.cards_count', { n: handSize(player) })}
        </span>
      </div>

      <HpBar hp={player.hp} maxHp={player.maxHp} dying={dying} dead={dead} />

      <EquipmentZone player={player} />
      <JudgementZone player={player} />

      {isWaitingOn ? <span className="seat__waiting-flag">{t('ui.waiting')}</span> : null}
      {targeted ? <span className="seat__target-flag">{t('ui.target_player')}</span> : null}
    </div>
  );
}
