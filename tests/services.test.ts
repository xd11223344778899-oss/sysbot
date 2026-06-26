import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeBlockReason,
  parseBlockRoleId,
} from '../src/services/block-service.js';
import {
  normalizeEmojiKey,
  emojiMatches,
} from '../src/services/verify-reaction.js';
import { assertJsonSize } from '../src/services/color-palette.js';
import { resolveAdminHierarchyByRanks } from '../src/services/admin-hierarchy.js';
import {
  formatCrimeDate,
  formatCrimeGroup,
} from '../src/services/crime-records.js';
import { buildProtectionAlertEmbed } from '../src/shared/log-embed.js';
import type { Penalty } from '@prisma/client';

describe('block-service', () => {
  it('encodes and parses role-specific block', () => {
    const reason = encodeBlockReason('123456789012345678', 'test');
    assert.equal(parseBlockRoleId(reason), '123456789012345678');
  });

  it('global block has no role id', () => {
    const reason = encodeBlockReason(undefined, 'spam');
    assert.equal(parseBlockRoleId(reason), null);
  });
});

describe('verify-reaction emoji', () => {
  it('matches custom emoji by id', () => {
    assert.ok(emojiMatches('<:x:999999999999999999>', '999999999999999999'));
  });

  it('normalizes unicode emoji', () => {
    assert.equal(normalizeEmojiKey('✅'), '✅');
  });
});

describe('color-palette json size', () => {
  it('rejects oversized json', () => {
    assert.ok(!assertJsonSize('x'.repeat(9000)));
    assert.ok(assertJsonSize('{"a":"#ff0000"}'));
  });
});

describe('admin hierarchy', () => {
  it('allows stronger admin to moderate weaker', () => {
    assert.equal(resolveAdminHierarchyByRanks(0, 2, false).status, 'allowed');
  });

  it('denies weaker admin punishing stronger', () => {
    assert.equal(resolveAdminHierarchyByRanks(3, 1, false).status, 'denied');
  });

  it('requires consent for voice move on peer or higher admin', () => {
    assert.equal(resolveAdminHierarchyByRanks(2, 1, true).status, 'voice_consent_required');
    assert.equal(resolveAdminHierarchyByRanks(1, 1, true).status, 'voice_consent_required');
  });

  it('ignores hierarchy for non-admin targets', () => {
    assert.equal(resolveAdminHierarchyByRanks(1, null, false).status, 'allowed');
  });
});

describe('crime records', () => {
  const sample = (overrides: Partial<Penalty>): Penalty => ({
    id: 'p1',
    guildId: 'g1',
    userId: 'u1',
    type: 'BLACKLIST',
    moderatorId: 'mod1',
    reason: 'test',
    active: false,
    expiresAt: null,
    createdAt: new Date('2026-06-05T12:00:00Z'),
    liftedAt: null,
    liftedById: null,
    ...overrides,
  });

  it('formats date without zero-padding', () => {
    assert.equal(formatCrimeDate(new Date(2026, 5, 5)), '2026-6-5');
  });

  it('lists newest blacklist entry first with highest index', () => {
    const text = formatCrimeGroup([
      sample({ id: '1', createdAt: new Date('2026-05-19T12:00:00Z'), reason: 'old' }),
      sample({ id: '2', createdAt: new Date('2026-06-07T12:00:00Z'), reason: 'new' }),
    ]);
    assert.match(text, /^2 - type: black/);
    assert.ok(text.includes('-------'));
    assert.ok(text.endsWith('reason: old'));
  });

  it('maps vmute to voice label', () => {
    const text = formatCrimeGroup([sample({ type: 'VMUTE', reason: 'سب' })]);
    assert.match(text, /type: voice/);
  });
});

describe('protection alert log', () => {
  it('matches log-protection embed layout', () => {
    const embed = buildProtectionAlertEmbed({
      guildName: 'Endls Groups',
      targetId: '123',
      attemptText: "Was trying to create a 1 channel's",
      codeTitle: 'Missing Permissions',
      codeDetail: '❌ -Bots.',
    });
    const data = embed.data;
    assert.equal(data.title, 'Protection Alert');
    assert.equal(data.author?.name, 'Endls Groups');
    assert.ok(data.description?.includes('To : <@123>'));
    assert.ok(data.description?.includes('Remove user roles'));
    assert.ok(data.description?.includes('```\nMissing Permissions\n❌ -Bots.\n```'));
  });
});
