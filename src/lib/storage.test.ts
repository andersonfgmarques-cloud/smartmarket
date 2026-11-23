import { describe, expect, it } from "vitest";
import { normalizeState } from "./storage";

describe("normalização do armazenamento", () => {
  it("retorna estado vazio para dados ausentes ou inválidos", () => {
    const emptyState = { items: [], budget: 0, purchases: [] };
    expect(normalizeState(null)).toEqual(emptyState);
    expect(normalizeState("inválido")).toEqual(emptyState);
  });

  it("preserva orçamento e itens válidos", () => {
    const item = {
      id: "item-1",
      name: "Macarrão",
      category: "Mercearia",
      kind: "unit",
      measure: "un",
      quantity: 2,
      unitPrice: 5.99,
      checked: false,
      updatedAt: "2026-11-23T12:00:00.000Z",
    };
    expect(normalizeState({ budget: 150, items: [item] })).toEqual({
      budget: 150,
      items: [item],
      purchases: [],
    });
  });

  it("remove itens corrompidos e corrige orçamento inválido", () => {
    const validItem = {
      id: "item-2",
      name: "Leite",
      category: "Laticínios",
      kind: "volume",
      measure: "l",
      quantity: 1,
      unitPrice: 5,
      checked: false,
      updatedAt: "2026-11-23T12:00:00.000Z",
    };
    expect(normalizeState({ budget: -20, items: [validItem, { name: "sem id" }] })).toEqual({
      budget: 0,
      items: [validItem],
      purchases: [],
    });
  });

  it("não aceita quantidades ou preços não finitos", () => {
    const invalidItem = {
      id: "item-3",
      name: "Arroz",
      category: "Mercearia",
      kind: "weight",
      measure: "kg",
      quantity: Number.NaN,
      unitPrice: 10,
      checked: false,
      updatedAt: "2026-11-23T12:00:00.000Z",
    };
    expect(normalizeState({ budget: 100, items: [invalidItem] }).items).toHaveLength(0);
  });

  it("preserva compras válidas e descarta registros corrompidos", () => {
    const purchase = {
      id: "purchase-1",
      purchasedAt: "2026-11-23T12:00:00.000Z",
      items: [{
        id: "item-4",
        name: "Café",
        category: "Mercearia",
        kind: "unit",
        measure: "un",
        quantity: 1,
        unitPrice: 18.5,
        checked: true,
        updatedAt: "2026-11-23T12:00:00.000Z",
      }],
      totalCents: 1850,
    };
    const result = normalizeState({ budget: 100, items: [], purchases: [purchase, { id: "broken" }] });
    expect(result.purchases).toEqual([purchase]);
  });
});
