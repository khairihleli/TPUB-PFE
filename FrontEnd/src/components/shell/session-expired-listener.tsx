"use client";

import { useEffect, useState } from "react";

import { SessionExpiredDialog } from "@/components/shell/session-expiry";
import { SESSION_EXPIRED_EVENT } from "@/lib/api/client";

/**
 * Listens for the `zelqane:session-expired` event (first 401 from apiFetch, or the JWT deadline)
 * and opens the non-dismissible SessionExpiredDialog instead of navigating away, so typed input
 * kept by useFormDraft survives the re-login (FFA-01).
 */
export function SessionExpiredListener() {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const onExpired = () => setExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  return <SessionExpiredDialog open={expired} />;
}
