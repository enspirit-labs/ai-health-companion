/**
 * "Showing X of Y" line for a filtered list — lets a user tell a short
 * filtered list apart from an over-filtered (empty-looking) one. Renders
 * nothing once `shown` equals `total` (no active filter reducing the list).
 * Shared by the Reports and Recommendations pages (Important).
 */
export function ResultCount({ shown, total }: { shown: number; total: number }) {
  if (shown === total) return null;
  return (
    <p className="text-sm text-muted-foreground">
      Showing {shown} of {total}
    </p>
  );
}
