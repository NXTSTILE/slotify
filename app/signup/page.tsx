import type { Metadata } from "next";
import Link from "next/link";
import { signupAction } from "@/app/actions/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "./signup-form";
import { Scissors, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Create account — Nxtstile",
  description: "Register your salon and start accepting WhatsApp bookings.",
};

const perks = [
  "WhatsApp booking bot — active immediately",
  "Dedicated number per salon",
  "Auto 24-hour reminders",
  "Owner dashboard with live updates",
];

export default function SignupPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-primary via-violet-500 to-purple-700 p-12 text-white">
        <div className="flex items-center gap-2 font-bold text-xl">
          <Scissors className="h-5 w-5" />
          Nxtstile
        </div>
        <div className="space-y-6">
          <h2 className="text-3xl font-bold leading-tight">
            Your salon, fully booked — on WhatsApp.
          </h2>
          <ul className="space-y-3">
            {perks.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm text-white/90">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-white/80" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-white/50 text-xs">Free to start · No credit card needed</p>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-2 font-bold text-lg text-primary lg:hidden">
            <Scissors className="h-5 w-5" />
            Nxtstile
          </div>
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Create your salon</CardTitle>
              <CardDescription>
                Register your salon — you&apos;ll use this email to sign in and manage bookings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SignupForm action={signupAction} />
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  href="/login"
                >
                  Sign in
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
