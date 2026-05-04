"use client";

import { useFormState } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthFormState } from "@/app/actions/auth";

export function SignupForm({
  action,
}: {
  action: (prev: AuthFormState | undefined, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="salonName">Salon name</Label>
        <Input id="salonName" name="salonName" required autoComplete="organization" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Business phone</Label>
        <Input id="phone" name="phone" type="tel" required autoComplete="tel" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full">
        Create account
      </Button>
    </form>
  );
}
