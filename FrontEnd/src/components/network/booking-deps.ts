/** API calls used by `runBatchBooking` (kept apart so booking-plan.ts stays pure). */
import type { BatchBookingDeps } from "@/components/network/booking-plan";
import { campaignsApi, reservationsApi } from "@/lib/api/endpoints";
import { invalidate, resourceKeys } from "@/lib/resource-cache";

export const BATCH_BOOKING_DEPS: BatchBookingDeps = {
  zones: (campaignId) => campaignsApi.zones(campaignId),
  setZones: async (campaignId, zones) => {
    const result = await campaignsApi.setZones(campaignId, zones);
    invalidate(resourceKeys.campaignZones(campaignId));
    invalidate(resourceKeys.campaign(campaignId));
    return result;
  },
  createBatch: async (body) => {
    const created = await reservationsApi.createBatch(body);
    invalidate(resourceKeys.reservationsByCampaign(body.campaignId));
    invalidate(resourceKeys.reservationsMine);
    invalidate(resourceKeys.campaignsMine);
    return created;
  },
};
