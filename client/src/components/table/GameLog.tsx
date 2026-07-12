import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLogLine } from '../../game/log';
import type { TableState } from '../../game/viewTypes';

/** A long match logs thousands of entries; the panel is a "what just
 * happened" readout, not an archive, and re-rendering an unbounded <ol> on
 * every snapshot is the cost. Raise if a scrollback UI ever wants more. */
const MAX_LOG_ENTRIES = 100;

/**
 * The game log (task 6.2). Renders `G.log` — a list of `{key, params}`, never
 * text, so the same match reads correctly in either language.
 *
 * ⚠️ The engine doesn't write `G.log` yet (Phase 2 review, finding **F3**), so
 * this is empty in a real match today. It is built now because F3's fix is
 * "log as each Phase 3 effect lands" — the renderer and the key vocabulary
 * (client/src/game/log.ts) need to exist *before* those effects are written, or
 * they'll each invent their own. Newest entry first: the last thing that
 * happened is the thing you're looking for.
 */
export function GameLog({ state }: { state: TableState }) {
  const { t } = useTranslation();
  const line = useLogLine(state);
  // slice() already copies, so reverse() is safe; memoised because the board
  // re-renders on every snapshot and selection click, not just when a log
  // entry lands.
  const entries = useMemo(() => state.log.slice(-MAX_LOG_ENTRIES).reverse(), [state.log]);

  return (
    <div className="log">
      <div className="log__label">{t('ui.game_log')}</div>
      {entries.length === 0 ? (
        <div className="log__empty">—</div>
      ) : (
        <ol className="log__entries">
          {entries.map((entry, i) => (
            <li key={`${entry.key}-${i}`} className="log__entry">
              {line(entry)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
