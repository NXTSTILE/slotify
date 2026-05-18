const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://vhumdgouumyrwvccyvij.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZodW1kZ291dW15cnd2Y2N5dmlqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc4MTE1NiwiZXhwIjoyMDkzMzU3MTU2fQ.V8NP311JiOAfvcDQGHfk9f9KHzZVigb8Fg6dO8L6CBU"; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function populate() {
  console.log("Fetching salon 'onu'...");
  const { data: salons, error: salonErr } = await supabase
    .from("salons")
    .select("id")
    .eq("name", "onu")
    .limit(1);

  if (salonErr || salons.length === 0) {
    console.error("Could not find salon 'onu'", salonErr);
    return;
  }
  const salonId = salons[0].id;
  console.log("Salon ID:", salonId);

  console.log("Deleting existing working hours, categories, and services (if any)...");
  await supabase.from("working_hours").delete().eq("salon_id", salonId);
  await supabase.from("services").delete().eq("salon_id", salonId);
  await supabase.from("service_categories").delete().eq("salon_id", salonId);

  console.log("Adding working hours for Monday-Sunday...");
  const workingHours = [];
  for (let i = 0; i <= 6; i++) {
    workingHours.push({
      salon_id: salonId,
      day_of_week: i,
      open_time: "09:00:00",
      close_time: "18:00:00",
      is_closed: false
    });
  }
  const { error: whErr } = await supabase.from("working_hours").insert(workingHours);
  if (whErr) console.error("Error inserting working hours", whErr);

  console.log("Adding a Service Category...");
  const { data: category, error: catErr } = await supabase
    .from("service_categories")
    .insert({
      salon_id: salonId,
      name: "Hair & Styling",
      display_order: 1
    })
    .select("id")
    .single();

  if (catErr) {
    console.error("Error inserting category", catErr);
    return;
  }

  console.log("Adding Services...");
  const services = [
    {
      salon_id: salonId,
      category_id: category.id,
      name: "Men's Haircut",
      duration_minutes: 30,
      price: 25,
      is_active: true,
      display_order: 1
    },
    {
      salon_id: salonId,
      category_id: category.id,
      name: "Women's Haircut",
      duration_minutes: 60,
      price: 50,
      is_active: true,
      display_order: 2
    }
  ];
  const { error: svcErr } = await supabase.from("services").insert(services);
  if (svcErr) console.error("Error inserting services", svcErr);

  console.log("✅ Successfully populated the salon with working hours and services! You are ready to test!");
}

populate();
