import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Terms of Service — Nxtstile",
  description: "Terms of Service agreement for Nxtstile salon booking SaaS platform.",
};

export default function TermsOfServicePage() {
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
            <h1 className="text-4xl font-extrabold tracking-tight">Terms of Service</h1>
            <p className="text-sm text-muted-foreground">Last updated: June 3, 2026</p>
          </div>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-foreground/90 leading-relaxed">
            <p>
              Please read these Terms of Service ("Terms", "Agreement") carefully before using the <a href="https://www.nxtstile.in" className="text-primary underline font-medium">www.nxtstile.in</a> website and the scheduling software services (the "Service") operated by <strong>Nxtstile</strong> ("us", "we", "our").
            </p>
            <p>
              By accessing or using the Service, you agree to be bound by these Terms. If you disagree with any part of the terms, you may not access the Service.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">1. Account Registration</h2>
            <p>
              To use the Service as a salon owner, you must create an account. You agree to provide accurate, current, and complete information during registration. You are responsible for safeguarding the password that you use to access the dashboard and for any actions taken under your account.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">2. WhatsApp Business Integration</h2>
            <p>
              Nxtstile operates a WhatsApp-first salon booking workflow. To enable scheduling interactions for your clients, you must integrate your own Meta WhatsApp Business Account, WhatsApp Phone Number ID, and System User Access Tokens into our platform.
            </p>
            <p>
              By integrating these services, you agree to strictly comply with the <strong>Meta WhatsApp Business Terms of Service</strong>, WhatsApp Commerce Policy, and all other applicable Meta Developer Policies. You are solely responsible for obtaining necessary consent from your customers prior to sending them booking notifications or reminders via WhatsApp.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">3. Acceptable Use Policy</h2>
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Send unsolicited messages or spam to customers in violation of anti-spam laws.</li>
              <li>Transmit any material that is offensive, abusive, defamatory, or unlawful.</li>
              <li>Attempt to gain unauthorized access to our systems, other user accounts, or connected databases.</li>
              <li>Exploit the platform to bypass payment gateways or abuse database limits.</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">4. Subscriptions and Fees</h2>
            <p>
              Certain aspects of the Service may be provided on a paid subscription basis. You agree to provide valid billing information. All fees are non-refundable unless specified otherwise. We reserve the right to modify subscription pricing at any time with prior notice.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">5. Intellectual Property</h2>
            <p>
              The Service and its original content, features, dashboard designs, and slot-calculation logic are and will remain the exclusive property of Nxtstile. Our trademarks and branding may not be used in connection with any product or service without our prior written consent.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">6. Limitation of Liability</h2>
            <p>
              In no event shall Nxtstile, its founders, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses resulting from (i) your access to or use of the Service, (ii) any conduct or content of any third party on the Service, or (iii) unauthorized access, use, or alteration of your transmissions or data.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">7. Termination</h2>
            <p>
              We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, under our sole discretion, for any reason whatsoever, including without limitation if you breach the Terms. Upon termination, your right to use the Service will immediately cease.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">8. Governing Law</h2>
            <p>
              These Terms shall be governed and construed in accordance with the laws of India, without regard to its conflict of law provisions.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">9. Changes to Terms</h2>
            <p>
              We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect.
            </p>

            <h2 className="text-2xl font-bold mt-8 border-b pb-2">10. Contact Us</h2>
            <p>
              If you have any questions about these Terms of Service, please contact us:
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
