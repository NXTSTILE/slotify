import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

const BOOTSTRAP_SECRET = "nxtstile-reset-2026-pw99z";
const SUPERADMIN_EMAIL = "superadmin@nxtstile.com";
const NEW_PASSWORD = "Admin@2026";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (secret !== BOOTSTRAP_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const hash = await bcrypt.hash(NEW_PASSWORD, 10);

    const result = await db.query(
      `UPDATE public.users 
       SET password_hash = $1, is_super_admin = true 
       WHERE email = $2 
       RETURNING id, email, is_super_admin`,
      [hash, SUPERADMIN_EMAIL]
    );

    if (result.rowCount === 0) {
      // Create if not exists
      const created = await db.query(
        `INSERT INTO public.users (email, password_hash, is_super_admin) 
         VALUES ($1, $2, true) RETURNING id, email`,
        [SUPERADMIN_EMAIL, hash]
      );
      return NextResponse.json({
        success: true,
        action: "created",
        user: created.rows[0],
        email: SUPERADMIN_EMAIL,
        password: NEW_PASSWORD,
      });
    }

    return NextResponse.json({
      success: true,
      action: "password_reset",
      user: result.rows[0],
      email: SUPERADMIN_EMAIL,
      password: NEW_PASSWORD,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
