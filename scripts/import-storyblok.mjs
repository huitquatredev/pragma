/**
 * Remise à plat Storyblok depuis artifacts/storyblok-payload.json
 *
 *   node scripts/import-storyblok.mjs --dry-run                 (aucune écriture)
 *   node scripts/import-storyblok.mjs --apply                   (crée 136 stories + MAJ index-general)
 *   node scripts/import-storyblok.mjs --apply --delete-existing (supprime d'abord l'existant)
 *   node scripts/import-storyblok.mjs --apply --no-publish      (laisse en brouillon)
 *
 * Env requis (ou .env sourcé) : STORYBLOK_MANAGEMENT_TOKEN, STORYBLOK_SPACE_ID
 * Dossiers cibles : cours/ (213549910808408), modules/ (213622519938542), parties/ (213622308683211)
 * Conservés : parties/index-general (mis à jour), home, tout le reste.
 */
import { readFileSync } from 'node:fs';

const SPACE = process.env.STORYBLOK_SPACE_ID || '343467';
const TOKEN = process.env.STORYBLOK_MANAGEMENT_TOKEN;
const API = `https://mapi.storyblok.com/v1/spaces/${SPACE}`;
const DRY = !process.argv.includes('--apply');
const DELETE = process.argv.includes('--delete-existing');
const PUBLISH = !process.argv.includes('--no-publish');

const FOLDERS = { cours: 213549910808408, modules: 213622519938542, parties: 213622308683211 };
const INDEX_GENERAL_ID = 218559179262354;

if (!TOKEN && !DRY) {
  console.error('STORYBLOK_MANAGEMENT_TOKEN manquant.');
  process.exit(1);
}

const payload = JSON.parse(readFileSync('artifacts/storyblok-payload.json', 'utf-8'));
const headers = { 'Content-Type': 'application/json', Authorization: TOKEN ?? 'DRY' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function listAllStories() {
  const all = [];
  let page = 1;
  for (;;) {
    const d = await api(`/stories?per_page=100&page=${page}&with_summary=true`);
    all.push(...(d.stories ?? []));
    if ((d.stories ?? []).length < 100) break;
    page += 1;
  }
  return all;
}

console.log(`Mode: ${DRY ? 'DRY-RUN' : 'APPLY'} | stories à créer: ${payload.stories.length} | publish: ${PUBLISH}`);

if (DRY) {
  const byFolder = {};
  for (const s of payload.stories) byFolder[s.folder] = (byFolder[s.folder] ?? 0) + 1;
  console.log('Répartition:', byFolder);
  process.exit(0);
}

if (DELETE) {
  const all = await listAllStories();
  const targets = all.filter(
    (s) =>
      (s.full_slug.startsWith('cours/') || s.full_slug.startsWith('modules/') || s.full_slug.startsWith('parties/')) &&
      s.full_slug !== 'parties/index-general'
  );
  console.log(`Suppression de ${targets.length} stories (cours/modules/parties, index-general conservé)…`);
  for (const s of targets) {
    await api(`/stories/${s.id}`, { method: 'DELETE' });
    console.log('  supprimé:', s.full_slug);
    await sleep(200);
  }
}

// Passe 1 : cours
const slugToUuid = {};
for (const s of payload.stories.filter((x) => x.folder === 'cours')) {
  const { content } = s;
  const body = await api('/stories', {
    method: 'POST',
    body: JSON.stringify({
      story: { name: content.title.slice(0, 200), slug: s.slug, parent_id: FOLDERS.cours, content },
    }),
  });
  slugToUuid[s.slug] = body.story.uuid;
  console.log('cours:', s.slug);
  await sleep(200);
}
// Passe 2 : modules
for (const s of payload.stories.filter((x) => x.folder === 'modules')) {
  const { _cours_slugs, ...content } = s.content;
  content.cours = (_cours_slugs || []).map((cs) => slugToUuid[cs]).filter(Boolean);
  const body = await api('/stories', {
    method: 'POST',
    body: JSON.stringify({
      story: { name: content.title.slice(0, 200), slug: s.slug, parent_id: FOLDERS.modules, content },
    }),
  });
  slugToUuid[s.slug] = body.story.uuid;
  console.log(`module: ${s.slug} (${content.cours.length} cours liés)`);
  await sleep(200);
}
// Passe 3 : parties
const partieUuidsInOrder = [];
// tri P1..P9 via préfixe pN-
const partieStories = payload.stories
  .filter((x) => x.folder === 'parties')
  .sort((a, b) => parseInt(a.slug.slice(1)) - parseInt(b.slug.slice(1)));
for (const s of partieStories) {
  const { _modules_slugs, _cours_slugs, cours, body, ...content } = s.content;
  content.modules = (_modules_slugs || []).map((ms) => slugToUuid[ms]).filter(Boolean);
  content.cours = (_cours_slugs || []).map((cs) => slugToUuid[cs]).filter(Boolean);
  content.body = body || [];
  const res = await api('/stories', {
    method: 'POST',
    body: JSON.stringify({
      story: { name: content.title.slice(0, 200), slug: s.slug, parent_id: FOLDERS.parties, content },
    }),
  });
  slugToUuid[s.slug] = res.story.uuid;
  partieUuidsInOrder.push(res.story.uuid);
  console.log(`partie: ${s.slug} (${content.modules.length} modules, ${content.cours.length} cours directs)`);
  await sleep(200);
}

// Passe 4 : index-general -> parties_list
const idx = await api(`/stories/${INDEX_GENERAL_ID}`);
idx.story.content.parties_list = partieUuidsInOrder;
await api(`/stories/${INDEX_GENERAL_ID}`, {
  method: 'PUT',
  body: JSON.stringify({ story: { content: idx.story.content } }),
});
console.log('index-general mis à jour (9 parties).');

if (PUBLISH) {
  console.log('Publication…');
  const all = await listAllStories();
  const fresh = all.filter((s) => Object.values(slugToUuid).includes(s.uuid) || s.id === INDEX_GENERAL_ID);
  for (const s of fresh) {
    await api(`/stories/${s.id}/publish`, { method: 'POST' });
    await sleep(200);
  }
  console.log(`Publié: ${fresh.length} stories.`);
}
console.log('Import terminé.');
