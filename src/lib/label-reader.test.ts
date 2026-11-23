import { describe, expect, it } from "vitest";
import { extractLabelReading } from "./label-reader";

describe("extração local do preço da etiqueta", () => {
  it("lê preço brasileiro com símbolo da moeda", () => {
    expect(extractLabelReading("ARROZ TIPO 1\nR$ 14,50", 88)).toMatchObject({ ok: true, price: 14.5, productName: "ARROZ TIPO 1" });
  });

  it("lê preço sem símbolo quando há apenas um valor monetário", () => {
    expect(extractLabelReading("LEITE INTEGRAL\n6,79", 80)).toMatchObject({ ok: true, price: 6.79 });
  });

  it("corrige confusões comuns de OCR somente dentro do valor", () => {
    expect(extractLabelReading("FEIJAO\nR$ I4,5O", 80)).toMatchObject({ ok: true, price: 14.5 });
  });

  it("rejeita imagem sem preço", () => {
    expect(extractLabelReading("texto aleatorio sem etiqueta", 90)).toEqual({ ok: false, reason: "no-price" });
  });

  it("rejeita mais de um preço em vez de escolher aleatoriamente", () => {
    expect(extractLabelReading("DE R$ 15,99\nPOR R$ 12,99", 90)).toEqual({ ok: false, reason: "ambiguous-price" });
  });

  it("rejeita OCR com confiança baixa", () => {
    expect(extractLabelReading("ARROZ R$ 14,50", 20)).toEqual({ ok: false, reason: "low-confidence" });
  });

  it("não interpreta números inteiros como preços", () => {
    expect(extractLabelReading("ARROZ 5 KG 123456", 90)).toEqual({ ok: false, reason: "no-price" });
  });
});
