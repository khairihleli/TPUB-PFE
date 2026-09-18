"use client";

import { QrCodeSvg } from "@/components/account/qr-code-svg";
import { groupSecret } from "@/components/account/two-factor-model";
import { CopyButton } from "@/components/contact/copy-button";
import type { TotpSetupResponse } from "@/lib/api/types";

/**
 * Step « scan the QR code »: the otpauth URI as a QR code, plus the secret in groups of 4 with a
 * copy button for manual entry (docs/round2-contract.md §3.7).
 */
export function TotpSetupPanel({ setup }: { setup: TotpSetupResponse }) {
  const grouped = groupSecret(setup.secret);
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <QrCodeSvg
        value={setup.otpauthUri}
        label="QR code à scanner avec votre application d'authentification"
        className="mx-auto w-48 shrink-0 p-1 sm:mx-0"
      />
      <div className="flex min-w-0 flex-col gap-3 text-sm">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 leading-relaxed text-ink-soft">
          <li>
            Ouvrez une application d&apos;authentification (Google Authenticator, Microsoft
            Authenticator, FreeOTP…).
          </li>
          <li>Ajoutez un compte en scannant ce QR code.</li>
          <li>Saisissez ensuite le code à 6 chiffres affiché par l&apos;application.</li>
        </ol>
        <div>
          <p className="font-label text-[0.8125rem] font-semibold text-ink-strong">
            Saisie manuelle de la clé
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <code
              className="min-w-0 flex-1 rounded-control border border-line bg-overlay-inset px-3 py-2 font-mono text-[0.8125rem] tracking-wider break-all text-ink-strong"
              aria-label={`Clé secrète : ${grouped}`}
            >
              {grouped}
            </code>
            <CopyButton value={setup.secret} label="Copier la clé secrète" />
          </div>
          <p className="mt-1.5 text-[0.75rem] text-muted">
            Type : basée sur le temps · 6 chiffres · 30 secondes.
          </p>
        </div>
      </div>
    </div>
  );
}
