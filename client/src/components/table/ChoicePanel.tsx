import { useTranslation } from 'react-i18next';
import { localizedName } from '@3k/shared';
import { generalById } from '../../game/cardIndex';
import { sameSlot } from '../../game/interaction';
import type { CardSlot, TableState } from '../../game/viewTypes';
import { CardFace } from './CardFace';

interface ChoicePanelProps {
  state: TableState;
  /** Whose cards these are. */
  targetId: string;
  /** Exactly what the server offered — never re-derived here. */
  choices: readonly CardSlot[];
  selected: CardSlot | null | undefined;
  onChoose: (slot: CardSlot) => void;
}

/**
 * "Point at one of that player's cards" — the answer surface for a `chooseCard`
 * request (过河拆桥 / 顺手牵羊, task 3.3).
 *
 * The three zones look different because they *are* different, and the
 * difference is the whole design (engine/cardChoice.ts):
 *
 *   • hand — face DOWN, and addressed by an opaque index. The client is not
 *     told which cards they are, because a card id carries suit and rank: to
 *     show the attacker a face here would be to hand them the target's hand.
 *     A player across a real table sees N backs and picks one, and so does this.
 *   • equipment / judgement zone — face UP, addressed by id. Already public.
 *
 * So this component renders exactly what the server sent and nothing more. It
 * never reads `state.players[targetId].hand` — there is no such field in the
 * view for another seat, which is the point of viewTypes.ts.
 */
export function ChoicePanel({ state, targetId, choices, selected, onChoose }: ChoicePanelProps) {
  const { t, i18n } = useTranslation();

  const target = state.players[targetId];
  const general = target ? generalById(target.generalId) : undefined;
  const name = general ? localizedName(general, i18n.language) : targetId;

  const hand = choices.filter((c) => c.z === 'hand');
  const equip = choices.filter((c) => c.z === 'equip');
  const judgement = choices.filter((c) => c.z === 'judgementZone');
  // 五谷丰登's pool (7.2's live-playtest stall): public cards, face up, not
  // anyone's — so when the choices are ALL from the pool, the "{player}'s
  // cards" header would be a lie and is swapped for the pool's own label.
  const revealed = choices.filter((c) => c.z === 'revealed');

  const isOn = (slot: CardSlot) => sameSlot(selected, slot);

  return (
    <div className="choices">
      <div className="choices__label">
        {revealed.length === choices.length
          ? t('ui.revealed_pool')
          : t('prompt.their_cards', { player: name })}
      </div>

      <div className="choices__zones">
        {hand.length > 0 ? (
          <div className="choices__zone">
            <span className="choices__zone-label">{t('ui.hand')}</span>
            <div className="choices__cards">
              {hand.map((slot) => {
                const index = slot.z === 'hand' ? slot.index : -1;
                return (
                  <button
                    key={`hand-${index}`}
                    type="button"
                    className={[
                      'card',
                      'card--md',
                      'card--back',
                      'card--interactive',
                      isOn(slot) ? 'card--selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onChoose(slot)}
                  >
                    <span className="card__subtitle">{t('prompt.hand_slot', { n: index + 1 })}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {equip.length > 0 ? (
          <div className="choices__zone">
            <span className="choices__zone-label">{t('ui.equipment')}</span>
            <div className="choices__cards">
              {equip.map((slot) =>
                slot.z === 'equip' ? (
                  <CardFace
                    key={`equip-${slot.cardId}`}
                    cardId={slot.cardId}
                    size="md"
                    selected={isOn(slot)}
                    onClick={() => onChoose(slot)}
                  />
                ) : null,
              )}
            </div>
          </div>
        ) : null}

        {judgement.length > 0 ? (
          <div className="choices__zone">
            <span className="choices__zone-label">{t('ui.judgement_zone')}</span>
            <div className="choices__cards">
              {judgement.map((slot) =>
                slot.z === 'judgementZone' ? (
                  <CardFace
                    key={`judge-${slot.cardId}`}
                    cardId={slot.cardId}
                    size="md"
                    selected={isOn(slot)}
                    onClick={() => onChoose(slot)}
                  />
                ) : null,
              )}
            </div>
          </div>
        ) : null}

        {revealed.length > 0 ? (
          <div className="choices__zone">
            <span className="choices__zone-label">{t('ui.revealed_pool')}</span>
            <div className="choices__cards">
              {revealed.map((slot) =>
                slot.z === 'revealed' ? (
                  <CardFace
                    key={`revealed-${slot.cardId}`}
                    cardId={slot.cardId}
                    size="md"
                    selected={isOn(slot)}
                    onClick={() => onChoose(slot)}
                  />
                ) : null,
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
