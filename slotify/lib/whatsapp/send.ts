import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

const DEFAULT_VERSION = "v19.0";

type InteractiveRow = { id: string; title: string; description?: string };
type InteractiveSection = { title: string; rows: InteractiveRow[] };

export type SendTextParams = {
  toE164: string;
  body: string;
};

export type SendListParams = {
  toE164: string;
  bodyText: string;
  buttonText: string;
  sections: InteractiveSection[];
};

export type SendButtonsParams = {
  toE164: string;
  bodyText: string;
  buttons: { id: string; title: string }[];
};

function graphVersion(): string {
  return process.env.WHATSAPP_API_VERSION ?? DEFAULT_VERSION;
}

async function postMessages(
  phoneNumberId: string,
  accessToken: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const v = graphVersion();
  const url = `https://graph.facebook.com/${v}/${phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (!res.ok) {
      const msg = json.error?.message ?? res.statusText;
      console.error("[WhatsApp] Graph API error:", res.status, msg);
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[WhatsApp] Request failed:", msg);
    return { ok: false, error: msg };
  }
}

export async function sendWhatsAppText(
  phoneNumberId: string,
  accessToken: string,
  params: SendTextParams
): Promise<{ ok: boolean; error?: string }> {
  return postMessages(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to: params.toE164.replace(/^\+/, ""),
    type: "text",
    text: { preview_url: false, body: params.body },
  });
}

export async function sendWhatsAppList(
  phoneNumberId: string,
  accessToken: string,
  params: SendListParams
): Promise<{ ok: boolean; error?: string }> {
  return postMessages(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to: params.toE164.replace(/^\+/, ""),
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: params.bodyText },
      action: {
        button: params.buttonText.slice(0, 20),
        sections: params.sections.map((s) => ({
          title: s.title.slice(0, 24),
          rows: s.rows.map((r) => ({
            id: r.id.slice(0, 200),
            title: r.title.slice(0, 24),
            description: r.description?.slice(0, 72),
          })),
        })),
      },
    },
  });
}

export async function sendWhatsAppButtons(
  phoneNumberId: string,
  accessToken: string,
  params: SendButtonsParams
): Promise<{ ok: boolean; error?: string }> {
  const buttons = params.buttons.slice(0, 3).map((b) => ({
    type: "reply" as const,
    reply: {
      id: b.id.slice(0, 256),
      title: b.title.slice(0, 20),
    },
  }));
  return postMessages(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to: params.toE164.replace(/^\+/, ""),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: params.bodyText },
      action: { buttons },
    },
  });
}

export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  accessToken: string,
  toE164: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[]
): Promise<{ ok: boolean; error?: string }> {
  return postMessages(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to: toE164.replace(/^\+/, ""),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components:
        bodyParameters.length > 0
          ? [
              {
                type: "body",
                parameters: bodyParameters.map((text) => ({
                  type: "text",
                  text,
                })),
              },
            ]
          : [],
    },
  });
}

/** Loads salon WhatsApp credentials from DB — use service role on server. */
export async function sendForSalon(
  admin: SupabaseClient<Database>,
  salonId: string,
  send: (phoneNumberId: string, token: string) => Promise<{ ok: boolean; error?: string }>
): Promise<{ ok: boolean; error?: string }> {
  const { data: salon, error } = await admin
    .from("salons")
    .select("whatsapp_phone_number_id, whatsapp_access_token")
    .eq("id", salonId)
    .maybeSingle();

  if (error) {
    console.error("[WhatsApp] Salon fetch error:", error.message);
    return { ok: false, error: error.message };
  }
  const pid = salon?.whatsapp_phone_number_id;
  const token = salon?.whatsapp_access_token;
  if (!pid || !token) {
    return { ok: false, error: "Salon WhatsApp not configured" };
  }
  return send(pid, token);
}
