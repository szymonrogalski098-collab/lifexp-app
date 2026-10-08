// The verification code to the parent through EmailJS, as v1 sends it (settings.js).
// The service, template and public key are v1's, already public in v1's code: an
// EmailJS public key only lets this site send through that one template.
const SEND_URL = 'https://api.emailjs.com/api/v1.0/email/send';
const SERVICE_ID = 'service_417sg11';
const TEMPLATE_ID = 'template_f2b4jeo';
const PUBLIC_KEY = '1vFk29QDNKopU0RnJ';

/** Rejects when EmailJS does not take it (v1: !res.ok → "emailSendError"). */
export async function sendParentCodeEmail(to: string, userName: string, code: string): Promise<void> {
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      template_params: { to_email: to, user_name: userName, code },
    }),
  });
  if (!res.ok) throw new Error(`EmailJS ${res.status}`);
}
