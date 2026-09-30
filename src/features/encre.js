/* ---------------------------------------------------------------------------
 * L'encre.
 *
 * Une plume boit à l'encrier : chaque ligne écrite l'entame, et un encrier
 * vide ne trace plus. On le remplit au flacon — chez soi, ou avec le flacon
 * qu'on a pris dans son sac. Un flacon remplit quatre encriers.
 *
 * Le niveau se voit au-dessus du cahier, partout où l'on écrit : chez soi, en
 * classe, dans la fenêtre flottante.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { affaires as depotAffaires } from "../data/index.js";
import { toast, erreur, messageErreur } from "../ui/toast.js";
import { debounce } from "../core/util.js";
import { figureObjet } from "./affaires.js";

/** Un point d'encre (1 %) tous les cinquante caractères : un encrier plein fait quelques pages. */
export const CARACTERES_PAR_POINT = 50;

/**
 * Ce qui boit : on lui signale chaque frappe, il entame l'encrier au point
 * entier (pas de requête à chaque lettre).
 */
export function creerBuveur({ encrier, surVide = null, surChange = null }) {
  let frais = 0;
  const boire = debounce(async () => {
    const e = encrier();
    if (!e) { frais = 0; return; }
    const points = Math.floor(frais / CARACTERES_PAR_POINT);
    if (points < 1) return;
    frais -= points * CARACTERES_PAR_POINT;
    const avant = Number(e.level ?? 0);
    try {
      Object.assign(e, await depotAffaires.consommer(e, points));
    } catch { return; /* un encrier qu'on ne peut pas entamer n'empêche pas d'écrire */ }
    const niveau = Number(e.level ?? 0);
    surChange?.(e);
    if (niveau <= 0) {
      toast("Votre encrier est vide", {
        corps: "La plume gratte le papier sans rien laisser. Remplissez-le au flacon, ou prenez un crayon.",
        type: "attn", duree: 10000
      });
      surVide?.(e);
    } else if (niveau <= 15 && avant > 15) {
      toast("L'encre baisse", { corps: `Il reste ${niveau} % dans l'encrier.`, type: "attn" });
    }
  }, 900);
  return { frappe(n = 1) { frais += n; boire(); } };
}

/** La jauge : l'encrier, ce qu'il reste, et « Remplir » quand on le peut. */
export function jaugeEncre(encrier, { remplir = null } = {}) {
  const niveau = Math.max(0, Math.min(100, Math.round(Number(encrier?.level ?? 0))));
  return el("div.encre-niveau", {
    dataset: { bas: niveau <= 15 ? "1" : "", vide: niveau <= 0 ? "1" : "" },
    title: `Encre : ${niveau} %`
  },
    figureObjet("encrier"),
    el("span.encre-niveau__mot", niveau <= 0 ? "Encrier vide" : "Encre"),
    el("span.jauge", el("span.jauge__remplissage", { style: { width: `${Math.max(3, niveau)}%` } })),
    el("span.encre-niveau__pc", `${niveau} %`),
    remplir && niveau < 100
      ? el("button.btn.btn--petit.encre-niveau__remplir", { type: "button", onclick: remplir }, icone("goutte", 13), "Remplir")
      : null);
}

/**
 * Remplir son encrier chez soi : au flacon de la maison. Plus de flacon (ou
 * un flacon vide) : on en entame un neuf, rangé sur le bureau de la chambre.
 */
export async function remplirChezSoi(bureau) {
  const objets = bureau.objets();
  const encrier = bureau.peutFaire("ecrire").encrier
    || bureau.surLeBureau().find((o) => o.kind === "encrier")
    || objets.find((o) => o.kind === "encrier" && o.state !== "lost");
  if (!encrier) { toast("Vous n'avez pas d'encrier."); return false; }
  let flacon = objets.find((o) => o.kind === "encre" && Number(o.level || 0) > 0 && o.state !== "lost"
    && (o.place || "range") === "range");
  try {
    if (!flacon) {
      flacon = await depotAffaires.creer({
        owner_id: bureau.moi, kind: "encre", label: "Flacon d'encre", category: "ecriture",
        level: 100, size: 2
      });
      objets.push(flacon);
      toast("Un flacon neuf", { corps: "Vous entamez un flacon d'encre, posé sur votre bureau.", duree: 3500 });
    }
    const { verse } = await depotAffaires.remplir(encrier, flacon);
    if (!verse) { toast("L'encrier est déjà plein."); return false; }
    await bureau.charger();
    toast("Encrier rempli", { corps: "La plume peut écrire.", type: "ok" });
    return true;
  } catch (err) {
    erreur("Impossible de remplir", messageErreur(err));
    return false;
  }
}
