/**
 * Shared slug rules. Guest slugs and invitation slugs both derive from a human
 * name, and both resolve collisions with a numeric suffix (handoff 1.5).
 */
export function slugify(value: string, fallback = 'undangan') {
  return (
    value
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  );
}

/**
 * Finds the first free slug for `base`, trying `base`, `base-2`, `base-3`, …
 * `isTaken` decides the uniqueness scope: global for invitations, per-invitation
 * for guests.
 */
export async function resolveUniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  limit = 200,
) {
  if (!(await isTaken(base))) return base;
  for (let suffix = 2; suffix <= limit; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Exhausting the range is not an expected state; fall back to a value that
  // cannot collide rather than overwriting someone else's slug.
  return `${base}-${Date.now().toString(36)}`;
}
