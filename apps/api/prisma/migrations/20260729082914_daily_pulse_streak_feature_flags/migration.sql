-- Daily Pulse & Streak (ALPHA-91). Hand-authored, not `prisma migrate dev`
-- generated: the shared dev DB has a pre-existing checksum drift on
-- 20260723000000_add_squat_assessment_type that blocks the normal shadow-DB
-- workflow (see git history / team discussion — unrelated to this feature,
-- left untouched here on purpose). A raw `prisma migrate diff` against this
-- schema would ALSO try to recreate the AssessmentType enum without the
-- legacy SIT_TO_STAND/SQUAT values, which live data still uses (3 rows in
-- assessments, 1 in ai_prompt_templates) — that recreation is deliberately
-- excluded from this migration. AssessmentType is not touched at all here.

-- CreateEnum
CREATE TYPE "AssessmentMode" AS ENUM ('FULL', 'PULSE');

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN "mode" "AssessmentMode" NOT NULL DEFAULT 'FULL';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "timezone" TEXT;

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "assessments_userId_type_status_mode_idx" ON "assessments"("userId", "type", "status", "mode");

-- CreateIndex
CREATE INDEX "assessments_userId_status_completedAt_idx" ON "assessments"("userId", "status", "completedAt");
