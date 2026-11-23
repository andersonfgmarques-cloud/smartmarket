import { describe, expect, it } from "vitest";
import { calculateSubtotal, formatBRL } from "./money";

describe("cálculo de subtotais", () => {
  it("calcula unidades", () => expect(calculateSubtotal(5.49, 2, "un")).toBe(1098));
  it("converte gramas para kg", () => expect(calculateSubtotal(39.9, 250, "g")).toBe(998));
  it("calcula kg", () => expect(calculateSubtotal(22.9, 1.5, "kg")).toBe(3435));
  it("converte ml para litros", () => expect(calculateSubtotal(8, 500, "ml")).toBe(400));
  it("formata moeda brasileira", () => expect(formatBRL(1098)).toContain("10,98"));
});
