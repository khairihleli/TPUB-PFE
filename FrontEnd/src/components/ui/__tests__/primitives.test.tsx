import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Reveal } from "@/components/marketing/reveal";
import { SessionContext, type SessionContextValue } from "@/components/shell/session-context";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";

describe("Button", () => {
  it("is type=button by default and fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Enregistrer</Button>);
    const btn = screen.getByRole("button", { name: /Enregistrer/ });
    expect(btn).toHaveAttribute("type", "button");
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps its name, sets aria-busy and swallows clicks while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Soumettre
      </Button>,
    );
    const btn = screen.getByRole("button", { name: /Soumettre/ });
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).not.toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("gates with disabledReason: focusable, aria-disabled, described, onDisabledClick", async () => {
    const onClick = vi.fn();
    const onDisabledClick = vi.fn();
    render(
      <Button
        variant="primary"
        disabledReason="Sélectionnez au moins un Porteur"
        onClick={onClick}
        onDisabledClick={onDisabledClick}
      >
        Continuer
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Continuer" });
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAccessibleDescription("Sélectionnez au moins un Porteur");
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(onDisabledClick).toHaveBeenCalledTimes(1);
  });

  it("uses the control shape by default and a 44px hit area for sm", () => {
    render(
      <Button size="sm" variant="secondary">
        Modifier
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Modifier" });
    expect(btn.className).toContain("rounded-control");
    expect(btn.className).toContain("hit-area");
    expect(btn.className).not.toContain("rounded-full");
  });

  it("renders a link with asChild", () => {
    render(
      <Button asChild variant="brand">
        <a href="/inscription">Créer un compte</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Créer un compte" })).toHaveAttribute(
      "href",
      "/inscription",
    );
  });
});

describe("Field", () => {
  it("wires label, hint and error to the input", () => {
    render(
      <Field
        label="E-mail"
        hint="Adresse professionnelle"
        error="Adresse e-mail invalide."
        required
      >
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText(/E-mail/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription(/Adresse professionnelle.*Adresse e-mail invalide\./);
  });
});

describe("StatusPill", () => {
  it("always renders a text label", () => {
    render(<StatusPill type="campaign-status" status="REJECTED_BY_AI" />);
    expect(screen.getByText("À corriger")).toBeInTheDocument();
  });

  it("switches labels by audience and shows the hint on demand", () => {
    render(
      <>
        <StatusPill type="campaign-status" status="REVIEW_REQUIRED" audience="staff" />
        <StatusPill type="campaign-status" status="REVIEW_REQUIRED" audience="annonceur" showHint />
        <StatusPill type="reservation" status="TEMPORAIRE" long />
        <StatusPill type="custom" label="Exemple" tone="cat-2" />
      </>,
    );
    expect(screen.getByText("Revue manuelle")).toBeInTheDocument();
    expect(screen.getByText("En examen ZELQANE")).toBeInTheDocument();
    expect(screen.getByText("Quelques points à vérifier par l'équipe")).toBeInTheDocument();
    expect(screen.getByText("Bloqué · en attente de décision ZELQANE")).toBeInTheDocument();
    expect(screen.getByText("Exemple")).toBeInTheDocument();
  });

  it("defaults to the annonceur vocabulary inside an advertiser session", () => {
    render(
      <SessionContext.Provider value={{ role: "ANNONCEUR" } as SessionContextValue}>
        <StatusPill type="campaign-status" status="APPROVED_BY_AI" />
      </SessionContext.Provider>,
    );
    expect(screen.getByText("En examen ZELQANE")).toBeInTheDocument();
  });
});

describe("Reveal", () => {
  it("marks content as revealed once observed", () => {
    render(<Reveal data-testid="r">Contenu</Reveal>);
    expect(screen.getByTestId("r")).toHaveAttribute("data-in");
    expect(document.documentElement).toHaveAttribute("data-reveal-ready");
  });
});
