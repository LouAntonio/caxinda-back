-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('AD', 'BUSINESS');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('SHOW', 'HIDE');

-- CreateEnum
CREATE TYPE "Province" AS ENUM ('BENGO', 'BENGUELA', 'BIÉ', 'CABINDA', 'CUANDO_CUBANGO', 'CUANZA_NORTE', 'CUANZA_SUL', 'CUNENE', 'HUAMBO', 'HUÍLA', 'LUANDA', 'LUNDA_NORTE', 'LUNDA_SUL', 'MALANJE', 'MOXICO', 'NAMIBE', 'UÍGE', 'ZAIRE');

-- AlterEnum
BEGIN;
CREATE TYPE "AdStatus_new" AS ENUM ('ACTIVE', 'SOLD', 'ARCHIVED', 'REJECTED');
ALTER TABLE "public"."ad" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ad" ALTER COLUMN "status" TYPE "AdStatus_new" USING ("status"::text::"AdStatus_new");
ALTER TYPE "AdStatus" RENAME TO "AdStatus_old";
ALTER TYPE "AdStatus_new" RENAME TO "AdStatus";
DROP TYPE "public"."AdStatus_old";
ALTER TABLE "ad" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterTable
ALTER TABLE "ad" DROP COLUMN "tradefor",
DROP COLUMN "type";

-- AlterTable
ALTER TABLE "category" ADD COLUMN     "type" "CategoryType" NOT NULL DEFAULT 'AD';

-- AlterTable
ALTER TABLE "plan" DROP COLUMN "tier";

-- AlterTable
ALTER TABLE "review" ADD COLUMN     "businessId" UUID,
ALTER COLUMN "adId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "subscription" DROP COLUMN "tier";

-- AlterTable
ALTER TABLE "user" DROP COLUMN "bankHolder",
DROP COLUMN "bankIban",
DROP COLUMN "bankName",
DROP COLUMN "city",
DROP COLUMN "neighborhood",
DROP COLUMN "province",
DROP COLUMN "subscriptionTier";

-- DropTable
DROP TABLE "platform_config";

-- DropEnum
DROP TYPE "AdType";

-- DropEnum
DROP TYPE "SubscriptionTier";

-- CreateTable
CREATE TABLE "business" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT,
    "province" "Province" NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logoUrl" VARCHAR(2048),
    "logoId" VARCHAR(255),
    "coverUrl" VARCHAR(2048),
    "coverId" VARCHAR(255),
    "gallery" JSONB DEFAULT '[]',
    "categoryId" UUID NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" "BusinessStatus" NOT NULL DEFAULT 'SHOW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_slug_key" ON "business"("slug");

-- CreateIndex
CREATE INDEX "business_status_idx" ON "business"("status");

-- CreateIndex
CREATE INDEX "business_province_idx" ON "business"("province");

-- CreateIndex
CREATE INDEX "business_categoryId_idx" ON "business"("categoryId");

-- CreateIndex
CREATE INDEX "review_businessId_idx" ON "review"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "review_reviewerId_businessId_key" ON "review"("reviewerId", "businessId");

-- AddForeignKey
ALTER TABLE "business" ADD CONSTRAINT "business_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business" ADD CONSTRAINT "business_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
