"use server";

import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SUPERADMIN_USERNAME = process.env.SUPERADMIN_USERNAME || "superadmin";
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || "superadmin123";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "fallback-secret-for-dev");

export async function loginSuperadmin(formData: FormData) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (username !== SUPERADMIN_USERNAME || password !== SUPERADMIN_PASSWORD) {
    return { error: "Invalid superadmin credentials" };
  }

  // Create token
  const token = await new SignJWT({ is_superadmin: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(JWT_SECRET);

  // Set cookie
  cookies().set("superadmin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 1 day
    path: "/",
  });

  redirect("/superadmin");
}

export async function logoutSuperadmin() {
  cookies().delete("superadmin_session");
  redirect("/superadmin/login");
}
