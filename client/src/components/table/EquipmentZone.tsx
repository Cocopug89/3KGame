import { useTranslation } from 'react-i18next';
import { equipmentSlots } from '../../game/viewModel';
import type { AnyPlayerView } from '../../game/viewTypes';
import { CardFace, EmptySlot, type CardSize } from './CardFace';

/**
 * The four equipment slots (weapon / armour / +1 horse / −1 horse), always all
 * four, in a fixed order — an empty slot is information (that seat has no
 * armour), and a row that reflows as cards are equipped is unreadable.
 * Equipment is public for everyone, so this renders the same for any seat.
 */
export function EquipmentZone({
  player,
  size = 'sm',
}: {
  player: AnyPlayerView;
  size?: CardSize;
}) {
  const { t } = useTranslation();

  return (
    <div className="equip">
      {equipmentSlots(player).map(({ slot, labelKey, cardId }) =>
        cardId ? (
          <CardFace key={slot} cardId={cardId} size={size} subtitle={t(labelKey)} />
        ) : (
          <EmptySlot key={slot} label={t(labelKey)} size={size} />
        ),
      )}
    </div>
  );
}
