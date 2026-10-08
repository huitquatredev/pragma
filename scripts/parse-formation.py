#!/usr/bin/env python3
"""Parse VERSION A INTEGRER docx -> structured formation JSON for Storyblok rebuild.
Excludes: Partie 0, *Livrables*, *.xlsx
Promotes MODULE headings found as Heading 3 to real modules (P5/P7/P9).
Skips P3 M1-M2 (pending) and P5 M9 JULIEN (pending).
Output: artifacts/formation-content.json + artifacts/formation-structure.json
"""
import docx, pathlib, json, re, unicodedata

BASE = pathlib.Path("VERSION A INTEGRER - 6-10-26/VERSION A INTEGRER")
OUT_CONTENT = pathlib.Path("artifacts/formation-content.json")
OUT_STRUCT = pathlib.Path("artifacts/formation-structure.json")

def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")
    return s[:80] or "sans-titre"

def clean(t):
    return re.sub(r"\s+", " ", t).strip()

def split_cours(paras):
    """paras: list of str after COURS title. Returns dict blocks."""
    # markers
    # markers: collect ALL occurrences, use LAST flash/jouer and guide-after-flash
    idx_enjeu = idx_comprendre = None
    flash_idxs, guide_idxs, jouer_idxs = [], [], []
    for i, t in enumerate(paras):
        low = t.lower()
        if idx_enjeu is None and ("l'enjeu" in low and "pourquoi cette étape" in low):
            idx_enjeu = i
        if idx_comprendre is None and "ce qu'il faut comprendre" in low:
            idx_comprendre = i
        if "évaluation flash" in low or "evaluation flash" in low:
            if len(t) < 120:
                flash_idxs.append(i)
        if ("guide pas à pas" in low or "application par l'exemple" in low) and len(t) < 150:
            guide_idxs.append(i)
        if "à toi de jouer" in low and len(t) < 120:
            jouer_idxs.append(i)
    idx_flash = flash_idxs[-1] if flash_idxs else None
    idx_jouer = jouer_idxs[-1] if jouer_idxs else None
    # guide = last guide strictly after flash if flash exists, else last guide
    if guide_idxs:
        if idx_flash is not None:
            after = [g for g in guide_idxs if g > idx_flash]
            idx_guide = after[-1] if after else guide_idxs[-1]
        else:
            idx_guide = guide_idxs[-1]
    else:
        idx_guide = None
    def seg(a, b):
        return paras[a:b]
    n = len(paras)
    # competence = first para starting with → or Compétence clé before enjeu
    competence = ""
    enjeu_paras = []
    if idx_enjeu is not None:
        pre = paras[:idx_enjeu]
        # competence = first non-empty arrow / competence line
        for t in pre:
            if t.startswith("→") or "compétence clé" in t.lower():
                competence = clean(t.lstrip("→ ").replace("Compétence clé :", "").strip())
                break
        if not competence and pre:
            competence = clean(pre[0])[:300]
        # enjeu ends at first section marker after enjeu (comprendre/flash/guide-final/jouer)
        candidates = [x for x in [idx_comprendre, idx_flash, idx_guide, idx_jouer] if x is not None and x > idx_enjeu]
        end_enjeu = min(candidates) if candidates else n
        enjeu_paras = seg(idx_enjeu, end_enjeu)
    else:
        # no enjeu marker: first para = competence
        if paras and (paras[0].startswith("→") or len(paras[0]) < 300):
            competence = clean(paras[0].lstrip("→ "))
    # comprendre ends at first of flash/guide-final/jouer after comprendre
    if idx_comprendre is not None:
        candidates = [x for x in [idx_flash, idx_guide, idx_jouer] if x is not None and x > idx_comprendre]
        end_comprendre = min(candidates) if candidates else n
        comprendre_paras = seg(idx_comprendre, end_comprendre)
    else:
        comprendre_paras = []
    # flash ends at first of guide-final/jouer after flash
    if idx_flash is not None:
        candidates = [x for x in [idx_guide, idx_jouer] if x is not None and x > idx_flash]
        end_flash = min(candidates) if candidates else n
        flash_paras = seg(idx_flash, end_flash)
    else:
        flash_paras = []
    # guide ends at jouer or end
    if idx_guide is not None:
        end_guide = idx_jouer if (idx_jouer is not None and idx_jouer > idx_guide) else n
        guide_paras = seg(idx_guide, end_guide)
    else:
        guide_paras = []
    jouer_paras = seg(idx_jouer, n) if idx_jouer is not None else []

    # parse quiz: Question + Option A/B/C + correction (👉 Bravo)
    quiz = {"question": "", "options": [], "bonne_reponse": "", "explication": ""}
    if flash_paras:
        q = next((t for t in flash_paras if t.strip().lower().startswith("question")), "")
        quiz["question"] = clean(q)
        opts = [t for t in flash_paras if re.match(r"^Option [ABC]", t.strip())]
        quiz["options"] = [clean(o)[:500] for o in opts]
        # bonne réponse = celle contenant 👉 Bravo
        for o in opts:
            if "👉" in o or "bravo" in o.lower():
                m = re.match(r"^Option ([ABC])", o.strip())
                if m:
                    quiz["bonne_reponse"] = m.group(1)
                quiz["explication"] = clean(o)[:600]
                break
    # parse guide: split Léa / Thomas
    lea, thomas, guide_intro = [], [], []
    if guide_paras:
        mode = "intro"
        for t in guide_paras[1:]:  # skip title
            low = t.lower()
            if "léa" in low and ("cas de léa" in low or "léa (" in low or "léa :" in low):
                mode = "lea"
                lea.append(t)
            elif "thomas" in low and ("cas de thomas" in low or "thomas (" in low or "thomas :" in low):
                mode = "thomas"
                thomas.append(t)
            else:
                if mode == "intro":
                    guide_intro.append(t)
                elif mode == "lea":
                    lea.append(t)
                else:
                    thomas.append(t)
    return {
        "competence_cle": competence,
        "enjeu": enjeu_paras,
        "comprendre": comprendre_paras,
        "quiz": quiz,
        "quiz_raw": flash_paras,
        "guide_intro": guide_intro,
        "guide_lea": lea,
        "guide_thomas": thomas,
        "guide_raw": guide_paras,
        "action": jouer_paras,
        "has_comprendre": bool(comprendre_paras),
        "has_flash": bool(flash_paras),
        "has_guide": bool(guide_paras),
        "has_jouer": bool(jouer_paras),
        "has_enjeu": bool(enjeu_paras),
        "has_competence": bool(competence),
    }

files = sorted([p for p in BASE.glob("*.docx") if "Livrables" not in p.name and not p.name.startswith("Partie 0")])
formation = []
for f in files:
    d = docx.Document(str(f))
    paras = [(p.style.name, clean(p.text)) for p in d.paragraphs if clean(p.text)]
    # tables: module metadata (single-cell tables with Approche:)
    mod_tables = []
    for t in d.tables:
        if len(t.rows) == 1 and len(t.columns) == 1 and "approche" in t.rows[0].cells[0].text.lower():
            mod_tables.append(t.rows[0].cells[0].text)
    # headings
    h1 = next(((i, t) for i, (s, t) in enumerate(paras) if s == "Heading 1"), (None, ""))
    # collect H2 and H3-MODULE (promote)
    headings = []
    for i, (s, t) in enumerate(paras):
        if s == "Heading 2":
            headings.append((i, "module", t))
        elif s == "Heading 3":
            if re.match(r"^\s*MODULE\s+\d+", t, re.I):
                headings.append((i, "module", t))
            elif t.upper().startswith("COURS"):
                headings.append((i, "cours", t))
            else:
                # unknown H3: treat as cours to avoid loss
                headings.append((i, "cours", t))
    # partie intro = between h1 and first heading
    h1_i = h1[0] if h1[0] is not None else -1
    first_h = headings[0][0] if headings else len(paras)
    partie_intro = [t for s, t in paras[h1_i + 1:first_h]] if h1_i is not None else []
    # parse partie enjeu/objectifs/livrables
    enjeu = " ".join(t for t in partie_intro if "enjeu" in t.lower())[:2000]
    # objectifs: lines after "Objectifs"
    objectifs, livrables = [], []
    mode = None
    for t in partie_intro:
        low = t.lower()
        if low.startswith("objectifs"):
            mode = "obj"
            continue
        if low.startswith("livrables") or low.startswith("livrable"):
            mode = "liv"
            continue
        if low.startswith("enjeu"):
            mode = None
            continue
        if mode == "obj":
            objectifs.append(t)
        elif mode == "liv":
            livrables.append(t)
    # modules + cours
    modules = []
    # map mod_tables in order to modules (only for files where count matches)
    for mi, (hi, kind, title) in enumerate([h for h in headings if h[1] == "module"]):
        # skip pending: P5 MODULE 9 JULIEN
        if "JULIEN" in title.upper() or re.match(r"^\s*MODULE\s+9\b", title, re.I) and "Partie 5" in f.name:
            continue
        # find end: next heading (module or cours-group?) Actually cours belong until next module
        all_h_idx = [h[0] for h in headings]
        pos = all_h_idx.index(hi)
        next_mod_pos = next((all_h_idx[k] for k in range(pos + 1, len(all_h_idx)) if headings[k][1] == "module"), len(paras))
        # module intro = paras between module title and first cours
        first_cours_after = next((all_h_idx[k] for k in range(pos + 1, len(all_h_idx)) if headings[k][1] == "cours"), next_mod_pos)
        mod_intro = [t for s, t in paras[hi + 1:first_cours_after]]
        # cours in this module
        cours_list = []
        for k in range(pos + 1, len(all_h_idx)):
            if headings[k][1] == "module":
                break
            chi, _, ctitle = headings[k]
            cend = all_h_idx[all_h_idx.index(chi) + 1] if all_h_idx.index(chi) + 1 < len(all_h_idx) else len(paras)
            # cap at next module already handled; cend is next heading or len
            if cend > next_mod_pos:
                cend = next_mod_pos
            cparas = [t for s, t in paras[chi + 1:cend]]
            # clean cours title
            short = re.sub(r"^COURS\s*:\s*", "", ctitle, flags=re.I).strip()
            blocks = split_cours(cparas)
            cours_list.append({
                "titre": short, "titre_raw": ctitle, "slug": slugify(short),
                "nb_paras": len(cparas), **blocks,
            })
        # module metadata from table if available by order
        table_txt = mod_tables[mi] if mi < len(mod_tables) else ""
        # parse approche/resultat/outils/prerequis from table_txt
        def extract_field(txt, name):
            m = re.search(name + r"\s*:\s*(.*?)(?=(Approche|Résultat|Resultat|Outils|Outil|Prérequis|Prerequis)\s*:|$)", txt, re.I | re.S)
            return clean(m.group(1)) if m else ""
        modules.append({
            "titre": re.sub(r"^Module\s+\d+\s*:\s*", "", title, flags=re.I).strip(),
            "titre_raw": title, "slug": slugify(title),
            "intro_paras": mod_intro,
            "cours": cours_list,
            "approche": extract_field(table_txt, "Approche"),
            "resultat": extract_field(table_txt, "R[ée]sultat"),
            "outils": extract_field(table_txt, "Outils?"),
            "prerequis": extract_field(table_txt, "Pr[ée]requis"),
            "table_raw": table_txt[:2000],
        })
    formation.append({
        "fichier": f.name,
        "partie_titre": h1[1] if h1[0] is not None else f.stem,
        "partie_slug": slugify(h1[1] if h1[0] is not None else f.stem),
        "introduction": partie_intro,
        "enjeu": enjeu, "objectifs": objectifs, "livrables": livrables,
        "modules": modules,
    })

OUT_CONTENT.parent.mkdir(parents=True, exist_ok=True)
OUT_CONTENT.write_text(json.dumps(formation, ensure_ascii=False, indent=2), encoding="utf-8")

# structure summary
struct = []
for p in formation:
    pc = sum(len(m["cours"]) for m in p["modules"])
    struct.append({
        "fichier": p["fichier"], "partie": p["partie_titre"], "slug": p["partie_slug"],
        "has_enjeu": bool(p["enjeu"]), "objectifs": len(p["objectifs"]), "livrables": len(p["livrables"]),
        "nb_modules": len(p["modules"]),
        "nb_cours": pc,
        "modules": [{"t": m["titre_raw"], "slug": m["slug"], "nb_cours": len(m["cours"]),
                     "has_meta": bool(m["approche"]),
                     "cours": [{"t": c["titre"], "slug": c["slug"], "flags": {k: c[k] for k in ["has_competence","has_enjeu","has_comprendre","has_flash","has_guide","has_jouer"]}} for c in m["cours"]]} for m in p["modules"]],
    })
OUT_STRUCT.write_text(json.dumps(struct, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Parties: {len(formation)}")
print(f"Modules: {sum(len(p['modules']) for p in formation)}")
print(f"Cours: {sum(len(m['cours']) for p in formation for m in p['modules'])}")
for s in struct:
    print(f"- {s['partie'][:60]} | mod={s['nb_modules']} cours={s['nb_cours']} enjeu={s['has_enjeu']} obj={s['objectifs']} liv={s['livrables']}")
