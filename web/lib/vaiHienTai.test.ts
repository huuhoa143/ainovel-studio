import { describe, expect, it } from 'vitest';

import { vaiHienTai } from './song';
import type { Snapshot } from './types';

const t = (agent?: string): Snapshot['transport'] =>
  ({
    state: 'idle',
    model: 'auto',
    cost_usd: 0,
    agent,
    last_call: { agent: 'arbiter', provider: 'lingo2', model: 'auto', at: '' },
  }) as Snapshot['transport'];

describe('vaiHienTai', () => {
  it('vai gốc đang làm thắng lượt gọi đã xong — ca đo được: Điều phối vừa giao việc', () => {
    const snap = {
      agents: [{ role: 'architect_short', state: 'working', depth: 0 }],
      transport: t(),
    };
    expect(vaiHienTai(snap, '')).toBe('architect_short');
  });
  it('bỏ qua vai con và vai rảnh', () => {
    const snap = {
      agents: [
        { role: 'novel_context', state: 'working', depth: 1 },
        { role: 'editor', state: 'idle', depth: 0 },
      ],
      transport: t(),
    };
    expect(vaiHienTai(snap, 'writer')).toBe('writer');
  });
  it('không còn nguồn sống thì rơi về lượt gọi gần nhất', () => {
    expect(vaiHienTai({ agents: [], transport: t() }, '')).toBe('arbiter');
  });
});
