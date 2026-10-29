import type { APIRoute } from 'astro';
import { contactEmail, escapeHtml, sendEmail } from '../../lib/email';

const SUBJECTS: Record<string, string> = {
  programme: 'Le programme',
  formules: 'Les formules et tarifs',
  suivi: 'Le suivi et la correction',
  autre: 'Autre',
};

const MAX_NAME = 80;
const MAX_EMAIL = 200;
const MAX_MESSAGE = 5000;

function read(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export const POST: APIRoute = async (context) => {
  let data: FormData;
  try {
    data = await context.request.formData();
  } catch {
    return context.redirect('/contact?erreur=champs#formulaire', 303);
  }

  const firstName = read(data, 'prenom').replace(/[\r\n]+/g, ' ');
  const email = read(data, 'email');
  const subject = read(data, 'sujet').replace(/[\r\n]+/g, ' ');
  const message = read(data, 'message');
  const honeypot = read(data, 'site');

  // Silent success for bots that fill the hidden field.
  if (honeypot) {
    return context.redirect('/contact?envoye=1#formulaire', 303);
  }

  if (
    !firstName ||
    firstName.length > MAX_NAME ||
    !email ||
    email.length > MAX_EMAIL ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !subject ||
    subject.length > 80 ||
    message.length < 10 ||
    message.length > MAX_MESSAGE
  ) {
    return context.redirect('/contact?erreur=champs#formulaire', 303);
  }

  const subjectLabel = SUBJECTS[subject] || subject;
  const receivedAt = new Date().toLocaleString('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
  const safeName = escapeHtml(firstName);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

  const result = await sendEmail({
    to: contactEmail(),
    subject: `[Pragma] Contact — ${subjectLabel} — ${firstName}`,
    html: `
      <p><strong>${safeName}</strong> &lt;${safeEmail}&gt;</p>
      <p><strong>Sujet :</strong> ${escapeHtml(subjectLabel)}</p>
      <p>${safeMessage}</p>
      <p style="color:#5b6480;font-size:12px">Reçu depuis la page contact le ${escapeHtml(receivedAt)}.</p>
    `,
    text: `Contact Pragma\n\n${firstName} <${email}>\nSujet : ${subjectLabel}\n\n${message}\n\nReçu depuis la page contact le ${receivedAt}.`,
  });

  if (!result.sent) {
    return context.redirect('/contact?erreur=envoi#formulaire', 303);
  }

  return context.redirect('/contact?envoye=1#formulaire', 303);
};
