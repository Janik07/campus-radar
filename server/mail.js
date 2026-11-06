// Sends the sign-in code through Resend (https://resend.com) when RESEND_API_KEY is set.
import { config } from './config.js';

export async function sendLoginCode(email, code) {
  if (!config.resendApiKey) {
    console.log(`[mail] no email service configured; code for ${email}: ${code}`);
    return false;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: config.mailFrom,
        to: [email],
        subject: `Your Campus Radar code: ${code}`,
        text: `Your sign-in code is ${code}. It expires in 10 minutes.\n\nIf you did not request it, ignore this email.`,
      }),
    });
    if (!r.ok) {
      console.error('[mail] send failed', r.status, await r.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('[mail] send failed', e.message);
    return false;
  }
}
