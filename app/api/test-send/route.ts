import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/send";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Fetch hyness salon credentials from the live DB
    const res = await db.query(
      "SELECT whatsapp_phone_number_id, whatsapp_access_token FROM public.salons WHERE name = 'hyness' LIMIT 1"
    );

    const salon = res.rows[0];
    if (!salon) {
      return NextResponse.json({ ok: false, error: "Salon 'hyness' not found in database." });
    }

    const { whatsapp_phone_number_id: phoneId, whatsapp_access_token: token } = salon;
    if (!phoneId || !token) {
      return NextResponse.json({ 
        ok: false, 
        error: "Missing WhatsApp credentials for salon 'hyness'.",
        hasPhoneId: !!phoneId,
        hasToken: !!token 
      });
    }

    // 2. Send test template message
    // Using standard 'hello_world' template which is available on all Meta WABAs by default
    console.log("[test-send] Sending hello_world template to 919692202185");
    const result = await sendWhatsAppTemplate(
      phoneId,
      token,
      "919692202185",
      "hello_world",
      "en_US",
      []
    );

    return NextResponse.json({ 
      ok: result.ok, 
      result,
      phoneIdUsed: phoneId,
      message: "Attempted to send hello_world template to 919692202185"
    });

  } catch (err: any) {
    console.error("[test-send] Error:", err);
    return NextResponse.json({ ok: false, error: err.message });
  }
}
