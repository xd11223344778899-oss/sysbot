-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '!',
    "noPrefixMode" BOOLEAN NOT NULL DEFAULT false,
    "setupDone" BOOLEAN NOT NULL DEFAULT false,
    "logCategory" TEXT,
    "modCategory" TEXT,
    "mutedRoleId" TEXT,
    "prisonRoleId" TEXT,
    "vmuteRoleId" TEXT,
    "newRoleId" TEXT,
    "unverifiedRoleId" TEXT,
    "blacklistedRoleId" TEXT,
    "picRoleId" TEXT,
    "hereRoleId" TEXT,
    "liveRoleId" TEXT,
    "autoRoleIds" TEXT NOT NULL DEFAULT '[]',
    "restrictedCategoryId" TEXT,
    "blackChannelId" TEXT,
    "blackVoiceId" TEXT,
    "prisonChannelId" TEXT,
    "prisonVoiceId" TEXT,
    "decorBaselineEnabled" BOOLEAN NOT NULL DEFAULT true,
    "newChannelId" TEXT,
    "verifyChannelId" TEXT,
    "logMode" TEXT NOT NULL DEFAULT 'DETAILED',
    "newEnabled" BOOLEAN NOT NULL DEFAULT false,
    "newMinAgeDays" INTEGER NOT NULL DEFAULT 0,
    "newMessage" TEXT,
    "verifyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "verifyMessage" TEXT,
    "verifiedRoleId" TEXT,
    "antijoinEnabled" BOOLEAN NOT NULL DEFAULT false,
    "antijoinAction" TEXT NOT NULL DEFAULT 'NONE',
    "antijoinMinAgeDays" INTEGER NOT NULL DEFAULT 0,
    "banMessage" TEXT,
    "punishOnlyAdmin" BOOLEAN NOT NULL DEFAULT false,
    "reasons" TEXT NOT NULL DEFAULT '[]',
    "punishReasons" TEXT NOT NULL DEFAULT '[]',
    "antiDelete" BOOLEAN NOT NULL DEFAULT false,
    "antiLinks" BOOLEAN NOT NULL DEFAULT false,
    "antiPerms" BOOLEAN NOT NULL DEFAULT false,
    "antiBots" BOOLEAN NOT NULL DEFAULT false,
    "antiWord" BOOLEAN NOT NULL DEFAULT false,
    "bannedWords" TEXT NOT NULL DEFAULT '[]',
    "protectionLimit" INTEGER NOT NULL DEFAULT 3,
    "spamEnabled" BOOLEAN NOT NULL DEFAULT false,
    "spamMessages" INTEGER NOT NULL DEFAULT 5,
    "spamSeconds" INTEGER NOT NULL DEFAULT 5,
    "autoLine" BOOLEAN NOT NULL DEFAULT false,
    "autoClear" BOOLEAN NOT NULL DEFAULT false,
    "autoReact" BOOLEAN NOT NULL DEFAULT false,
    "reactEmoji" TEXT,
    "embedColor" TEXT NOT NULL DEFAULT '#5865F2',
    "embedPic" TEXT,
    "linkInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuildLogChannel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    CONSTRAINT "GuildLogChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BotOwner" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "BotOwner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccessEntry" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    CONSTRAINT "AccessEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommandConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "commandName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowedRoleIds" TEXT NOT NULL DEFAULT '[]',
    "allowedUserIds" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "CommandConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Penalty" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),
    "liftedById" TEXT,
    CONSTRAINT "Penalty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Warn" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Warn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Point" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Point_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrustEntry" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "TrustEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlacklistChat" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    CONSTRAINT "BlacklistChat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelDeny" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    CONSTRAINT "ChannelDeny_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpecialRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "SpecialRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReactionRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "ReactionRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModTask" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Exemption" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "Exemption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PunishPerm" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "PunishPerm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommandAlias" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "commandName" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CommandAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AntiCollection" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "AntiCollection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InteractiveRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "attachFiles" BOOLEAN NOT NULL DEFAULT false,
    "mentionEveryone" BOOLEAN NOT NULL DEFAULT false,
    "stream" BOOLEAN NOT NULL DEFAULT false,
    "muteMembers" BOOLEAN NOT NULL DEFAULT false,
    "deafenMembers" BOOLEAN NOT NULL DEFAULT false,
    "allowedCommands" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "InteractiveRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelStressState" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "autoLineSuspendedUntil" TIMESTAMP(3),
    "lastConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suspendCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChannelStressState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuildLogChannel_guildId_eventType_key" ON "GuildLogChannel"("guildId", "eventType");
CREATE INDEX "GuildLogChannel_guildId_idx" ON "GuildLogChannel"("guildId");
CREATE UNIQUE INDEX "BotOwner_guildId_userId_key" ON "BotOwner"("guildId", "userId");
CREATE INDEX "BotOwner_guildId_idx" ON "BotOwner"("guildId");
CREATE UNIQUE INDEX "AccessEntry_guildId_targetId_mode_key" ON "AccessEntry"("guildId", "targetId", "mode");
CREATE INDEX "AccessEntry_guildId_idx" ON "AccessEntry"("guildId");
CREATE UNIQUE INDEX "CommandConfig_guildId_commandName_key" ON "CommandConfig"("guildId", "commandName");
CREATE INDEX "CommandConfig_guildId_idx" ON "CommandConfig"("guildId");
CREATE INDEX "Penalty_guildId_userId_idx" ON "Penalty"("guildId", "userId");
CREATE INDEX "Penalty_active_expiresAt_idx" ON "Penalty"("active", "expiresAt");
CREATE INDEX "Warn_guildId_userId_idx" ON "Warn"("guildId", "userId");
CREATE UNIQUE INDEX "Point_guildId_userId_key" ON "Point"("guildId", "userId");
CREATE INDEX "Point_guildId_idx" ON "Point"("guildId");
CREATE UNIQUE INDEX "TrustEntry_guildId_userId_key" ON "TrustEntry"("guildId", "userId");
CREATE UNIQUE INDEX "BlacklistChat_guildId_channelId_key" ON "BlacklistChat"("guildId", "channelId");
CREATE UNIQUE INDEX "ChannelDeny_guildId_channelId_userId_key" ON "ChannelDeny"("guildId", "channelId", "userId");
CREATE INDEX "ChannelDeny_guildId_idx" ON "ChannelDeny"("guildId");
CREATE UNIQUE INDEX "SpecialRole_guildId_ownerId_key" ON "SpecialRole"("guildId", "ownerId");
CREATE UNIQUE INDEX "ReactionRole_guildId_messageId_emoji_key" ON "ReactionRole"("guildId", "messageId", "emoji");
CREATE INDEX "ModTask_guildId_userId_idx" ON "ModTask"("guildId", "userId");
CREATE UNIQUE INDEX "Exemption_guildId_userId_type_key" ON "Exemption"("guildId", "userId", "type");
CREATE UNIQUE INDEX "PunishPerm_guildId_userId_key" ON "PunishPerm"("guildId", "userId");
CREATE UNIQUE INDEX "CommandAlias_guildId_alias_key" ON "CommandAlias"("guildId", "alias");
CREATE INDEX "CommandAlias_guildId_commandName_idx" ON "CommandAlias"("guildId", "commandName");
CREATE UNIQUE INDEX "AntiCollection_guildId_name_key" ON "AntiCollection"("guildId", "name");
CREATE UNIQUE INDEX "InteractiveRole_guildId_roleId_key" ON "InteractiveRole"("guildId", "roleId");
CREATE INDEX "InteractiveRole_guildId_idx" ON "InteractiveRole"("guildId");
CREATE UNIQUE INDEX "ChannelStressState_guildId_channelId_key" ON "ChannelStressState"("guildId", "channelId");
CREATE INDEX "ChannelStressState_guildId_idx" ON "ChannelStressState"("guildId");

ALTER TABLE "GuildLogChannel" ADD CONSTRAINT "GuildLogChannel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BotOwner" ADD CONSTRAINT "BotOwner_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessEntry" ADD CONSTRAINT "AccessEntry_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommandConfig" ADD CONSTRAINT "CommandConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Warn" ADD CONSTRAINT "Warn_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Point" ADD CONSTRAINT "Point_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrustEntry" ADD CONSTRAINT "TrustEntry_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlacklistChat" ADD CONSTRAINT "BlacklistChat_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelDeny" ADD CONSTRAINT "ChannelDeny_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpecialRole" ADD CONSTRAINT "SpecialRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReactionRole" ADD CONSTRAINT "ReactionRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModTask" ADD CONSTRAINT "ModTask_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Exemption" ADD CONSTRAINT "Exemption_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PunishPerm" ADD CONSTRAINT "PunishPerm_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommandAlias" ADD CONSTRAINT "CommandAlias_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AntiCollection" ADD CONSTRAINT "AntiCollection_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InteractiveRole" ADD CONSTRAINT "InteractiveRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelStressState" ADD CONSTRAINT "ChannelStressState_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
