import { describe, expect, it } from "vitest";

import { frTypo } from "@/components/offer/fr-typo";

describe("frTypo", () => {
  it("binds high punctuation to the preceding word", () => {
    expect(frTypo("Compte annonceur ou plan média :")).toBe("Compte annonceur ou plan média :");
    expect(frTypo("TPUB est-il déjà en service ? Oui ! Non ; peut-être")).toBe(
      "TPUB est-il déjà en service ? Oui ! Non ; peut-être",
    );
  });

  it("binds guillemets to their content", () => {
    expect(frTypo("« Je ne saurai pas si ça a tourné. »")).toBe(
      "« Je ne saurai pas si ça a tourné. »",
    );
  });

  it("leaves other spaces and already-bound punctuation untouched", () => {
    expect(frTypo("Grand axe, rue de quartier")).toBe("Grand axe, rue de quartier");
    expect(frTypo("08:00")).toBe("08:00");
  });
});
