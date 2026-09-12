-- Destaque (benefício de plano) em empresas
ALTER TABLE "business"
  ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "featuredUntil" TIMESTAMP(3),
  ADD COLUMN "featuredAt" TIMESTAMP(3);

CREATE INDEX "business_featured_featuredUntil_idx" ON "business"("featured", "featuredUntil");