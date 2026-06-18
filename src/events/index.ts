import {
  AuditLogEvent,
  ChannelType,
  Events,
  type Client,
  type EmbedBuilder,
  type GuildMember,
  type PartialGuildMember,
  type VoiceState,
} from 'discord.js';
import { handleMessage } from '../core/command-parser.js';
import { classifyMessage } from '../core/message-classifier.js';
import { runAutoModeration, runAutoFeatures } from '../services/auto-moderation.js';
import { runMessagePermissionGuard } from '../services/message-permission-guard.js';
import { handleDeveloperCommand } from '../services/developer-panel.js';
import { recordChannelMessage } from '../services/spam-intelligence.js';
import { handleMemberJoin } from '../services/member-gate.js';
import { sendLog } from '../services/log-service.js';
import { formatExecutor, matchAuditEntry } from '../services/log-audit.js';
import {
  classifyVoiceChannelChange,
  VOICE_LOG_EVENT_TYPE,
} from '../services/voice-log-classifier.js';
import { handlePunishmentInteraction } from '../services/punishment-flow.js';
import { onVmuteVoiceUpdate } from '../services/vmute-guard.js';
import { syncAllOverwritesOnChannelCreate } from '../services/channel-permissions.js';
import { isTrusted, recordProtectionStrike } from '../services/trust-service.js';
import { handleProtectionModal } from '../services/protection-panel.js';
import {
  antiDeleteLog,
  antiPermsLog,
  botJoinLog,
  channelCreateLog,
  channelDeleteLog,
  channelUpdateLog,
  emojiCreateLog,
  inviteCreateLog,
  inviteDeleteLog,
  memberBanLog,
  memberJoinLog,
  memberLeaveLog,
  memberUnbanLog,
  messageDeleteLog,
  messageEditLog,
  nicknameLog,
  roleCreateLog,
  roleDeleteLog,
  roleGiveLog,
  roleRemoveLog,
  roleUpdateLog,
  serverUpdateLog,
  threadCreateLog,
  voiceChangeLog,
  voiceDeafenLog,
  voiceDisconnectLog,
  voiceJoinLog,
  voiceLeaveLog,
  voiceMoveLog,
  voiceMuteLog,
} from '../shared/log-templates.js';
import { getGuildConfig } from '../database/guild-config.js';
import { prisma } from '../database/prisma.js';
import { logger } from '../logger.js';

export function registerEvents(client: Client): void {
  client.on(Events.MessageCreate, async (message) => {
    if (!message.inGuild() || message.author.bot) return;
    try {
      if (await handleDeveloperCommand(message as import('discord.js').Message<true>)) return;

      const route = await classifyMessage(message as import('discord.js').Message<true>);

      if (route.needsGuard) {
        const guardRemoved = await runMessagePermissionGuard(message);
        if (guardRemoved) return;
      }

      if (route.needsAutoMod || route.needsAutoFeatures) {
        void recordChannelMessage(
          message.guildId,
          message.channelId,
          message.author.id,
          message.content,
        );
      }

      if (route.needsAutoMod) {
        const removed = await runAutoModeration(message);
        if (removed) return;
      }

      if (route.needsAutoFeatures) {
        await runAutoFeatures(message);
      }

      if (route.isCommand) {
        await handleMessage(message);
      }
    } catch (err) {
      logger.error({ err }, 'messageCreate handler error');
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        if (await handlePunishmentInteraction(interaction)) return;
        if (interaction.isModalSubmit() && (await handleProtectionModal(interaction))) return;
      }
    } catch (err) {
      logger.error({ err }, 'interactionCreate handler error');
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      if (member.user.bot) {
        await sendLog(client, member.guild.id, 'botJoin', botJoinLog(member.id, member.user.tag));
      }
      const removed = await handleMemberJoin(member);
      await sendLog(
        client,
        member.guild.id,
        'memberJoin',
        memberJoinLog(member.id, member.user.tag, member.user.createdTimestamp),
      );
      if (removed) logger.info({ user: member.id }, 'Member gated out on join');
    } catch (err) {
      logger.error({ err }, 'GuildMemberAdd error');
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    await sendLog(
      client,
      member.guild.id,
      'memberLeave',
      memberLeaveLog(member.id, member.user?.tag ?? member.id),
    );
  });

  client.on(Events.GuildBanAdd, async (ban) => {
    const audit = await matchAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    await sendLog(
      client,
      ban.guild.id,
      'memberBan',
      memberBanLog(
        ban.user.id,
        ban.user.tag,
        formatExecutor(audit.executor),
        ban.reason ?? audit.reason ?? undefined,
      ),
    );
  });

  client.on(Events.GuildBanRemove, async (ban) => {
    const audit = await matchAuditEntry(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    await sendLog(
      client,
      ban.guild.id,
      'memberUnban',
      memberUnbanLog(ban.user.id, ban.user.tag, formatExecutor(audit.executor), audit.reason ?? undefined),
    );
  });

  client.on(Events.GuildMemberUpdate, async (oldM, newM) => {
    await handleMemberUpdate(client, oldM, newM);
  });

  client.on(Events.MessageDelete, async (message) => {
    if (!message.guild || message.author?.bot) return;
    const audit = await matchAuditEntry(
      message.guild,
      AuditLogEvent.MessageDelete,
      message.channelId,
    );
    await sendLog(
      client,
      message.guild.id,
      'messageDelete',
      messageDeleteLog({
        by: formatExecutor(audit.executor),
        authorId: message.author?.id,
        authorTag: message.author?.tag,
        channelId: message.channelId,
        reason: audit.reason ?? undefined,
        content: message.content?.slice(0, 1000) || 'بدون نص',
      }),
    );
  });

  client.on(Events.MessageUpdate, async (oldM, newM) => {
    if (!newM.guild || newM.author?.bot) return;
    if (oldM.content === newM.content) return;
    await sendLog(
      client,
      newM.guild.id,
      'messageEdit',
      messageEditLog({
        authorId: newM.author!.id,
        authorTag: newM.author!.tag,
        channelId: newM.channelId,
        before: oldM.content || 'فارغ',
        after: newM.content || 'فارغ',
      }),
    );
  });

  client.on(Events.ChannelCreate, async (channel) => {
    if (!('guild' in channel)) return;
    const guildId = channel.guild.id;
    const audit = await matchAuditEntry(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    await sendLog(
      client,
      guildId,
      'channelCreate',
      channelCreateLog(
        `${channel}`,
        channel.name,
        formatExecutor(audit.executor),
        audit.reason ?? undefined,
      ),
    );
    try {
      await syncAllOverwritesOnChannelCreate(channel);
    } catch (err) {
      logger.warn({ err, channelId: channel.id }, 'channel permission sync on create failed');
    }
  });

  client.on(Events.ChannelDelete, async (channel) => {
    if (channel.type === ChannelType.DM) return;
    const guildId = 'guild' in channel ? channel.guild.id : null;
    if (!guildId) return;
    await maybeAntiDelete(client, guildId, 'channelDelete');
    const guild = 'guild' in channel ? channel.guild : null;
    const audit = guild
      ? await matchAuditEntry(guild, AuditLogEvent.ChannelDelete, channel.id)
      : { executor: null, reason: null };
    await sendLog(
      client,
      guildId,
      'channelDelete',
      channelDeleteLog(channel.name, formatExecutor(audit.executor), audit.reason ?? undefined),
    );
  });

  client.on(Events.ChannelUpdate, async (_old, channel) => {
    if (channel.type === ChannelType.DM) return;
    const guildId = 'guild' in channel ? channel.guild.id : null;
    if (!guildId) return;
    const guild = 'guild' in channel ? channel.guild : null;
    const audit = guild
      ? await matchAuditEntry(guild, AuditLogEvent.ChannelUpdate, channel.id)
      : { executor: null, reason: null };
    await sendLog(
      client,
      guildId,
      'channelUpdate',
      channelUpdateLog(`${channel}`, formatExecutor(audit.executor), audit.reason ?? undefined),
    );
  });

  client.on(Events.GuildRoleCreate, async (role) => {
    const audit = await matchAuditEntry(role.guild, AuditLogEvent.RoleCreate, role.id);
    await sendLog(
      client,
      role.guild.id,
      'roleCreate',
      roleCreateLog(role.name, formatExecutor(audit.executor), audit.reason ?? undefined),
    );
  });

  client.on(Events.GuildRoleDelete, async (role) => {
    await maybeAntiDelete(client, role.guild.id, 'roleDelete');
    const audit = await matchAuditEntry(role.guild, AuditLogEvent.RoleDelete, role.id);
    await sendLog(
      client,
      role.guild.id,
      'roleDelete',
      roleDeleteLog(role.name, formatExecutor(audit.executor), audit.reason ?? undefined),
    );
  });

  client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      await maybeAntiPerms(client, newRole.guild.id, newRole.id);
    }
    const audit = await matchAuditEntry(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    await sendLog(
      client,
      newRole.guild.id,
      'roleUpdate',
      roleUpdateLog(newRole.name, formatExecutor(audit.executor), audit.reason ?? undefined),
    );
  });

  client.on(Events.GuildUpdate, async (_old, guild) => {
    const audit = await matchAuditEntry(guild, AuditLogEvent.GuildUpdate, guild.id);
    await sendLog(
      client,
      guild.id,
      'serverUpdate',
      serverUpdateLog(guild.name, formatExecutor(audit.executor), audit.reason ?? undefined),
    );
  });

  client.on(Events.InviteCreate, async (invite) => {
    if (!invite.guild) return;
    await sendLog(
      client,
      invite.guild.id,
      'inviteCreate',
      inviteCreateLog(
        invite.code,
        invite.inviter ? `<@${invite.inviter.id}> (${invite.inviter.tag})` : undefined,
        invite.channel ? `${invite.channel}` : undefined,
      ),
    );
  });

  client.on(Events.InviteDelete, async (invite) => {
    if (!invite.guild) return;
    await sendLog(
      client,
      invite.guild.id,
      'inviteDelete',
      inviteDeleteLog(invite.code, invite.channel ? `${invite.channel}` : undefined),
    );
  });

  client.on(Events.GuildEmojiCreate, async (emoji) => {
    const audit = await matchAuditEntry(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
    await sendLog(
      client,
      emoji.guild.id,
      'emojiUpdate',
      emojiCreateLog(`${emoji}`, formatExecutor(audit.executor), audit.reason ?? undefined),
    );
  });

  client.on(Events.ThreadCreate, async (thread) => {
    await sendLog(
      client,
      thread.guild.id,
      'threadCreate',
      threadCreateLog(thread.id, thread.name),
    );
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    await handleVoice(client, oldState, newState);
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    await handleReactionRole(client, reaction, user.id, true);
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    await handleReactionRole(client, reaction, user.id, false);
  });
}

async function handleMemberUpdate(
  client: Client,
  oldM: GuildMember | PartialGuildMember,
  newM: GuildMember,
) {
  if (oldM.nickname !== newM.nickname) {
    const audit = await matchAuditEntry(newM.guild, AuditLogEvent.MemberUpdate, newM.id);
    await sendLog(
      client,
      newM.guild.id,
      'nickname',
      nicknameLog(
        newM.id,
        newM.user.tag,
        oldM.nickname ?? null,
        newM.nickname ?? null,
        formatExecutor(audit.executor),
        audit.reason ?? undefined,
      ),
    );
  }
  const oldRoles = oldM.roles?.cache;
  if (oldRoles) {
    const added = newM.roles.cache.filter((r) => !oldRoles.has(r.id));
    const removed = oldRoles.filter((r) => !newM.roles.cache.has(r.id));
    const audit = await matchAuditEntry(newM.guild, AuditLogEvent.MemberRoleUpdate, newM.id);
    for (const role of added.values()) {
      await sendLog(
        client,
        newM.guild.id,
        'roleGive',
        roleGiveLog(
          newM.id,
          newM.user.tag,
          role.name,
          formatExecutor(audit.executor),
          audit.reason ?? undefined,
        ),
      );
    }
    for (const role of removed.values()) {
      await sendLog(
        client,
        newM.guild.id,
        'roleRemove',
        roleRemoveLog(
          newM.id,
          newM.user.tag,
          role.name,
          formatExecutor(audit.executor),
          audit.reason ?? undefined,
        ),
      );
    }
  }
}

function buildVoiceChannelLog(
  classification: Awaited<ReturnType<typeof classifyVoiceChannelChange>>,
  member: GuildMember,
  oldState: VoiceState,
  newState: VoiceState,
): EmbedBuilder | null {
  const tag = member.user.tag;
  const oldId = oldState.channelId;
  const newId = newState.channelId;

  switch (classification.kind) {
    case 'join':
      return newId ? voiceJoinLog(member.id, tag, newId) : null;
    case 'leave':
      return oldId ? voiceLeaveLog(member.id, tag, oldId) : null;
    case 'change':
      return oldId && newId ? voiceChangeLog(member.id, tag, oldId, newId) : null;
    case 'move':
      if (!classification.executor || !oldId || !newId) {
        return oldId && newId ? voiceChangeLog(member.id, tag, oldId, newId) : null;
      }
      return voiceMoveLog(
        member.id,
        tag,
        classification.executor.id,
        oldId,
        newId,
        classification.reason,
      );
    case 'disconnect':
      if (!classification.executor || !oldId) {
        return oldId ? voiceLeaveLog(member.id, tag, oldId) : null;
      }
      return voiceDisconnectLog(
        member.id,
        tag,
        classification.executor.id,
        oldId,
        classification.reason,
      );
    default:
      return null;
  }
}

async function handleVoice(client: Client, oldState: VoiceState, newState: VoiceState) {
  try {
    await onVmuteVoiceUpdate(oldState, newState);
  } catch (err) {
    logger.warn({ err }, 'vmute guard error');
  }

  const guildId = newState.guild.id;
  const member = newState.member;
  if (!member) return;

  const classification = await classifyVoiceChannelChange(oldState, newState);
  if (classification.kind !== 'none') {
    const embed = buildVoiceChannelLog(classification, member, oldState, newState);
    if (embed) {
      await sendLog(client, guildId, VOICE_LOG_EVENT_TYPE[classification.kind], embed);
    }
  }

  const voiceChannel = newState.channel ?? oldState.channel;
  const channelId = voiceChannel?.id;

  if (oldState.serverMute !== newState.serverMute) {
    const audit = await matchAuditEntry(newState.guild, AuditLogEvent.MemberUpdate, member.id);
    await sendLog(
      client,
      guildId,
      'voiceMute',
      voiceMuteLog({
        memberId: member.id,
        memberTag: member.user.tag,
        channelId,
        by: formatExecutor(audit.executor),
        reason: audit.reason ?? undefined,
        muted: Boolean(newState.serverMute),
      }),
    );
  }

  if (oldState.serverDeaf !== newState.serverDeaf) {
    const audit = await matchAuditEntry(newState.guild, AuditLogEvent.MemberUpdate, member.id);
    await sendLog(
      client,
      guildId,
      'voiceDeafen',
      voiceDeafenLog({
        memberId: member.id,
        memberTag: member.user.tag,
        channelId,
        by: formatExecutor(audit.executor),
        reason: audit.reason ?? undefined,
        deafened: Boolean(newState.serverDeaf),
      }),
    );
  }
}

async function handleReactionRole(client: Client, reaction: any, userId: string, add: boolean) {
  try {
    if (reaction.partial) await reaction.fetch();
    const guildId = reaction.message.guildId;
    if (!guildId) return;
    const emoji = reaction.emoji.id ?? reaction.emoji.name;
    const row = await prisma.reactionRole.findUnique({
      where: { guildId_messageId_emoji: { guildId, messageId: reaction.message.id, emoji } },
    });
    if (!row) return;
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    if (add) await member.roles.add(row.roleId).catch(() => {});
    else await member.roles.remove(row.roleId).catch(() => {});
  } catch (err) {
    logger.warn({ err }, 'reaction role error');
  }
}

async function maybeAntiDelete(client: Client, guildId: string, type: 'channelDelete' | 'roleDelete') {
  const cfg = await getGuildConfig(guildId);
  if (!cfg.antiDelete) return;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const logs = await guild
    .fetchAuditLogs({
      type: type === 'channelDelete' ? AuditLogEvent.ChannelDelete : AuditLogEvent.RoleDelete,
      limit: 1,
    })
    .catch(() => null);
  const entry = logs?.entries.first();
  const executor = entry?.executor;
  if (!executor || executor.bot) return;
  if (await isTrusted(guildId, executor.id)) return;
  const strike = await recordProtectionStrike(guildId, executor.id);
  if (!strike.exceeded) return;
  const member = await guild.members.fetch(executor.id).catch(() => null);
  if (member && member.manageable) {
    await member.roles.set([]).catch(() => {});
    await sendLog(
      client,
      guildId,
      'modAction',
      antiDeleteLog(member.id, member.user.tag, executor.id, type, entry?.reason ?? undefined),
    );
  }
}

async function maybeAntiPerms(client: Client, guildId: string, _roleId: string) {
  const cfg = await getGuildConfig(guildId);
  if (!cfg.antiPerms) return;
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const logs = await guild
    .fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 1 })
    .catch(() => null);
  const entry = logs?.entries.first();
  const executor = entry?.executor;
  if (!executor || executor.bot) return;
  if (await isTrusted(guildId, executor.id)) return;
  const strike = await recordProtectionStrike(guildId, executor.id);
  if (!strike.exceeded) return;
  const member = await guild.members.fetch(executor.id).catch(() => null);
  if (member && member.manageable) {
    await member.roles.set([]).catch(() => {});
    await sendLog(
      client,
      guildId,
      'modAction',
      antiPermsLog(member.id, member.user.tag, executor.id, entry?.reason ?? undefined),
    );
  }
}
