"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type AuthFormState = { error?: string };

export async function loginAction(
  _prev: AuthFormState | undefined,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password (min 6 characters)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: error.message };
  }
  redirect("/dashboard");
}

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  salonName: z.string().min(2),
  phone: z.string().min(8),
});

export async function signupAction(
  _prev: AuthFormState | undefined,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    salonName: formData.get("salonName"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: "Check all fields: password min 8 chars, salon name and phone required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return { error: error.message };
  }
  const user = data.user;
  if (!user) {
    return { error: "Could not create account. Try again." };
  }

  const { error: salonErr } = await supabase.from("salons").insert({
    owner_id: user.id,
    name: parsed.data.salonName,
    phone: parsed.data.phone,
  });
  if (salonErr) {
    return { error: salonErr.message };
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
