-- CreateTable
CREATE TABLE "daily_pulse_games" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "gameType" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_pulse_games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_pulse_games_userId_dateKey_key" ON "daily_pulse_games"("userId", "dateKey");

-- AddForeignKey
ALTER TABLE "daily_pulse_games" ADD CONSTRAINT "daily_pulse_games_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
