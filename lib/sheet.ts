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
  if (!sheetUrl) {
    console.error("[sheet] SHEET_CSV_URL is not set — the bot has no FAQ and will hand off every question");
    return "";
  }

  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache.csv;
  }

  try {
    const res = await fetch(sheetUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`sheet fetch returned ${res.status}`);

    const csv = await res.text();

    // A sheet that isn't "Published to web" as CSV doesn't fail: Google redirects to a sign-in
    // or HTML page and answers 200, so without this check the model is handed a web page as
    // its FAQ and hands off every question.
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/html") || /^\s*</.test(csv)) {
      throw new Error(
        "SHEET_CSV_URL returned HTML, not CSV — publish the sheet via File → Share → Publish to web, choose the FAQ tab and .csv, and use that link"
      );
    }

    const rows = toFaqRows(parseCsv(csv));
    if (rows.length === 0) {
      // Not fatal: the raw CSV still goes to the model, which can read Thai headers. But the
      // documented schema is question/answer, so say so rather than fail quietly.
      console.warn(
        "[sheet] no rows parsed — expected header columns 'question' and 'answer' in the first row; got:",
        parseCsv(csv)[0]?.join(" | ") ?? "(empty sheet)"
      );
    } else {
      console.log("[sheet] loaded", rows.length, "FAQ rows");
    }

    cache = { rows, csv, fetchedAt: Date.now() };
    return csv;
  } catch (err) {
    console.error("[sheet]", err);
    return cache?.csv ?? "";
  }
}
