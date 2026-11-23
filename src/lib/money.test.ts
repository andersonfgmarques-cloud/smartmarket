import { describe, expect, it } from "vitest";
import { calculateSubtotal, formatBRL, parseBRLAmount } from "./money";

describe("interpretação de valores em reais", () => {
  it("aceita decimal com vírgula", () => expect(parseBRLAmount("1234,56")).toBe(1234.56));
  it("aceita milhares no padrão brasileiro", () => expect(parseBRLAmount("1.234,56")).toBe(1234.56));
  it("aceita formato decimal com ponto", () => expect(parseBRLAmount("1234.56")).toBe(1234.56));
  it("aceita prefixo de moeda e espaços", () => expect(parseBRLAmount(" R$ 1.234,50 ")).toBe(1234.5));
  it("interpreta ponto de milhar sem casas decimais", () => expect(parseBRLAmount("1.234")).toBe(1234));
  it("rejeita entradas vazias, negativas e malformadas", () => {
    expect(parseBRLAmount("")).toBeNull();
    expect(parseBRLAmount("-10,00")).toBeNull();
    expect(parseBRLAmount("12,345")).toBeNull();
    expect(parseBRLAmount("abc")).toBeNull();
  });
});

describe("cálculo de subtotais", () => {
  it("calcula unidades", () => expect(calculateSubtotal(5.49, 2, "un")).toBe(1098));
  it("converte gramas para kg", () => expect(calculateSubtotal(39.9, 250, "g")).toBe(998));
  it("calcula kg", () => expect(calculateSubtotal(22.9, 1.5, "kg")).toBe(3435));
  it("converte ml para litros", () => expect(calculateSubtotal(8, 500, "ml")).toBe(400));
  it("formata moeda brasileira", () => expect(formatBRL(1098)).toContain("10,98"));
});
