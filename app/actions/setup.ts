"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
});

export async function createSalonSetupAction(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: "Enter salon name and a valid phone number." };
  }

  // 1. Fetch active session context
  const session = await getSession();
  if (!session) {
    return { error: "Not signed in." };
  }

  try {
    // 2. Check for existing salon for this user
    const existingRes = await db.query(
      "SELECT id FROM public.salons WHERE owner_id = $1 AND is_deleted = false LIMIT 1",
      [session.userId]
    );
    if (existingRes.rows.length > 0) {
      // User already completed onboarding
      redirect("/dashboard");
    }

    // 3. Insert new salon directly into standard PostgreSQL table
    await db.query(
      "INSERT INTO public.salons (owner_id, name, phone) VALUES ($1, $2, $3)",
      [session.userId, parsed.data.name, parsed.data.phone]
    );

  } catch (err: any) {
    console.error("[Setup Onboarding Error]", err.message);
    return { error: "An unexpected database error occurred during setup." };
  }

  // Redirect to dashboard
  redirect("/dashboard");
}
