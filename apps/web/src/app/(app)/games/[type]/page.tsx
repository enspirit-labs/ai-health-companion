'use client';

import { use } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PinpointGameScreen } from '@/components/games/pinpoint/pinpoint-game-screen';
import { TangoGameScreen } from '@/components/games/tango/tango-game-screen';
import { gameTypeFromSlug } from '@/lib/games/game-slug';
import { useRecommendedAssessment } from '@/lib/dashboard/use-dashboard';

/**
 * Dedicated, distraction-free screen for today's pulse game — deliberately its
 * own route rather than a dashboard widget so the board gets the whole viewport
 * on a phone. Mirrors the assessments/[type] slug convention.
 *
 * The puzzle comes from the same cached endpoint the dashboard tile reads, so
 * opening the game never generates a different board than the tile advertised.
 */
export default function GamePage({ params }: { params: Promise<{ type: string }> }) {
  const { type: slug } = use(params);
  const requestedType = gameTypeFromSlug(slug);
  const recommended = useRecommendedAssessment();

  if (!requestedType) {
    return <GameUnavailable message="That game doesn't exist." />;
  }

  if (recommended.isLoading) {
    return (
      <main id="main-content" className="flex flex-1 items-center justify-center">
        <LoadingState label="Loading today's puzzle…" variant="page" />
      </main>
    );
  }

  if (recommended.isError) {
    return (
      <main id="main-content" className="flex flex-1 items-center justify-center px-4">
        <ErrorState
          description="Could not load today's puzzle."
          onRetry={() => recommended.refetch()}
        />
      </main>
    );
  }

  const data = recommended.data;

  // No game today: either the check-in isn't done yet, or the feature is off.
  if (!data || data.kind !== 'GAME') {
    return (
      <GameUnavailable message="Today's game unlocks once you've completed your Daily Pulse check-in." />
    );
  }

  // Guard against a stale bookmark: the day's game is chosen by the check-in,
  // so /games/tango is meaningless on a day that generated a Pinpoint.
  if (data.game.type !== requestedType) {
    return (
      <GameUnavailable
        message={`Today's puzzle is ${data.game.type === 'TANGO' ? 'Tango' : 'Pinpoint'}, not ${requestedType === 'TANGO' ? 'Tango' : 'Pinpoint'}.`}
      />
    );
  }

  return data.game.type === 'TANGO' ? (
    <TangoGameScreen game={data.game} difficulty={data.difficulty} />
  ) : (
    <PinpointGameScreen game={data.game} difficulty={data.difficulty} />
  );
}

function GameUnavailable({ message }: { message: string }) {
  return (
    <main
      id="main-content"
      className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <p role="status" className="text-lg font-medium">
        No puzzle here yet
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </main>
  );
}
