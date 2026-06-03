import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { SuperAdminShell } from "./superadmin-shell";
import { ShieldAlert } from "lucide-react";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Fetch user session
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // 2. Query user status to verify if they are a superadmin
  const userRes = await db.query(
    "SELECT id, email, is_super_admin FROM public.users WHERE id = $1 LIMIT 1",
    [session.userId]
  );
  const user = userRes.rows[0];

  if (!user || !user.is_super_admin) {
    // If authenticated but not a superadmin, redirect to normal dashboard
    redirect("/dashboard");
  }

  return (
    <SuperAdminShell>
      <main className="flex-1 overflow-auto bg-background min-h-screen">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </SuperAdminShell>
  );
}
