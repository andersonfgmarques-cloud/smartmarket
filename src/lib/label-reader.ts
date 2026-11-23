import { parseBRLAmount } from "./money";

export type LabelReading =
  | { ok: true; price: number; productName: string | null; confidence: number }
  | { ok: false; reason: "low-confidence" | "no-price" | "ambiguous-price" };

const PRICE_PATTERN = /(?:R\\s*\\$\\s*)?([0-9OoQIl|Ss]{1,3}(?:\\.[0-9OoQIl|Ss]{3})*[,.][0-9OoQIl|Ss]{2}|[0-9OoQIl|Ss]+[,.][0-9OoQIl|Ss]{2})/gi;

function normalizeDigits(value: string): string {
  return value
    .replace(/[OoQ]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[Ss]/g, "5");
}

export function extractLabelReading(text: string, confidence: number): LabelReading {
  if (!Number.isFinite(confidence) || confidence < 45) {
    return { ok: false, reason: "low-confidence" };
  }

  const candidates = [...text.matchAll(PRICE_PATTERN)].map((match) => {
    const amountText = normalizeDigits(match[1]);
    return {
      amount: parseBRLAmount(amountText),
      hasCurrency: /^R\\s*\\$\\s*/i.test(match[0]),
    };
  }).filter((item): item is { amount: number; hasCurrency: boolean } =>
    item.amount !== null && item.amount > 0 && item.amount < 100000
  );

  const currencyPrices = [...new Set(candidates.filter((item) => item.hasCurrency).map((item) => item.amount))];
  const allPrices = [...new Set(candidates.map((item) => item.amount))];
  const prices = currencyPrices.length > 0 ? currencyPrices : allPrices;

  if (prices.length === 0) return { ok: false, reason: "no-price" };
  if (prices.length !== 1) return { ok: false, reason: "ambiguous-price" };

  const withoutPrices = text.replace(PRICE_PATTERN, " ");
  const productName = withoutPrices.split(/\\r?\\n/)
    .map((line) => line.replace(/[^\\p{L}\\p{N} ]/gu, " ").replace(/\\s+/g, " ").trim())
    .filter((line) => line.length >= 4 && (line.match(/[A-Za-zÀ-ÿ]/g)?.length ?? 0) >= 3)
    .sort((a, b) => b.length - a.length)[0] ?? null;

  return { ok: true, price: prices[0], productName, confidence };
}
