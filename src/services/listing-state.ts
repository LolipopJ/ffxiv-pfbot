import type { Recruitment } from "../types/recruitment";
import { getListingExpiresAt, isListingStale } from "../utils/listing-time";
import { logger } from "../utils/logger";
import type { SubscriptionStore } from "./store";

// Both monitoring and cleanup refresh deadlines before acting on stored state.
export function refreshListingState(
  store: SubscriptionStore,
  listings: ReadonlyMap<string, Recruitment> | undefined,
  observedAt: number,
) {
  const expiredListingIds = new Set(store.getExpiredListingIds());
  const listingExpiries = new Map<string, number | null>();
  if (listings) {
    for (const listing of listings.values()) {
      // Stale website entries represent full/cancelled recruitments, even if
      // their advertised countdown has not ended. Persist this for delete retries.
      const expiresAt = isListingStale(listing.updated)
        ? observedAt
        : getListingExpiresAt(listing.expires, observedAt);
      listingExpiries.set(listing.id, expiresAt);
      if (expiresAt === null) {
        logger.warn("listing", "expiryUnknown", {
          listingId: listing.id,
          expires: listing.expires,
        });
      }
    }
    for (const id of expiredListingIds) {
      const expiresAt = listingExpiries.get(id);
      if (!listings.has(id) || (expiresAt != null && expiresAt > observedAt)) {
        store.removeExpiredListing(id);
        expiredListingIds.delete(id);
      }
    }
    store.refreshMonitorDeliveries(listingExpiries, observedAt);
  }
  // Retain deadlines from every channel, including inaccessible/unsubscribed ones.
  // Rechecking this snapshot during delivery must not renew website countdowns.
  const recordedExpiries = new Map<string, number>();
  for (const delivery of store.getMonitorDeliveries()) {
    recordedExpiries.set(
      delivery.listingId,
      Math.min(
        recordedExpiries.get(delivery.listingId) ?? Infinity,
        delivery.expiresAt,
      ),
    );
  }
  const isListingExpired = (listingId: string, checkedAt: number) => {
    if (expiredListingIds.has(listingId)) return true;
    const expiresAt = recordedExpiries.get(listingId);
    if (
      expiresAt !== undefined &&
      expiresAt <= checkedAt &&
      (!listings || listings.has(listingId))
    ) {
      store.markListingExpired(listingId, expiresAt, checkedAt);
      expiredListingIds.add(listingId);
      return true;
    }
    return false;
  };
  // Persist suppression independently of Discord access and channel order.
  for (const listingId of recordedExpiries.keys())
    isListingExpired(listingId, observedAt);
  return { listingExpiries, expiredListingIds, isListingExpired };
}
