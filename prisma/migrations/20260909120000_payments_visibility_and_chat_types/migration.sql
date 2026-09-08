-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('AD', 'BUSINESS', 'SUPPORT');

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentStatus_new" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');
ALTER TABLE "public"."payment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "payment" ALTER COLUMN "status" TYPE "PaymentStatus_new" USING ("status"::text::"PaymentStatus_new");
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "public"."PaymentStatus_old";
ALTER TABLE "payment" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- DropForeignKey
ALTER TABLE "conversation" DROP CONSTRAINT "conversation_adId_fkey";

-- DropForeignKey
ALTER TABLE "payment" DROP CONSTRAINT "payment_adId_fkey";

-- DropForeignKey
ALTER TABLE "payment" DROP CONSTRAINT "payment_buyerId_fkey";

-- DropForeignKey
ALTER TABLE "payment" DROP CONSTRAINT "payment_sellerId_fkey";

-- DropIndex
DROP INDEX "payment_adId_idx";

-- DropIndex
DROP INDEX "payment_buyerId_idx";

-- DropIndex
DROP INDEX "payment_sellerId_idx";

-- AlterTable
ALTER TABLE "conversation" ADD COLUMN     "businessId" UUID,
ADD COLUMN     "type" "ConversationType" NOT NULL DEFAULT 'AD',
ALTER COLUMN "adId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payment" DROP COLUMN "adId",
DROP COLUMN "buyerId",
DROP COLUMN "feePercent",
DROP COLUMN "releasedAt",
DROP COLUMN "sellerId",
ADD COLUMN     "subscriptionId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "plan" ADD COLUMN     "businessVisibilityLimit" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "subscription" ADD COLUMN     "businessId" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "conversation_type_idx" ON "conversation"("type");

-- CreateIndex
CREATE INDEX "conversation_adId_idx" ON "conversation"("adId");

-- CreateIndex
CREATE INDEX "conversation_businessId_idx" ON "conversation"("businessId");

-- CreateIndex
CREATE INDEX "payment_subscriptionId_idx" ON "payment"("subscriptionId");

-- CreateIndex
CREATE INDEX "subscription_businessId_idx" ON "subscription"("businessId");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_adId_fkey" FOREIGN KEY ("adId") REFERENCES "ad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
