const accessToken = "EAA8EYBMVKo8BRZA8fEbIdaXUXk2kYpFAXjytMS8sJwrALXhIfAFL5iBshpZBfqm8bOqhWfAPxZA6OCJAunTZCiSzL7ckN66QeOptYnZCBxZCJEBvw7vRv8AObI79OrWTqx1hNUZAYlzntNSaqUbeTzQfsZAf6fkh4EeNJZAySF7cSq0pcopY8FvZBfPqukejlza0DZC2BKkuxoyTpQjNZBVZCM7BjgtoLhkUTl3CjPf6nii3KiBxDZCxdpW9VeZCLZAZCcmFWHjq9Hoqg7gPNErjubUDqE2ggHeUPs40ZD";
const phoneNumberId = "1134996063024550";
const recipientNumber = "919692202185"; // Added 91 assuming it's an Indian number based on the 10 digits. Adjust if different!

async function testWhatsApp() {
  console.log("Sending test message to " + recipientNumber + "...");
  
  const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: recipientNumber,
      type: "template",
      template: {
        name: "hello_world",
        language: { code: "en_US" }
      }
    })
  });

  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));
}

testWhatsApp().catch(console.error);
