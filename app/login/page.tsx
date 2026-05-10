import type { Metadata } from "next";
import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "./auth-form";
import { Scissors } from "lucide-react";

export const metadata: Metadata = {
  title: "Sign in — Slotify",
  description: "Sign in to your Slotify salon dashboard.",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-primary via-violet-500 to-purple-700 p-12 text-white">
        <div className="flex items-center gap-2 font-bold text-xl">
          <Scissors className="h-5 w-5" />
          Slotify
        </div>
        <div className="space-y-4">
          <blockquote className="text-2xl font-medium leading-snug">
            "Our customers love booking via WhatsApp. No more missed calls."
          </blockquote>
          <p className="text-white/70 text-sm">— Salon owner, Mumbai</p>
        </div>
        <p className="text-white/50 text-xs">WhatsApp-first scheduling for India's salons</p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-2 font-bold text-lg text-primary lg:hidden">
            <Scissors className="h-5 w-5" />
            Slotify
          </div>
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Welcome back</CardTitle>
              <CardDescription>Sign in to your owner dashboard</CardDescription>
            </CardHeader>
            <CardContent>
              <AuthForm action={loginAction} submitLabel="Sign in" />
              <p className="mt-4 text-center text-sm text-muted-foreground">
                New salon?{" "}
                <Link className="text-primary underline-offset-4 hover:underline" href="/signup">
                  Create free account
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
