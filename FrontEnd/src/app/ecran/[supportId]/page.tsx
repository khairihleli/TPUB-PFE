import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { parseSimulatedDateTime, parseSupportId } from "@/components/player/player-schedule";
import { PlayerScreen } from "@/components/player/player-screen";

interface PageProps {
  params: Promise<{ supportId: string }>;
  /**
   * `?datetime=2026-09-20T18:30` simulates the local Tunis clock (demo of time windows, honoured
   * only by a backend in the `local` profile). `?cle=` is the pairing key (round 2 §3.7).
   */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { supportId } = await params;
  const id = parseSupportId(supportId);
  return { title: id ? `Écran n° ${id}` : "Écran de diffusion" };
}

export default async function Page({ params, searchParams }: PageProps) {
  const { supportId } = await params;
  const query = (await searchParams) ?? {};
  const rawDatetime = Array.isArray(query.datetime) ? query.datetime[0] : query.datetime;
  const rawKey = Array.isArray(query.cle) ? query.cle[0] : query.cle;
  const id = parseSupportId(supportId);

  if (id === null) {
    return (
      <div className="app-ground flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <Image src="/brand/tpub.png" alt="" width={64} height={70} className="h-auto w-14" />
        <h1 className="font-display text-h3 text-ink-strong">Identifiant d&apos;écran invalide</h1>
        <p className="max-w-md text-[0.9375rem] leading-relaxed text-muted">
          L&apos;adresse du lecteur doit se terminer par le numéro d&apos;un écran, par exemple{" "}
          <code className="rounded-sm bg-white/8 px-1.5 py-0.5 text-ink-soft">/ecran/1</code>.
          Retrouvez les numéros dans le back-office, rubrique Réseau.
        </p>
        <Link
          href="/admin/reseau"
          className="mt-2 inline-flex min-h-touch items-center rounded-full border border-line-strong px-5 font-label text-sm font-semibold text-ink transition-colors hover:bg-white/8"
        >
          Ouvrir le réseau
        </Link>
      </div>
    );
  }

  return (
    <PlayerScreen
      supportId={id}
      simulatedAt={parseSimulatedDateTime(rawDatetime)}
      pairingKey={rawKey ?? null}
    />
  );
}
