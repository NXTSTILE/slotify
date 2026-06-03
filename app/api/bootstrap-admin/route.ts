import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

const BOOTSTRAP_SECRET = "nxtstile-bootstrap-2026-xk9z";
const SUPERADMIN_EMAIL = "superadmin@nxtstile.com";
const SUPERADMIN_PASSWORD = "NxtStile@SuperAdmin2026";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (secret !== BOOTSTRAP_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const hash = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);

    const existing = await db.query(
      "SELECT id, is_super_admin FROM public.users WHERE email = $1 LIMIT 1",
      [SUPERADMIN_EMAIL]
    );

    let userId: string;
    let action: string;

    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      await db.query(
        "UPDATE public.users SET is_super_admin = true, password_hash = $1 WHERE id = $2",
        [hash, userId]
      );
      action = "updated";
    } else {
      const result = await db.query(
        "INSERT INTO public.users (email, password_hash, is_super_admin) VALUES ($1, $2, true) RETURNING id",
        [SUPERADMIN_EMAIL, hash]
      );
      userId = result.rows[0].id;
      action = "created";
    }

    return NextResponse.json({
      success: true,
      action,
      email: SUPERADMIN_EMAIL,
      password: SUPERADMIN_PASSWORD,
      userId,
      loginUrl: "/login",
      superadminUrl: "/superadmin",
      message: "⚠️ DELETE THIS ENDPOINT IMMEDIATELY AFTER USE!",
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
