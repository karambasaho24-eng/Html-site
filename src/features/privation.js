/* ---------------------------------------------------------------------------
 * La privation de matériel.
 *
 * Le cartable disait déjà qui était arrivé les mains vides ; il ne s'était
 * rien passé ensuite. Préparer ses affaires n'était donc qu'un décor : on
 * cochait des objets sans conséquence, et l'oubli ne coûtait rien.
 *
 * Ici il coûte. Sans de quoi écrire, on assiste au cours sans pouvoir y
 * prendre part : on voit le tableau, on entend la consigne, et on ne peut
 * rien noter. C'est exactement la punition scolaire ordinaire, et c'est
 * pourquoi elle se joue bien.
 *
 * Deux garde-fous, parce qu'une sanction automatique n'est pas une scène :
 *   — elle tombe d'elle-même à l'échéance, le maître n'a pas à y repenser ;
 *   — le maître peut l'abréger à tout moment, et c'est lui seul qui autorise
 *     à aller chercher ce qu'on a laissé.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { fiche } from "./affaires.js";
import { typesDuSac } from "./materiel.js";

/** Les durées proposées. Au-delà, on prive quelqu'un de tout le cours. */
export const MINUTES_OFFERTES = [5, 10, 15, 20, 30];

/** La règle telle qu'elle a été fixée — pour cette séance d'abord. Par défaut,
 *  rien ne bloque. */
export function reglesMateriel(classe, session = null) {
  const m = session?.materiel || classe?.settings?.materiel || {};
  return {
    bloquant: Boolean(m.bloquant),
    minutes: MINUTES_OFFERTES.includes(Number(m.minutes)) ? Number(m.minutes) : 15
  };
}

/**
 * De quoi écrire : un support ET quelque chose qui trace.
 *
 * On ne bloque pas sur n'importe quel oubli. Oublier sa règle n'empêche pas de
 * prendre des notes ; oublier son cahier ou sa plume, si. La privation doit se
 * justifier d'un mot — « tu n'as rien pour écrire » — sinon elle passe pour de
 * l'arbitraire.
 *
 * Un crayon suffit toujours : il n'a besoin de rien. Une plume réclame de
 * l'encre, et c'est précisément ce qui donne une raison de préparer son sac.
 *
 * Le site juge sur la DÉCLARATION, jamais sur ce qu'il croit savoir du jeu : il
 * regarde ce qui a été mis dans le cartable, et rien d'autre.
 */
export function nePeutPasEcrire(sac, attendu) {
  const supports = Object.keys(normaliser(sac?.notebooks));
  const types = typesDuSac(sac);
  const manque = [];

  // Un support était demandé et n'a pas été apporté : rien où écrire.
  const supportsDemandes = (attendu?.supports || []).length;
  if (supportsDemandes && !supports.length) manque.push("de quoi écrire dessus");

  const quiTracent = [...types].filter((k) => fiche(k)?.ecrit);
  if (!quiTracent.length) {
    manque.push("de quoi écrire avec");
  } else if (quiTracent.every((k) => fiche(k)?.encre) && !types.has("encrier")) {
    // Une plume sans encrier ne trace pas. C'est une scène, pas un détail.
    manque.push("de l'encre");
  }
  return manque;
}

/** Accepte l'ancienne forme (liste d'identifiants) comme la nouvelle. */
function normaliser(valeur) {
  if (!valeur) return {};
  if (Array.isArray(valeur)) return Object.fromEntries(valeur.map((id) => [String(id), ""]));
  return valeur;
}

/** « 12 min 04 » — on montre les secondes : une punition qui s'écoule se supporte. */
export function formaterDelai(secondes) {
  const m = Math.floor(secondes / 60);
  const s = secondes % 60;
  return `${m} min ${String(s).padStart(2, "0")}`;
}

/**
 * Le bandeau du privé. Il dit trois choses, dans cet ordre : ce qui manque,
 * combien de temps il reste, et ce qu'on peut tenter. Sans la troisième, la
 * privation n'est plus qu'un mur.
 */
export function bandeauPrivation({ manquants, privation, secondes, surDemande, surAffaires }) {
  const demande = privation?.state === "asked";
  const refuse = privation?.state === "denied";

  // Le décompte vit dans son propre nœud : on le met à jour chaque seconde
  // sans refaire le bandeau. Un bouton reconstruit sous le doigt avale le
  // clic — et celui-là, justement, est le seul recours du cadet.
  const delai = el("b", secondes > 0 ? `Encore ${formaterDelai(secondes)}.` : "Vous pouvez reprendre.");

  const noeud = el("div.privation", { role: "status" },
    el("span.privation__sceau", { "aria-hidden": "true" }, icone("alerte", 16)),
    el("div.privation__dit",
      el("strong.privation__titre", "Vous n'avez pas de quoi travailler"),
      el("span.privation__detail", `Il vous manque ${manquants.join(" et ")}. `, delai),
      refuse ? el("span.privation__refus", "Le maître a refusé : restez à votre place.") : null
    ),
    el("div.privation__gestes",
      demande
        ? el("span.etiq.etiq--attn", icone("main", 12), "Main levée")
        : el("button.btn.btn--fantome", { onclick: surDemande },
            icone("main", 14), "Demander à aller les chercher"),
      el("button.btn", { onclick: surAffaires }, icone("sac", 14), "Mes affaires")
    )
  );

  noeud.majDelai = (s) => {
    delai.textContent = s > 0 ? `Encore ${formaterDelai(s)}.` : "Vous pouvez reprendre.";
  };
  return noeud;
}

/**
 * Vu de l'estrade : une ligne par privé. On montre ce qui manque parce que
 * c'est cela qui se décide — accorder à quelqu'un d'aller chercher sa plume
 * n'est pas la même chose que lui rendre tout son sac.
 */
export function lignePrivation({ privation, nom, secondes, surAccord, surRefus, surLevee }) {
  const demande = privation.state === "asked";
  return el("div.privation__ligne", { class: demande ? "privation__ligne--demande" : "" },
    el("div", { style: { flex: "1", minWidth: "0" } },
      el("div.tronque", nom, demande ? el("span.etiq.etiq--attn", { style: { marginLeft: "6px" } },
        icone("main", 11), "demande") : null),
      el("div.petit.faible",
        (privation.missing || []).join(" et ") || "matériel incomplet",
        secondes > 0 ? ` · encore ${formaterDelai(secondes)}` : " · temps purgé")
    ),
    demande
      ? el("div.privation__choix",
          el("button.btn.btn--fantome.btn--icone", {
            title: "L'autoriser à aller chercher ses affaires", onclick: surAccord
          }, icone("coche", 14)),
          el("button.btn.btn--fantome.btn--icone", {
            title: "Refuser : il reste à sa place", onclick: surRefus
          }, icone("croix", 14)))
      : el("button.btn.btn--fantome.btn--icone", {
          title: "Lever la privation", onclick: surLevee
        }, icone("entree", 14))
  );
}
