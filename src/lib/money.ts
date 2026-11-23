import type { Measure } from "../types";

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
