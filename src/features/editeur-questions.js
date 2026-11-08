/* ---------------------------------------------------------------------------
 * Éditeur de questions — saisie rapide, sans limite de choix.
 * Une question = énoncé + (réponse libre | choix avec 0, 1 ou plusieurs bonnes réponses).
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";

export const bonnesReponses = (q) => { const s = q?.solution; return s == null ? [] : Array.isArray(s) ? s : [s]; };
export const estChoix = (q) => ["qcm", "single", "multiple"].includes(q?.kind);

/** « * Paris » ou « [x] Paris » = bonne réponse. */
function lire(ligne) {
  const m = /^\s*(?:\*|\[x\])\s*(.*)$/i.exec(ligne);
  return m ? { t: m[1].trim(), ok: true } : { t: ligne.trim(), ok: false };
}

/** Ordre mélangé mais stable pour un même élève et une même question. */
export function melanger(n, graine) {
  let h = 1779033703;
  for (const c of String(graine)) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  const alea = () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function initial(modele) {
  const bonnes = new Set(bonnesReponses(modele));
  const opts = (modele?.options || []).filter((o) => typeof o === "string");
  return {
    texte: modele?.prompt || "",
    libre: modele ? !estChoix(modele) : false,
    choix: opts.length ? opts.map((t, i) => ({ t, ok: bonnes.has(i) })) : [{ t: "", ok: false }, { t: "", ok: false }],
    points: modele?.points ?? 1,
    multi: modele ? (modele.kind === "multiple" || Boolean(modele.settings?.multi) || bonnes.size > 1) : false,
    partiel: Boolean(modele?.settings?.partiel),
    melange: Boolean(modele?.settings?.melange)
  };
}

/** compositeur({ modele?, libelle?, surValider(donnees), surAnnuler? }) → noeud */
export function compositeur({ modele = null, libelle = "Ajouter la question", surValider, surAnnuler = null }) {
  let e = initial(modele);
  const racine = el("div.exo__question");
  const message = el("p.petit", { style: { color: "#b3261e", minHeight: "1em" } });
  const montrer = (t) => { message.textContent = t; };
  const nbBonnes = () => e.choix.filter((c) => c.ok).length;

  const bouton = (texte, actif, action) =>
    el(actif ? "button.btn.btn--primaire" : "button.btn", { type: "button", onclick: action }, texte);
  const option = (texte, cle) => el("label.petit.ligne-flex", { style: { gap: "6px" } },
    el("input", { type: "checkbox", checked: e[cle], onchange: (x) => { e[cle] = x.target.checked; } }), texte);

  function collage(ev, i) {
    const t = ev.clipboardData?.getData("text") || "";
    if (!t.includes("\n")) return;
    ev.preventDefault();
    const neufs = t.split(/\r?\n/).filter((l) => l.trim()).map(lire);
    const vide = !e.choix[i].t.trim();
    e.choix.splice(vide ? i : i + 1, vide ? 1 : 0, ...neufs);
    if (nbBonnes() > 1) e.multi = true;
    peindre();
  }

  function zoneChoix() {
    return el("div",
      el("p.petit.faible", "Coche toutes les bonnes réponses (une, plusieurs, ou aucune). Tu peux coller une liste : une ligne par choix, « * » devant les bonnes."),
      e.choix.map((c, i) => el("div.ligne-flex", { style: { marginBottom: "6px", gap: "8px" } },
        el("input", { type: "checkbox", checked: c.ok, "aria-label": "Bonne réponse",
          onchange: (x) => { c.ok = x.target.checked; if (nbBonnes() > 1) e.multi = true; peindre(); } }),
        el("input.saisie", { value: c.t, placeholder: `Choix ${i + 1}`, style: { flex: "1" },
          oninput: (x) => { c.t = x.target.value; }, onpaste: (ev) => collage(ev, i),
          onkeydown: (ev) => {
            if (ev.key !== "Enter") return;
            ev.preventDefault(); e.choix.splice(i + 1, 0, { t: "", ok: false }); peindre();
            racine.querySelectorAll("input.saisie[placeholder^=\"Choix\"]")[i + 1]?.focus();
          } }),
        el("button.btn.btn--fantome.btn--icone", { type: "button", "aria-label": "Retirer ce choix",
          onclick: () => { e.choix.splice(i, 1); peindre(); } }, icone("corbeille", 14)))),
      el("button.btn", { type: "button", onclick: () => { e.choix.push({ t: "", ok: false }); peindre(); } },
        icone("plus", 14), "Ajouter un choix"));
  }

  function peindre() {
    render(racine,
      el("textarea.zone", { rows: 2, placeholder: "Énoncé de la question", "aria-label": "Énoncé", value: e.texte,
        oninput: (x) => { e.texte = x.target.value; } }),
      el("div.ligne-flex", { style: { margin: "8px 0", gap: "8px" } },
        bouton("Choix (QCM)", !e.libre, () => { e.libre = false; peindre(); }),
        bouton("Réponse libre", e.libre, () => { e.libre = true; peindre(); })),
      e.libre ? null : zoneChoix(),
      el("div.ligne-flex.enrouler", { style: { gap: "14px", margin: "8px 0" } },
        el("label.petit", "Points ", el("input.saisie", { type: "number", min: 0, step: 0.5, value: e.points,
          style: { width: "72px" }, oninput: (x) => { e.points = x.target.value; } })),
        e.libre ? null : option("Plusieurs réponses possibles", "multi"),
        e.libre ? null : option("Points partiels", "partiel"),
        e.libre ? null : option("Mélanger l'ordre des choix", "melange")),
      message,
      el("div.ligne-flex", { style: { gap: "8px" } },
        el("button.btn.btn--primaire", { type: "button", onclick: valider }, icone("plus", 15), libelle),
        surAnnuler ? el("button.btn", { type: "button", onclick: surAnnuler }, "Annuler") : null));
  }

  async function valider() {
    const texte = e.texte.trim();
    if (!texte) return montrer("Écris l'énoncé de la question.");
    const points = e.points === "" || Number.isNaN(Number(e.points)) ? 1 : Number(e.points);
    let donnees = { prompt: texte, helper: modele?.helper ?? null, points };
    if (e.libre) {
      donnees = { ...donnees, kind: "free", options: [], solution: null, settings: {} };
    } else {
      const gardes = e.choix.map((c) => ({ t: c.t.trim(), ok: c.ok })).filter((c) => c.t);
      if (gardes.length < 2) return montrer("Il faut au moins deux choix.");
      const sol = gardes.flatMap((c, i) => (c.ok ? [i] : []));
      donnees = { ...donnees, kind: "qcm", options: gardes.map((c) => c.t), solution: sol.length ? sol : null,
        settings: { multi: e.multi || sol.length > 1, partiel: e.partiel, melange: e.melange } };
    }
    try {
      montrer("");
      await surValider(donnees);
      if (!modele) { e = initial(null); peindre(); }
    } catch (err) { montrer(err?.message || "Enregistrement impossible"); }
  }

  peindre();
  return racine;
}
