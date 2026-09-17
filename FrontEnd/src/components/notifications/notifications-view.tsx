"use client";

import { BellRing, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PagerBar } from "@/components/admin/admin-controls";
import {
  SEVERITY_TONE,
  typeLabel,
  unreadCount,
} from "@/components/notifications/notification-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { notificationsApi } from "@/lib/api/endpoints-supervision";
import { presentError } from "@/lib/api/errors";
import { cx } from "@/lib/cx";
import { formatDateTime } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const PAGE_SIZE = 20;

/** Page « Notifications » (docs/round2-contract.md §5.8): full list, unread filter. */
export function NotificationsView() {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, error, loading, reload, setData } = useResource(
    `admin:notifications:${page}:${unreadOnly}`,
    (signal) => notificationsApi.list({ unreadOnly, page, size: PAGE_SIZE, signal }),
  );

  const markAll = async () => {
    try {
      const { updated } = await notificationsApi.markAllRead();
      toast({
        title: updated > 0 ? `${updated} notification(s) marquée(s) comme lue(s)` : "Rien à marquer",
        variant: "success",
      });
      reload();
    } catch (e) {
      toast({ title: "Action impossible", description: presentError(e).message, variant: "danger" });
    }
  };

  const markOne = async (id: number) => {
    try {
      await notificationsApi.markRead(id);
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((n) =>
                n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
              ),
            }
          : prev!,
      );
    } catch (e) {
      toast({ title: "Action impossible", description: presentError(e).message, variant: "danger" });
    }
  };

  const header = (
    <PageHeader
      title="Notifications"
      description="Alertes du réseau, approbations en attente et messages prioritaires qui vous concernent."
      secondaryActions={
        <>
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<RefreshCw aria-hidden="true" />}
            onClick={reload}
          >
            Actualiser
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void markAll()}
            disabled={(data ? unreadCount(data.items) : 0) === 0}
          >
            Tout marquer comme lu
          </Button>
        </>
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <ErrorState error={error} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="mt-4 flex items-center gap-3">
        <label className="inline-flex items-center gap-2 text-[0.8125rem] text-ink-soft">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => {
              setUnreadOnly(e.target.checked);
              setPage(0);
            }}
            className="size-4 accent-[var(--color-brand-blue)]"
          />
          Non lues seulement
        </label>
      </div>

      {loading && !data ? (
        <LoadingRegion label="Chargement des notifications…">
          <Skeleton className="mt-4 h-20 rounded-card" />
          <Skeleton className="mt-3 h-20 rounded-card" />
        </LoadingRegion>
      ) : null}

      {data && data.items.length === 0 ? (
        <EmptyState
          icon={<BellRing />}
          title="Aucune notification"
          description={
            unreadOnly
              ? "Toutes vos notifications sont lues."
              : "Vous serez prévenu ici des alertes du réseau et des approbations en attente."
          }
        />
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <ul className="mt-4 flex flex-col gap-2">
            {data.items.map((notification) => (
              <li
                key={notification.id}
                className={cx(
                  "rounded-card border border-line p-3",
                  notification.readAt === null && "bg-overlay-inset",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={SEVERITY_TONE[notification.severity]}>
                    {typeLabel(notification.type)}
                  </Badge>
                  <span className="font-label text-[0.8125rem] font-semibold text-ink-strong">
                    {notification.title}
                  </span>
                  <span className="ml-auto text-xs text-muted tabular">
                    {formatDateTime(notification.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-[0.8125rem] text-muted">{notification.message}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {notification.link ? (
                    <Link
                      href={notification.link}
                      onClick={() => void markOne(notification.id)}
                      className="font-label text-[0.8125rem] font-semibold text-brand-blue-text underline-offset-4 hover:underline"
                    >
                      Ouvrir
                    </Link>
                  ) : null}
                  {notification.readAt === null ? (
                    <Button size="sm" variant="ghost" onClick={() => void markOne(notification.id)}>
                      Marquer comme lue
                    </Button>
                  ) : (
                    <span className="text-xs text-muted">Lue</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <PagerBar page={data} noun="notifications" onPage={setPage} />
        </>
      ) : null}
    </>
  );
}
