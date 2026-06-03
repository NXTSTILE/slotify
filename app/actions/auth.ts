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
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    salonName: formData.get("salonName"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: "Check all fields: password min 8 chars, salon name and phone required." };
  }

  const { email, password, salonName, phone } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  let client;
  try {
    // 1. Hash the password securely with bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // 2. Establish a client for transaction management
    client = await db.pool.connect();

    // 3. Check if email already exists
    const checkUser = await client.query(
      "SELECT id FROM public.users WHERE email = $1 LIMIT 1",
      [normalizedEmail]
    );
    if (checkUser.rows.length > 0) {
      return { error: "An account with this email already exists." };
    }

    // 4. Execute Transaction
    await client.query("BEGIN");

    // Insert new user
    const userInsert = await client.query(
      "INSERT INTO public.users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [normalizedEmail, passwordHash]
    );
    const userId = userInsert.rows[0].id;

    // Insert corresponding salon
    await client.query(
      "INSERT INTO public.salons (owner_id, name, phone) VALUES ($1, $2, $3)",
      [userId, salonName, phone]
    );

    await client.query("COMMIT");

    // 5. Set session cookie
    await setSessionCookie(userId, normalizedEmail);

  } catch (err: any) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }
    console.error("[Signup Action Error]", err.message);
    return { error: `Failed to create user account: ${err.message}` };
  } finally {
    if (client) {
      client.release();
    }
  }

  // Redirect to dashboard
  redirect("/dashboard");
}

/**
 * Destroy user session and redirect to login screen.
 */
export async function signOutAction() {
  await deleteSessionCookie();
  redirect("/login");
}
