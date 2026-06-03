"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/**
 * Securely verifies that the currently logged-in user is a verified Super Admin.
 * Throws an error if not authorized.
 */
async function verifySuperAdmin() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized: No active session found.");
  }

  const userRes = await db.query(
    "SELECT is_super_admin FROM public.users WHERE id = $1 LIMIT 1",
    [session.userId]
  );

  const user = userRes.rows[0];
  if (!user || !user.is_super_admin) {
    throw new Error("Forbidden: You do not have Super Admin platform permissions.");
  }

  return session.userId; // Returns the logged-in superadmin's user ID
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
 * Deletes a salon from the platform.
 */
export async function deleteGlobalSalonAction(salonId: string): Promise<ActionResponse> {
  try {
    await verifySuperAdmin();

    if (!salonId) {
      return { success: false, message: "Invalid salon ID provided." };
    }

    await db.query("DELETE FROM public.salons WHERE id = $1", [salonId]);

    revalidatePath("/superadmin");
    return { success: true, message: "Salon deleted successfully." };
  } catch (err: any) {
    console.error("[deleteGlobalSalonAction Error]", err.message);
    return { success: false, message: err.message || "Failed to delete salon." };
  }
}

/**
 * Toggles a user's is_super_admin privilege status.
 * Prevents a Super Admin from revoking their own admin access.
 */
export async function toggleUserAdminRoleAction(targetUserId: string): Promise<ActionResponse> {
  try {
    const currentUserId = await verifySuperAdmin();

    if (currentUserId === targetUserId) {
      return { success: false, message: "You cannot revoke your own Super Admin access." };
    }

    // Fetch target user's current status
    const targetRes = await db.query(
      "SELECT is_super_admin FROM public.users WHERE id = $1 LIMIT 1",
      [targetUserId]
    );

    const targetUser = targetRes.rows[0];
    if (!targetUser) {
      return { success: false, message: "User account not found." };
    }

    const newAdminStatus = !targetUser.is_super_admin;
    await db.query(
      "UPDATE public.users SET is_super_admin = $1 WHERE id = $2",
      [newAdminStatus, targetUserId]
    );

    revalidatePath("/superadmin");
    return {
      success: true,
      message: `User permissions updated. Admin role ${newAdminStatus ? "granted" : "revoked"} successfully.`
    };
  } catch (err: any) {
    console.error("[toggleUserAdminRoleAction Error]", err.message);
    return { success: false, message: err.message || "Failed to change user permissions." };
  }
}

/**
 * Safely deletes a user account.
 * Prevents deleting one's own account.
 */
export async function deleteGlobalUserAction(targetUserId: string): Promise<ActionResponse> {
  try {
    const currentUserId = await verifySuperAdmin();

    if (currentUserId === targetUserId) {
      return { success: false, message: "You cannot delete your own account." };
    }

    await db.query("DELETE FROM public.users WHERE id = $1", [targetUserId]);

    revalidatePath("/superadmin");
    return { success: true, message: "User account deleted successfully." };
  } catch (err: any) {
    console.error("[deleteGlobalUserAction Error]", err.message);
    return { success: false, message: err.message || "Failed to delete user account." };
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
      "SELECT id FROM public.salons WHERE owner_id = $1 LIMIT 1",
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
