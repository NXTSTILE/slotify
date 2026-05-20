import { createClient } from "@/lib/supabase/server";
import { getSalonForUser } from "@/lib/salon";
import { SettingsView } from "./settings-view";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { salon } = await getSalonForUser(supabase, user.id);
  if (!salon) return null;

  const { data: whRows } = await supabase
    .from("working_hours")
    .select("day_of_week, open_time, close_time, is_closed")
    .eq("salon_id", salon.id);

  const { data: holidays } = await supabase
    .from("holidays")
    .select("id, date, reason")
    .eq("salon_id", salon.id)
    .order("date", { ascending: true });

  return (
    <SettingsView
      salon={{
        name: salon.name,
        phone: salon.phone,
        address: salon.address,
        city: salon.city,
        cancellation_policy: salon.cancellation_policy,
        services_display_mode: salon.services_display_mode,
        whatsapp_phone_number_id: salon.whatsapp_phone_number_id,
        whatsapp_access_token: salon.whatsapp_access_token,
        whatsapp_business_account_id: salon.whatsapp_business_account_id,
      }}
      workingHours={whRows ?? []}
      holidays={holidays ?? []}
    />
  );
}
