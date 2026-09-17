import type { Metadata } from "next";

import { ReservationsAdminView } from "@/components/admin/reservations-admin-view";

export const metadata: Metadata = {
  title: "Réservations",
};

export default function Page() {
  return <ReservationsAdminView />;
}
