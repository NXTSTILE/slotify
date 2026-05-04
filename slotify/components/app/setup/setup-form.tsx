"use client";

import { useFormState } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type State = { error?: string };

export function SetupForm({
  action,
}: {
  action: (prev: State | undefined, formData: FormData) => Promise<State>;
}) {
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Salon name</Label>
        <Input id="name" name="name" required autoComplete="organization" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Contact phone</Label>
        <Input id="phone" name="phone" required type="tel" autoComplete="tel" />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full">
        Continue to dashboard
      </Button>
    </form>
  );
}
