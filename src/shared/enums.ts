// String-union "enums" replacing native Prisma enums (unsupported on SQLite).
// Values are stored verbatim in the database.

export type PenaltyType = 'MUTE' | 'PRISON' | 'VMUTE' | 'BAN' | 'BLACKLIST' | 'BLOCK' | 'WARN';
export type LogMode = 'DETAILED' | 'COMPACT';
export type AntijoinAction = 'NONE' | 'BAN' | 'PRISON' | 'KICK';
export type AccessMode = 'ALLOW' | 'DENY';
export type TargetType = 'USER' | 'ROLE';

export const PENALTY_TYPES: PenaltyType[] = [
  'MUTE',
  'PRISON',
  'VMUTE',
  'BAN',
  'BLACKLIST',
  'BLOCK',
  'WARN',
];
