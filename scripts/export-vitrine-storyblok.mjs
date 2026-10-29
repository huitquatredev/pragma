/**
 * Exporte la vitrine Pragma dans Storyblok.
 *
 *   node --env-file=.env scripts/export-vitrine-storyblok.mjs            # dry-run
 *   node --env-file=.env scripts/export-vitrine-storyblok.mjs --apply    # crée/MAJ composants + stories + publie
 *   node --env-file=.env scripts/export-vitrine-storyblok.mjs --apply --no-publish
 *   node --env-file=.env scripts/export-vitrine-storyblok.mjs --apply --overwrite
 *
 * Les composants sont mis à jour par nom (les IDs de champs existants sont
 * conservés). Les stories existantes sont IGNORÉES par défaut : après le
 * premier import, Storyblok devient la source de vérité. --overwrite réécrit
 * les stories avec le contenu de ce script (à utiliser consciemment).
 */
import { randomBytes, randomUUID } from 'node:crypto';

const SPACE = process.env.STORYBLOK_SPACE_ID;
const TOKEN = process.env.STORYBLOK_MANAGEMENT_TOKEN;
const API = `https://mapi.storyblok.com/v1/spaces/${SPACE}`;
const APPLY = process.argv.includes('--apply');
const PUBLISH = !process.argv.includes('--no-publish');
const OVERWRITE = process.argv.includes('--overwrite');

if (!SPACE || !TOKEN) {
  console.error('STORYBLOK_SPACE_ID et STORYBLOK_MANAGEMENT_TOKEN sont requis.');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: TOKEN,
};

const sleep = (ms = 260) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path, options = {}, attempt = 0) {
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const text = await res.text();
  if (res.status === 429 && attempt < 8) {
    const retryAfter = Number(res.headers.get('retry-after') || 0);
    const wait = Math.max(retryAfter * 1000, 450 * (attempt + 1));
    console.log(`  … rate limit, nouvelle tentative dans ${wait} ms`);
    await sleep(wait);
    return api(path, options, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${path} -> ${res.status} ${text.slice(0, 1200)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function listAllStories() {
  const all = [];
  for (let page = 1; ; page += 1) {
    const data = await api(`/stories?per_page=100&page=${page}&with_summary=true`);
    all.push(...(data.stories ?? []));
    if ((data.stories ?? []).length < 100) break;
  }
  return all;
}

async function listComponents() {
  const data = await api('/components?per_page=100');
  return data.components ?? [];
}

const fieldId = () => randomBytes(16).toString('base64url').slice(0, 22);

// ---------------------------------------------------------------------------
// Schémas
// ---------------------------------------------------------------------------

const text = (display_name) => ({ type: 'text', display_name });
const area = (display_name) => ({ type: 'textarea', display_name });
const rich = (display_name) => ({ type: 'richtext', display_name });
const bool = (display_name) => ({ type: 'boolean', display_name });
const asset = (display_name) => ({ type: 'asset', display_name, filetypes: ['images'] });
const option = (display_name, datasource_slug) => ({
  type: 'option',
  display_name,
  source: 'internal',
  datasource_slug,
  use_uuid: false,
});
const blocks = (display_name, whitelist) => ({
  type: 'bloks',
  display_name,
  restrict_components: true,
  component_whitelist: whitelist,
});
const multilink = (display_name) => ({
  type: 'multilink',
  display_name,
  restrict_content_types: false,
});

const componentDefs = [
  {
    name: 'vitrine_fact',
    display: 'Chiffre clé',
    preview: 'label',
    fields: {
      value: text('Valeur'),
      label: text('Libellé'),
    },
  },
  {
    name: 'vitrine_plan_item',
    display: 'Étape du plan',
    preview: 'label',
    fields: {
      number: text('Numéro'),
      label: text('Libellé'),
      highlight: bool('Mettre en avant'),
    },
  },
  {
    name: 'vitrine_plan',
    display: 'Plan des étapes',
    preview: 'top_left',
    fields: {
      top_left: text('Titre haut gauche'),
      top_right: text('Métadonnée haut droite'),
      items: blocks('Étapes', ['vitrine_plan_item']),
      foot_left: text('Pied gauche'),
      foot_right: text('Pied droite'),
    },
  },
  {
    name: 'vitrine_hero',
    display: 'Hero',
    preview: 'title',
    fields: {
      eyebrow: text('Surtitre'),
      title: text('Titre'),
      accent: text('Suite du titre en corail'),
      lede: area('Accroche'),
      primary_label: text('CTA principal — libellé'),
      primary_link: multilink('CTA principal — lien'),
      secondary_label: text('CTA secondaire — libellé'),
      secondary_link: multilink('CTA secondaire — lien'),
      note: text('Note sous les CTA'),
      facts_label: text('Titre du bandeau de chiffres'),
      facts: blocks('Chiffres clés', ['vitrine_fact']),
      plan: blocks('Plan (optionnel)', ['vitrine_plan']),
    },
  },
  {
    name: 'vitrine_text_section',
    display: 'Section texte',
    preview: 'title',
    fields: {
      eyebrow: text('Surtitre'),
      title: text('Titre'),
      note: area('Encadré corail'),
      body: rich('Texte'),
      list_items: area('Liste (une ligne par item)'),
      variant: option('Variante', 'vitrine_text_variants'),
      rail_label: text('Libellé du rail'),
      rail_items: area('Rail (une ligne par item)'),
      anchor: text('Ancre HTML'),
    },
  },
  {
    name: 'vitrine_card',
    display: 'Carte',
    preview: 'title',
    fields: {
      title: text('Titre'),
      text: area('Texte'),
      quote: area('Citation (carte)'),
      name: text('Nom (citation)'),
      role: text('Rôle (citation)'),
      result: text('Résultat (citation)'),
      proof: bool('Mettre en avant (objection)'),
      number: text('Numéro optionnel'),
    },
  },
  {
    name: 'vitrine_cards',
    display: 'Section cartes',
    preview: 'title',
    fields: {
      eyebrow: text('Surtitre'),
      title: text('Titre'),
      intro: area('Introduction'),
      variant: option('Variante', 'vitrine_cards_variants'),
      cards: blocks('Cartes', ['vitrine_card']),
      quote: area('Citation de section (optionnelle)'),
      quote_name: text('Nom de la citation'),
      quote_role: area('Rôle de la citation'),
      anchor: text('Ancre HTML'),
    },
  },
  {
    name: 'vitrine_programme_band',
    display: 'Bandeau programme',
    preview: 'title',
    fields: {
      eyebrow: text('Surtitre'),
      title: text('Titre'),
      text: area('Texte'),
      outcomes: area('Livrables (une ligne par item)'),
      cta_label: text('CTA — libellé'),
      cta_link: multilink('CTA — lien'),
      anchor: text('Ancre HTML'),
    },
  },
  {
    name: 'vitrine_part',
    display: 'Partie du programme',
    preview: 'title',
    fields: {
      title: text('Titre'),
      text: area('Description'),
      deliverable: text('Livrable'),
    },
  },
  {
    name: 'vitrine_parts',
    display: 'Liste des parties',
    preview: 'title',
    fields: {
      eyebrow: text('Surtitre'),
      title: text('Titre'),
      intro: area('Introduction'),
      cta_label: text('CTA — libellé'),
      cta_link: multilink('CTA — lien'),
      parts: blocks('Parties', ['vitrine_part']),
      anchor: text('Ancre HTML'),
    },
  },
  {
    name: 'vitrine_price',
    display: 'Carte formule',
    preview: 'name',
    fields: {
      name: text('Nom de la formule'),
      lede: area('Accroche'),
      price: text('Prix'),
      price_note: text('Précision de prix'),
      badge: text('Badge'),
      features: area('Inclus (une ligne par item)'),
      cta_label: text('CTA — libellé'),
      cta_link: multilink('CTA — lien'),
      featured: bool('Mettre en avant'),
    },
  },
  {
    name: 'vitrine_pricing',
    display: 'Formules',
    preview: 'title',
    fields: {
      eyebrow: text('Surtitre'),
      title: text('Titre'),
      intro: area('Introduction'),
      note: area('Note sous les cartes'),
      cards: blocks('Formules', ['vitrine_price']),
      anchor: text('Ancre HTML'),
    },
  },
  {
    name: 'vitrine_faq_item',
    display: 'Question FAQ',
    preview: 'question',
    fields: {
      question: text('Question'),
      answer: rich('Réponse'),
    },
  },
  {
    name: 'vitrine_faq',
    display: 'FAQ',
    preview: 'title',
    fields: {
      eyebrow: text('Surtitre'),
      title: text('Titre'),
      items: blocks('Questions', ['vitrine_faq_item']),
      anchor: text('Ancre HTML'),
    },
  },
  {
    name: 'vitrine_person',
    display: 'Personne',
    preview: 'name',
    fields: {
      initials: text('Initiales'),
      name: text('Nom'),
      role: text('Rôle'),
      tags: area('Spécialités (une ligne par item)'),
      bio: rich('Biographie'),
      index: text('Numéro optionnel'),
    },
  },
  {
    name: 'vitrine_team',
    display: 'Équipe',
    preview: 'title',
    fields: {
      eyebrow: text('Surtitre'),
      title: text('Titre'),
      intro: area('Introduction'),
      link_label: text('Lien — libellé'),
      link_url: multilink('Lien — URL'),
      foot: area('Note de bas de section'),
      variant: option('Variante', 'vitrine_team_variants'),
      people: blocks('Personnes', ['vitrine_person']),
      anchor: text('Ancre HTML'),
    },
  },
  {
    name: 'vitrine_cta',
    display: 'CTA final',
    preview: 'title',
    fields: {
      title: text('Titre'),
      text: area('Texte'),
      primary_label: text('CTA principal — libellé'),
      primary_link: multilink('CTA principal — lien'),
      secondary_label: text('CTA secondaire — libellé'),
      secondary_link: multilink('CTA secondaire — lien'),
      wide: bool('Actions larges'),
      anchor: text('Ancre HTML'),
    },
  },
  {
    name: 'vitrine_subject',
    display: 'Sujet de contact',
    preview: 'label',
    fields: {
      label: text('Libellé'),
      value: text('Valeur'),
    },
  },
  {
    name: 'vitrine_contact',
    display: 'Bloc contact',
    preview: 'form_title',
    fields: {
      form_eyebrow: text('Formulaire — surtitre'),
      form_title: text('Formulaire — titre'),
      success_message: text('Message de succès'),
      error_message: text('Message d’erreur de validation'),
      send_error_message: text('Message d’erreur d’envoi (avant l’email)'),
      first_name_label: text('Champ prénom'),
      email_label: text('Champ email'),
      subject_label: text('Champ sujet'),
      message_label: text('Champ message'),
      submit_label: text('Bouton envoyer'),
      subjects: blocks('Sujets', ['vitrine_subject']),
      note: text('Note sous le bouton'),
      aside_eyebrow: text('Encart appel — surtitre'),
      aside_title: text('Encart appel — titre'),
      aside_text: area('Encart appel — texte'),
      aside_cta_label: text('Encart appel — CTA'),
      aside_cta_link: multilink('Encart appel — lien'),
      contact_eyebrow: text('Encart email — surtitre'),
      contact_note: text('Encart email — note'),
      email: text('Adresse email'),
      anchor: text('Ancre HTML'),
    },
  },
  {
    name: 'vitrine_notfound',
    display: 'Bloc 404',
    preview: 'title',
    fields: {
      eyebrow: text('Surtitre'),
      title: text('Titre'),
      text: area('Texte'),
      note: text('Note en bas'),
      primary_label: text('CTA principal — libellé'),
      primary_link: multilink('CTA principal — lien'),
      secondary_label: text('CTA secondaire — libellé'),
      secondary_link: multilink('CTA secondaire — lien'),
      tertiary_label: text('CTA tertiaire — libellé'),
      tertiary_link: multilink('CTA tertiaire — lien'),
      visual_top_left: text('Visuel — haut gauche'),
      visual_top_right: text('Visuel — haut droite'),
      visual_code: text('Visuel — code'),
      visual_foot_left: text('Visuel — bas gauche'),
      visual_foot_right: text('Visuel — bas droite'),
    },
  },
  {
    name: 'vitrine_page',
    display: 'Page vitrine',
    preview: 'title',
    fields: {
      title: text('Balise title'),
      description: area('Meta description'),
      canonical: multilink('URL canonique'),
      robots: text('Balise robots'),
      og_image: asset('Image Open Graph'),
      schema: area('Données structurées JSON-LD'),
      cta_label: text('CTA header — libellé'),
      cta_link: multilink('CTA header — lien'),
      sitemap: bool('Inclure dans le sitemap'),
      body: blocks('Contenu de la page', [
        'vitrine_hero',
        'vitrine_text_section',
        'vitrine_cards',
        'vitrine_programme_band',
        'vitrine_parts',
        'vitrine_pricing',
        'vitrine_faq',
        'vitrine_team',
        'vitrine_cta',
        'vitrine_contact',
        'vitrine_notfound',
      ]),
    },
  },
];

const datasourceDefs = [
  {
    name: 'Vitrine — sections texte',
    slug: 'vitrine_text_variants',
    entries: [
      ['Deux colonnes', 'split'],
      ['Méthode avec rail', 'method'],
    ],
  },
  {
    name: 'Vitrine — sections cartes',
    slug: 'vitrine_cards_variants',
    entries: [
      ['Étapes', 'steps'],
      ['Principes', 'principles'],
      ['Citations', 'quotes'],
      ['Objections', 'objections'],
    ],
  },
  {
    name: 'Vitrine — équipe',
    slug: 'vitrine_team_variants',
    entries: [
      ['Compacte', 'compact'],
      ['Grille', 'grid'],
      ['Mentors', 'mentors'],
      ['Soutien', 'support'],
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers de contenu
// ---------------------------------------------------------------------------

const U = () => randomUUID();
const P = (textValue) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: textValue }] }],
});
const RT = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((paragraph) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: paragraph }],
  })),
});
const L = (url) => ({
  url,
  cached_url: url,
  linktype: 'url',
  fieldtype: 'multilink',
});
const blok = (component, fields = {}) => ({ _uid: U(), component, ...fields });
const fact = (value, label) => blok('vitrine_fact', { value, label });
const person = (initials, name, role, extra = {}) =>
  blok('vitrine_person', { initials, name, role, ...extra });

const plan = blok('vitrine_plan', {
  top_left: 'Plan de construction',
  top_right: '9 étapes · 18 mois',
  items: [
    ['01', 'Marché'],
    ['02', 'Offre & tarifs'],
    ['03', 'Marque'],
    ['04', 'Tunnel'],
    ['05', 'Site'],
    ['06', 'Capture'],
    ['07', 'Trafic'],
    ['08', 'Micro-entreprise'],
    ['09', 'Prospection', true],
  ].map(([number, label, highlight]) =>
    blok('vitrine_plan_item', { number, label, highlight: Boolean(highlight) })
  ),
  foot_left: 'Le plan avant les briques.',
  foot_right: '300 h',
});

const page = ({ title, description, robots = 'all', ctaLabel, ctaHref, body, sitemap = true }) => ({
  component: 'vitrine_page',
  _uid: U(),
  title,
  description,
  robots,
  cta_label: ctaLabel,
  cta_link: L(ctaHref),
  sitemap,
  body,
});

// ---------------------------------------------------------------------------
// Contenus
// ---------------------------------------------------------------------------

const home = page({
  title: 'Pragma, de salarié à freelance sans quitter ton poste',
  description:
    'Méthode en 9 étapes pour structurer ton offre et signer tes premiers clients. 4h/semaine · 18 mois · Espace privé et Discord · Prompts de vérification et mentorat',
  ctaLabel: 'Me connecter à mon espace',
  ctaHref: '/login',
  body: [
    blok('vitrine_hero', {
      eyebrow: 'Formation · De salarié à freelance',
      title: 'Structure une offre qui se vend ',
      accent: 'sans quitter ton poste.',
      lede: 'Méthode en 9 étapes pour valider ton offre et signer tes premiers clients le soir et le week-end. Cours à ton rythme, prompts de vérification inclus, correction en plus en mentorée.',
      primary_label: 'Je construis mon activité',
      primary_link: L('/contact'),
      secondary_label: 'Voir les 9 étapes',
      secondary_link: L('#programme'),
      note: 'Accès 18 mois · 5 places mentorées par mois · Essai 14 jours possible',
      facts_label: 'Pragma en chiffres',
      facts: [
        fact('9', 'étapes, 1 livrable concret à chaque fois'),
        fact('4 h', 'par semaine, le soir ou le week-end'),
        fact('18 mois', 'd’accès à la méthode et à l’espace privé'),
        fact('7 j', 'pour la correction de ton livrable en mentorée'),
      ],
      plan: [plan],
    }),
    blok('vitrine_text_section', {
      eyebrow: 'Le constat',
      title: 'Tu ne veux pas faire 20 ans de plus comme ça',
      note: 'Tu veux retrouver le contrôle sur ce que tu fais, sans quitter la sécurité de ton poste.',
      body: RT(
        'Tu n’as plus envie de te lever le matin. Ton travail te passionne autant qu’il t’épuise. Tu suis des processus absurdes.',
        'Tester une première version de ton offre et signer tes premiers clients, avant de rompre ton contrat : c’est possible. Aujourd’hui, trois choses te manquent encore.'
      ),
      list_items:
        'Tu n’es pas autonome en communication.\nTu n’as pas la vision complète du job d’entrepreneur.\nLe marketing digital reste flou pour toi.',
      variant: 'split',
      anchor: 'constat',
    }),
    blok('vitrine_text_section', {
      eyebrow: 'La méthode',
      title: 'Une méthode complète qui mène à des clients, pas juste des cours',
      body: RT(
        'Pragma te fait construire ton activité dans l’ordre : marché, offre et tarifs, marque, tunnel, site, capture, trafic, micro-entreprise, prospection. Tu suis ta progression sur ton espace privé. Chaque partie finit par un livrable concret.',
        'La méthode est explicite et des prompts IA t’aident à vérifier seul avant de valider. En mentorée, un formateur corrige en plus ton livrable. Tu sais quoi garder et quoi retravailler avant la suite.'
      ),
      variant: 'method',
      rail_label: 'Les 9 parties du programme',
      rail_items:
        'Marché\nOffre & tarifs\nMarque\nTunnel\nSite\nCapture\nTrafic\nMicro-entreprise\nProspection',
      anchor: 'methode',
    }),
    blok('vitrine_cards', {
      eyebrow: 'Le rythme',
      title: 'Tu avances sans t’éparpiller',
      variant: 'steps',
      cards: [
        blok('vitrine_card', {
          title: 'Tu construis',
          text: 'Tu suis le cours et tu remplis les formulaires, ton livrable se construit au fil de l’eau.',
        }),
        blok('vitrine_card', {
          title: 'Tu vérifies',
          text: 'Tu déposes ton livrable en fin de partie. En autonome tu vérifies avec les prompts, en mentorée tu reçois une correction.',
        }),
        blok('vitrine_card', {
          title: 'Tu avances',
          text: 'Tu passes à la partie suivante avec une base validée, jusqu’à tes premiers clients.',
        }),
      ],
      anchor: 'rythme',
    }),
    blok('vitrine_programme_band', {
      eyebrow: 'Le programme',
      title: 'Ton programme en 9 étapes',
      text: 'Tu repars avec ton étude validée, ta grille de tarifs, ton identité de marque, ton tunnel cartographié, ton site en ligne, ta capture automatisée, ton plan trafic 90 jours, ta micro-entreprise créée, et tes premiers prospects contactés.',
      outcomes:
        'Ton étude de marché validée\nTa grille de tarifs\nTon identité de marque\nTon tunnel cartographié\nTon site en ligne\nTa capture automatisée\nTon plan trafic 90 jours\nTa micro-entreprise créée\nTes premiers prospects contactés',
      cta_label: 'Voir le programme détaillé avec les livrables',
      cta_link: L('/programme'),
      anchor: 'programme',
    }),
    blok('vitrine_cards', {
      eyebrow: 'Elles l’ont fait',
      title: 'De l’idée aux premiers clients',
      variant: 'quotes',
      cards: [
        blok('vitrine_card', {
          quote: 'Je me sens beaucoup plus légitime pour vendre.',
          name: 'Stéphanie Gorostégui',
          role: 'Salariée à temps plein, consultante IA',
        }),
        blok('vitrine_card', {
          quote: 'J’ai gagné en clarté et en stratégie pour me lancer.',
          name: 'Florence Desenne',
          role: 'Ex-enseignante, travel planner — Flowlidays',
          result: '5 pages en ligne · 4 demandes de devis en 6 semaines',
        }),
        blok('vitrine_card', {
          quote: 'J’ai avancé avec des repères clairs et une vraie montée en compétences.',
          name: 'Audrey B.',
          role: 'Ex-enseignante, développeuse web — Pas à Page',
          result: 'Premier contrat un mois après le lancement',
        }),
      ],
      anchor: 'preuves',
    }),
    blok('vitrine_cards', {
      eyebrow: 'Les questions que tu te poses',
      title: 'Et si ton poste, ton temps ou tes doutes te retenaient ?',
      variant: 'objections',
      cards: [
        blok('vitrine_card', {
          title: 'Et si je n’ai pas le temps avec mon poste ?',
          text: 'Pragma représente environ 300 h au total, soit environ 4 h par semaine sur 18 mois.',
        }),
        blok('vitrine_card', {
          title: 'Et si je ne vais pas au bout ?',
          text: 'Tu avances par livrables, avec un suivi clair et la communauté. En mentorée, ton livrable déposé est corrigé sous 7 jours, sinon ton accès est prolongé d’autant.\n\nSi tu t’arrêtes 3 semaines, tu repars avec un plan de reprise.',
        }),
        blok('vitrine_card', {
          title: 'Est-ce que ça marche si je suis la méthode ?',
          text: 'Tu suis une méthode complète, de l’analyse de ton marché à la signature de tes premiers contrats. Ici, il n’y a pas de promesse magique.',
          quote:
            'Flowlidays : 5 pages en ligne et 4 demandes de devis en 6 semaines. Audrey a signé son premier contrat un mois après le lancement de son site.',
          proof: true,
        }),
        blok('vitrine_card', {
          title: 'Et le cumul salarié freelance ?',
          text: 'Tu avances dans les règles. Tu sais ce que tu peux cumuler, ce que dit ta clause d’exclusivité, et comment préparer ta rupture et tes droits. Tu valides ton activité sans quitter ton travail.',
        }),
      ],
      anchor: 'objections',
    }),
    blok('vitrine_pricing', {
      eyebrow: 'Les formules',
      title: 'Choisis ta formule',
      intro:
        'Tu repars avec 9 livrables, ton site en ligne et tes premiers prospects contactés. 300 h de méthode et 18 mois pour avancer à ton rythme.',
      note: 'Tarifs Early Tickets 2026. +100 € dès 2027. Accès 18 mois dès l’inscription. Le suivi mentoré démarre le 1er du mois suivant, dans la limite de 5 places par mois.',
      cards: [
        blok('vitrine_price', {
          name: 'Autonome',
          lede: 'Pour avancer en indépendance. Tu embarques quand c’est le moment pour toi.',
          price: '490 €',
          price_note: 'en une fois · Early Tickets 2026',
          features:
            'Les 9 parties du programme et ses mises à jour\nLes prompts de vérification pour avancer seul\nLes masterclass en direct avec replay\nLa communauté Discord Pragma',
          cta_label: 'Je construis mon activité',
          cta_link: L('/contact'),
        }),
        blok('vitrine_price', {
          name: 'Mentorée',
          lede: 'Pour un suivi fiable sur chaque décision. 5 places par mois pour garantir la correction sous 7 jours.',
          price: '2 190 €',
          price_note: 'ou 575 € x 4 sous 90 jours',
          badge: 'Recommandée · 5 places/mois',
          features:
            'Tout le contenu Autonome inclus\nLa correction de chaque livrable sous 7 jours, en audio et vidéo\n2 permanences par mois avec un formateur\nUn plan de reprise de 30 min si tu t’arrêtes 3 semaines',
          cta_label: 'Je construis mon activité',
          cta_link: L('/contact'),
          featured: true,
        }),
      ],
      anchor: 'formules',
    }),
    blok('vitrine_team', {
      eyebrow: 'L’équipe',
      title: 'Tu n’avances pas en solo.',
      intro:
        'Une fondatrice qui corrige, une spécialiste storytelling publiée chez Eyrolles, un développeur web senior et 4 mentors passés par Pragma.',
      link_label: 'Découvrir l’équipe et les mentors',
      link_url: L('/equipe'),
      variant: 'compact',
      people: [
        person('MF', 'Manon Fayard', 'Communication et vente'),
        person('CG', 'Camille Gillet', 'Storytelling de marque'),
        person('JF', 'Julien Fayard', 'Site et identité visuelle'),
        person(
          '4',
          'Aurélie, Nathalie, Stéphanie et Jennifer',
          'Mentors ex-élèves — correction et Discord'
        ),
      ],
      anchor: 'equipe',
    }),
    blok('vitrine_faq', {
      eyebrow: 'FAQ',
      title: 'Questions fréquentes',
      items: [
        blok('vitrine_faq_item', {
          question: 'Quelle différence entre Autonome et Mentorée ?',
          answer: RT(
            'En Autonome tu avances avec la méthode, les prompts de vérification, les masterclass et le Discord. En Mentorée, tu as en plus la correction de chaque livrable et 2 permanences par mois, dans la limite de 5 places par mois.'
          ),
        }),
        blok('vitrine_faq_item', {
          question: 'Combien de temps ai-je accès ?',
          answer: RT(
            'Tu as un accès de 18 mois dès ton inscription. Si tu as validé 7 parties, tu peux prolonger 6 mois pour 490 €, avec permanences Discord, masterclass et correction de tes 2 derniers livrables.'
          ),
        }),
        blok('vitrine_faq_item', {
          question: 'Faut-il être à l’aise avec le digital ?',
          answer: RT(
            'Tu dois utiliser un intranet et des outils en ligne au quotidien. Si tu es très éloigné du digital, Pragma n’est pas adapté.'
          ),
        }),
        blok('vitrine_faq_item', {
          question: 'Et si je prends du retard ?',
          answer: RT(
            'Tu avances à ton rythme pendant 18 mois. Si tu t’arrêtes 3 semaines en mentorée, tu repars avec un plan de reprise.'
          ),
        }),
        blok('vitrine_faq_item', {
          question: 'Puis-je me faire rembourser ?',
          answer: RT(
            'Option 1 — Accès immédiat, sans rétractation. Tu as accès à tout Pragma dès ton inscription. Tu coches explicitement que tu renonces à ton délai de rétractation de 14 jours pour un contenu numérique fourni immédiatement. Passé ce cap, aucun remboursement n’est possible.',
            'Option 2 — Accès progressif avec essai de 14 jours. Tu as accès au premier module pendant 14 jours pour essayer. Si tu te rétractes dans ce délai, tu es remboursé intégralement. Passé 14 jours ou accès au module 2, aucun remboursement n’est possible.'
          ),
        }),
        blok('vitrine_faq_item', {
          question: 'Quand commence la Mentorée ?',
          answer: RT(
            'Tu as accès aux cours dès ton inscription. Ton suivi mentoré démarre le 1er du mois suivant, avec 5 places maximum par mois. Si le mois est complet, tu sécurises aujourd’hui ta place pour le mois prochain.'
          ),
        }),
      ],
      anchor: 'faq',
    }),
    blok('vitrine_cta', {
      title: 'Construis maintenant, lance-toi quand c’est prêt.',
      text: 'Tu développes ton activité en toute sécurité, à ton rythme, sans quitter ton poste.',
      primary_label: 'Je construis mon activité',
      primary_link: L('/contact'),
      secondary_label: 'Voir le programme détaillé',
      secondary_link: L('/programme'),
    }),
  ],
});

const equipe = page({
  title: 'L’équipe Pragma — Manon, Camille, Julien et tes mentors',
  description:
    'Manon pour ton positionnement, Camille pour ton storytelling, Julien pour ton site, 4 mentors ex-élèves pour corriger chaque livrable sous 7 jours en mentorée.',
  ctaLabel: 'Me connecter à mon espace',
  ctaHref: '/login',
  body: [
    blok('vitrine_hero', {
      eyebrow: 'L’équipe Pragma',
      title: 'Tu n’avances pas en solo. ',
      accent: 'Voici ton équipe.',
      lede: 'Une fondatrice qui corrige, une spécialiste storytelling publiée chez Eyrolles, un développeur web senior, 4 mentors passés par Pragma et un soutien pour garder le cap.',
      primary_label: 'Découvrir le programme en 9 parties',
      primary_link: L('/programme'),
      secondary_label: 'Réserver un appel découverte',
      secondary_link: L('/contact'),
      facts_label: 'L’équipe Pragma en chiffres',
      facts: [
        fact('3', 'formatrices et formateurs'),
        fact('4', 'mentors ex-élèves'),
        fact('1', 'soutien bien-être'),
        fact('7 j', 'de correction en mentorée'),
      ],
    }),
    blok('vitrine_team', {
      eyebrow: 'Formation',
      title: 'Ton équipe de formation',
      intro: 'Trois regards complémentaires sur ton positionnement, ton récit et ton site.',
      variant: 'grid',
      people: [
        person('MF', 'Manon Fayard', 'Communication et vente', {
          tags: 'Fondatrice\nPositionnement',
          bio: RT(
            'Fondatrice et conceptrice de Pragma. Plus de 70 entreprises accompagnées sur leur positionnement et leurs contenus, avec une vision terrain issue de 8 ans de missions réelles.',
            'Ex-professeure des écoles reconvertie, pédagogie directe et orientée action. Avec elle, tu clarifies qui tu aides, tu structures une offre qui se vend et tu sais quelle est la prochaine étape.'
          ),
        }),
        person('CG', 'Camille Gillet', 'Storytelling de marque', {
          tags: 'Storytelling\nMarque',
          bio: RT(
            'Auteure du Pouvoir du storytelling chez Eyrolles, freelance depuis 11 ans, ex-intervenante en Master 2 à Lyon Lumière. C’est la référence du récit de marque en France.',
            'Avec elle, tu trouves ton pourquoi, tes valeurs et ton archétype, puis tu construis le récit de ta page à propos, de ton site et de tes réseaux.'
          ),
        }),
        person('JF', 'Julien Fayard', 'Site et identité visuelle', {
          tags: 'Site\nIdentité visuelle',
          bio: RT(
            'Fondateur de Fyrd Instruments et du studio huitquatre, ex-chercheur à l’INRA. Des sites beaux, une UX soignée, des packagings produit et des fonctionnalités avancées quand ton projet l’exige.',
            'Avec lui, tu mets en ligne des pages rapides qui se trouvent sur Google et guident vers le contact, avec un brief propre si tu délègues.'
          ),
        }),
      ],
      anchor: 'formation',
    }),
    blok('vitrine_team', {
      eyebrow: 'Mentorat',
      title: 'Ton mentorat au quotidien',
      intro:
        'Quatre mentors passés par Pragma, présents pour corriger, débloquer et garder le cap.',
      variant: 'mentors',
      people: [
        person('AT', 'Aurélie Trémion', 'Positionnement et Alignement', {
          bio: RT(
            'Spécialiste reconversion, Ikigaï et clarté de l’offre. Avec elle, tu valides que ton projet correspond à la vie voulue et tu clarifies ta cible et ton offre quand tu hésites. Pour toi si tu te disperses ou tu doutes de la direction.'
          ),
        }),
        person('NB', 'Nathalie Blanc', 'SEO et Stratégie éditoriale', {
          bio: RT(
            'Correctrice et content manager freelance spécialisée en SEO. Avec elle, tu débloques mots-clés, pages web et articles, avec correction orthographique incluse. Pour toi si la technique SEO ou la rédaction te freine.'
          ),
        }),
        person('SG', 'Stéphanie Gorostégui', 'IA et automatisation', {
          bio: RT(
            'Salariée en ESN et consultante IA freelance, spécialiste outils et automatisation. Elle cumule freelancing et salariat, comme toi. Avec elle, tu prends en main les outils de la méthode, tu automatises avec l’IA et tu débloques ce qui coince. Pour toi si la technique te ralentit.'
          ),
        }),
        person('JA', 'Jennifer Alleaume', 'Organisation et parentalité', {
          bio: RT(
            'Content manager spécialisée enfance. Avec elle, tu organises ton travail du soir et du week-end et tu avances sur ton projet tout en gérant ta vie de parent à côté de ton emploi. Pour toi si tu veux un rythme tenable et une oreille qui comprend la charge mentale.'
          ),
        }),
      ],
      anchor: 'mentorat',
    }),
    blok('vitrine_team', {
      eyebrow: 'Soutien',
      title: 'Ton soutien et ta motivation',
      intro: 'Une présence pour ton bien-être et ta motivation, tout au long du parcours.',
      variant: 'support',
      people: [
        person('CP', 'Cécile Paulin', 'Cap et Motivation', {
          bio: RT(
            'Doula et masseuse, fondatrice de La Parent’elle à Mazan. Elle intervient pour ton bien-être et ta motivation tout au long du parcours.'
          ),
        }),
      ],
      anchor: 'soutien',
    }),
    blok('vitrine_cta', {
      title: 'Il ne manque plus que ton projet.',
      text: '9 parties, 1 livrable concret à chaque étape, 4 h par semaine à côté de ton emploi.',
      primary_label: 'Voir le programme',
      primary_link: L('/programme'),
      secondary_label: 'Réserver un appel',
      secondary_link: L('/contact'),
    }),
  ],
});

const programme = page({
  title: 'Pragma en 9 parties : de ton expertise aux premiers clients',
  description:
    'Détail des 9 parties Pragma, correction sous 7 jours en mentorée, 4 h par semaine à côté de l’emploi, accès 18 mois. Appel découverte sur demande',
  ctaLabel: 'Me connecter à mon espace',
  ctaHref: '/login',
  body: [
    blok('vitrine_hero', {
      eyebrow: 'Le programme',
      title: 'Le programme en ',
      accent: '9 étapes',
      lede: 'Tu suis la méthode appliquée à ton projet, avec 1 livrable vérifié à chaque étape, et corrigé par un formateur si tu es en mentorée. 4 heures par semaine à côté de ton emploi, accès 18 mois. Tu peux cumuler durablement, tu n’es pas obligé de quitter ton poste.',
      primary_label: 'Réserver un appel découverte',
      primary_link: L('/contact'),
      secondary_label: 'Voir les formules',
      secondary_link: L('#formules'),
      facts_label: 'Le programme en chiffres',
      facts: [
        fact('9', 'parties, 1 livrable à chaque étape'),
        fact('100 %', 'asynchrone, à ton rythme'),
        fact('7 j', 'de correction en mentorée'),
        fact('18 mois', 'd’accès à la plateforme'),
      ],
    }),
    blok('vitrine_parts', {
      eyebrow: 'Le contenu',
      title: 'Les 9 parties du programme',
      intro: 'Le détail module par module est présenté en appel découverte.',
      cta_label: 'Réserver un appel découverte',
      cta_link: L('/contact'),
      parts: [
        [
          'Réaliser ton étude de marché',
          'Tu sors avec tes segments et tes entretiens terrain analysés.',
          'Synthèse d’enquête corrigée',
        ],
        [
          'Construire ton offre et fixer tes tarifs',
          'Tu construis ton persona, ta proposition de valeur et ton TJM testé sur le marché.',
          'Offre et grille tarifaire corrigées',
        ],
        [
          'Créer ton identité de marque',
          'Tu construis ton storytelling, ta charte éditoriale et ton brief graphiste.',
          'ADN, ligne éditoriale et charte corrigés',
        ],
        [
          'Cartographier ton tunnel d’acquisition',
          'Tu visualises ton écosystème et ton parcours client de bout en bout.',
          'Ton tunnel en 1 page',
        ],
        [
          'Rédiger et optimiser ton site internet',
          'Tu mets en ligne une landing, une page à propos et une home qui convertissent et se trouvent sur Google.',
          '3 pages corrigées',
        ],
        [
          'Automatiser ta capture de prospects',
          'Tu installes ton diagnostic, tes pages et tes emails automatisés sur Brevo.',
          'Tunnel et séquence corrigés',
        ],
        [
          'Propulser ton trafic et ton autorité',
          'Tu publies ton premier article, tu planifies tes réseaux et ta newsletter, tu actives presse et partenariats.',
          'Stratégies et productions corrigées',
        ],
        [
          'Créer et gérer ta micro-entreprise',
          'Tu immatricules, tu factures et tu gères URSSAF, TVA et impôts sans stress, avec le cadre légal pour cumuler sereinement.',
          'Dossier administratif vérifié',
        ],
        [
          'Prospecter et signer tes premiers clients',
          'Tu constitues ton fichier, tu pitches, tu mènes ton call méthode SPIN et tu closes.',
          'Script et proposition commerciale corrigés',
        ],
      ].map(([title, textValue, deliverable]) =>
        blok('vitrine_part', { title, text: textValue, deliverable })
      ),
      anchor: 'parties',
    }),
    blok('vitrine_cards', {
      eyebrow: 'La méthode',
      title: 'Une méthode pour construire dans le bon ordre',
      intro: 'Six principes pour avancer sans t’éparpiller.',
      variant: 'principles',
      cards: [
        blok('vitrine_card', {
          title: 'Le plan avant les briques',
          text: 'Tu visualises d’abord l’ensemble de ton écosystème, puis tu poses les fondations une par une, avant de passer aux actions simples. Tu sais toujours où s’insère ce que tu fais.',
        }),
        blok('vitrine_card', {
          title: 'La conversion avant le trafic',
          text: 'Tu construis d’abord tes pages où l’on achète, puis ton diagnostic et tes emails pour amener vers l’offre, puis blog, réseaux et partenariats pour attirer. Ton trafic arrive sur une base prête à convertir.',
        }),
        blok('vitrine_card', {
          title: 'Un écosystème, pas un tunnel isolé',
          text: 'Offre, marque, site, blog, diagnostic, emails, réseaux et newsletter reliés entre eux. Le prospect entre par où il veut et trouve un chemin vers l’action.',
        }),
        blok('vitrine_card', {
          title: 'Une routine de travail simple',
          text: 'Pense, construis, mesure, itère. Tu poses la stratégie, tu crées, tu lis les chiffres Search Console et Brevo, tu corriges.',
        }),
        blok('vitrine_card', {
          title: 'Deux fils rouges suivis tout au long',
          text: 'Léa, consultante IA B2B, et Thomas, boutique écoresponsable B2C. Tu vois la méthode appliquée avant de l’appliquer à ton projet.',
        }),
        blok('vitrine_card', {
          title: 'À tes côtés',
          text: 'Manon pour le positionnement, Camille pour le storytelling, Julien pour le site, 4 mentors ex-élèves pour la correction, le cap et la motivation.',
        }),
      ],
      quote: 'J’ai avancé avec des repères clairs et une vraie montée en compétences.',
      quote_name: 'Audrey B.',
      quote_role:
        'Ex-enseignante, développeuse web — Pas à Page. Premier contrat un mois après le lancement de son site.',
      anchor: 'methode',
    }),
    blok('vitrine_pricing', {
      eyebrow: 'Les formules',
      title: 'Un même programme, deux niveaux de suivi',
      intro: 'Early Tickets jusqu’au 31 décembre 2026. +100 € dès le 1er janvier 2027.',
      cards: [
        blok('vitrine_price', {
          name: 'Autonome',
          lede: 'Pour avancer en indépendance, quand c’est le moment pour toi.',
          price: '490 €',
          price_note: 'en une fois',
          features:
            'Les 9 parties du programme\nLes prompts de vérification\nLa communauté d’élèves\nLes masterclass incluses\nUn accès de 18 mois',
          cta_label: 'Je construis mon activité',
          cta_link: L('/contact'),
        }),
        blok('vitrine_price', {
          name: 'Mentorée',
          lede: 'Correction de chaque livrable sous 7 jours, permanences 2 fois par mois, plan de reprise si arrêt 3 semaines.',
          price: '2 190 €',
          price_note: 'ou 575 € x 4 sous 90 jours',
          badge: 'La plus choisie · 5 places/mois',
          features:
            'Tout le programme et les prompts inclus\nCorrection de chaque livrable sous 7 jours\n2 permanences par mois avec un formateur\nPlan de reprise si arrêt 3 semaines\nAccès 18 mois et suivi dès le 1er du mois suivant',
          cta_label: 'Je construis mon activité',
          cta_link: L('/contact'),
          featured: true,
        }),
      ],
      anchor: 'formules',
    }),
    blok('vitrine_faq', {
      eyebrow: 'FAQ',
      title: 'Questions sur le contenu',
      items: [
        blok('vitrine_faq_item', {
          question: 'Faut-il savoir coder ou déjà savoir vendre ?',
          answer: RT(
            'Non. Tu pars de ton expertise. La partie 5 guide la mise en ligne sans jargon, la partie 9 guide l’entretien de vente avec une trame.'
          ),
        }),
        blok('vitrine_faq_item', {
          question: 'Quels outils sont demandés et quel budget prévoir ?',
          answer: RT(
            'Tous les outils proposés ont des options gratuites suffisantes ou sont open source. L’hébergement des sites Pragma est gratuit.'
          ),
        }),
        blok('vitrine_faq_item', {
          question: 'Comment se passe le suivi du travail ?',
          answer: RT(
            'Tu déposes le livrable de chaque partie. En autonome tu vérifies avec les prompts et la méthode. En mentorée, ton mentor renvoie une correction commentée en audio et vidéo sous 7 jours. Tu avances à la partie suivante une fois validé.'
          ),
        }),
        blok('vitrine_faq_item', {
          question: 'Et si je bloque sur les tarifs ou le SEO ?',
          answer: RT(
            'Nos processus, prompts IA, grilles d’auto-correction et surtout, nos mentors sont là pour t’aider à chaque étape.'
          ),
        }),
        blok('vitrine_faq_item', {
          question: 'Quel rythme tenir avec un emploi ?',
          answer: RT(
            'Le parcours est pensé pour 4 heures par semaine, à ton rythme. Les masterclass et ateliers ont un replay, les permanences mentorées 2 fois par mois aident à garder le cap.'
          ),
        }),
        blok('vitrine_faq_item', {
          question: 'Puis-je cumuler durablement sans quitter mon poste ?',
          answer: RT(
            'Oui. La méthode vise des premiers clients en parallèle, et la partie 8 te donne le cadre légal pour cumuler sereinement.'
          ),
        }),
        blok('vitrine_faq_item', {
          question: 'Que se passe-t-il à la fin des 18 mois ?',
          answer: RT(
            'L’accès à la plateforme et aux corrections est valable 18 mois à compter de ton inscription. Avec 7 parties validées et une présence sur Discord, une suite de 6 mois reste possible pour finaliser, avec tes 2 derniers livrables corrigés pour 490 €.'
          ),
        }),
      ],
      anchor: 'faq',
    }),
    blok('vitrine_cta', {
      title: 'Vérifie que Pragma colle à ton projet.',
      text: 'Tu repars avec un avis clair sur ton idée, les 9 parties adaptées à ton cas et la formule faite pour toi. 5 places mentorées par mois, tarifs liste d’attente jusqu’au 31 décembre 2026.',
      primary_label: 'Réserver un appel découverte',
      primary_link: L('/contact'),
      secondary_label: 'Voir les formules',
      secondary_link: L('#formules'),
      wide: true,
    }),
  ],
});

const contact = page({
  title: 'Contacter Pragma : une question avant de te lancer ?',
  description:
    'Une question sur le programme, les formules ou l’accès 18 mois. Réponse sous 2 jours ouvrés.',
  ctaLabel: 'Me connecter à mon espace',
  ctaHref: '/login',
  body: [
    blok('vitrine_hero', {
      eyebrow: 'Contact',
      title: 'Une question avant de te lancer\u00a0?',
      lede: 'Une question sur le programme, les formules ou l’accès 18\u00a0mois\u00a0? Écris-nous : on te répond sous 2 jours ouvrés, sans démarchage.',
      primary_label: 'Poser ma question',
      primary_link: L('#formulaire'),
    }),
    blok('vitrine_contact', {
      form_eyebrow: 'Ta question',
      form_title: 'Écris-nous',
      success_message: 'Message envoyé. On te répond sous 2 jours ouvrés.',
      error_message: 'Merci de vérifier les champs du formulaire avant de l’envoyer.',
      send_error_message: 'L’envoi automatique n’a pas abouti. Écris-nous à',
      first_name_label: 'Prénom',
      email_label: 'Email',
      subject_label: 'Sujet',
      message_label: 'Message',
      submit_label: 'Envoyer ma question',
      subjects: [
        blok('vitrine_subject', { label: 'Le programme', value: 'programme' }),
        blok('vitrine_subject', { label: 'Les formules et tarifs', value: 'formules' }),
        blok('vitrine_subject', { label: 'Le suivi et la correction', value: 'suivi' }),
        blok('vitrine_subject', { label: 'Autre', value: 'autre' }),
      ],
      note: 'Réponse sous 2 jours ouvrés. Pas de démarchage, juste une réponse.',
      aside_eyebrow: 'Appel découverte',
      aside_title: 'Tu préfères en parler ?',
      aside_text:
        'Pour connaître le contenu détaillé ou vérifier que Pragma peut coller à ton projet, réserve un appel découverte, c’est plus rapide.',
      aside_cta_label: 'Réserver un appel découverte',
      aside_cta_link: L(
        'mailto:bonjour@pragma-formation.fr?subject=R%C3%A9server%20un%20appel%20d%C3%A9couverte'
      ),
      contact_eyebrow: 'Écrire directement',
      contact_note: 'Pas de démarchage, juste une réponse.',
      email: 'bonjour@pragma-formation.fr',
      anchor: 'formulaire',
    }),
  ],
});

const notfound = page({
  title: 'Page introuvable — Pragma',
  description:
    'Cette page n’existe pas ou a été déplacée. Retrouve le programme Pragma, l’équipe et le contact.',
  robots: 'noindex',
  ctaLabel: 'Me connecter à mon espace',
  ctaHref: '/login',
  sitemap: false,
  body: [
    blok('vitrine_notfound', {
      eyebrow: 'Erreur 404',
      title: 'Cette page n’a pas suivi le plan.',
      text: 'Pas de stress, ton projet, lui, peut en suivre un. 9 parties, 1 livrable corrigé à chaque étape, 18 mois à côté de ton emploi.',
      note: 'Erreur 404 signalée, on s’en occupe.',
      primary_label: 'Retour à l’accueil',
      primary_link: L('/'),
      secondary_label: 'Voir le programme',
      secondary_link: L('/programme'),
      tertiary_label: 'Réserver un appel découverte',
      tertiary_link: L('/contact'),
      visual_top_left: 'Plan 404',
      visual_top_right: 'Page introuvable',
      visual_code: '404',
      visual_foot_left: 'Cette page n’est pas au plan.',
      visual_foot_right: 'PRG',
    }),
  ],
});

const stories = [
  { slug: 'home', name: 'Accueil', content: home },
  { slug: 'equipe', name: 'Équipe', content: equipe },
  { slug: 'programme', name: 'Programme', content: programme },
  { slug: 'contact', name: 'Contact', content: contact },
  { slug: '404', name: 'Page introuvable', content: notfound },
];

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

console.log(
  `Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} | composants: ${componentDefs.length} | stories: ${stories.length}`
);

if (!APPLY) {
  console.log('\nComposants :');
  for (const def of componentDefs) console.log(`  - ${def.name} (${def.display})`);
  console.log('\nStories :');
  for (const story of stories) console.log(`  - ${story.slug} (${story.name})`);
  process.exit(0);
}

// Groupe de composants
const groups = await api('/component_groups');
let group = (groups.component_groups ?? []).find((item) => item.name === 'Vitrine');
if (!group) {
  const created = await api('/component_groups', {
    method: 'POST',
    body: JSON.stringify({ component_group: { name: 'Vitrine' } }),
  });
  group = created.component_group;
  console.log('Groupe Vitrine créé.');
}

// Datasources
const datasourcesData = await api('/datasources?per_page=100');
const existingDatasources = datasourcesData.datasources ?? [];
for (const def of datasourceDefs) {
  let datasource = existingDatasources.find((item) => item.slug === def.slug);
  if (!datasource) {
    const created = await api('/datasources', {
      method: 'POST',
      body: JSON.stringify({ datasource: { name: def.name, slug: def.slug } }),
    });
    datasource = created.datasource;
    console.log(`Datasource créée: ${def.slug}`);
    await sleep();
  }
  const entriesData = await api(`/datasource_entries?datasource_id=${datasource.id}&per_page=100`);
  const existingEntries = entriesData.datasource_entries ?? [];
  for (const [name, value] of def.entries) {
    if (existingEntries.some((entry) => entry.value === value)) continue;
    await api('/datasource_entries', {
      method: 'POST',
      body: JSON.stringify({
        datasource_entry: { name, value, datasource_id: datasource.id },
      }),
    });
    console.log(`  + ${def.slug}/${value}`);
    await sleep();
  }
}

// Composants
const existingComponents = await listComponents();
const existingByName = new Map(existingComponents.map((component) => [component.name, component]));

for (const def of componentDefs) {
  const existing = existingByName.get(def.name);
  const schema = {};
  let position = 0;
  for (const [key, field] of Object.entries(def.fields)) {
    schema[key] = {
      ...field,
      pos: position++,
      id: existing?.schema?.[key]?.id || fieldId(),
    };
  }
  // Préserve les champs ajoutés à la main après le premier export.
  for (const [key, field] of Object.entries(existing?.schema ?? {})) {
    if (!(key in schema)) schema[key] = field;
  }
  const payload = {
    name: def.name,
    display_name: def.display,
    preview_field: def.preview || null,
    component_group_uuid: group.uuid,
    is_root: def.name === 'vitrine_page',
    is_nestable: def.name !== 'vitrine_page',
    schema,
  };
  if (existing) {
    await api(`/components/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ component: payload }),
    });
    console.log(`Composant MAJ: ${def.name}`);
  } else {
    await api('/components', {
      method: 'POST',
      body: JSON.stringify({ component: payload }),
    });
    console.log(`Composant créé: ${def.name}`);
  }
  await sleep();
}

// Stories
const allStories = await listAllStories();
const bySlug = new Map(allStories.map((story) => [story.full_slug, story]));

for (const def of stories) {
  const existing = bySlug.get(def.slug);
  let story;
  if (existing && !OVERWRITE) {
    console.log(`Story ignorée (déjà existante): ${def.slug} — --overwrite pour réécrire`);
    continue;
  }
  if (existing) {
    const response = await api(`/stories/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        story: {
          name: def.name,
          content: def.content,
        },
      }),
    });
    story = response.story;
    console.log(`Story MAJ: ${def.slug}`);
  } else {
    const response = await api('/stories', {
      method: 'POST',
      body: JSON.stringify({
        story: {
          name: def.name,
          slug: def.slug,
          parent_id: 0,
          content: def.content,
        },
      }),
    });
    story = response.story;
    console.log(`Story créée: ${def.slug}`);
  }
  await sleep();

  if (PUBLISH) {
    await api(`/stories/${story.id}/publish`);
    console.log(`  publiée (${story.id})`);
    await sleep();
  }
}

console.log('Export vitrine terminé.');
