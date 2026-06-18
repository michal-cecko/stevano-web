import type { APIRoute } from 'astro';
import { Resend } from 'resend';

// On-demand (server) route — everything else on the site stays prerendered.
export const prerender = false;

type Payload = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  /** Honeypot — populated by bots, never by humans. */
  company?: unknown;
};

function asString(v: unknown, max = 500): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const POST: APIRoute = async ({ request }) => {
  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  // Honeypot — silently accept then drop.
  if (typeof body.company === 'string' && body.company.trim().length > 0) {
    return json({ ok: true });
  }

  const name = asString(body.name, 120);
  const email = asString(body.email, 200);
  const message = asString(body.message, 4000);

  if (!name || !email || !message) return json({ error: 'missing_fields' }, 422);
  if (!EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 422);

  const apiKey = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY is not set');
    return json({ error: 'mail_not_configured' }, 503);
  }

  // Until a STEVANO domain is verified at Resend, the only allowed sender is
  // onboarding@resend.dev. Once verified, set CONTACT_FROM in env, e.g.
  // "STEVANO <web@stevano.tld>". CONTACT_TO is the recipient you control.
  const from = import.meta.env.CONTACT_FROM ?? process.env.CONTACT_FROM ?? 'STEVANO website <onboarding@resend.dev>';
  const to = import.meta.env.CONTACT_TO ?? process.env.CONTACT_TO ?? 'ceckomichal@gmail.com';

  const subject = `[STEVANO] New enquiry — ${name}`;
  const text = [
    'New contact-form submission from the STEVANO website',
    '',
    `Name:    ${name}`,
    `Email:   ${email}`,
    '',
    'Message:',
    message,
  ].join('\n');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#14171A;">
      <h2 style="margin:0 0 16px;font-size:18px;">New STEVANO enquiry</h2>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr><td style="padding:6px 12px 6px 0;color:#555;width:80px;">Name</td><td style="padding:6px 0;"><strong>${escapeHtml(name)}</strong></td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#555;">Email</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(email)}" style="color:#5BA8C9;">${escapeHtml(email)}</a></td></tr>
      </table>
      <hr style="border:0;border-top:1px solid #ddd;margin:20px 0;" />
      <div style="font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(message)}</div>
    </div>`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to, replyTo: email, subject, text, html });
    if (error) {
      console.error('[contact] Resend error:', error);
      return json({ error: 'send_failed' }, 502);
    }
    return json({ ok: true, id: data?.id });
  } catch (err) {
    console.error('[contact] Unexpected error:', err);
    return json({ error: 'send_failed' }, 502);
  }
};
