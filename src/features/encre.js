/* ---------------------------------------------------------------------------
 * L'encre, vue du navigateur.
 *
 * Ce module ne DÉCIDE de rien : il lit le portefeuille que la base tient
 * (migration 0039), l'affiche, et prévient l'élève avant qu'il ne tape dans le
 * vide. L'autorité, c'est le serveur : quoi que fasse ce fichier, une écriture
 * sans encre est refusée par la base (erreur IK001), et un navigateur modifié
 * n'y change rien.
 *
 * Ce que l'encre épuisée interdit : produire du contenu (texte, pense-bête,
 * tracé, pièce jointe). Ce qu'elle n'interdit jamais : ouvrir, lire, parcourir,
 * imprimer, copier ses notes et ses documents.
 * ------------------------------------------------------------------------- */
import { boutique, temps } from "../data/index.js";
import { etat, definir, observer } from "../core/store.js";
import { aller } from "../core/router.js";
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";

export const CODE_ENCRE_EPUISEE = "IK001";
export const CODE_CAHIER_A_ACHETER = "NB001";

/** L'erreur renvoyée par la base est-elle « plus d'encre » ? */
export const estEncreEpuisee = (err) =>
  err?.code === CODE_ENCRE_EPUISEE || /Encre épuisée/i.test(String(err?.message || ""));

/** … ou « ce cahier supplémentaire s'achète » ? */
export const estCahierAAcheter = (err) =>
  err?.code === CODE_CAHIER_A_ACHETER || /cahier supplémentaire/i.test(String(err?.message || ""));

/* --- Lecture ---------------------------------------------------------------- */
let engage = 0;               // encre « promise » par la frappe, pas encore débitée par le serveur
let abonnement = null;

/** Relit le portefeuille et les droits de cahiers auprès de la base. */
export async function chargerCommerce() {
  try {
    const commerce = await boutique.moi();
    engage = 0;
    // Un nouvel objet à chaque lecture : les observateurs doivent se réveiller.
    definir({ commerce: { ...commerce } });
    return commerce;
  } catch (err) {
    // Migration 0039 non appliquée : le site reste utilisable, sans limite côté interface.
    console.warn("[encre] portefeuille indisponible (migration 0039 appliquée ?)", err);
    definir({ commerce: null });
    return null;
  }
}

let minuteurSync = null;
/** À appeler après une sauvegarde réussie : le serveur vient de débiter. */
export function synchroniserBientot() {
  clearTimeout(minuteurSync);
  minuteurSync = setTimeout(chargerCommerce, 400);
}

/** Écoute le portefeuille : un achat confirmé ou un geste de l'administration se voit tout de suite. */
export function suivrePortefeuille() {
  abonnement?.fermer?.();
  abonnement = null;
  if (!etat.utilisateur) return;
  try {
    abonnement = temps.sabonner({
      cle: `encre:${etat.utilisateur.id}`,
      tables: [{ table: "ink_wallets", filtre: `user_id=eq.${etat.utilisateur.id}` }],
      surChangement: () => synchroniserBientot()
    });
  } catch (err) {
    console.warn("[encre] temps réel indisponible", err);
  }
}

export function oublierPortefeuille() {
  abonnement?.fermer?.();
  abonnement = null;
  engage = 0;
}

export const estExempte = () => Boolean(etat.commerce?.exempte);

/** Le solde connu, en caractères d'encre. Infini tant qu'il est inconnu ou pour les exemptés. */
export function solde() {
  const c = etat.commerce;
  if (!c || c.exempte) return Infinity;
  return Math.max(0, Number(c.encre?.solde ?? 0) - engage);
}

/** Peut-on encore produire quelque chose ? (jamais un « non » définitif : le serveur tranche) */
export const peutProduire = () => solde() > 0;

/** Coût, en encre, de n caractères de texte. */
export const coutTexte = (n) => Math.max(0, n) * Number(etat.commerce?.regles?.cout_caractere ?? 1);
export const coutTrace = () => Number(etat.commerce?.regles?.cout_trace ?? 20);
export const coutPiece = () => Number(etat.commerce?.regles?.cout_piece ?? 500);

/**
 * Réserve de quoi écrire `cout`. Faux si l'encre ne suffit pas : l'appelant
 * doit alors refuser le geste. La réservation s'efface à la prochaine lecture
 * du portefeuille, qui rend le vrai solde.
 */
export function reserver(cout) {
  if (estExempte() || !etat.commerce) return true;
  if (cout <= 0) return true;
  if (solde() < cout) return false;
  engage += cout;
  return true;
}

/** Combien de caractères le solde permet-il encore d'écrire ? */
export function caracteresRestants() {
  const s = solde();
  if (s === Infinity) return Infinity;
  return Math.floor(s / Math.max(1, Number(etat.commerce?.regles?.cout_caractere ?? 1)));
}

/* --- Affichage -------------------------------------------------------------- */
/** Se repeint à chaque changement du portefeuille, et s'arrête quand l'élément a quitté la page. */
function suivre(racine, peindre) {
  let vu = false;
  const quitter = observer("commerce", () => {
    if (racine.isConnected) vu = true;
    else if (vu) { quitter(); return; }
    peindre();
  });
}

const nombre = (n) => Math.round(n).toLocaleString("fr-FR");

/** « 12 000 caractères » — une unité qui parle à un élève. */
export function libelleSolde() {
  if (estExempte()) return "Encre illimitée";
  const c = caracteresRestants();
  if (c === Infinity) return "";
  if (c <= 0) return "Encre épuisée";
  return `${nombre(c)} caractères`;
}

/** Le solde en deux morceaux : la valeur, puis l'unité (que le téléphone laisse de côté). */
function morceauxSolde() {
  if (estExempte()) return { valeur: "Illimitée", unite: "" };
  const c = caracteresRestants();
  if (c === Infinity) return { valeur: "", unite: "" };
  if (c <= 0) return { valeur: "Épuisée", unite: "" };
  return { valeur: nombre(c), unite: " caractères" };
}

/** La jauge d'encre : une barre et un mot. Se met à jour toute seule. */
export function jaugeEncre({ compacte = false } = {}) {
  const racine = el("button.jauge-encre", {
    type: "button",
    title: "Votre encre — ouvrir la boutique",
    onclick: () => aller("/boutique")
  });
  const peindre = () => {
    const c = etat.commerce;
    racine.hidden = !c;
    if (!c) return;
    const exempte = Boolean(c.exempte);
    const recu = Math.max(1, Number(c.encre?.recu ?? 1), Number(c.encre?.solde ?? 0));
    const part = exempte ? 1 : Math.max(0, Math.min(1, solde() / recu));
    racine.dataset.niveau = exempte ? "plein" : solde() <= 0 ? "vide" : part < 0.15 ? "bas" : "ok";
    racine.replaceChildren(...[
      icone("stylo", 14),
      compacte ? null : (() => {
        const { valeur, unite } = morceauxSolde();
        return el("span.jauge-encre__mot", valeur, unite ? el("span.jauge-encre__unite", unite) : null);
      })(),
      el("span.jauge-encre__piste", el("span.jauge-encre__niveau", { style: `width:${Math.round(part * 100)}%` }))
    ].filter(Boolean));
    racine.setAttribute("aria-label", `Encre : ${libelleSolde()}`);
  };
  peindre();
  suivre(racine, peindre);
  return racine;
}

/** Le bandeau « plus d'encre » : on peut relire, on ne peut plus écrire. */
export function bandeauEncre() {
  const racine = el("div.bandeau-encre", { role: "status" });
  const peindre = () => {
    const vide = Boolean(etat.commerce) && !estExempte() && solde() <= 0;
    racine.hidden = !vide;
    if (!vide) { racine.replaceChildren(); return; }
    racine.replaceChildren(
      icone("stylo", 15),
      el("span.bandeau-encre__texte",
        el("strong", "Plus d'encre. "),
        "Vos cahiers et vos documents restent ouverts à la lecture ; pour écrire de nouveau, il faut une cartouche."),
      el("button.btn.btn--petit", { type: "button", onclick: () => aller("/boutique") }, "Voir les cartouches")
    );
  };
  peindre();
  suivre(racine, peindre);
  return racine;
}

/** Message à montrer quand la base refuse faute d'encre. */
export const MESSAGE_ENCRE_EPUISEE =
  "Vous n'avez plus d'encre. Vos notes sont intactes et restent lisibles ; une cartouche permet de reprendre.";
