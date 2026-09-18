"use client";

/* Rendered when the root layout itself fails: globals.css may not be loaded, so inline styles only. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0b10",
          color: "#f5f3ef",
          fontFamily: "system-ui, 'Segoe UI', sans-serif",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: 520 }}>
          <p
            style={{
              color: "#ff9a45",
              letterSpacing: "0.22em",
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            ZELQANE · Incident
          </p>
          <h1 style={{ fontSize: 32, lineHeight: 1.15, margin: "16px 0 12px", color: "#ffffff" }}>
            Le site est momentanément indisponible.
          </h1>
          <p style={{ color: "#a3a9b5", lineHeight: 1.6, margin: 0 }}>
            Un problème empêche l&apos;affichage. Réessayez dans un instant.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 44,
                padding: "0 20px",
                borderRadius: 12,
                border: 0,
                background: "linear-gradient(120deg,#c8101c,#e11d2a 55%,#e8551c)",
                color: "#ffffff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Réessayer
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                minHeight: 44,
                padding: "0 20px",
                borderRadius: 12,
                border: "1px solid rgba(245,243,239,.25)",
                background: "transparent",
                color: "#f5f3ef",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Recharger la page
            </button>
          </div>
          {error.digest ? (
            <p style={{ marginTop: 32, fontSize: 13, color: "#7f8693" }}>
              Référence : <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
