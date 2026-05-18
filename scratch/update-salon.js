const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://vhumdgouumyrwvccyvij.supabase.co";
// Getting the service role key from .env
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZodW1kZ291dW15cnd2Y2N5dmlqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc4MTE1NiwiZXhwIjoyMDkzMzU3MTU2fQ.V8NP311JiOAfvcDQGHfk9f9KHzZVigb8Fg6dO8L6CBU"; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // Check if any salons exist
  const { data: salons, error } = await supabase.from("salons").select("*");
  
  if (error) {
    console.error("Error fetching salons:", error);
    return;
  }
  
  if (salons.length === 0) {
    console.log("No salons found in the database. You need to create an account first!");
    return;
  }
  
  console.log(`Found ${salons.length} salon(s). Updating the first one...`);
  const salonId = salons[0].id;
  
  // Update with WhatsApp credentials
  const { error: updateError } = await supabase
    .from("salons")
    .update({
      whatsapp_phone_number_id: "1134996063024550",
      whatsapp_access_token: "EAA8EYBMVKo8BRZA8fEbIdaXUXk2kYpFAXjytMS8sJwrALXhIfAFL5iBshpZBfqm8bOqhWfAPxZA6OCJAunTZCiSzL7ckN66QeOptYnZCBxZCJEBvw7vRv8AObI79OrWTqx1hNUZAYlzntNSaqUbeTzQfsZAf6fkh4EeNJZAySF7cSq0pcopY8FvZBfPqukejlza0DZC2BKkuxoyTpQjNZBVZCM7BjgtoLhkUTl3CjPf6nii3KiBxDZCxdpW9VeZCLZAZCcmFWHjq9Hoqg7gPNErjubUDqE2ggHeUPs40ZD"
    })
    .eq("id", salonId);
    
  if (updateError) {
    console.error("Failed to update salon:", updateError);
  } else {
    console.log(`Successfully mapped WhatsApp credentials to salon: ${salons[0].name}`);
  }
}

run();
