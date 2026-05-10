import { createClient } from "@supabase/supabase-js";
import { handleConversationMessage } from "../lib/booking/conversation";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(supabaseUrl, supabaseKey);

async function runSimulation() {
  const salonId = "YOUR_SALON_ID"; // Replace with a real salon ID from your DB
  const phone = "+919876543210";

  console.log("--- STARTING SIMULATION ---");

  // Step 1: Start Booking
  console.log("\nUser: BOOK");
  await handleConversationMessage(admin, salonId, phone, { kind: "text", body: "BOOK" });

  // Step 2: Pick a service
  console.log("\nUser: 1");
  await handleConversationMessage(admin, salonId, phone, { kind: "text", body: "1" });

  // Step 3: Pick a date
  console.log("\nUser: Tomorrow");
  await handleConversationMessage(admin, salonId, phone, { kind: "text", body: "Tomorrow" });

  console.log("\n--- SIMULATION COMPLETE ---");
}

runSimulation().catch(console.error);
