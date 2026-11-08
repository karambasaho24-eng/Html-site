/* ---------------------------------------------------------------------------
 * Les personnes présentes.
 *
 * Pas de fiches, pas de gros avatars : un pictogramme et un nom, sur une bande
 * qu'on fait défiler. On sait qui est là d'un coup d'œil, et on s'adresse à
 * quelqu'un d'un clic. Le reste du temps, un simple « 👥 6 » suffit.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { docHote } from "../core/hote.js";

const NS = "http://www.w3.org/2000/svg";

/** Une silhouette debout, sobre. `role` : "responsable" la souligne. */
export function pictogramme(role = "") {
  const doc = docHote();
  const svg = doc.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 32");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("picto-personne");
  if (role) svg.dataset.role = role;
  const tete = doc.createElementNS(NS, "circle");
  tete.setAttribute("cx", "12"); tete.setAttribute("cy", "7.5"); tete.setAttribute("r", "5");
  const corps = doc.createElementNS(NS, "path");
  corps.setAttribute("d", "M2.5 31.5c0-7.4 4.3-12.6 9.5-12.6s9.5 5.2 9.5 12.6z");
  svg.append(tete, corps);
  return svg;
}

/**
 * La bande : ◀ personnes ▶, et leur nombre.
 * @param {object} o
 * @param {Array}  o.personnes  lignes { user_id, … }
 * @param {Function} o.nomDe    (p) → nom affiché
 * @param {Function} [o.roleDe] (p) → "responsable" | ""
 * @param {Function} [o.surChoix] (p, ancre) → geste
 * @param {string} [o.choisi]   user_id sélectionné (sélection simple)
 */
export function bandePersonnes({ personnes = [], nomDe, roleDe = () => "", surChoix = null, choisi = null, legende = null }) {
  const piste = el("div.bande__piste", { role: "list" });
  const n = personnes.length;

  render(piste, n
    ? personnes.map((p) => el("button.bande__personne", {
        type: "button", role: "listitem",
        "aria-pressed": choisi != null ? String(String(p.user_id) === String(choisi)) : null,
        title: nomDe(p),
        onclick: (e) => {
          if (choisi != null) {
            piste.querySelectorAll(".bande__personne").forEach((b) => b.setAttribute("aria-pressed", "false"));
            e.currentTarget.setAttribute("aria-pressed", "true");
          }
          surChoix?.(p, e.currentTarget);
        }
      }, pictogramme(roleDe(p)), el("span.bande__nom", nomDe(p))))
    : el("span.bande__vide", "Personne pour l'instant."));

  const defiler = (sens) => piste.scrollBy({ left: sens * Math.max(160, piste.clientWidth * .7), behavior: "smooth" });

  return el("div.bande",
    el("button.bande__fleche", { type: "button", "aria-label": "Précédents", onclick: () => defiler(-1) }, icone("chevronG", 14)),
    piste,
    el("button.bande__fleche", { type: "button", "aria-label": "Suivants", onclick: () => defiler(1) }, icone("chevronD", 14)),
    el("span.bande__compte", legende || `${n} personne${n > 1 ? "s" : ""}`));
}

/** « 👥 6 » : le compteur discret qui ouvre la bande. */
export function compteurPersonnes(n, onclick) {
  return el("button.compteur-personnes", {
    type: "button", title: "Personnes présentes", onclick
  }, pictogramme(), el("span", String(n)));
}

/**
 * La bande en surimpression, posée au-dessus (ou au-dessous) d'un bouton.
 * Se referme au clic ailleurs ou sur Échap.
 */
export function ouvrirBande(ancre, options) {
  const doc = docHote();
  doc.querySelector(".bande-flottante")?.remove();
  const bande = bandePersonnes({
    ...options,
    surChoix: (p, b) => { fermer(); options.surChoix?.(p, b); }
  });
  const hote = el("div.bande-flottante", { role: "dialog", "aria-label": "Personnes présentes" }, bande);
  doc.body.appendChild(hote);

  const r = ancre?.getBoundingClientRect?.();
  const vue = doc.defaultView;
  if (r) {
    const enBas = r.top < vue.innerHeight / 2;
    hote.style.left = `${Math.max(8, Math.min(vue.innerWidth - hote.offsetWidth - 8, r.left + r.width / 2 - hote.offsetWidth / 2))}px`;
    if (enBas) hote.style.top = `${r.bottom + 8}px`;
    else hote.style.bottom = `${vue.innerHeight - r.top + 8}px`;
  }

  const ailleurs = (e) => { if (!hote.contains(e.target) && e.target !== ancre && !ancre?.contains?.(e.target)) fermer(); };
  const echap = (e) => { if (e.key === "Escape") fermer(); };
  setTimeout(() => { doc.addEventListener("pointerdown", ailleurs, true); doc.addEventListener("keydown", echap); });
  function fermer() {
    hote.remove();
    doc.removeEventListener("pointerdown", ailleurs, true);
    doc.removeEventListener("keydown", echap);
  }
  return fermer;
}
