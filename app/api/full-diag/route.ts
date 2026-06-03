import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== "nxtstile-diag-2026") {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const [users, salons, services, workingHours, customers, appointments, conversationStates] = await Promise.all([
      db.query("SELECT id, email, is_super_admin, created_at FROM public.users ORDER BY created_at"),
      db.query("SELECT id, name, phone, owner_id, whatsapp_phone_number_id, whatsapp_business_account_id, (whatsapp_access_token IS NOT NULL AND whatsapp_access_token != '') as has_token, whatsapp_access_token FROM public.salons"),
      db.query("SELECT id, salon_id, name, price, duration_minutes, is_active FROM public.services ORDER BY salon_id"),
      db.query("SELECT salon_id, day_of_week, open_time, close_time, is_closed FROM public.working_hours ORDER BY salon_id, day_of_week"),
      db.query("SELECT id, salon_id, phone, name FROM public.customers ORDER BY created_at DESC LIMIT 10"),
      db.query("SELECT id, salon_id, status, start_time, total_price FROM public.appointments ORDER BY created_at DESC LIMIT 10"),
      db.query("SELECT salon_id, customer_phone, current_state, updated_at FROM public.conversation_states ORDER BY updated_at DESC LIMIT 10"),
    ]);

    return NextResponse.json({
      users: users.rows,
      salons: salons.rows,
      services: services.rows,
      workingHours: workingHours.rows,
      recentCustomers: customers.rows,
      recentAppointments: appointments.rows,
      conversationStates: conversationStates.rows,
    }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
