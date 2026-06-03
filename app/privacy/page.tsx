import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — Nxtstile",
  description: "Privacy Policy for Nxtstile salon booking SaaS platform.",
};

export default function PrivacyPolicyPage() {
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
          <div className="space-y-2 border-b pb-6">
            <h1 className="text-4xl font-extrabold tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">Last updated: June 3, 2026</p>
          </div>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-foreground/90 leading-relaxed">
            <p>
              Welcome to <strong>Nxtstile</strong> (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;). Nxtstile is a multi-tenant Scheduling Software as a Service (SaaS) designed to help independent salons in India manage appointments seamlessly, utilizing automated WhatsApp-based interactions.
            </p>
            <p>
              This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website at <a href="https://www.nxtstile.in" className="text-primary underline font-medium">www.nxtstile.in</a>, use our SaaS dashboard, or interact with our automated WhatsApp scheduling bot.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">1. Information We Collect</h2>
            <p>We collect information to provide better services to all our users. The categories of information we collect include:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Account Information:</strong> When you register as a salon owner, we collect your email address, password (cryptographically hashed), and dashboard configuration parameters.
              </li>
              <li>
                <strong>Salon and Business Profile Data:</strong> Information related to your salon business, such as the salon name, contact number, business address, operating hours, holiday schedules, services offered, and pricing.
              </li>
              <li>
                <strong>WhatsApp Meta Integration Details:</strong> To power the WhatsApp-first booking engine on behalf of your tenant, we securely store your Meta WhatsApp Phone Number ID and Graph API system tokens.
              </li>
              <li>
                <strong>Client and Booking Records:</strong> When customers message your WhatsApp bot to book an appointment, the system processes and records their mobile phone number, name, selected services, and booking history.
              </li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">2. How We Use Your Information</h2>
            <p>We use the collected information for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>To initialize and host your custom salon booking engine.</li>
              <li>To calculate and match real-time appointment availability based on business hours.</li>
              <li>To transmit notifications, automated appointment confirmations, reminders, and cancellations via the Meta WhatsApp Business API.</li>
              <li>To authenticate user sessions securely using JSON Web Tokens (JWT).</li>
              <li>To detect, prevent, and address technical issues or fraudulent activity.</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">3. Data Sharing and Disclosure</h2>
            <p>
              We do not sell, rent, or trade your personal or business data. We only share information with third-party service providers to the minimum extent necessary to operate our service:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Database & Infrastructure Providers:</strong> Our database and auth services are hosted via Supabase (PostgreSQL database).
              </li>
              <li>
                <strong>Communications Platforms:</strong> Outbound booking confirmations and reminders are routed through Meta&apos;s official WhatsApp Business API endpoints.
              </li>
              <li>
                <strong>Compliance with Law:</strong> We may disclose information if required to do so by applicable laws, regulations, or court orders.
              </li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">4. Data Security</h2>
            <p>
              We prioritize the protection of your data. We implement standard security mechanisms, including database Row-Level Security (RLS) policies to keep tenants strictly isolated, HTTPS encryption on all incoming traffic, and cryptographically signed session cookies. However, no method of transmission over the internet is 100% secure.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">5. Your Rights and Data Deletion</h2>
            <p>
              Under applicable regulations, salon owners and customers have rights regarding their personal data, including the right to view, correct, or delete their profile information. For detailed instructions on how to request deletion of your data, please see our dedicated <Link href="/deletion" className="text-primary underline font-medium">Data Deletion Instructions</Link> page.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">6. Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date at the top of this document.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">7. Contact Us</h2>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy, please reach out to us at:
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
