"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { setSessionCookie, deleteSessionCookie } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type AuthFormState = { error?: string };

/**
 * Log in a user by verifying their password against direct PostgreSQL database.
 */
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

  const { email, password } = parsed.data;
  let isSuperAdmin = false;

  try {
    // 1. Fetch user from custom PostgreSQL users table
    const result = await db.query(
      "SELECT id, email, password_hash, is_super_admin FROM public.users WHERE email = $1 LIMIT 1",
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];
    if (!user) {
      return { error: "Invalid email or password." };
    }

    // 2. Cryptographically verify password against bcrypt hash
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return { error: "Invalid email or password." };
    }

    // 3. Set the encrypted HTTP-only session cookie
    await setSessionCookie(user.id, user.email);

    // 4. Store flag — redirect MUST happen outside try/catch in Next.js
    isSuperAdmin = !!user.is_super_admin;

  } catch (err: any) {
    console.error("[Login Action Error]", err.message);
    return { error: "An unexpected database error occurred during login." };
  }

  // Next.js redirect must be called outside try/catch blocks
  if (isSuperAdmin) {
    redirect("/superadmin");
  }
  redirect("/dashboard");
}

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  salonName: z.string().min(2),
  phone: z.string().min(8),
});

/**
 * Sign up a new user, create their corresponding salon in a transaction, and log them in.
 */
export async function signupAction(
  _prev: AuthFormState | undefined,
  formData: FormData
): Promise<AuthFormState> {
  return { error: "Public registration is disabled. Please contact the administrator to create an account." };
}

/**
 * Destroy user session and redirect to login screen.
 */
export async function signOutAction() {
  await deleteSessionCookie();
  redirect("/login");
}
