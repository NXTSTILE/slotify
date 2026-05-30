import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// One-time migration endpoint — DELETE THIS FILE after running
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== "run-staff-migration-now") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.staff (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        salon_id uuid NOT NULL REFERENCES public.salons (id) ON DELETE CASCADE,
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_staff_salon ON public.staff (salon_id);`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS public.staff_services (
        staff_id uuid NOT NULL REFERENCES public.staff (id) ON DELETE CASCADE,
        service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE CASCADE,
        PRIMARY KEY (staff_id, service_id)
      );
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_staff_services_staff ON public.staff_services (staff_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_staff_services_service ON public.staff_services (service_id);`);

    await db.query(`
      ALTER TABLE public.appointments
        ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff (id) ON DELETE SET NULL;
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_appointments_staff ON public.appointments (staff_id);`);

    return NextResponse.json({
      ok: true,
      message: "Migration complete! Tables staff and staff_services created. Column staff_id added to appointments. Now delete the file app/api/run-migration/route.ts",
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
