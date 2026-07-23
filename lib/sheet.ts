import type { FaqRow } from "@/types/faq";

const TTL_MS = 60 * 1000;

type Cache = { rows: FaqRow[]; csv: string; fetchedAt: number };

let cache: Cache | null = null;

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];

    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function toFaqRows(rows: string[][]): FaqRow[] {
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);

  const qIdx = col("question");
  const aIdx = col("answer");
  const cIdx = col("category");
  const kIdx = col("keywords");

  if (qIdx === -1 || aIdx === -1) return [];

  return body
    .map((r) => ({
      question: r[qIdx]?.trim() ?? "",
      answer: r[aIdx]?.trim() ?? "",
      category: cIdx >= 0 ? r[cIdx]?.trim() || undefined : undefined,
      keywords: kIdx >= 0 ? r[kIdx]?.trim() || undefined : undefined,
    }))
    .filter((r) => r.question && r.answer);
}

/**
 * Returns the raw FAQ CSV text, refreshed at most once per TTL_MS.
 * On fetch/parse failure, serves the last-known cache (even if stale)
 * rather than breaking the bot; returns "" only when there's no cache yet.
 */
export async function getFaqData(): Promise<string> {
  const sheetUrl = process.env.SHEET_CSV_URL;
  if (!sheetUrl) return "";

  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache.csv;
  }

  try {
    const res = await fetch(sheetUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`sheet fetch returned ${res.status}`);

    const csv = await res.text();
    const rows = toFaqRows(parseCsv(csv));

    cache = { rows, csv, fetchedAt: Date.now() };
    return csv;
  } catch (err) {
    console.error("[sheet]", err);
    return cache?.csv ?? "";
  }
}
