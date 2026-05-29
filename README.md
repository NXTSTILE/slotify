
# Nxtstile - WhatsApp-first Salon Scheduling SaaS

Nxtstile is a multi-tenant SaaS for independent salons in India, built with a strict "WhatsApp-first" approach. Customers interact with a fully automated bot on WhatsApp to discover services, check availability, and book appointments—all without downloading an app or leaving their favorite chat interface. Owners manage bookings via a clean, Next.js web dashboard.

---

## 🤖 AI Context & Developer Guide

*If you are an AI model reading this, this section contains the architectural context you need to understand the system without reading the code.*

### 1. Database Schema (Supabase PostgreSQL)
*   **`salons`**: The core tenant table. Contains `whatsapp_phone_number_id` and `whatsapp_access_token` (used to send Meta API messages on behalf of this tenant), plus business hours/policy info.
*   **`services` & `service_categories`**: Belongs to a salon. Includes `duration_minutes` (must be multiple of 5) and `price`.
*   **`working_hours` & `holidays`**: Belongs to a salon. Defines when they are open.
*   **`customers`**: Unique by `(salon_id, phone)`. Represents end-users messaging the bot.
*   **`appointments` & `appointment_services`**: The core booking record. Contains `start_time`, `end_time` (calculated via duration + 2m buffer), `status` (pending, confirmed, cancelled, completed), and `customer_id`.
*   **`conversation_states`**: Crucial table for the bot. Tracks the current step of a user's WhatsApp conversation. Unique by `(salon_id, customer_phone)`.
*   **`notifications`**: Alerts for the owner dashboard (new bookings, cancellations).

### 2. The WhatsApp Bot State Machine (`lib/booking/conversation.ts`)
The bot is **not an LLM**. It uses strict keyword matching and a state machine. The states are:
1.  **`IDLE`**: User says "hi" or sends an unknown command. Bot replies with a list of services.
2.  **`SELECTING_SERVICES`**: User selects services (via WhatsApp interactive lists or comma-separated numbers).
3.  **`SELECTING_DATE`**: User provides a date ("today", "tomorrow", or "DD/MM/YYYY").
4.  **`SELECTING_SLOT`**: The system calculates available slots (`lib/booking/slots.ts`) and presents them.
5.  **`CONFIRMING_NAME`**: User provides their name to finalize the booking.
6.  **`BOOKED`**: Booking is confirmed. Sending messages here shows the active appointment details.

Keywords like `CANCEL`, `RESCHEDULE`, `HELP`, `SERVICES`, `LOCATION`, `HOURS`, `CONTACT`, `POLICY` can be triggered at any time to interrupt or provide info.

### 3. Routing & Actions Architecture
*   **Webhooks (`app/api/whatsapp/webhook/route.ts`)**: Meta sends `POST` requests here. It parses the incoming message, looks up the salon by `phone_number_id`, and passes it to the state machine.
*   **Dashboard (`app/dashboard/*`)**: Standard Next.js server components fetching data via Supabase Server client. Mobile responsive (Slide-in drawer on mobile, persistent sidebar on desktop).
*   **Server Actions (`app/actions/salon.ts`, `auth.ts`)**: Form submissions (login, updating settings, marking appointments complete) use standard Next.js Server Actions.
*   **Cron (`app/api/cron/reminders/route.ts`)**: Secured via `CRON_SECRET`. Runs every 30m, checks for appointments in the 24-hour window, and sends Meta Template messages.

---

## 🚀 Key Features

*   **WhatsApp-Only Bookings:** Customers chat with the salon's dedicated WhatsApp number. The bot handles greetings, interactive service menus (lists/buttons), date selection, and slot availability.
*   **Smart Slot Engine:** Automatically calculates exact service duration + buffer times (e.g. 2 min) and cross-checks against the salon's configured working hours, holidays, and existing appointments to show only real available slots.
*   **Multi-tenant Architecture:** A single codebase powers multiple salons. Data is isolated using Supabase Row Level Security (RLS). Each salon configures its own working hours, services, holidays, and connects its own WhatsApp Business Number.
*   **Auto Reminders:** A cron job runs every 30 minutes to send 24-hour WhatsApp reminders to customers automatically.
*   **Dashboard for Owners:** A polished, mobile-responsive Next.js dashboard where owners manage everything.

## 🛠 Tech Stack

*   **Framework:** Next.js 14 (App Router)
*   **Backend / DB / Auth:** Supabase (PostgreSQL, Realtime, GoTrue Auth)
*   **Styling:** Tailwind CSS, Shadcn UI components
*   **WhatsApp Integration:** Meta WhatsApp Business API (Graph API v19.0)
*   **Date handling:** `date-fns` and `date-fns-tz` (strictly locked to `Asia/Kolkata` for India salons)
*   **Deployment:** DigitalOcean (App Platform or VPS Droplet with Docker)

## 🚦 Getting Started

1.  **Clone & Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Environment Variables:**
    Copy `.env.example` to `.env` and fill in the values:
    *   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    *   `SUPABASE_SERVICE_ROLE_KEY` (Needed for webhook and cron operations to bypass RLS)
    *   `WHATSAPP_VERIFY_TOKEN` (Your custom string for Meta webhook setup)
    *   `WHATSAPP_APP_SECRET` (For verifying incoming webhook signatures)
    *   `CRON_SECRET` (To secure the `api/cron/reminders` endpoint)

3.  **Supabase Setup:**
    *   Create a Supabase project.
    *   Run the migration found in `supabase/migrations/20260103000000_init.sql` in the Supabase SQL editor to create the schema and policies.

4.  **Run Development Server:**
    ```bash
    npm run dev
    ```

## 🔗 Meta WhatsApp Setup

1.  Go to the [Meta Developer Dashboard](https://developers.facebook.com/).
2.  Create an App and add the WhatsApp product.
3.  Configure your Webhook URL to point to your deployed instance: `https://your-domain.com/api/whatsapp/webhook`.
4.  Use your `WHATSAPP_VERIFY_TOKEN` during the webhook subscription phase.
5.  Subscribe to the `messages` webhook event.
6.  For reminders, you must create an approved WhatsApp Message Template named `appointment_reminder` in the Meta dashboard.

## 🔒 Security

*   **Webhook Verification:** All incoming requests to the WhatsApp webhook verify the `X-Hub-Signature-256` header against your `WHATSAPP_APP_SECRET`.
*   **Row Level Security (RLS):** Supabase RLS policies ensure that a logged-in salon owner can only read/write data associated with their own `salon_id`.
*   **CSP & Headers:** `next.config.mjs` enforces strict Content-Security-Policy and framing protections.

---

## 🚀 DigitalOcean Deployment Guide

This project is configured for a robust, secure, and production-ready deployment on **DigitalOcean**. 

To protect your API keys and avoid security risks, **never commit plain-text credentials to Git**. All secret keys are marked as `SECRET` and must be entered through secure environment parameters.

### Option 1: DigitalOcean App Platform (PaaS) - Recommended

DigitalOcean App Platform is fully managed, offers free SSL certificates, and updates automatically when you push to GitHub.

1. **Push your code** to a private GitHub repository.
2. Go to the **DigitalOcean Web Console** -> **Apps** -> **Create App**.
3. Select **GitHub** and connect your Nxtstile repository.
4. The system will automatically detect the Next.js setup via the custom `.do/app.yaml` file.
5. In the **Environment Variables** step, you will be prompted to supply values for all keys marked as `SECRET`. Retrieve these values from your local `.env` file and input them securely:
   - `NEXT_PUBLIC_SUPABASE_URL` (Build and Run time)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Build and Run time)
   - `SUPABASE_SERVICE_ROLE_KEY` (Run time)
   - `WHATSAPP_VERIFY_TOKEN` (Run time)
   - `WHATSAPP_APP_SECRET` (Run time)
   - `CRON_SECRET` (Run time)
6. Choose the **Basic XXS** instance size (~$5.00/mo) and click **Create Resources**.
7. Once deployed, DigitalOcean will provision a secure HTTPS domain for your application.

### Option 2: DigitalOcean Droplet (VPS) with Docker

For self-managed infrastructure, a multi-stage `Dockerfile` and `docker-compose.yml` are provided in the root directory.

1. SSH into your DigitalOcean Droplet.
2. Ensure `docker` and `docker-compose` are installed:
   ```bash
   sudo apt update
   sudo apt install docker.io docker-compose -y
   ```
3. Clone your repository onto the Droplet.
4. Create a `.env` file in the project root containing your secrets (similar to `.env.example`).
5. Run the production container:
   ```bash
   docker-compose up -d --build
   ```
6. Set up **Nginx** as a reverse proxy to route traffic from port `80`/`443` to `http://localhost:3000`, and use **Certbot** for Let's Encrypt SSL certificates.

---

## ⏰ Scheduling Appointment Reminders (`/api/cron/reminders`)

Since Vercel Crons are deprecated, use one of the following methods to trigger the WhatsApp reminders endpoint securely every 30 minutes:

### Method A: DigitalOcean App Platform Scheduled Job (Highest Recommendation)
This is already **fully pre-configured** for you in [.do/app.yaml](file:///c:/Users/marth/Projects/salon-saas/slotify/.do/app.yaml). 
- When deploying the application to DigitalOcean App Platform, DigitalOcean will automatically provision a native scheduled job (`reminders-cron`) that runs every 30 minutes.
- The job executes a lightweight curl command securely.
- **Requirement**: Simply supply your `CRON_SECRET` in the DigitalOcean dashboard when prompted during deployment. The platform dynamically routes the request using your secure internal environment configurations.

### Method B: Supabase `pg_cron`
If you are hosting your database on Supabase, you can run a scheduled SQL query directly inside your database using the standard `pg_cron` and `pg_net` extensions. 

Execute the following SQL in your **Supabase SQL Editor**:

```sql
-- Enable the required extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule the GET request to run every 30 minutes
select cron.schedule(
  'send-whatsapp-reminders',
  '*/30 * * * *',
  $$
  select net.http_get(
    url := 'https://your-digitalocean-domain.com/api/cron/reminders',
    headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'
  );
  $$
);
```

### Method C: Local Linux Cron (Droplet only)
If hosting on a standalone DigitalOcean Droplet, add a standard Linux crontab rule to trigger the local web endpoint directly:

1. Open crontab manager: `crontab -e`
2. Append the following line (replace `YOUR_CRON_SECRET` and ensure the port matches):
   ```bash
   */30 * * * * curl -s -X GET -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/reminders
   ```


