"use client";

import { useState } from "react";
import { loginSuperadmin } from "@/app/actions/superadmin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";

export function SuperAdminLoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsPending(true);
    setError(null);
    const result = await loginSuperadmin(formData);
    if (result?.error) {
      setError(result.error);
      setIsPending(false);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="username" className="text-zinc-200">Username</Label>
        <Input 
          id="username" 
          name="username" 
          required 
          disabled={isPending}
          className="border-zinc-800 bg-zinc-950 text-zinc-50 focus-visible:ring-rose-500"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-zinc-200">Password</Label>
        <Input 
          id="password" 
          name="password" 
          type="password" 
          required 
          disabled={isPending}
          className="border-zinc-800 bg-zinc-950 text-zinc-50 focus-visible:ring-rose-500"
        />
      </div>
      <Button 
        type="submit" 
        className="w-full bg-rose-600 text-white hover:bg-rose-700" 
        disabled={isPending}
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Enter Dashboard
      </Button>
    </form>
  );
}
