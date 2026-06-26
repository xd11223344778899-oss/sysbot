import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatVoiceLogTime } from '../src/shared/log-time.js';
import { buildVoiceLogEmbed } from '../src/shared/voice-log-embed.js';

describe('formatVoiceLogTime', () => {
  it('formats without leading zeros on time parts', () => {
    const d = new Date(2026, 5, 26, 4, 22, 1);
    assert.equal(formatVoiceLogTime(d), '4:22:1 AM - 2026/6/26');
  });
});

describe('buildVoiceLogEmbed', () => {
  it('includes Reason for command source', () => {
    const embed = buildVoiceLogEmbed({
      kind: 'mute',
      actor: { id: '1', displayName: 'Admin' },
      target: { id: '2', displayName: 'User' },
      channel: { id: 'c', name: 'Dream' },
      source: 'command',
      reason: 'spam',
      actionAt: new Date(2026, 5, 26, 4, 22, 1),
    });
    const desc = embed.data.description ?? '';
    assert.ok(desc.includes('To : <@2>'));
    assert.ok(desc.includes('By : <@1>'));
    assert.ok(desc.includes('In : 🔊 Dream'));
    assert.ok(desc.includes('Reason : spam'));
    assert.ok(desc.includes('Mute At : 4:22:1 AM - 2026/6/26'));
  });

  it('omits Reason for manual source', () => {
    const embed = buildVoiceLogEmbed({
      kind: 'unmute',
      actor: { id: '1' },
      target: { id: '2' },
      channel: { id: 'c', name: 'Dream' },
      source: 'manual',
    });
    const desc = embed.data.description ?? '';
    assert.ok(!desc.includes('Reason :'));
    assert.ok(!desc.includes('Un Mute At'));
    assert.equal(embed.data.title, 'UnMute Member');
  });
});
