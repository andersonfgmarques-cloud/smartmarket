import type { Measure } from "../types";

export function parseBRLAmount(input: string): number | null {
  const value = input.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!value) return null;

  let normalized = value;
  if (value.includes(",")) {
    if (!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(value)) return null;
    normalized = value.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) {
    normalized = value.replace(/\./g, "");
  } else if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    return null;
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

export function calculateSubtotal(price: number, quantity: number, measure: Measure): number {
  const normalizedQuantity = measure === "g" || measure === "ml" ? quantity / 1000 : quantity;
  return toCents(price * normalizedQuantity);
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
