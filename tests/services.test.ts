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
