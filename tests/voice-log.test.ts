import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatVoiceLogTime } from '../src/shared/log-time.js';
import { buildVoiceLogEmbed } from '../src/shared/voice-log-embed.js';
import { formatChannelCapacity } from '../src/shared/voice-log-capacity.js';
import {
  markCommandVoiceLogSent,
  wasCommandVoiceLogSent,
} from '../src/services/voice-log-context.js';

describe('formatVoiceLogTime', () => {
  it('formats without leading zeros on time parts', () => {
    const d = new Date(2026, 5, 26, 4, 22, 1);
    assert.equal(formatVoiceLogTime(d), '4:22:1 AM - 2026/6/26');
  });
});

describe('formatChannelCapacity', () => {
  it('formats limited channel occupancy', () => {
    assert.equal(formatChannelCapacity(5, 10), '5 / 10');
  });

  it('formats unlimited channel as infinity', () => {
    assert.equal(formatChannelCapacity(3, 0), '3 / ∞');
  });
});

describe('command voice log dedup', () => {
  it('marks and detects sent command logs within TTL', () => {
    const guildId = 'g1';
    const userId = 'u1';
    assert.equal(wasCommandVoiceLogSent(guildId, userId, 'mute'), false);
    markCommandVoiceLogSent(guildId, userId, 'mute');
    assert.equal(wasCommandVoiceLogSent(guildId, userId, 'mute'), true);
    assert.equal(wasCommandVoiceLogSent(guildId, userId, 'unmute'), false);
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
    assert.ok(desc.includes('Display : User'));
    assert.ok(desc.includes('By : <@1>'));
    assert.ok(desc.includes('In : 🔊 Dream'));
    assert.ok(desc.includes('Via : Bot Command'));
    assert.ok(desc.includes('Reason : spam'));
    assert.ok(desc.includes('Mute At : 4:22:1 AM - 2026/6/26'));
  });

  it('shows not in voice when offline', () => {
    const embed = buildVoiceLogEmbed({
      kind: 'mute',
      actor: { id: '1', displayName: 'Admin' },
      target: { id: '2', displayName: 'User' },
      notInVoice: true,
      source: 'command',
    });
    const desc = embed.data.description ?? '';
    assert.ok(desc.includes('In : Not in voice channel'));
    assert.ok(desc.includes('Via : Bot Command'));
    assert.ok(!desc.includes('🔊'));
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
    assert.ok(!desc.includes('Via : Bot Command'));
    assert.equal(embed.data.title, 'UnMute Member');
  });
});
