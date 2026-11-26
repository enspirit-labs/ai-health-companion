export interface PaginationParams {
  page?: number;
  limit?: number;
}

/** Parses an optional query-string number, treating anything non-positive/NaN as unset. */
export function parsePositiveInt(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Converts optional page/limit params into Prisma `take`/`skip` args. Returns
 * an empty object when `limit` is unset, so callers that omit pagination get
 * an unmodified, unbounded query — existing behavior is preserved exactly.
 */
export function toPrismaPageArgs(pagination?: PaginationParams): { take?: number; skip?: number } {
  const limit = pagination?.limit && pagination.limit > 0 ? pagination.limit : undefined;
  if (!limit) return {};
  const page = pagination?.page && pagination.page > 0 ? pagination.page : undefined;
  return page ? { take: limit, skip: (page - 1) * limit } : { take: limit };
}
