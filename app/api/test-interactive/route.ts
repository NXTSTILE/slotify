import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await db.query(
      "SELECT id, name, whatsapp_phone_number_id, whatsapp_access_token FROM public.salons WHERE name = 'hyness' LIMIT 1"
    );
    const salon = res.rows[0];
    if (!salon || !salon.whatsapp_phone_number_id || !salon.whatsapp_access_token) {
      return NextResponse.json({ ok: false, error: "Missing credentials for salon 'hyness'" });
    }

    const phoneId = salon.whatsapp_phone_number_id;
    const token = salon.whatsapp_access_token;
    const recipient = "919692202185";

    // Get services
    const svcRes = await db.query(
      "SELECT id, name, duration_minutes, price FROM public.services WHERE salon_id = $1 AND is_active = true LIMIT 5",
      [salon.id]
    );
    const services = svcRes.rows;

    if (services.length === 0) {
      return NextResponse.json({ ok: false, error: "No services found in database to build list." });
    }

    // 1. Send List Test
    const listPayload = {
      messaging_product: "whatsapp",
      to: recipient,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: "Choose one service to begin:" },
        action: {
          button: "Pick service",
          sections: [
            {
              title: "Services",
              rows: services.map((s: any, i: number) => ({
                id: `svc_${s.id}`,
                title: `${i + 1}. ${s.name}`.slice(0, 24),
                description: `${s.duration_minutes}m · ₹${Number(s.price).toFixed(0)}`.slice(0, 72)
              }))
            }
          ]
        }
      }
    };

    const listRes = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(listPayload)
    });
    const listData = await listRes.json();

    // 2. Send Buttons Test
    const buttonsPayload = {
      messaging_product: "whatsapp",
      to: recipient,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Choose a session:" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "session_morning", title: "Morning" } },
            { type: "reply", reply: { id: "session_evening", title: "Evening" } }
          ]
        }
      }
    };

    const btnRes = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buttonsPayload)
    });
    const btnData = await btnRes.json();

    return NextResponse.json({
      ok: true,
      listResponseStatus: listRes.status,
      listResponse: listData,
      buttonsResponseStatus: btnRes.status,
      buttonsResponse: btnData
    });

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message });
  }
}
