-- CreateEnum
CREATE TYPE "PersonalGoal" AS ENUM ('MOVEMENT', 'SLEEP', 'STRESS', 'HYDRATION', 'SELF_CARE');

-- CreateTable
CREATE TABLE "user_goals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goal" "PersonalGoal" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_goals_userId_active_idx" ON "user_goals"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "user_goals_userId_goal_key" ON "user_goals"("userId", "goal");

-- AddForeignKey
ALTER TABLE "user_goals" ADD CONSTRAINT "user_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
