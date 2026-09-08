-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'MODERATOR', 'PROMOTER');

-- CreateEnum
CREATE TYPE "KYCStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdType" AS ENUM ('SALE', 'TRADE', 'DONATION');

-- CreateEnum
CREATE TYPE "AdStatus" AS ENUM ('ACTIVE', 'SOLD', 'TRADED', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdVisibility" AS ENUM ('VISIBLE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'KUSUMBA_PASS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PENDING', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('AD', 'USER', 'REVIEW', 'MESSAGE');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'FRAUD', 'FAKE_AD', 'INAPPROPRIATE', 'DEFECTIVE_PRODUCT', 'NOT_AS_DESCRIBED', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'RELEASED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "surname" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "role" "Role" NOT NULL DEFAULT 'USER',
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "phone" TEXT,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "neighborhood" TEXT,
    "city" TEXT DEFAULT 'Luanda',
    "province" TEXT,
    "bankName" TEXT,
    "bankHolder" TEXT,
    "bankIban" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "KYCStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "biFrontUrl" VARCHAR(2048) NOT NULL,
    "biFrontId" VARCHAR(255) NOT NULL,
    "biBackUrl" VARCHAR(2048) NOT NULL,
    "biBackId" VARCHAR(255) NOT NULL,
    "selfies" JSONB DEFAULT '[]',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_bank_account" (
    "id" UUID NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankHolder" TEXT NOT NULL,
    "bankIban" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_config" (
    "id" TEXT NOT NULL,
    "feePercent" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "buyerId" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "adId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "feePercent" DECIMAL(5,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "platformAccount" JSONB,
    "proofUrl" VARCHAR(2048),
    "proofId" VARCHAR(255),
    "proofAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" UUID,
    "adminNote" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "type" "AdType" NOT NULL DEFAULT 'SALE',
    "status" "AdStatus" NOT NULL DEFAULT 'ACTIVE',
    "visibility" "AdVisibility" NOT NULL DEFAULT 'VISIBLE',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tradefor" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "averageRating" DOUBLE PRECISION,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "featuredUntil" TIMESTAMP(3),
    "featuredAt" TIMESTAMP(3),
    "image" VARCHAR(2048),
    "imageId" VARCHAR(255),
    "gallery" JSONB DEFAULT '[]',
    "userId" UUID NOT NULL,

    CONSTRAINT "ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL,
    "impersonatedBy" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "issuer" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation" (
    "id" UUID NOT NULL,
    "adId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participant" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "conversation_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senderId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "media" JSONB DEFAULT '[]',

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review" (
    "id" UUID NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "comment" TEXT,
    "response" TEXT,
    "adId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "revieweeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report" (
    "id" UUID NOT NULL,
    "targetType" "ReportTarget" NOT NULL,
    "targetId" UUID NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "description" TEXT,
    "media" JSONB DEFAULT '[]',
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "reporterId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_item" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "adId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currency" TEXT NOT NULL DEFAULT 'AOA',
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "featuredAdsLimit" INTEGER NOT NULL DEFAULT 0,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'KUSUMBA_PASS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'KUSUMBA_PASS',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "renewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AdToCategory" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_AdToCategory_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_phone_key" ON "user"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_userId_key" ON "kyc"("userId");

-- CreateIndex
CREATE INDEX "payment_buyerId_idx" ON "payment"("buyerId");

-- CreateIndex
CREATE INDEX "payment_sellerId_idx" ON "payment"("sellerId");

-- CreateIndex
CREATE INDEX "payment_adId_idx" ON "payment"("adId");

-- CreateIndex
CREATE INDEX "payment_status_idx" ON "payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ad_slug_key" ON "ad"("slug");

-- CreateIndex
CREATE INDEX "ad_featured_featuredUntil_idx" ON "ad"("featured", "featuredUntil");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account"("issuer", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "category_slug_key" ON "category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participant_conversationId_userId_key" ON "conversation_participant"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "message_conversationId_createdAt_idx" ON "message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "message_conversationId_isRead_idx" ON "message"("conversationId", "isRead");

-- CreateIndex
CREATE INDEX "review_revieweeId_idx" ON "review"("revieweeId");

-- CreateIndex
CREATE INDEX "review_reviewerId_idx" ON "review"("reviewerId");

-- CreateIndex
CREATE INDEX "review_adId_idx" ON "review"("adId");

-- CreateIndex
CREATE UNIQUE INDEX "review_reviewerId_adId_key" ON "review"("reviewerId", "adId");

-- CreateIndex
CREATE INDEX "report_targetType_targetId_idx" ON "report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "report_status_idx" ON "report"("status");

-- CreateIndex
CREATE INDEX "report_reporterId_idx" ON "report"("reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "report_reporterId_targetType_targetId_key" ON "report"("reporterId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "wishlist_item_userId_idx" ON "wishlist_item"("userId");

-- CreateIndex
CREATE INDEX "wishlist_item_adId_idx" ON "wishlist_item"("adId");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_item_userId_adId_key" ON "wishlist_item"("userId", "adId");

-- CreateIndex
CREATE INDEX "plan_isActive_idx" ON "plan"("isActive");

-- CreateIndex
CREATE INDEX "subscription_userId_idx" ON "subscription"("userId");

-- CreateIndex
CREATE INDEX "subscription_planId_idx" ON "subscription"("planId");

-- CreateIndex
CREATE INDEX "subscription_status_idx" ON "subscription"("status");

-- CreateIndex
CREATE INDEX "_AdToCategory_B_index" ON "_AdToCategory"("B");

-- AddForeignKey
ALTER TABLE "kyc" ADD CONSTRAINT "kyc_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_adId_fkey" FOREIGN KEY ("adId") REFERENCES "ad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad" ADD CONSTRAINT "ad_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_adId_fkey" FOREIGN KEY ("adId") REFERENCES "ad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_adId_fkey" FOREIGN KEY ("adId") REFERENCES "ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_adId_fkey" FOREIGN KEY ("adId") REFERENCES "ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdToCategory" ADD CONSTRAINT "_AdToCategory_A_fkey" FOREIGN KEY ("A") REFERENCES "ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdToCategory" ADD CONSTRAINT "_AdToCategory_B_fkey" FOREIGN KEY ("B") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
