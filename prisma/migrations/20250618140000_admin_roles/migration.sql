-- CreateTable
CREATE TABLE "AdminRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "allowedCommands" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminRole_guildId_roleId_key" ON "AdminRole"("guildId", "roleId");
CREATE INDEX "AdminRole_guildId_idx" ON "AdminRole"("guildId");

ALTER TABLE "AdminRole" ADD CONSTRAINT "AdminRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
