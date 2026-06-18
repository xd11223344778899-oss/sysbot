-- Reaction-based member verification (toggle on a message in verify channel).
ALTER TABLE "Guild" ADD COLUMN "verifyReactionEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guild" ADD COLUMN "verifyReactionMessageId" TEXT;
ALTER TABLE "Guild" ADD COLUMN "verifyReactionEmoji" TEXT;
