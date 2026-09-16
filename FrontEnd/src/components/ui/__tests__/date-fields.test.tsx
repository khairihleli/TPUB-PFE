import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DateField, type DateRangeValue, DateRangeField } from "@/components/ui/date-field";
import { Field } from "@/components/ui/field";
import { type TimeRangeValue, TimeRangeField } from "@/components/ui/time-range-field";

function RangeHarness({
  initial = { start: "", end: "" },
  unavailable,
  onChange,
}: {
  initial?: DateRangeValue;
  unavailable?: (iso: string) => boolean;
  onChange?: (v: DateRangeValue) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DateRangeField
      id="periode"
      value={value}
      unavailable={unavailable}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe("DateRangeField", () => {
  it("parses typed digits and echoes the range in French", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RangeHarness onChange={onChange} />);
    const start = screen.getByLabelText("Début");
    await user.type(start, "10022027");
    expect(start).toHaveValue("10/02/2027");
    expect(onChange).toHaveBeenLastCalledWith({ start: "2027-02-10", end: "" });
    await user.type(screen.getByLabelText("Fin"), "16022027");
    const echo = document.getElementById("periode-echo");
    expect(echo).toHaveTextContent("du mercredi 10 février au mardi 16 février 2027 · 7 jours");
    expect(start).toHaveAttribute("aria-describedby", expect.stringContaining("periode-echo"));
  });

  it("shows a format error on blur and the order error", async () => {
    const user = userEvent.setup();
    render(<RangeHarness initial={{ start: "2027-02-16", end: "" }} />);
    const end = screen.getByLabelText("Fin");
    await user.type(end, "3102");
    await user.tab();
    expect(screen.getByText("Date invalide (format jj/mm/aaaa)")).toBeInTheDocument();
    await user.clear(end);
    await user.type(end, "10022027");
    expect(screen.getByText("La date de fin doit suivre la date de début")).toBeInTheDocument();
  });

  it("presets set the end from the chosen start", async () => {
    const user = userEvent.setup();
    render(<RangeHarness initial={{ start: "2027-02-10", end: "" }} />);
    await user.click(screen.getAllByRole("button", { name: "2 semaines" })[0]!);
    expect(screen.getByLabelText("Fin")).toHaveValue("23/02/2027");
  });

  it("rejects a range crossing an unavailable day with the message", async () => {
    const user = userEvent.setup();
    const busy = new Set([
      "2027-09-14",
      "2027-09-15",
      "2027-09-16",
      "2027-09-17",
      "2027-09-18",
      "2027-09-19",
      "2027-09-20",
    ]);
    const onChange = vi.fn();
    render(
      <RangeHarness
        initial={{ start: "2027-09-10", end: "" }}
        unavailable={(d) => busy.has(d)}
        onChange={onChange}
      />,
    );
    await user.type(screen.getByLabelText("Fin"), "25092027");
    expect(screen.getByText("Ce Porteur est déjà réservé du 14 au 20 sept.")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalledWith({ start: "2027-09-10", end: "2027-09-25" });
  });

  it("renders read-only with the locked reason", () => {
    render(
      <DateRangeField
        value={{ start: "2027-02-10", end: "2027-02-16" }}
        onChange={() => undefined}
        lockedReason="La période est verrouillée : des Porteurs sont bloqués sur ces dates."
      />,
    );
    expect(screen.getByLabelText("Début")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Début")).toHaveAccessibleDescription(/verrouillée/);
    expect(screen.queryByRole("button", { name: "1 semaine" })).toBeNull();
  });
});

describe("DateField calendar (APG)", () => {
  it("opens a Monday-first grid and navigates with the keyboard", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [v, setV] = useState("2027-02-10");
      return (
        <Field label="Date">
          <DateField value={v} onChange={setV} />
        </Field>
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Choisir une date" }));
    const grid = await screen.findByRole("grid", { name: "février 2027" });
    const headers = within(grid).getAllByRole("columnheader");
    expect(headers[0]).toHaveTextContent("lun.");
    expect(headers[6]).toHaveTextContent("dim.");
    const selected = within(grid).getByRole("button", { name: /mercredi 10 février 2027/ });
    expect(selected).toHaveFocus();
    expect(selected.closest("td")).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowRight}");
    expect(within(grid).getByRole("button", { name: /jeudi 11 février 2027/ })).toHaveFocus();
    await user.keyboard("{PageDown}");
    const march = await screen.findByRole("grid", { name: "mars 2027" });
    expect(within(march).getByRole("button", { name: /jeudi 11 mars 2027/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Date")).toHaveValue("11/03/2027");
    expect(screen.queryByRole("grid")).toBeNull();
    // APG: focus returns to the field, never to <body>.
    expect(screen.getByLabelText("Date")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Choisir une date" }));
    await screen.findByRole("grid");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.getByLabelText("Date")).toHaveFocus();
  });

  it("announces disabled days as « indisponible »", async () => {
    const user = userEvent.setup();
    render(
      <Field label="Date">
        <DateField value="2027-02-10" onChange={() => undefined} min="2027-02-09" />
      </Field>,
    );
    await user.click(screen.getByRole("button", { name: "Choisir une date" }));
    const day = await screen.findByRole("button", { name: /lundi 8 février 2027, indisponible/ });
    expect(day).toHaveAttribute("aria-disabled", "true");
  });
});

describe("TimeRangeField", () => {
  it("lists 48 options in 24 h, applies day parts and echoes", () => {
    function Harness() {
      const [v, setV] = useState<TimeRangeValue>({ start: "09:00", end: "18:00" });
      return (
        <TimeRangeField
          id="heures"
          value={v}
          onChange={setV}
          dayParts={[{ label: "Journée", start: "08:00", end: "20:00" }]}
        />
      );
    }
    render(<Harness />);
    const start = screen.getByLabelText("Heure de début");
    expect(within(start).getAllByRole("option")).toHaveLength(48);
    expect(within(start).getAllByRole("option")[18]).toHaveTextContent("09:00");
    expect(document.getElementById("heures-echo")).toHaveTextContent("de 09:00 à 18:00 · 9 h");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Journée/ }));
    });
    expect(screen.getByRole("button", { name: /Journée/ })).toHaveAttribute("aria-pressed", "true");
    expect(document.getElementById("heures-echo")).toHaveTextContent("de 08:00 à 20:00 · 12 h");
    fireEvent.change(screen.getByLabelText("Heure de fin"), { target: { value: "07:00" } });
    expect(screen.getByText("L'heure de fin doit suivre l'heure de début")).toBeInTheDocument();
  });
});
