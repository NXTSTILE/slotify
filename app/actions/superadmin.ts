"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

/**
 * Securely verifies that the currently logged-in user is a verified Super Admin.
 * Throws an error if not authorized.
 */
async function verifySuperAdmin() {
  const saSessionCookie = cookies().get("superadmin_session")?.value;
  if (!saSessionCookie) {
    throw new Error("Unauthorized: No active superadmin session found.");
  }
  
  try {
    const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "fallback-secret-for-dev");
    await jwtVerify(saSessionCookie, JWT_SECRET, { algorithms: ['HS256'] });
    return true;
  } catch (e) {
    throw new Error("Forbidden: Invalid superadmin session.");
  }
}

export type ActionResponse = {
  success: boolean;
  message: string;
};

/**
 * Updates any salon's basic metadata globally.
 */
export async function updateGlobalSalonAction(
  salonId: string,
  name: string,
  phone: string,
  address: string,
  city: string
): Promise<ActionResponse> {
  try {
    await verifySuperAdmin();

    if (!name || !phone) {
      return { success: false, message: "Salon name and phone number are required." };
    }

    await db.query(
      `UPDATE public.salons
       SET name = $1, phone = $2, address = $3, city = $4
       WHERE id = $5`,
      [name.trim(), phone.trim(), address?.trim() || null, city?.trim() || null, salonId]
    );

    revalidatePath("/superadmin");
    return { success: true, message: "Salon updated successfully." };
  } catch (err: any) {
    console.error("[updateGlobalSalonAction Error]", err.message);
    return { success: false, message: err.message || "Failed to update salon." };
  }
}

/**
 * Soft-deletes a salon from the platform.
 */
export async function deleteGlobalSalonAction(salonId: string): Promise<ActionResponse> {
  try {
    await verifySuperAdmin();

    if (!salonId) {
      return { success: false, message: "Invalid salon ID provided." };
    }

    await db.query("UPDATE public.salons SET is_deleted = true WHERE id = $1", [salonId]);

    revalidatePath("/superadmin");
    return { success: true, message: "Salon soft-deleted successfully." };
  } catch (err: any) {
    console.error("[deleteGlobalSalonAction Error]", err.message);
    return { success: false, message: err.message || "Failed to delete salon." };
  }
}

/**
 * Soft-deletes an appointment globally.
 */
export async function deleteGlobalAppointmentAction(appointmentId: string): Promise<ActionResponse> {
  try {
    await verifySuperAdmin();

    if (!appointmentId) {
      return { success: false, message: "Invalid appointment ID provided." };
    }

    await db.query("UPDATE public.appointments SET is_deleted = true WHERE id = $1", [appointmentId]);

    revalidatePath("/superadmin");
    return { success: true, message: "Appointment soft-deleted successfully." };
  } catch (err: any) {
    console.error("[deleteGlobalAppointmentAction Error]", err.message);
    return { success: false, message: err.message || "Failed to delete appointment." };
  }
}

/**
 * Adds a new salon for a user (if they don't already have one)
 */
export async function createGlobalSalonAction(
  ownerId: string,
  name: string,
  phone: string
): Promise<ActionResponse> {
  try {
    await verifySuperAdmin();

    if (!ownerId || !name || !phone) {
      return { success: false, message: "All fields are required to create a salon." };
    }

    // Check if the user already owns a salon
    const checkRes = await db.query(
      "SELECT id FROM public.salons WHERE owner_id = $1 AND is_deleted = false LIMIT 1",
      [ownerId]
    );
    if (checkRes.rows.length > 0) {
      return { success: false, message: "Selected user already owns a salon." };
    }

    await db.query(
      "INSERT INTO public.salons (owner_id, name, phone) VALUES ($1, $2, $3)",
      [ownerId, name.trim(), phone.trim()]
    );

    revalidatePath("/superadmin");
    return { success: true, message: "Salon created successfully." };
  } catch (err: any) {
    console.error("[createGlobalSalonAction Error]", err.message);
    return { success: false, message: err.message || "Failed to create new salon." };
  }
}

/**
 * Creates a new user with email and password from the superadmin console.
 */
export async function createGlobalUserAction(
  email: string,
  password: string
): Promise<ActionResponse> {
  try {
    await verifySuperAdmin();

    if (!email || !password) {
      return { success: false, message: "Email and password are required." };
    }
    if (password.trim().length < 8) {
      return { success: false, message: "Password must be at least 8 characters." };
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const checkRes = await db.query(
      "SELECT id FROM public.users WHERE email = $1 LIMIT 1",
      [normalizedEmail]
    );
    if (checkRes.rows.length > 0) {
      return { success: false, message: "A user with this email already exists." };
    }

    // Hash the password securely with bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    await db.query(
      "INSERT INTO public.users (email, password_hash) VALUES ($1, $2)",
      [normalizedEmail, passwordHash]
    );

    revalidatePath("/superadmin");
    return { success: true, message: "User created successfully." };
  } catch (err: any) {
    console.error("[createGlobalUserAction Error]", err.message);
    return { success: false, message: err.message || "Failed to create user." };
  }
}
