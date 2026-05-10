import Link from "next/link";
import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CalendarCheck,
  MessageCircle,
  Bell,
  LayoutDashboard,
  Scissors,
  CheckCircle2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Slotify — WhatsApp Appointment Booking for Salons",
  description:
    "Let customers book appointments on WhatsApp. Manage your salon from a beautiful dashboard. No app downloads. No friction.",
};

const features = [
  {
    icon: MessageCircle,
    title: "WhatsApp-Only Booking",
    desc: "Customers book via the WhatsApp number they already have. Zero friction, zero app downloads.",
  },
  {
    icon: CalendarCheck,
    title: "Smart Slot Engine",
    desc: "Automatically calculates service duration + buffer and shows only real available slots.",
  },
  {
    icon: Bell,
    title: "Auto Reminders",
    desc: "24-hour WhatsApp reminder sent automatically to every customer. No manual follow-up.",
  },
  {
    icon: LayoutDashboard,
    title: "Owner Dashboard",
    desc: "View today's schedule, manage services, set working hours and holidays in one place.",
  },
  {
    icon: Scissors,
    title: "Service Catalog",
    desc: "Add services with prices and durations. Reorder by drag-and-drop. Group by category.",
  },
  {
    icon: CheckCircle2,
    title: "Cancel & Reschedule",
    desc: "Customers text CANCEL or RESCHEDULE. The bot handles it automatically.",
  },
];

const steps = [
  { n: "01", title: "Customer texts your salon's WhatsApp", desc: "The bot greets them instantly." },
  { n: "02", title: "They pick services & a date", desc: "Interactive menu shows your live catalog." },
  { n: "03", title: "Bot shows open slots", desc: "Calculated in real time from your working hours." },
  { n: "04", title: "Booking confirmed", desc: "Customer gets a confirmation. You see it in the dashboard." },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <span className="text-lg font-bold tracking-tight text-primary">Slotify</span>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              Get started free
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-secondary/30 py-24 sm:py-32">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,oklch(0.52_0.22_286/12%),transparent)]" />
          <div className="relative mx-auto max-w-3xl px-6 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <span className="size-1.5 rounded-full bg-primary" />
              Multi-tenant · Meta WhatsApp API · India
            </div>
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
              WhatsApp booking for{" "}
              <span className="bg-gradient-to-r from-primary to-violet-400 bg-clip-text text-transparent">
                your salon
              </span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Customers text your salon's WhatsApp number and book appointments in seconds.
              You manage everything from a clean dashboard. No app. No hassle.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "px-8")}>
                Create your salon dashboard
              </Link>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "px-8"
                )}
              >
                Sign in →
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Free to start · No credit card</p>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight">Everything you need</h2>
              <p className="mt-3 text-muted-foreground">
                Designed for independent salons in India. Runs entirely on WhatsApp.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="group rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="bg-muted/40 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
              <p className="mt-3 text-muted-foreground">
                From first message to confirmed booking in under 2 minutes.
              </p>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(({ n, title, desc }) => (
                <div key={n} className="flex flex-col gap-3">
                  <span className="text-4xl font-bold text-primary/20">{n}</span>
                  <h3 className="font-semibold leading-snug">{title}</h3>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-xl px-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Ready to modernise your salon?
            </h2>
            <p className="mt-4 text-muted-foreground">
              Set up your dashboard in minutes. Start taking WhatsApp bookings today.
            </p>
            <Link
              href="/signup"
              className={cn(buttonVariants({ size: "lg" }), "mt-8 px-10")}
            >
              Create free account
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Slotify. WhatsApp-first salon scheduling for India.
      </footer>
    </div>
  );
}
