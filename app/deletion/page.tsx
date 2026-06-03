import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";

export const metadata = {
  title: "Data Deletion Instructions — Nxtstile",
  description: "Instructions on how to request the deletion of your personal or business data from Nxtstile.",
};

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-card to-muted py-12 px-6">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Home
        </Link>

        <div className="rounded-2xl border bg-card/60 backdrop-blur-md p-8 sm:p-12 shadow-xl space-y-8">
          <div className="flex items-start gap-4 border-b pb-6">
            <div className="bg-destructive/10 text-destructive p-3 rounded-xl border border-destructive/20 hidden sm:block">
              <Trash2 className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-extrabold tracking-tight">Data Deletion Instructions</h1>
              <p className="text-sm text-muted-foreground">Instructions for requesting deletion of salon or customer data</p>
            </div>
          </div>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-foreground/90 leading-relaxed">
            <p>
              At <strong>Nxtstile</strong>, we respect your privacy and provide a clear, transparent pathway to request the permanent deletion of your data from our systems. This page outlines the step-by-step instructions for both Salon Owners (Platform Tenants) and Salon Customers (End Users) to purge their data in compliance with privacy guidelines.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">1. For Salon Owners (Tenants)</h2>
            <p>
              If you have registered an account to manage your salon, the following data is associated with your profile:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your email address and cryptographically hashed login credentials.</li>
              <li>Your business configurations (salon name, phone, address, operating hours, and services catalog).</li>
              <li>Your integrated Meta WhatsApp API credentials (Phone ID and Access Tokens).</li>
            </ul>
            <p>
              To request a complete and permanent account deletion, please follow the steps in <strong>Section 3</strong>. Once deleted, you will no longer have access to the dashboard, and your integrated WhatsApp bot will immediately stop responding.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">2. For Salon Customers (End Users)</h2>
            <p>
              If you have interacted with a salon&apos;s WhatsApp bot powered by Nxtstile, we store:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your WhatsApp telephone number and name (provided during scheduling).</li>
              <li>Your active conversation state with the bot.</li>
              <li>Your past, present, and scheduled appointments at the respective salon.</li>
            </ul>
            <p>
              If you wish to have your phone number and booking history permanently purged from our database records, please proceed to <strong>Section 3</strong>.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">3. Steps to Request Data Deletion</h2>
            <p>
              To request deletion of your business or personal data from Nxtstile, please submit an official request:
            </p>
            <ol className="list-decimal pl-6 space-y-4">
              <li>
                Compose an email from your registered email address (or mention your WhatsApp phone number if you are a customer).
              </li>
              <li>
                Address the email to: <a href="mailto:support@nxtstile.in" className="text-primary font-medium hover:underline">support@nxtstile.in</a>
              </li>
              <li>
                Use the subject line: <strong>Nxtstile Data Deletion Request</strong>
              </li>
              <li>
                State clearly whether you want to delete a <strong>Salon Dashboard Account</strong> or a <strong>Customer Booking Profile</strong>.
              </li>
            </ol>
            <p className="bg-muted p-4 rounded-xl border text-sm">
              <strong>Processing Timeline:</strong> Upon receiving your request, our engineering team will verify your identity. Once verified, we will permanently purge all requested database rows (and unlink integrated Meta Graph API assets) from our production databases and backups within <strong>7 business days</strong>. A confirmation email will be sent to you once the deletion process is complete.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">4. Questions & Support</h2>
            <p>
              If you have any questions regarding our data policies or the deletion procedure, feel free to contact our data protection team:
            </p>
            <p className="bg-muted p-4 rounded-xl border font-medium">
              Email: <a href="mailto:support@nxtstile.in" className="text-primary hover:underline">support@nxtstile.in</a>
            </p>
          </div>
        </div>

        <div className="text-center mt-8 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Nxtstile. All rights reserved.
        </div>
      </div>
    </div>
  );
}
