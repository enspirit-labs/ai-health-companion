-- CreateTable
CREATE TABLE "weekly_action_completions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "goal" "PersonalGoal" NOT NULL,
    "actionId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_action_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weekly_action_completions_userId_weekStart_idx" ON "weekly_action_completions"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_action_completions_userId_weekStart_actionId_key" ON "weekly_action_completions"("userId", "weekStart", "actionId");

-- AddForeignKey
ALTER TABLE "weekly_action_completions" ADD CONSTRAINT "weekly_action_completions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
