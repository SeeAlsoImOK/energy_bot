import { messagingApi } from "@line/bot-sdk";

let client: messagingApi.MessagingApiClient | null = null;

export function getLineClient(): messagingApi.MessagingApiClient {
  if (!client) {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!channelAccessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
    client = new messagingApi.MessagingApiClient({ channelAccessToken });
  }
  return client;
}

/**
 * Sends a reply and swallows any failure (expired replyToken, LINE API down, etc.)
 * so a delivery failure never bubbles up into a non-200 webhook response.
 */
export async function replyText(replyToken: string, text: string): Promise<void> {
  try {
    await getLineClient().replyMessage({
      replyToken,
      messages: [{ type: "text", text }],
    });
  } catch (err) {
    console.error("[line]", err);
  }
}
