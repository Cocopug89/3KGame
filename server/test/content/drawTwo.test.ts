// 无中生有 (task 3.3): one frame, no targets, no request.

import { describe, it, expect } from 'vitest';
import { drawTwo } from '../../src/content/effects/drawTwo.js';
import { makeGState } from '../engine/fixtures.js';

describe('drawTwo', () => {
  it('draws two cards for whoever played it', () => {
    expect(drawTwo.resolve(makeGState(), { source: '0', cards: ['draw_two_7h'], targets: [] })).toEqual(
      [{ t: 'draw', player: '0', count: 2 }],
    );
  });

  it('takes no targets and is always playable', () => {
    expect(drawTwo.targeting).toEqual({ min: 0, max: 0, self: 'only' });
    expect(drawTwo.canPlay(makeGState(), '0')).toBe(true);
  });
});
