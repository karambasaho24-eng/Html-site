/* ---------------------------------------------------------------------------
 * La signature : dessinée (souris, pavé, doigt, stylet) ou écrite au clavier,
 * toujours choisie par le joueur — jamais son pseudo Discord par défaut.
 *
 * Forme stockée (compacte, que des nombres ou du texte brut) :
 *   { kind: "trace", data: { traits: [[x,y,x,y,…], …], epaisseur } }  x 0..600, y 0..200
 *   { kind: "texte", data: { texte, police } }
 * L'affichage reconstruit un SVG à partir de ces nombres : aucun SVG ni HTML
 * venu du navigateur n'est jamais injecté. Signature de jeu, pas certification.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { ouvrirModale } from "../ui/modal.js";
import { toast } from "../ui/toast.js";

const L = 600, H = 200;                    // repère fixe, quelle que soit la taille d'écran
const POLICES = { plume: "Caveat", ronde: "Kalam", script: "Patrick Hand" };  // déjà chargées pour les cahiers
const EPAISSEURS = { fin: 2, moyen: 3.5, epais: 5.5 };
const NS = "http://www.w3.org/2000/svg";

/** Rend une signature stockée en noeud DOM, sans jamais interpréter de balisage. */
export function rendreSignature(sig, { hauteur = 64 } = {}) {
  if (sig?.kind === "texte") {
    const police = POLICES[sig.data?.police] || POLICES.plume;
    return el("span.signature.signature--texte", { style: { fontFamily: `"${police}", cursive`, fontSize: `${Math.round(hauteur * 0.55)}px` } },
      String(sig.data?.texte || "").slice(0, 60));
  }
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${L} ${H}`);
  svg.setAttribute("class", "signature signature--trace");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Signature dessinée");
  svg.style.height = `${hauteur}px`;
  const ep = Number(sig?.data?.epaisseur);
  for (const trait of (Array.isArray(sig?.data?.traits) ? sig.data.traits : []).slice(0, 80)) {
    const n = (Array.isArray(trait) ? trait : []).map(Number).filter(Number.isFinite);
    if (n.length < 2) continue;
    const pts = [];
    for (let i = 0; i + 1 < n.length; i += 2) pts.push(`${Math.max(0, Math.min(L, n[i]))} ${Math.max(0, Math.min(H, n[i + 1]))}`);
    const chemin = document.createElementNS(NS, "path");
    chemin.setAttribute("d", `M${pts[0]}` + (pts.length > 1 ? `L${pts.slice(1).join("L")}` : `l0.1 0`));
    chemin.setAttribute("fill", "none");
    chemin.setAttribute("stroke", "currentColor");
    chemin.setAttribute("stroke-width", String(Number.isFinite(ep) && ep > 0 && ep < 12 ? ep : EPAISSEURS.moyen));
    chemin.setAttribute("stroke-linecap", "round");
    chemin.setAttribute("stroke-linejoin", "round");
    svg.appendChild(chemin);
  }
  return svg;
}

/** Ouvre l'atelier de signature. Résout { kind, data } ou null. */
export function creerSignature({ initiale = null, titre = "Ma signature" } = {}) {
  let mode = initiale?.kind === "texte" ? "texte" : "trace";
  let traits = initiale?.kind === "trace" ? structuredClone(initiale.data.traits || []) : [];
  let epaisseur = initiale?.data?.epaisseur || EPAISSEURS.moyen;
  let texte = initiale?.kind === "texte" ? initiale.data.texte : "";
  let police = initiale?.kind === "texte" ? initiale.data.police : "plume";
  let enCours = null;

  const toile = el("canvas.signature__toile", { width: L * 2, height: H * 2, "aria-label": "Zone de signature : dessinez avec la souris, le doigt ou un stylet" });
  const ctx = toile.getContext("2d");

  function dessiner() {
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, L, H);
    ctx.strokeStyle = "#1b1b1d"; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = epaisseur;
    for (const t of enCours ? [...traits, enCours] : traits) {
      ctx.beginPath(); ctx.moveTo(t[0], t[1]);
      if (t.length === 2) ctx.lineTo(t[0] + 0.1, t[1]);
      for (let i = 2; i + 1 < t.length; i += 2) ctx.lineTo(t[i], t[i + 1]);
      ctx.stroke();
    }
  }
  const point = (e) => {
    const r = toile.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * L), Math.round(((e.clientY - r.top) / r.height) * H)];
  };
  toile.addEventListener("pointerdown", (e) => {
    e.preventDefault(); toile.setPointerCapture(e.pointerId);
    enCours = point(e); dessiner();
  });
  toile.addEventListener("pointermove", (e) => {
    if (!enCours) return;
    // Les événements regroupés suivent finement un stylet ou un doigt rapide.
    for (const ev of e.getCoalescedEvents?.() || [e]) {
      const [x, y] = point(ev);
      const lx = enCours.at(-2), ly = enCours.at(-1);
      if (Math.abs(x - lx) + Math.abs(y - ly) >= 2) enCours.push(x, y);
    }
    dessiner();
  });
  const finir = () => {
    if (!enCours) return;
    if (traits.length < 80 && JSON.stringify(traits).length < 20000) traits.push(enCours);
    else toast("Signature trop chargée", { corps: "Effacez un peu avant d'ajouter des traits." });
    enCours = null; dessiner();
  };
  toile.addEventListener("pointerup", finir);
  toile.addEventListener("pointercancel", finir);

  const apercu = el("div.signature__apercu");
  const peindreTexte = () => apercu.replaceChildren(texte.trim()
    ? rendreSignature({ kind: "texte", data: { texte, police } }, { hauteur: 80 })
    : el("span.petit.faible", "Votre signature apparaîtra ici."));

  const zoneTrace = el("div.signature__zone",
    toile,
    el("div.signature__outils",
      el("button.btn", { type: "button", onclick: () => { traits.pop(); dessiner(); } }, "Annuler le trait"),
      el("button.btn", { type: "button", onclick: () => { traits = []; dessiner(); } }, "Tout effacer"),
      el("label.signature__epaisseur", "Trait",
        el("select.saisie", { onchange: (e) => { epaisseur = Number(e.currentTarget.value); dessiner(); } },
          Object.entries(EPAISSEURS).map(([nom, v]) => el("option", { value: String(v), selected: v === epaisseur },
            { fin: "fin", moyen: "moyen", epais: "épais" }[nom]))))));
  const zoneTexte = el("div.signature__zone",
    el("input.saisie", { value: texte, maxLength: 60, placeholder: "Votre signature : nom RP, initiales…",
      "aria-label": "Texte de la signature", oninput: (e) => { texte = e.currentTarget.value; peindreTexte(); } }),
    el("div.signature__polices", Object.keys(POLICES).map((cle) => el("button.btn", {
      type: "button", "aria-pressed": String(cle === police), style: { fontFamily: `"${POLICES[cle]}", cursive` },
      onclick: (e) => { police = cle; e.currentTarget.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); peindreTexte(); }
    }, { plume: "Plume", ronde: "Ronde", script: "Script" }[cle]))),
    apercu);

  const onglets = el("div.signature__modes", { role: "tablist" },
    ["trace", "texte"].map((m) => el("button.btn", {
      type: "button", role: "tab", "aria-selected": String(m === mode),
      onclick: (e) => { mode = m; montrer(); e.currentTarget.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === e.currentTarget))); }
    }, m === "trace" ? "Dessiner" : "Écrire")));
  const montrer = () => { zoneTrace.hidden = mode !== "trace"; zoneTexte.hidden = mode !== "texte"; if (mode === "trace") dessiner(); };

  setTimeout(() => { montrer(); peindreTexte(); }, 0);

  return ouvrirModale({
    titre, large: true,
    corps: () => el("div.signature", onglets, zoneTrace, zoneTexte,
      el("p.petit.faible", "Une signature de jeu : elle identifie votre personnage, ce n'est pas une signature légale.")),
    actions: [
      { libelle: "Annuler", valeur: null },
      { libelle: "Valider", variante: "primaire", action: () => {
        if (mode === "trace") return traits.length ? { kind: "trace", data: { traits, epaisseur } } : (toast("Dessinez votre signature."), false);
        return texte.trim() ? { kind: "texte", data: { texte: texte.trim(), police } } : (toast("Écrivez votre signature."), false);
      } }
    ]
  });
}
