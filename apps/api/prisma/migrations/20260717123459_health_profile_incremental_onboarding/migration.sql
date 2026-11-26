-- AlterTable
ALTER TABLE "health_profiles" ADD COLUMN     "answeredQuestionKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "age" DROP NOT NULL,
ALTER COLUMN "gender" DROP NOT NULL,
ALTER COLUMN "heightCm" DROP NOT NULL,
ALTER COLUMN "weightKg" DROP NOT NULL,
ALTER COLUMN "exerciseLevel" DROP NOT NULL,
ALTER COLUMN "dietType" DROP NOT NULL,
ALTER COLUMN "sleepHours" DROP NOT NULL,
ALTER COLUMN "emergencyContactName" DROP NOT NULL,
ALTER COLUMN "emergencyContactRelationship" DROP NOT NULL,
ALTER COLUMN "emergencyContactPhone" DROP NOT NULL;
