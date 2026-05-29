import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createSalonSetupAction } from "@/app/actions/setup";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupForm } from "./setup-form";

export default async function SetupPage() {
  // 1. Fetch active session context
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // 2. Redirect to dashboard if salon already exists
  const salonRes = await db.query(
    "SELECT id FROM public.salons WHERE owner_id = $1 LIMIT 1",
    [session.userId]
  );
  const salon = salonRes.rows[0];
  if (salon) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your salon</CardTitle>
          <CardDescription>
            You&apos;re signed in. Add your business details to open the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SetupForm action={createSalonSetupAction} />
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/" className="underline">
              Back home
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
