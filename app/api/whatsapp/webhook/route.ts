import { NextResponse } from "next/server";
import { handleConversationMessage } from "@/lib/booking/conversation";
import type { IncomingParsed } from "@/lib/booking/conversation";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/whatsapp/verify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verify = process.env.WHATSAPP_VERIFY_TOKEN;
  console.log("[webhook verify GET]", { mode, token, challenge, verify });
  
  if (mode === "subscribe" && token === verify && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

type WaGraphEntry = {
  changes?: Array<{
    value?: {
      metadata?: { phone_number_id?: string };
      messages?: Array<Record<string, unknown>>;
      statuses?: unknown[];
    };
  }>;
};

function parseIncoming(message: Record<string, unknown>): IncomingParsed | null {
  const type = message.type as string | undefined;
  const from = message.from as string | undefined;
  if (!from) return null;

  if (type === "text") {
    const body = (message.text as { body?: string } | undefined)?.body;
    if (!body) return null;
    return { kind: "text", body };
  }

  if (type === "interactive") {
    const interactive = message.interactive as {
      type?: string;
      list_reply?: { id?: string; title?: string };
      button_reply?: { id?: string; title?: string };
    };
    if (interactive?.type === "list_reply" && interactive.list_reply?.id) {
      return {
        kind: "interactive",
        id: interactive.list_reply.id,
        title: interactive.list_reply.title,
      };
    }
    if (interactive?.type === "button_reply" && interactive.button_reply?.id) {
      return {
        kind: "interactive",
        id: interactive.button_reply.id,
        title: interactive.button_reply.title,
      };
    }
  }

  return null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("X-Hub-Signature-256");
  const secret = process.env.WHATSAPP_APP_SECRET;

  if (!secret) {
    console.error("[webhook] WHATSAPP_APP_SECRET not set");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: { entry?: WaGraphEntry[] };
  try {
    payload = JSON.parse(rawBody) as { entry?: WaGraphEntry[] };
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  queueMicrotask(() => {
    void processPayload(payload).catch((e) =>
      console.error("[webhook] async process failed", e)
    );
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

async function processPayload(payload: { entry?: WaGraphEntry[] }) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      try {
        const result = await db.query(
          "SELECT id FROM public.salons WHERE whatsapp_phone_number_id = $1 LIMIT 1",
          [phoneNumberId]
        );

        const salon = result.rows[0];
        if (!salon) {
          console.warn("[webhook] No salon for phone_number_id", phoneNumberId);
          continue;
        }

        for (const msg of change.value?.messages ?? []) {
          const parsed = parseIncoming(msg);
          if (!parsed) continue;

          const from = (msg.from as string) ?? "";
          try {
            await handleConversationMessage(salon.id, from, parsed);
          } catch (e) {
            console.error("[webhook] conversation error", e);
          }
        }
      } catch (err: any) {
        console.error("[webhook] database error during processing", err.message);
      }
    }
  }
}
