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

  console.log("[webhook POST] received", {
    hasSignature: !!signature,
    hasSecret: !!secret,
    bodyLength: rawBody.length,
    bodyPreview: rawBody.slice(0, 200),
  });

  if (!secret) {
    console.error("[webhook] WHATSAPP_APP_SECRET not set");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const signatureValid = verifyWebhookSignature(rawBody, signature, secret);
  console.log("[webhook POST] signature valid:", signatureValid);

  if (!signatureValid) {
    console.error("[webhook] signature mismatch - rejecting request");
    return new Response("Forbidden", { status: 403 });
  }

  let payload: { entry?: WaGraphEntry[] };
  try {
    payload = JSON.parse(rawBody) as { entry?: WaGraphEntry[] };
    console.log("[webhook POST] parsed payload entries:", payload.entry?.length ?? 0);
  } catch {
    console.error("[webhook POST] failed to parse JSON body");
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Process synchronously so logs appear before response
  void processPayload(payload).catch((e) =>
    console.error("[webhook] async process failed", e)
  );

  return NextResponse.json({ ok: true }, { status: 200 });
}

async function processPayload(payload: { entry?: WaGraphEntry[] }) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      console.log("[webhook processPayload] phone_number_id from Meta:", phoneNumberId);

      if (!phoneNumberId) {
        console.warn("[webhook] no phone_number_id in change metadata");
        continue;
      }

      try {
        const result = await db.query(
          "SELECT id, name FROM public.salons WHERE whatsapp_phone_number_id = $1 LIMIT 1",
          [phoneNumberId]
        );

        const salon = result.rows[0];
        if (!salon) {
          console.warn("[webhook] No salon found for phone_number_id:", phoneNumberId);
          // Log all salons for diagnosis
          const allSalons = await db.query("SELECT id, name, whatsapp_phone_number_id FROM public.salons");
          console.warn("[webhook] All salons in DB:", JSON.stringify(allSalons.rows));
          continue;
        }

        console.log("[webhook] matched salon:", salon.name, salon.id);

        const messages = change.value?.messages ?? [];
        console.log("[webhook] messages in payload:", messages.length);

        for (const msg of messages) {
          console.log("[webhook] processing message type:", msg.type, "from:", msg.from);
          const parsed = parseIncoming(msg);
          if (!parsed) {
            console.warn("[webhook] could not parse message:", JSON.stringify(msg));
            continue;
          }

          const from = (msg.from as string) ?? "";
          try {
            await handleConversationMessage(salon.id, from, parsed);
            console.log("[webhook] conversation handled successfully for:", from);
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
