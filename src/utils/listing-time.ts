export const LISTING_LIFETIME_MS = 3_600_000;
export const LISTING_STALE_AFTER_MINUTES = 10;

export function isListingStale(updated: string) {
  if (
    updated === "now" ||
    /^(?:a|\d+) seconds? ago$/.test(updated) ||
    updated === "a minute ago" ||
    updated === "1 minute ago"
  )
    return false;
  if (updated === "an hour ago" || updated === "1 hour ago") return true;
  const match = /^(\d+) minutes ago$/.exec(updated);
  return match !== null && Number(match[1]) >= LISTING_STALE_AFTER_MINUTES;
}

export function parseListingExpiry(expires: string) {
  if (expires.trim().toLowerCase() === "now")
    return { amount: 0, unit: "second" as const, remaining: 0 };
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
  const normalizedUnit = unit.startsWith("hour")
    ? "hour"
    : unit.startsWith("minute")
      ? "minute"
      : "second";
  return {
    amount,
    unit: normalizedUnit as "hour" | "minute" | "second",
    remaining,
  };
}

export function getListingExpiresAt(expires: string, now = Date.now()) {
  const parsed = parseListingExpiry(expires);
  return parsed ? now + parsed.remaining : null;
}
