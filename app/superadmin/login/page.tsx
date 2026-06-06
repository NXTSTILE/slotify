import type { Metadata } from "next";
import { SuperAdminLoginForm } from "./superadmin-login-form";
import { ShieldAlert } from "lucide-react";

export const metadata: Metadata = {
  title: "Superadmin Login — Nxtstile",
  description: "Secure login for Nxtstile superadmin.",
};

export default function SuperadminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-50">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-rose-500/10 p-4">
            <ShieldAlert className="h-8 w-8 text-rose-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Superadmin Access</h1>
          <p className="text-sm text-zinc-400">
            Restricted area. Please enter your superadmin credentials.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-xl backdrop-blur">
          <SuperAdminLoginForm />
        </div>
      </div>
    </div>
  );
}
