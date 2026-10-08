#!/usr/bin/env python3
"""Build Storyblok Management-API payload from formation-content.json.
- Converts plain paragraphs to Storyblok richtext docs
- Cleans quiz options (strip 👉 Bravo from option, keep in explication)
- Generates [BROUILLON A VALIDER] drafts for missing parties/modules/competences
Output: artifacts/storyblok-payload.json + artifacts/MANQUANTS.md
"""
import json, pathlib, re, uuid

SRC = pathlib.Path("artifacts/formation-content.json")
OUT = pathlib.Path("artifacts/storyblok-payload.json")
MISS = pathlib.Path("artifacts/MANQUANTS.md")

def rt(paras):
    """list[str] -> storyblok richtext doc"""
    content = []
    for p in paras:
        p = (p or "").strip()
        if not p:
            continue
        # bold markers for mini-titles ending with : or starting with A./B./Étape
        content.append({"type": "paragraph", "content": [{"type": "text", "text": p[:2000]}]})
    if not content:
        content = [{"type": "paragraph"}]
    return {"type": "doc", "content": content}

def parse_quiz(flash_paras):
    """Robust quiz parse handling 4 formats: inline 👉, standalone 👉, Correction:, A/B/C variants."""
    q_text, opts, bonne, expl = "", [], "", ""
    if not flash_paras:
        return q_text, opts, bonne, expl
    q_text = next((t for t in flash_paras if re.match(r"^\s*Question\s*:", t, re.I)), "")
    # options: lines starting with Option A/B/C or A)/B)/C)
    for t in flash_paras:
        if re.match(r"^\s*(Option\s+[ABC]\s*[:. sul]|Option\s+[ABC]\b)", t, re.I) or re.match(r"^\s*[ABC]\)\s+", t):
            opts.append(t)
    # 1) inline bravo
    for o in opts:
        if "👉" in o or "bravo" in o.lower():
            m = re.search(r"Option\s+([ABC])", o, re.I) or re.search(r"^([ABC])\)", o)
            if m:
                bonne = m.group(1).upper()
            expl = o
            break
    # 2) standalone bravo / correction lines
    if not bonne:
        for t in flash_paras:
            if ("👉" in t or "bonne r" in t.lower() or "correction" in t.lower()):
                m = re.search(r"[Oo]ption\s+([ABC])", t) or re.search(r"r[ée]ponse\s+(?:est\s+la\s+)?([ABC])\b", t, re.I)
                if m:
                    bonne = m.group(1).upper()
                    expl = t
                    break
    opts = (opts + ["", "", ""])[:3]
    return q_text, opts, bonne, expl


def clean_opt(o):
    m = re.match(r"^\s*([ABC])\)\s*(.*)$", o)
    if m:
        o = f"Option {m.group(1)} : {m.group(2)}"
    o = re.sub(r"\s*\(👉.*$", "", o).strip()
    return o[:500]

formation = json.loads(SRC.read_text(encoding="utf-8"))
stories = []
manquants = ["# Contenus manquants — à compléter avant publication\n"]
SANS_MODULE = {4, 8}  # parties sans module : cours rattachés directement à la partie

# Draft generators for missing parties
DRAFT_PARTIES = {
    "créer-ta-marque": {
        "enjeu": "[BROUILLON A VALIDER] Poser ton identité de marque pour être reconnue, mémorisée et choisie : transformer ton archétype abstrait en langage concret et cohérent sur tous tes supports.",
        "objectifs": ["Stabiliser ton identité éditoriale (curseurs de ton, pronoms, lexique).", "Rassembler tes preuves de crédibilité (E-E-A-T, sameAs).", "Rédiger ta charte éditoriale officielle et opposable (y compris gouvernance IA)."],
        "livrables": ["Ton portrait de marque + boussole du ton + messages clés.", "Ton passeport de crédibilité.", "Ta charte éditoriale officielle."],
    },
    "cartographier-ton-tunnel": {
        "enjeu": "[BROUILLON A VALIDER] Visualiser l'architecture complète de ton écosystème digital avant de construire : connecter pages, diagnostic, e-mails et conversion sur un seul plan.",
        "objectifs": ["Choisir ton modèle d'ingénierie de flux (Haute Confiance vs Impulsion).", "Cartographier source de trafic, page de capture, séquence de confiance et terminus.", "Fixer tes objectifs de taux (capture, ouverture, conversion)."],
        "livrables": ["Ton schéma directeur d'écosystème.", "Ton modèle de tunnel choisi + tes objectifs chiffrés."],
    },
    "rédiger-et-optimiser-ton-site": {
        "enjeu": "[BROUILLON A VALIDER] Rédiger un site que Google et les IA trouvent, comprennent et citent, et qui convertit : de l'exploration robot à la landing page, la page à propos et la home.",
        "objectifs": ["Maîtriser crawl / indexation / classement + Query Fan-Out.", "Trouver tes mots-clés de conversion (intention de recherche).", "Rédiger landing page, page à propos et home page optimisées SEO/GEO."],
        "livrables": ["Ta liste de mots-clés + métadonnées.", "Ta landing page + page à propos + home page rédigées et polies SEO/GEO."],
    },
    "automatiser-ta-capture-de-prospects": {
        "enjeu": "[BROUILLON A VALIDER] Transformer ton trafic en prospects captés puis en clients grâce à un diagnostic interactif, des pages qui convertissent et une séquence e-mail automatisée (Brevo, RGPD).",
        "objectifs": ["Concevoir ton diagnostic interactif (idée centrale, questions, scoring).", "Rédiger tes pages clés (promesse, résultats, CTA).", "Automatiser tes e-mails de nurturing + conversion et piloter tes stats."],
        "livrables": ["Ton diagnostic + scoring + profils de résultats.", "Tes pages + tes 4 e-mails + automatisations Brevo."],
    },
    "propulser-ton-trafic-et-ton-autorité": {
        "enjeu": "[BROUILLON A VALIDER] Propulser ton trafic et ton autorité avec un socle blog rentable, des réseaux sociaux qui distribuent, une newsletter qui fidélise et des leviers extérieurs (presse, sponsors).",
        "objectifs": ["Créer ton socle d'expertise blog + maillage vers ton diagnostic.", "Déployer ta stratégie SMO + calendrier de recyclage.", "Fidéliser via newsletter + activer presse et partenariats."],
        "livrables": ["Ton premier article optimisé + plan 12 mois.", "Ton calendrier éditorial + ta newsletter + tes premiers leviers extérieurs."],
    },
}

def draft_module(partie_slug, mod_titre):
    return {
        "approche": f"[BROUILLON A VALIDER] Approche — {mod_titre} : passer de la théorie à l'exécution guidée, avec exemples Léa & Thomas et plan d'action.",
        "resultat": f"[BROUILLON A VALIDER] Résultat — à l'issue de « {mod_titre} », ton livrable est complété et mesurable dans ton outil de travail.",
        "outils": "[BROUILLON A VALIDER] Outils : ton document / tableur de travail + IA en soutien.",
        "prerequis": "[BROUILLON A VALIDER] Prérequis : le module précédent validé.",
    }

for pi, p in enumerate(formation, start=1):
    slug_p = p["partie_slug"]
    # patch missing partie intro with drafts
    enjeu_txt = p["enjeu"]
    obj_list = p["objectifs"]
    liv_list = p["livrables"]
    key = next((k for k in DRAFT_PARTIES if k in slug_p), None)
    draft_flag = False
    if not enjeu_txt and key:
        enjeu_txt = DRAFT_PARTIES[key]["enjeu"]; draft_flag = True
    if not obj_list and key:
        obj_list = DRAFT_PARTIES[key]["objectifs"]; draft_flag = True
    if not liv_list and key:
        liv_list = DRAFT_PARTIES[key]["livrables"]; draft_flag = True
    if pi in (8, 9) and not obj_list:
        obj_list = ["[BROUILLON A VALIDER] Objectifs à formuler à partir des livrables et des modules ci-dessous."]
    manquants.append(f"\n## Partie {pi} — {p['partie_titre']}")
    if draft_flag or not enjeu_txt or not obj_list or not liv_list:
        manquants.append(f"- INTRO : enjeu={'OK' if p['enjeu'] else 'BROUILLON'}, objectifs={'OK' if p['objectifs'] else 'BROUILLON'}, livrables={'OK' if p['livrables'] else 'BROUILLON'}")

    for mi, m in enumerate(p["modules"], start=1):
        if pi in SANS_MODULE:
            manquants.append(f"- Partie sans module : le module « {m['titre'][:70]} » est fusionné dans la partie ({len(m['cours'])} cours rattachés directement).")
            dm = None
        else:
            meta_missing = not m["approche"]
            dm = None
            if meta_missing:
                dm = draft_module(slug_p, m["titre"])
                manquants.append(f"- Module P{pi}M{mi} « {m['titre'][:70]} » : metadata BROUILLON (approche/résultat/outils/prérequis à valider)")
        for c in m["cours"]:
            flags = []
            if not c["competence_cle"]:
                # draft competence from title
                c["competence_cle"] = f"[BROUILLON A VALIDER] {c['titre']}"
                flags.append("competence=BROUILLON")
            if not c["has_flash"]:
                flags.append("sans quiz")
            if not c["has_guide"]:
                flags.append("sans guide")
            if not c["has_jouer"]:
                flags.append("sans action")
            if not c["quiz"]["bonne_reponse"] and c["quiz"]["question"]:
                # re-check with robust parser before flagging
                _, _, _bonne2, _ = parse_quiz(c["quiz_raw"])
                if not _bonne2:
                    flags.append("quiz sans bonne réponse détectée")
            if flags:
                manquants.append(f"  - Cours « {c['titre'][:70]} » : {', '.join(flags)}")

    # build stories: cours -> modules -> partie (slugs stables)


def build_cours_story(c, c_slug):
    q_text, opts, bonne, expl = parse_quiz(c["quiz_raw"])
    # fallback to legacy parse if needed
    if not q_text and c["quiz"]["question"]:
        q_text, opts = c["quiz"]["question"], (c["quiz"]["options"] + ["", "", ""])[:3]
        bonne, expl = c["quiz"]["bonne_reponse"], c["quiz"]["explication"]
    body = []
    if c["comprendre"]:
        body.append({"component": "bloc_comprendre", "titre": "Ce qu'il faut comprendre",
                     "corps": rt(c["comprendre"]), "_uid": uuid.uuid4().hex})
    if q_text:
        body.append({"component": "bloc_quiz", "titre": "Évaluation Flash",
                     "question": q_text[:800],
                     "option_a": clean_opt(opts[0]), "option_b": clean_opt(opts[1]), "option_c": clean_opt(opts[2]),
                     "bonne_reponse": bonne or "C",
                     "explication": rt([expl] if expl else []),
                     "_uid": uuid.uuid4().hex})
    guide_corps_lea = rt(c["guide_lea"]) if c["guide_lea"] else rt([])
    guide_corps_th = rt(c["guide_thomas"]) if c["guide_thomas"] else rt([])
    if c["guide_lea"] or c["guide_thomas"] or c["guide_intro"]:
        body.append({"component": "bloc_guide", "titre": "Guide pas à pas",
                     "intro": rt(c["guide_intro"]), "exemple_lea": guide_corps_lea,
                     "exemple_thomas": guide_corps_th, "_uid": uuid.uuid4().hex})
    if c["action"]:
        body.append({"component": "bloc_action", "titre": "À toi de jouer",
                     "consignes": rt(c["action"]), "_uid": uuid.uuid4().hex})
    if not body:
        body.append({"component": "section_text", "titre": c["titre"], "corps": rt([c["titre"]]), "_uid": uuid.uuid4().hex})
    return {
        "folder": "cours", "slug": c_slug,
        "content": {"component": "cours", "title": c["titre"],
                    "competence": c["competence_cle"][:500],
                    "enjeu": rt(c["enjeu"]),
                    "question": rt(c["quiz_raw"][:3]), "temps": rt([]), "action": rt(c["action"][:3]),
                    "body": body},
    }


def split_module_intro(paras):
    """Découpe le contenu brut d'un module sans cours (P4) en blocs partie."""
    flash_i, guide_i = None, None
    guides = []
    for i, t in enumerate(paras):
        low = t.lower()
        if flash_i is None and ("évaluation flash" in low or "evaluation flash" in low) and len(t) < 120:
            flash_i = i
        if ("guide pas à pas" in low or "application par l'exemple" in low) and len(t) < 150:
            guides.append(i)
    guide_i = next((g for g in guides if flash_i is not None and g > flash_i), guides[-1] if guides else None)
    n = len(paras)
    pre_end = min([x for x in [flash_i, guide_i] if x is not None] or [n])
    pre = paras[:pre_end]
    flash = paras[flash_i:guide_i if guide_i and guide_i > flash_i else n] if flash_i is not None else []
    guide = paras[guide_i:] if guide_i is not None else []
    # split guide Léa/Thomas
    lea, thomas, intro = [], [], []
    if guide:
        mode = "intro"
        for t in guide[1:]:
            low = t.lower()
            if "léa" in low and ("cas de léa" in low or "léa (" in low):
                mode = "lea"; lea.append(t)
            elif "thomas" in low and ("cas de thomas" in low or "thomas (" in low):
                mode = "thomas"; thomas.append(t)
            elif mode == "intro":
                intro.append(t)
            elif mode == "lea":
                lea.append(t)
            else:
                thomas.append(t)
    return pre, flash, intro, lea, thomas


for pi, p in enumerate(formation, start=1):
    num = pi  # 1..9
    sans_module = num in SANS_MODULE
    partie_cours_slugs = []
    partie_body = []
    for mi, m in enumerate(p["modules"], start=1):
        cours_slugs = []
        for c in m["cours"]:
            c_slug = f"p{num}-{c['slug']}" if sans_module else f"p{num}-m{mi}-{c['slug']}"
            cours_slugs.append(c_slug)
            stories.append(build_cours_story(c, c_slug))
        if sans_module:
            partie_cours_slugs.extend(cours_slugs)
            # P4 : convertit le contenu du module Masterclass en body de partie
            if not m["cours"]:
                pre, flash, g_intro, g_lea, g_th = split_module_intro(m["intro_paras"])
                if m["approche"]:
                    approche_txt = [f"Approche : {m['approche']}", f"Résultat : {m['resultat']}",
                                    f"Outils : {m['outils']}", f"Prérequis : {m['prerequis']}"]
                    partie_body.append({"component": "section_text", "titre": m["titre"],
                                        "corps": rt(approche_txt), "_uid": uuid.uuid4().hex})
                if pre:
                    partie_body.append({"component": "bloc_comprendre", "titre": "Ce qu'il faut comprendre",
                                        "corps": rt(pre), "_uid": uuid.uuid4().hex})
                if flash:
                    q_text, opts, bonne, expl = parse_quiz(flash)
                    if q_text:
                        partie_body.append({"component": "bloc_quiz", "titre": "Évaluation Flash",
                                            "question": q_text[:800],
                                            "option_a": clean_opt(opts[0]), "option_b": clean_opt(opts[1]),
                                            "option_c": clean_opt(opts[2]), "bonne_reponse": bonne or "C",
                                            "explication": rt([expl] if expl else []), "_uid": uuid.uuid4().hex})
                if g_lea or g_th or g_intro:
                    partie_body.append({"component": "bloc_guide", "titre": "Guide pas à pas",
                                        "intro": rt(g_intro), "exemple_lea": rt(g_lea),
                                        "exemple_thomas": rt(g_th), "_uid": uuid.uuid4().hex})
            m["_export_slug"] = None
            m["_cours_slugs"] = cours_slugs
            continue
        m_slug = f"p{num}-m{mi}-{m['slug']}"[:90]
        dm = draft_module(p["partie_slug"], m["titre"]) if not m["approche"] else None
        stories.append({
            "folder": "modules", "slug": m_slug,
            "content": {"component": "module", "title": m["titre"],
                        "approche": rt([m["approche"] or (dm["approche"] if dm else "")]),
                        "resultat": rt([m["resultat"] or (dm["resultat"] if dm else "")]),
                        "outil": rt([m["outils"] or (dm["outils"] if dm else "")]),
                        "prerequis": rt([m["prerequis"] or (dm["prerequis"] if dm else "")]),
                        "_cours_slugs": cours_slugs},
        })
        m["_export_slug"] = m_slug
        m["_cours_slugs"] = cours_slugs
    # partie story
    key = next((k for k in DRAFT_PARTIES if k in p["partie_slug"]), None)
    enjeu_txt = p["enjeu"] or (DRAFT_PARTIES[key]["enjeu"] if key else "[BROUILLON A VALIDER] Enjeu à rédiger.")
    obj_list = p["objectifs"] or (DRAFT_PARTIES[key]["objectifs"] if key else ["[BROUILLON A VALIDER] Objectifs à rédiger."])
    liv_list = p["livrables"] or (DRAFT_PARTIES[key]["livrables"] if key else (p["introduction"][:4] or ["[BROUILLON A VALIDER] Livrables à rédiger."]))
    stories.append({
        "folder": "parties", "slug": f"p{num}-{p['partie_slug']}"[:90],
        "content": {"component": "partie", "title": p["partie_titre"],
                    "enjeu": rt([enjeu_txt]), "objectifs": rt(obj_list), "livrables": rt(liv_list),
                    "body": partie_body,
                    "cours": [],
                    "_modules_slugs": [] if sans_module else [m["_export_slug"] for m in p["modules"]],
                    "_cours_slugs": partie_cours_slugs if sans_module else []},
    })

OUT.write_text(json.dumps({"stories": stories,
                            "counts": {"parties": 9,
                                       "modules": sum(len(p["modules"]) for p in formation) - sum(len(p["modules"]) for p in formation if formation.index(p) + 1 in SANS_MODULE),
                                       "cours": sum(len(m["cours"]) for p in formation for m in p["modules"])}},
                           ensure_ascii=False, indent=1), encoding="utf-8")
MISS.write_text("\n".join(manquants) + "\n", encoding="utf-8")
print(f"stories: {len(stories)} | " + str({"parties": 9}))
