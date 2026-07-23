# energy_bot

LINE chatbot สำหรับ Energy Infinitus (บริการ Airport Transfer รับส่งสนามบินทั่วประเทศไทย)
ตอบคำถามด้วย Gemini โดยอ้างอิงข้อมูลจาก Google Sheet (export เป็น CSV) เป็นฐานความรู้ (FAQ)
ถ้าคำถามไม่มีใน FAQ จะส่งต่อเจ้าหน้าที่แทนการเดาคำตอบ

## Setup

1. ติดตั้ง dependencies:

   ```bash
   npm install
   ```

2. คัดลอก `.env.local.example` เป็น `.env.local` แล้วกรอกค่า:

   - `LINE_CHANNEL_ACCESS_TOKEN` — จาก LINE Developers Console
   - `LINE_CHANNEL_SECRET` — จาก LINE Developers Console
   - `GEMINI_API_KEY` — จาก Google AI Studio
   - `SHEET_CSV_URL` — ลิงก์ export CSV ของ Google Sheet ที่ใช้เป็นฐานความรู้
     (File → Share → Publish to web → เลือกชีตแล้ว export เป็น .csv)

3. รันโหมดพัฒนา:

   ```bash
   npm run dev
   ```

4. ตั้งค่า Webhook URL ใน LINE Developers Console ให้ชี้ไปที่
   `https://<your-domain>/api/line-webhook`

## FAQ Sheet Schema

Google Sheet ที่ publish เป็น CSV ต้องมีหัวคอลัมน์แถวแรกดังนี้:

| คอลัมน์ | บังคับ | คำอธิบาย |
| --- | --- | --- |
| `question` | ✅ | คำถามตัวอย่าง / หัวข้อ |
| `answer` | ✅ | คำตอบที่ถูกต้อง (ราคา/เวลา/เงื่อนไข ต้องแม่นตรงนี้) |
| `category` | ไม่บังคับ | เช่น "ราคา", "เวลารับส่ง", "เส้นทาง", "การจอง" |
| `keywords` | ไม่บังคับ | คำที่ลูกค้าน่าจะพิมพ์ ช่วยจับ intent |

AI จะอ่านค่า `answer` ตรงตัวเท่านั้น ห้ามแต่งราคา/เวลาที่ไม่มีในชีต — บังคับไว้ใน system prompt
([lib/gemini.ts](lib/gemini.ts))

## โครงสร้างโปรเจกต์

- `app/api/line-webhook/route.ts` — รับ webhook จาก LINE, verify signature, orchestrate ทั้ง flow, return 200 เสมอ
- `lib/sheet.ts` — ดึง + cache FAQ CSV จาก Google Sheet (TTL 60 วิ, stale-while-error)
- `lib/gemini.ts` — build system prompt, เรียก Gemini, parse finishReason/usage
- `lib/line.ts` — LINE Messaging API client + reply helper
- `types/faq.ts` — type ของ FAQ row

## Deploy Checklist

1. `git add . && git commit -m "feat: LINE bot with Gemini FAQ"`
2. `git push origin main`
3. Vercel auto-deploy จาก GitHub push → เช็ค deployment status ใน Vercel dashboard
4. ตั้ง env vars ใน Vercel Project Settings → Environment Variables:
   `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `GEMINI_API_KEY`, `SHEET_CSV_URL`
5. อัปเดต Webhook URL ใน LINE Developers Console เป็น
   `https://<production-domain>/api/line-webhook` แล้วกด "Verify" ให้ขึ้น Success
6. ทดสอบส่งข้อความจริงจาก LINE OA → เช็ค log ใน Vercel (finishReason / token counts)
