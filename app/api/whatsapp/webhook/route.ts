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

  const headersObj: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headersObj[key] = value;
  });

  let logId: string | null = null;
  try {
    const insertRes = await db.query(
      "INSERT INTO public.webhook_logs (headers, body) VALUES ($1, $2) RETURNING id",
      [JSON.stringify(headersObj), rawBody]
    );
    logId = insertRes.rows[0]?.id || null;
  } catch (dbErr: any) {
    console.error("[webhook POST] failed to log raw request to DB:", dbErr.message);
  }

  console.log("[webhook POST] received", {
    hasSignature: !!signature,
    hasSecret: !!secret,
    bodyLength: rawBody.length,
    bodyPreview: rawBody.slice(0, 200),
    logId,
  });

  if (!secret) {
    const errMsg = "WHATSAPP_APP_SECRET not set";
    console.error("[webhook]", errMsg);
    if (logId) {
      await db.query("UPDATE public.webhook_logs SET error = $1 WHERE id = $2", [errMsg, logId]).catch(() => {});
    }
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const signatureValid = verifyWebhookSignature(rawBody, signature, secret);
  console.log("[webhook POST] signature valid:", signatureValid);

  if (!signatureValid) {
    const errMsg = `signature mismatch - signature headers: ${signature}`;
    console.error("[webhook]", errMsg);
    if (logId) {
      await db.query("UPDATE public.webhook_logs SET error = $1 WHERE id = $2", [errMsg, logId]).catch(() => {});
    }
    return new Response("Forbidden", { status: 403 });
  }

  let payload: { entry?: WaGraphEntry[] };
  try {
    payload = JSON.parse(rawBody) as { entry?: WaGraphEntry[] };
    console.log("[webhook POST] parsed payload entries:", payload.entry?.length ?? 0);
  } catch {
    const errMsg = "failed to parse JSON body";
    console.error("[webhook POST]", errMsg);
    if (logId) {
      await db.query("UPDATE public.webhook_logs SET error = $1 WHERE id = $2", [errMsg, logId]).catch(() => {});
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Process synchronously so logs appear before response
  void processPayload(payload, logId).catch((e) =>
    console.error("[webhook] async process failed", e)
  );

  return NextResponse.json({ ok: true }, { status: 200 });
}

async function processPayload(payload: { entry?: WaGraphEntry[] }, logId: string | null) {
  const errors: string[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        console.log(`[webhook processPayload] skipping non-message field: ${change.field}`);
        continue;
      }
      
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      console.log("[webhook processPayload] phone_number_id from Meta:", phoneNumberId);

      if (!phoneNumberId) {
        errors.push("no phone_number_id in change metadata");
        continue;
      }

      try {
        const result = await db.query(
          "SELECT id, name FROM public.salons WHERE whatsapp_phone_number_id = $1 LIMIT 1",
          [phoneNumberId]
        );

        const salon = result.rows[0];
        if (!salon) {
          const warnMsg = `No salon found for phone_number_id: ${phoneNumberId}`;
          console.warn("[webhook]", warnMsg);
          errors.push(warnMsg);
          
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
            errors.push(`could not parse message of type ${msg.type}`);
            continue;
          }

          const from = (msg.from as string) ?? "";
          try {
            await handleConversationMessage(salon.id, from, parsed);
            console.log("[webhook] conversation handled successfully for:", from);
          } catch (e: any) {
            console.error("[webhook] conversation error", e);
            errors.push(`conversation error for ${from}: ${e.message}`);
          }
        }
      } catch (err: any) {
        console.error("[webhook] database error during processing", err.message);
        errors.push(`database error: ${err.message}`);
      }
    }
  }

  if (errors.length > 0 && logId) {
    await db.query("UPDATE public.webhook_logs SET error = $1 WHERE id = $2", [errors.join("; "), logId]).catch(() => {});
  }
}
