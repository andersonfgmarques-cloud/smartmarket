import { openDB } from "idb";
import type { Measure, ShoppingItem, ShoppingState } from "../types";

const DB_NAME = "smartmarket-db";
const STORE = "app-state";
const STATE_KEY = "current";
const FALLBACK_KEY = "smartmarket-state";
const DEFAULT_STATE: ShoppingState = { items: [], budget: 0, purchases: [] };
const MEASURES: Measure[] = ["un", "kg", "g", "l", "ml"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isShoppingItem(value: unknown): value is ShoppingItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.category === "string" &&
    (value.kind === "unit" || value.kind === "weight" || value.kind === "volume") &&
    MEASURES.includes(value.measure as Measure) &&
    typeof value.quantity === "number" &&
    Number.isFinite(value.quantity) &&
    value.quantity > 0 &&
    typeof value.unitPrice === "number" &&
    Number.isFinite(value.unitPrice) &&
    value.unitPrice >= 0 &&
    typeof value.checked === "boolean" &&
    (value.favorite === undefined || typeof value.favorite === "boolean") &&
    typeof value.updatedAt === "string"
  );
}

export function normalizeState(value: unknown): ShoppingState {
  if (!isRecord(value)) return DEFAULT_STATE;
  const budget = typeof value.budget === "number" && Number.isFinite(value.budget) && value.budget >= 0
    ? value.budget
    : 0;
  const items = Array.isArray(value.items) ? value.items.filter(isShoppingItem) : [];
  const purchases = Array.isArray(value.purchases) ? value.purchases.filter((entry): entry is ShoppingState["purchases"] extends (infer T)[] | undefined ? T : never => {
    if (!isRecord(entry)) return false;
    return typeof entry.id === "string" && typeof entry.purchasedAt === "string" && typeof entry.totalCents === "number" && Number.isFinite(entry.totalCents) && Array.isArray(entry.items) && entry.items.every(isShoppingItem);
  }) : [];
  return { items, budget, purchases };
}

async function database() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    },
  });
}

function loadFallback(): ShoppingState {
  try {
    const fallback = localStorage.getItem(FALLBACK_KEY);
    return fallback ? normalizeState(JSON.parse(fallback) as unknown) : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

export async function loadState(): Promise<ShoppingState> {
  try {
    const db = await database();
    const saved: unknown = await db.get(STORE, STATE_KEY);
    return saved === undefined ? loadFallback() : normalizeState(saved);
  } catch {
    return loadFallback();
  }
}

export async function saveState(state: ShoppingState): Promise<void> {
  const safeState = normalizeState(state);
  try {
    const db = await database();
    await db.put(STORE, safeState, STATE_KEY);
  } catch {
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(safeState));
    } catch (error) {
      console.error("Não foi possível salvar os dados do SmartMarket neste aparelho.", error);
    }
  }
}

export function createItem(input: Omit<ShoppingItem, "id" | "checked" | "updatedAt">): ShoppingItem {
  return { ...input, id: crypto.randomUUID(), checked: false, updatedAt: new Date().toISOString() };
}
