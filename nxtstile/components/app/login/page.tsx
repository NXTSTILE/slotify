import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "./auth-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Nxtstile owner dashboard (email + password)</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthForm action={loginAction} submitLabel="Sign in" />
          <p className="mt-4 text-center text-sm text-muted-foreground">
            New salon?{" "}
            <Link className="underline" href="/signup">
              Create account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
