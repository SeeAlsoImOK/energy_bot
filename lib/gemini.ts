import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-3.5-flash";
// Thinking runs before the answer and is slow on a prompt that carries the whole FAQ sheet;
// 7s cut most replies off mid-thought. LINE accepts a reply well past this, and the webhook
// route's maxDuration leaves headroom above it.
const GEMINI_TIMEOUT_MS = 20_000;
// This model thinks by default and its thought tokens count toward maxOutputTokens. At 1024
// the thinking alone hit the cap, so replies ended as MAX_TOKENS with no text and fell back to
// the hand-off message. Answer length is held to 1-3 sentences by the prompt, not by this cap.
const MAX_OUTPUT_TOKENS = 8192;

export const DEFAULT_REPLY =
  "เรื่องนี้ขอส่งต่อให้เจ้าหน้าที่ช่วยเช็คให้อีกทีนะครับ/ค่ะ เดี๋ยวจะติดต่อกลับไปเร็วๆ นี้";

const SYSTEM_PROMPT = `<role>
คุณคือแอดมินของ Energy Infinitus บริการรับส่งสนามบิน (Airport Transfer) ทั่วประเทศไทย
คุณสุภาพ มีใจบริการ พูดคุยเป็นกันเองแบบเพื่อนที่รู้จักกันแต่ไม่สนิทมาก
มีความรู้และความเชี่ยวชาญเรื่องเส้นทาง สนามบิน และการเดินทางในประเทศไทยเป็นพิเศษ
</role>

<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น ห้ามแต่งราคา เวลา หรือสถานที่ที่ไม่มีในข้อมูล
- ถ้าคำถามไม่มีคำตอบใน <faq> ให้ตอบด้วยข้อความ default ที่กำหนดไว้เท่านั้น (ห้ามเดา ห้ามคาดคะเน)
- ข้อความ default: "${DEFAULT_REPLY}"
- โทนภาษา: สุภาพ มีใจบริการ แทรกมุกตลกเบาๆ ได้บ้างแบบเพื่อนที่รู้จักกันแต่ไม่สนิทมาก ไม่ตลกจนดูไม่จริงจัง
- ความยาวคำตอบ 1-3 ประโยค กระชับ ตรงประเด็น
- ห้ามพูดแทนบริษัทในเรื่องที่ไม่มีข้อมูลรองรับ (เช่น การรับประกัน เงื่อนไขกฎหมาย)
</constraints>

<output_format>
ภาษาไทย ไม่ใช้ markdown ไม่ใช้ bullet point ตอบเป็นข้อความธรรมดาต่อเนื่อง
</output_format>`;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

function buildPrompt(userMessage: string, faqCsv: string): string {
  return `${SYSTEM_PROMPT}

<faq>
${faqCsv}
</faq>

<question>
${userMessage}
</question>`;
}

export type GeminiResult = {
  text: string;
  finishReason: string | undefined;
};

export async function askGemini(userMessage: string, faqCsv: string): Promise<GeminiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: buildPrompt(userMessage, faqCsv),
      config: {
        temperature: 1.0,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: controller.signal,
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    console.log(
      "[gemini]",
      "finishReason:",
      finishReason,
      "thoughtsTokenCount:",
      response.usageMetadata?.thoughtsTokenCount,
      "candidatesTokenCount:",
      response.usageMetadata?.candidatesTokenCount
    );

    // Every path below that returns DEFAULT_REPLY says why, so a bot that keeps handing off
    // can be diagnosed from the logs instead of looking like it simply has no answer.
    if (finishReason === "MAX_TOKENS") {
      console.error("[gemini] fallback: hit maxOutputTokens", MAX_OUTPUT_TOKENS, "before finishing");
      return { text: DEFAULT_REPLY, finishReason };
    }

    if (finishReason !== "STOP") {
      console.error("[gemini] fallback: non-STOP finishReason:", finishReason);
      return { text: DEFAULT_REPLY, finishReason };
    }

    const text = response.text?.trim();
    if (!text) {
      console.error("[gemini] fallback: STOP with empty text");
      return { text: DEFAULT_REPLY, finishReason };
    }
    return { text, finishReason };
  } catch (err) {
    const timedOut = controller.signal.aborted;
    console.error(
      "[gemini] fallback:",
      timedOut ? `timed out after ${GEMINI_TIMEOUT_MS}ms` : "request failed",
      err
    );
    return { text: DEFAULT_REPLY, finishReason: undefined };
  } finally {
    clearTimeout(timer);
  }
}
