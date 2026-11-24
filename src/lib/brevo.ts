export interface BrevoContactInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

export function isBrevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY || import.meta.env.BREVO_API_KEY);
}

export function brevoListId(): number {
  const raw = process.env.BREVO_LIST_ID || import.meta.env.BREVO_LIST_ID || '32';
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 32;
}

/**
 * Create or update a Brevo contact and add it to the configured list.
 * `updateEnabled` makes the call idempotent when the contact already exists.
 */
export async function addContactToBrevoList(
  input: BrevoContactInput
): Promise<{ synced: boolean; reason?: string }> {
  const apiKey = process.env.BREVO_API_KEY || import.meta.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn('[brevo] BREVO_API_KEY absent — contact non ajouté à la liste.', {
      email: input.email,
    });
    return { synced: false, reason: 'BREVO_API_KEY absent.' };
  }

  const attributes: Record<string, string> = {};
  if (input.firstName?.trim()) attributes.FIRSTNAME = input.firstName.trim();
  if (input.lastName?.trim()) attributes.LASTNAME = input.lastName.trim();

  const res = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      attributes,
      listIds: [brevoListId()],
      updateEnabled: true,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[brevo] Échec de l’ajout du contact:', res.status, detail.slice(0, 1000));
    return { synced: false, reason: `Brevo ${res.status}.` };
  }

  return { synced: true };
}
