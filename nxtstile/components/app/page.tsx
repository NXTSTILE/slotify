import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-background to-muted p-6">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Nxtstile</h1>
        <p className="text-muted-foreground max-w-md">
          WhatsApp appointment booking for salons in India. Owners manage everything from the
          dashboard.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/login" className={cn(buttonVariants())}>
          Owner login
        </Link>
        <Link href="/signup" className={cn(buttonVariants({ variant: "outline" }))}>
          Create account
        </Link>
      </div>
    </div>
  );
}
