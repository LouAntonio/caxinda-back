-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- AlterTable
ALTER TABLE "conversation" ADD COLUMN     "assignedToId" UUID,
ADD COLUMN     "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN';

-- CreateIndex
CREATE INDEX "conversation_status_idx" ON "conversation"("status");

-- CreateIndex
CREATE INDEX "conversation_assignedToId_idx" ON "conversation"("assignedToId");

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
