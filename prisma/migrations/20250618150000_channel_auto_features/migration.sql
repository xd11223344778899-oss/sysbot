-- CreateTable
CREATE TABLE "ChannelAutoFeature" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "autoLine" BOOLEAN NOT NULL DEFAULT false,
    "autoReact" BOOLEAN NOT NULL DEFAULT false,
    "reactEmoji" TEXT,

    CONSTRAINT "ChannelAutoFeature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelAutoFeature_guildId_channelId_key" ON "ChannelAutoFeature"("guildId", "channelId");
CREATE INDEX "ChannelAutoFeature_guildId_idx" ON "ChannelAutoFeature"("guildId");

ALTER TABLE "ChannelAutoFeature" ADD CONSTRAINT "ChannelAutoFeature_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
