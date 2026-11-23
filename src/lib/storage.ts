import { openDB } from "idb";
import type { ShoppingItem, ShoppingState } from "../types";

const DB_NAME = "smartmarket-db";
const STORE = "app-state";
const STATE_KEY = "current";

async function database() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    },
  });
}

export async function loadState(): Promise<ShoppingState> {
  try {
    const db = await database();
    return (await db.get(STORE, STATE_KEY)) ?? { items: [], budget: 0 };
  } catch {
    const fallback = localStorage.getItem("smartmarket-state");
    return fallback ? JSON.parse(fallback) as ShoppingState : { items: [], budget: 0 };
  }
}

export async function saveState(state: ShoppingState): Promise<void> {
  try {
    const db = await database();
    await db.put(STORE, state, STATE_KEY);
  } catch {
    localStorage.setItem("smartmarket-state", JSON.stringify(state));
  }
}

export function createItem(input: Omit<ShoppingItem, "id" | "checked" | "updatedAt">): ShoppingItem {
  return { ...input, id: crypto.randomUUID(), checked: false, updatedAt: new Date().toISOString() };
}
