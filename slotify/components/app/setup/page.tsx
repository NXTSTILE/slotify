import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSalonForUser } from "@/lib/salon";
import { createSalonSetupAction } from "@/app/actions/setup";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupForm } from "./setup-form";

export default async function SetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { salon } = await getSalonForUser(supabase, user.id);
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
