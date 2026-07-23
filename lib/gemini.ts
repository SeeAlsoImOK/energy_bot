import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-3.5-flash";
const GEMINI_TIMEOUT_MS = 7_000;

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
        maxOutputTokens: 1024,
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

    if (finishReason === "MAX_TOKENS") {
      return { text: DEFAULT_REPLY, finishReason };
    }

    if (finishReason !== "STOP") {
      console.error("[gemini] non-STOP finishReason:", finishReason);
      return { text: DEFAULT_REPLY, finishReason };
    }

    return { text: response.text?.trim() || DEFAULT_REPLY, finishReason };
  } catch (err) {
    console.error("[gemini]", err);
    return { text: DEFAULT_REPLY, finishReason: undefined };
  } finally {
    clearTimeout(timer);
  }
}
