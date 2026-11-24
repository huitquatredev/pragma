import { contactEmail, escapeHtml, sendEmail } from './email';
import { getSiteUrl, PLANS, type PaymentMode, type PlanId } from './stripe';

export interface WelcomeEmailInput {
  to: string;
  firstName: string | null;
  plan: PlanId;
  payment: PaymentMode;
  accessEndDate: Date;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export async function sendWelcomeEmail(input: WelcomeEmailInput) {
  const plan = PLANS[input.plan];
  const site = getSiteUrl();
  const loginUrl = new URL('/login', site).href;
  const logoUrl = new URL('/logo_couleur.svg', site).href;
  const supportEmail = contactEmail();
  const firstName = input.firstName?.trim();
  const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
  const paymentLabel =
    input.payment === 'monthly'
      ? `${plan.monthlyAmount} €/mois pendant ${plan.installments} mois (soit ${plan.monthlyTotal} € au total)`
      : `${plan.onceTotal} € en une fois`;
  const accessEnd = formatDate(input.accessEndDate);
  const mentorNote =
    input.plan === 'mentoree'
      ? 'Ton suivi mentoré démarre le 1er du mois suivant ton inscription. Tu pourras déposer tes livrables depuis ton espace pour recevoir une correction sous 7 jours.'
      : 'Tu avances en autonomie avec les prompts de vérification, les masterclass et le Discord Pragma.';
  const installmentNote =
    input.payment === 'monthly'
      ? `Ton paiement est réparti sur ${plan.installments} mensualités. L’abonnement s’arrête automatiquement après la ${plan.installments}e mensualité : tu n’as rien à résilier.`
      : 'Ton paiement a été réglé en une seule fois.';

  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#eef0f4;font-family:'Outfit',Arial,sans-serif;color:#0b1e4e">
    <div style="max-width:600px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border:1px solid #d8dce6;border-radius:20px;padding:32px 28px">
        <img src="${logoUrl}" alt="Pragma" width="112" style="display:block;height:auto;margin-bottom:28px">
        <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#f45844">Bienvenue chez Pragma</p>
        <h1 style="margin:0 0 18px;font-size:30px;line-height:1.1;letter-spacing:-0.03em;color:#08327d">Ta place est confirmée.</h1>
        <p style="margin:0 0 14px;font-size:16px;line-height:1.6">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 14px;font-size:16px;line-height:1.6">
          Ton paiement pour la formule <strong>${plan.label}</strong> est validé.
          Tu as accès à l’espace apprenant jusqu’au <strong>${accessEnd}</strong>.
        </p>
        <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#5b6480">${paymentLabel}. ${installmentNote}</p>
        <a href="${loginUrl}" style="display:inline-block;background:#cf4230;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:999px">Accéder à mon espace</a>
        <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#5b6480">
          Connecte-toi avec l’adresse <strong>${escapeHtml(input.to)}</strong>. Un lien de connexion te sera envoyé par email, sans mot de passe.
        </p>
        <div style="margin:26px 0 0;padding:18px 20px;background:#eef0f4;border-radius:14px">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#0b1e4e">${mentorNote}</p>
        </div>
        <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#5b6480">
          Une question ? Réponds à cet email ou écris-nous à
          <a href="mailto:${supportEmail}" style="color:#08327d;font-weight:700">${supportEmail}</a>.
        </p>
      </div>
      <p style="margin:18px 0 0;text-align:center;font-size:12px;line-height:1.5;color:#5b6480">
        Pragma — La méthode concrète pour structurer ton offre et signer tes premiers clients.
      </p>
    </div>
  </body>
</html>`;

  const text = `${greeting}

Ton paiement pour la formule ${plan.label} est validé.
Tu as accès à l’espace apprenant jusqu’au ${accessEnd}.
${paymentLabel}. ${installmentNote}

Accède à ton espace : ${loginUrl}
Connecte-toi avec l’adresse ${input.to}. Un lien de connexion te sera envoyé par email, sans mot de passe.

${mentorNote}

Une question ? Écris-nous à ${supportEmail}.

Pragma — La méthode concrète pour structurer ton offre et signer tes premiers clients.`;

  return sendEmail({
    to: input.to,
    subject: `Bienvenue dans la formation Pragma — ton accès est ouvert`,
    html,
    text,
    replyTo: supportEmail,
  });
}
