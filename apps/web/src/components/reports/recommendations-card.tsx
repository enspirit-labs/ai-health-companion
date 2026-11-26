import { Sparkles } from 'lucide-react';
import type { AiRecommendation } from '@aidoctor/shared';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RecommendationsList } from '@/components/reports/recommendations-list';

/**
 * Recommendations are the payoff of every assessment — the one thing a user
 * actually acts on — so this card is deliberately louder than the plain
 * Observations card it sits next to (tinted background, primary-colored
 * ring, icon badge) instead of matching its neighbor.
 */
export function RecommendationsCard({ recommendations }: { recommendations: AiRecommendation[] }) {
  if (recommendations.length === 0) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/[0.07] via-card to-card shadow-md shadow-primary/5 ring-1 ring-primary/10">
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-0.5">
          <CardTitle className="text-base">AI Recommendations</CardTitle>
          <CardDescription>Personalized guidance based on your results</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <RecommendationsList recommendations={recommendations} />
      </CardContent>
    </Card>
  );
}
