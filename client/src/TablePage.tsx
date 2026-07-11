import { useEffect, useState } from 'react';
import { LanguageToggle } from './components/LanguageToggle';
import { GameTable } from './components/table/GameTable';
import { recordingActions, type RecordedIntent } from './game/actions';
import { FIXTURES } from './game/fixtures';
import { SCENARIO_STEPS, SCENARIO_SURVIVES } from './game/scenario';

const SCENARIOS = [
  { id: 'scenario · 杀 → death', steps: SCENARIO_STEPS },
  { id: 'scenario · 杀 → 闪 → 桃', steps: SCENARIO_SURVIVES },
];

/**
 * Dev harness for the Phase 6 board (`?table`). Renders the table against
 * fixture states so it can be built and reviewed before there's a lobby to join
 * or a match to play (Phase 5).
 *
 * The moves fired by the prompt are *recorded*, not sent: there's no server here
 * and, deliberately, no client-side rules engine to simulate one — so the honest
 * thing to show is the exact move the board would have dispatched. Wiring
 * `TableActions` to boardgame.io's `props.moves` is a ~10-line change once a
 * match exists.
 *
 * The seat picker re-renders the same fixture as a different viewer, which is the
 * most useful check available here: the whole board is written against the
 * stripped playerView, so switching seats must change which hand is visible,
 * which roles are legible, and who gets a prompt — and must never reveal more.
 * (A fixture only carries one viewer's legal information, so other seats simply
 * have no hand to show — that's the honest behaviour, not a bug.)
 *
 * "reject" simulates the server answering INVALID_MOVE — the one path the client
 * cannot predict, since it deliberately doesn't compute range (see prompts.ts).
 */
export function TablePage() {
  const [fixtureIndex, setFixtureIndex] = useState(0);
  const fixture = FIXTURES[fixtureIndex];
  const [viewerId, setViewerId] = useState<string | null>(fixture.viewerId);
  const [intents, setIntents] = useState<RecordedIntent[]>([]);
  const [rejected, setRejected] = useState(false);

  // 6.3: animations are triggered by the *difference* between two snapshots, so
  // a single fixture can't show one. A scenario is a scripted list of snapshots —
  // stepping (or playing) through it is the only way to actually see the motion.
  const [scenarioIndex, setScenarioIndex] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const scenario = scenarioIndex == null ? null : SCENARIOS[scenarioIndex];

  useEffect(() => {
    if (!playing || !scenario) return;
    if (stepIndex >= scenario.steps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStepIndex((i) => i + 1), 1400);
    return () => clearTimeout(timer);
  }, [playing, scenario, stepIndex]);

  const startScenario = (index: number) => {
    setScenarioIndex(index);
    setStepIndex(0);
    setPlaying(false);
    setViewerId('1'); // the scenario is written from seat 1's eyes
    setIntents([]);
    setRejected(false);
  };

  const actions = recordingActions((intent) => {
    setIntents((cur) => [intent, ...cur].slice(0, 8));
    setRejected(false);
  });

  const selectFixture = (index: number) => {
    setFixtureIndex(index);
    setScenarioIndex(null);
    setPlaying(false);
    setViewerId(FIXTURES[index].viewerId);
    setIntents([]);
    setRejected(false);
  };

  const shownState = scenario ? scenario.steps[stepIndex].state : fixture.state;

  const chip = (active: boolean) => ({
    marginTop: 0,
    padding: '0.35rem 0.6rem',
    background: active ? '#2f6feb' : '#e0e0e0',
    color: active ? '#fff' : '#333',
    fontSize: '0.85rem',
  });

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1180, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>三国杀 · Three Kingdoms Kill</h1>
        <LanguageToggle />
      </header>

      {/* Dev-only controls: ids and seat numbers, not user-facing copy — hence
          no i18n keys (see 6.4's hard-coded-string sweep). */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        {FIXTURES.map((f, i) => (
          <button
            key={f.id}
            type="button"
            onClick={() => selectFixture(i)}
            style={chip(scenario == null && i === fixtureIndex)}
          >
            {f.id}
          </button>
        ))}
        {SCENARIOS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => startScenario(i)}
            style={{ ...chip(scenarioIndex === i), background: scenarioIndex === i ? '#7952b3' : '#e0e0e0' }}
          >
            {s.id}
          </button>
        ))}
      </div>

      {scenario ? (
        <div
          style={{
            display: 'flex',
            gap: '0.4rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: '0.6rem',
            padding: '0.5rem 0.6rem',
            background: '#f3eefb',
            borderRadius: 8,
            fontSize: '0.85rem',
          }}
        >
          <button
            type="button"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            style={chip(false)}
          >
            ‹ step
          </button>
          <button
            type="button"
            onClick={() => setStepIndex((i) => Math.min(scenario.steps.length - 1, i + 1))}
            disabled={stepIndex >= scenario.steps.length - 1}
            style={chip(false)}
          >
            step ›
          </button>
          <button
            type="button"
            onClick={() => {
              if (stepIndex >= scenario.steps.length - 1) setStepIndex(0);
              setPlaying((p) => !p);
            }}
            style={{ ...chip(playing), background: playing ? '#7952b3' : '#e0e0e0' }}
          >
            {playing ? '❚❚ pause' : '▶ play'}
          </button>
          <span style={{ color: '#555' }}>
            {stepIndex + 1}/{scenario.steps.length} — {scenario.steps[stepIndex].label}
          </span>
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          gap: '0.4rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
          alignItems: 'center',
        }}
      >
        <span style={{ color: '#666', fontSize: '0.85rem' }}>seat:</span>
        {shownState.seats.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setViewerId(id)}
            style={{ ...chip(viewerId === id), background: viewerId === id ? '#3fa653' : '#e0e0e0' }}
          >
            {Number(id) + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setViewerId(null)}
          style={{ ...chip(viewerId === null), background: viewerId === null ? '#6c757d' : '#e0e0e0' }}
        >
          spectator
        </button>
        <button
          type="button"
          onClick={() => setRejected((r) => !r)}
          style={{ ...chip(rejected), background: rejected ? '#d9534f' : '#e0e0e0', marginLeft: '0.75rem' }}
        >
          simulate INVALID_MOVE
        </button>
      </div>

      <GameTable state={shownState} viewerId={viewerId} actions={actions} rejected={rejected} />

      <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#555' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>moves fired (recorded, not sent):</div>
        {intents.length === 0 ? (
          <div style={{ color: '#999' }}>—</div>
        ) : (
          <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            {intents.map((intent, i) => (
              <li key={i}>
                <code>
                  {intent.move}({intent.args.map((a) => JSON.stringify(a)).join(', ')})
                </code>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
