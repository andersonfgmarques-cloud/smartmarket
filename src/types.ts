export type Measure = "un" | "kg" | "g" | "l" | "ml";
export type ItemKind = "unit" | "weight" | "volume";

export interface ShoppingItem {
  id: string;
  name: string;
  category: string;
  kind: ItemKind;
  measure: Measure;
  quantity: number;
  unitPrice: number;
  checked: boolean;
  favorite?: boolean;
  updatedAt: string;
}

export interface PurchaseRecord {
  id: string;
  purchasedAt: string;
  items: ShoppingItem[];
  totalCents: number;
}

export interface ShoppingState {
  items: ShoppingItem[];
  budget: number;
  purchases?: PurchaseRecord[];
}
