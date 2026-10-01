export const LISTING_LIFETIME_MS = 3_600_000;

export function getListingExpiresAt(expires: string, now = Date.now()) {
  if (expires.trim().toLowerCase() === "now") return now;
  const match = /^in\s+(\d+|an?)\s+(seconds?|minutes?|hours?)$/i.exec(
    expires.trim(),
  );
  if (!match) return null;
  const amount = /^\d+$/.test(match[1]!) ? Number(match[1]) : 1;
  const unit = match[2]!.toLowerCase();
  const remaining =
    amount *
    (unit.startsWith("hour")
      ? LISTING_LIFETIME_MS
      : unit.startsWith("minute")
        ? 60_000
        : 1000);
  if (!Number.isFinite(remaining) || remaining > LISTING_LIFETIME_MS)
    return null;
  return now + remaining;
}
