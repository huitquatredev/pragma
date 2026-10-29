export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Envoi via Resend (HTTP, sans dépendance). Sans RESEND_API_KEY, l'email est
 * journalisé et la soumission reste enregistrée — à configurer sur Vercel.
 */
export async function sendEmail(email: EmailMessage): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY || import.meta.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM ||
    import.meta.env.RESEND_FROM ||
    'Pragma Formation <onboarding@resend.dev>';
  if (!apiKey) {
    console.log('[email] RESEND_API_KEY absent — email non envoyé.', {
      to: email.to,
      subject: email.subject,
      text: email.text.slice(0, 2000),
    });
    return { sent: false, reason: 'Email non configuré (RESEND_API_KEY absent).' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[email] Échec envoi:', res.status, detail.slice(0, 1000));
    return { sent: false, reason: 'Échec de l’envoi de l’email.' };
  }
  return { sent: true };
}

/** Compatibilité avec les envois de livrables déjà câblés. */
export async function sendCoachEmail(
  email: EmailMessage
): Promise<{ sent: boolean; reason?: string }> {
  return sendEmail(email);
}

export function coachEmail(): string {
  return (
    process.env.COACH_EMAIL ||
    import.meta.env.COACH_EMAIL ||
    'huitquatre.dev@gmail.com'
  ).trim();
}

export function contactEmail(): string {
  return (
    process.env.CONTACT_EMAIL ||
    import.meta.env.CONTACT_EMAIL ||
    'bonjour@pragma-formation.fr'
  ).trim();
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
