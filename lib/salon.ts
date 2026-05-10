import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export async function getSalonForUser(
  supabase: SupabaseClient<Database>,
  userId: string
) {
  const { data, error } = await supabase
    .from("salons")
    .select("*")
    .eq("owner_id", userId)
    .maybeSingle();

  return { salon: data, error };
}
