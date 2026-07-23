import { validateSignature, type WebhookEvent } from "@line/bot-sdk";
import { NextResponse } from "next/server";
import { askGemini, DEFAULT_REPLY } from "@/lib/gemini";
import { replyText } from "@/lib/line";
import { getFaqData } from "@/lib/sheet";

export const runtime = "nodejs";

async function handleEvent(event: WebhookEvent): Promise<void> {
  if (event.type !== "message" || event.message.type !== "text") return;

  const faqCsv = await getFaqData();
  const { text } = await askGemini(event.message.text, faqCsv);

  await replyText(event.replyToken, text || DEFAULT_REPLY);
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-line-signature");
  const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";

  if (!signature || !validateSignature(body, channelSecret, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  try {
    const { events } = JSON.parse(body) as { events: WebhookEvent[] };
    await Promise.all(events.map(handleEvent));
  } catch (err) {
    console.error("[line-webhook]", err);
  }

  // Always ack 200 — a non-200 makes LINE retry-deliver the same event.
  return NextResponse.json({ ok: true });
}
