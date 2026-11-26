import { Skeleton } from '@/components/ui/skeleton';

/**
 * Placeholder rows shaped like the bordered list-item cards shared by
 * `ReportList` and `RecommendationsFeed` — used in place of a bare `LoadingState`
 * spinner so the layout doesn't pop in once data resolves (Important).
 * The rows themselves are decorative (`aria-hidden`, inherited from `Skeleton`);
 * `label` is the only content exposed to assistive tech, via the `status` role.
 */
export function ListItemSkeleton({ count = 3, label = 'Loading…' }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border p-4">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
