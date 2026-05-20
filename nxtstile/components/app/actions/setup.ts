"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSalonForUser } from "@/lib/salon";
import { z } from "zod";

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not signed in." };
  }

  const { salon: existing } = await getSalonForUser(supabase, user.id);
  if (existing) {
    redirect("/dashboard");
  }

  const { error } = await supabase.from("salons").insert({
    owner_id: user.id,
    name: parsed.data.name,
    phone: parsed.data.phone,
  });
  if (error) {
    return { error: error.message };
  }
  redirect("/dashboard");
}
