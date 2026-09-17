"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  badgeText,
  markReadLocally,
  mergeNotification,
  SEVERITY_TONE,
  typeLabel,
  unreadAriaLabel,
} from "@/components/notifications/notification-model";
import { useSession } from "@/components/shell/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast";
import { notificationsApi } from "@/lib/api/endpoints-supervision";
import { presentError } from "@/lib/api/errors";
import type { NotificationResponse } from "@/lib/api/types-supervision";
import { cx } from "@/lib/cx";
import { formatDateTime } from "@/lib/format";
import { useEventStream } from "@/lib/realtime/use-event-stream";

const POPOVER_SIZE = 10;

/**
 * Notification bell of the back-office topbar (docs/round2-contract.md §5.8): unread badge, last ten
 * notifications, live push and a 60 s polling fallback of the counter.
 */
export function NotificationBell() {
  const { role } = useSession();
  const { toast } = useToast();
  const staff = role !== "ANNONCEUR";
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationResponse[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCount = useCallback(async () => {
    if (!staff) return;
    try {
      const { count } = await notificationsApi.unreadCount();
      setUnread(count);
    } catch {
      /* the badge simply keeps its previous value */
    }
  }, [staff]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await notificationsApi.list({ size: POPOVER_SIZE });
      setItems(page.items);
    } catch (e) {
      setError(presentError(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!staff) return;
    const id = setInterval(() => void refreshCount(), 60_000);
    return () => clearInterval(id);
  }, [staff, refreshCount]);

  const handlers = useMemo(
    () => ({
      "unread-count": (payload: unknown) => {
        const count = (payload as { count?: number } | null)?.count;
        if (typeof count === "number") setUnread(count);
      },
      notification: (payload: unknown) => {
        const notification = payload as NotificationResponse;
        setItems((prev) => mergeNotification(prev, notification, POPOVER_SIZE));
        setUnread((n) => n + 1);
        if (notification.severity === "CRITIQUE") {
          toast({
            title: notification.title,
            description: notification.message,
            variant: "danger",
          });
        }
      },
    }),
    [toast],
  );

  useEventStream(staff ? "/api/realtime/notifications" : null, handlers, {
    fallback: refreshCount,
    fallbackIntervalMs: 60_000,
    enabled: staff,
  });

  if (!staff) return null;

  const markRead = async (notification: NotificationResponse) => {
    if (notification.readAt) return;
    setItems((prev) => markReadLocally(prev, notification.id, new Date().toISOString()));
    setUnread((n) => Math.max(0, n - 1));
    try {
      await notificationsApi.markRead(notification.id);
    } catch {
      void refreshCount();
    }
  };

  const markAll = async () => {
    try {
      await notificationsApi.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      setUnread(0);
    } catch (e) {
      toast({ title: "Action impossible", description: presentError(e).message, variant: "danger" });
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadList();
      }}
    >
      <PopoverTrigger
        aria-label={unreadAriaLabel(unread)}
        className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-overlay-hover data-[state=open]:bg-overlay-hover"
      >
        <Bell aria-hidden="true" className="size-5" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] leading-4 font-bold text-on-brand"
          >
            {badgeText(unread)}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <p className="font-label text-[0.8125rem] font-semibold text-ink-strong">Notifications</p>
          <Button size="sm" variant="ghost" onClick={() => void markAll()} disabled={unread === 0}>
            Tout marquer comme lu
          </Button>
        </div>
        <div className="max-h-[22rem] overflow-y-auto">
          {loading ? (
            <p role="status" className="px-3 py-6 text-center text-sm text-muted">
              Chargement…
            </p>
          ) : null}
          {error ? (
            <p role="status" className="px-3 py-4 text-center text-sm text-warning">
              {error}
            </p>
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Aucune notification.</p>
          ) : null}
          <ul>
            {items.map((notification) => {
              const body = (
                <>
                  <span className="flex items-center gap-2">
                    <Badge tone={SEVERITY_TONE[notification.severity]}>
                      {typeLabel(notification.type)}
                    </Badge>
                    {notification.readAt === null ? (
                      <span className="sr-only">Non lue</span>
                    ) : null}
                    <span className="ml-auto text-xs text-muted tabular">
                      {formatDateTime(notification.createdAt)}
                    </span>
                  </span>
                  <span className="mt-1 block font-label text-[0.8125rem] font-semibold text-ink-strong">
                    {notification.title}
                  </span>
                  <span className="block text-[0.8125rem] text-muted">{notification.message}</span>
                </>
              );
              return (
                <li key={notification.id} className="border-b border-line last:border-b-0">
                  {notification.link ? (
                    <Link
                      href={notification.link}
                      onClick={() => void markRead(notification)}
                      className={cx(
                        "block px-3 py-2 transition-colors hover:bg-overlay-hover",
                        notification.readAt === null && "bg-overlay-inset",
                      )}
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void markRead(notification)}
                      className={cx(
                        "block w-full px-3 py-2 text-left transition-colors hover:bg-overlay-hover",
                        notification.readAt === null && "bg-overlay-inset",
                      )}
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="border-t border-line px-3 py-2 text-right">
          <Link
            href="/admin/notifications"
            onClick={() => setOpen(false)}
            className="font-label text-[0.8125rem] font-semibold text-brand-blue-text underline-offset-4 hover:underline"
          >
            Voir toutes les notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
