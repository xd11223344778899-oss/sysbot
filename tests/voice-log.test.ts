import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatVoiceLogTime } from '../src/shared/log-time.js';
import { buildVoiceLogEmbed } from '../src/shared/voice-log-embed.js';
import { formatChannelCapacity, formatCapacityCount, formatCapacityLimit } from '../src/shared/voice-log-capacity.js';
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

  it('formats pill segments with zero padding', () => {
    assert.equal(formatCapacityCount(2), '02');
    assert.equal(formatCapacityCount(12), '12');
    assert.equal(formatCapacityLimit(12), '12');
    assert.equal(formatCapacityLimit(0), '∞');
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
    assert.ok(desc.includes('By : <@1>'));
    assert.ok(desc.includes('In : <#c>'));
    assert.ok(desc.includes('Reason : spam'));
    assert.ok(desc.includes('Mute At : 4:22:1 AM - 2026/6/26'));
    assert.ok(!desc.includes('Display :'));
    assert.ok(!desc.includes('Via :'));
  });

  it('omits In when no channel (details live in snapshot image)', () => {
    const embed = buildVoiceLogEmbed({
      kind: 'mute',
      actor: { id: '1', displayName: 'Admin' },
      target: { id: '2', displayName: 'User' },
      source: 'command',
    });
    const desc = embed.data.description ?? '';
    assert.ok(!desc.includes('In :'));
    assert.ok(!desc.includes('Not in voice channel'));
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
