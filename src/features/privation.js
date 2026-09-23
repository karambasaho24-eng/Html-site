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

/** Les durées proposées. Au-delà, on prive quelqu'un de tout le cours. */
export const MINUTES_OFFERTES = [5, 10, 15, 20, 30];

/** La règle telle que la classe l'a fixée. Par défaut, rien ne bloque. */
export function reglesMateriel(classe) {
  const m = classe?.settings?.materiel || {};
  return {
    bloquant: Boolean(m.bloquant),
    minutes: MINUTES_OFFERTES.includes(Number(m.minutes)) ? Number(m.minutes) : 15
  };
}

/**
 * De quoi écrire : un support ET une fourniture qui trace.
 *
 * On ne bloque pas sur n'importe quel oubli. Oublier sa règle n'empêche pas
 * de prendre des notes ; oublier son cahier ou sa plume, si. La privation
 * doit se justifier d'un mot — « tu n'as rien pour écrire » — sinon elle
 * passe pour de l'arbitraire.
 */
const ECRIVENT = ["plume", "stylo", "crayon", "encre", "bic", "feutre"];

export function nePeutPasEcrire(sac, attendu) {
  const supports = Object.keys(normaliser(sac?.notebooks));
  const fournitures = (sac?.supplies || []).map((f) => String(f).toLowerCase());
  const manque = [];

  // Un support était demandé et n'a pas été apporté : rien où écrire.
  const supportsDemandes = (attendu?.supports || []).length;
  if (supportsDemandes && !supports.length) manque.push("de quoi écrire dessus");

  // Rien qui trace dans la trousse.
  if (!fournitures.some((f) => ECRIVENT.some((e) => f.includes(e)))) {
    manque.push("de quoi écrire avec");
  }
  return manque;
}

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
