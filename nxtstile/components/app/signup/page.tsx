import Link from "next/link";
import { signupAction } from "@/app/actions/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>
            Register your salon — you&apos;ll use this email to manage bookings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm action={signupAction} />
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have access?{" "}
            <Link className="underline" href="/login">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
