/* ---------------------------------------------------------------------------
 * Fiche de personnage.
 *
 * Le compte identifie le joueur, la fiche identifie le personnage. C'est elle
 * qui signe les carnets, les questions et les appels : sans elle, un rapport
 * militaire se retrouve signé « xX_Dark_Xx », et le HRP est déjà commis avant
 * que quiconque ait ouvert la bouche.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { personnages } from "../data/index.js";
import { formulaire } from "../ui/modal.js";
import { succes, erreur, messageErreur } from "../ui/toast.js";
import { gradesDisponibles, corpsDisponibles, nomAffiche, universDe } from "../core/rp.js";
import { L } from "../core/lexique.js";

/** Présentation en lecture d'une fiche. */
export function carteFiche(personnage, profil, options = {}) {
  if (!personnage) {
    return el("div.vide",
      el("span.vide__titre", "Aucune fiche de personnage"),
      el("p", options.sien
        ? "Tant que vous n'en avez pas, c'est le nom de votre compte qui signe vos écrits."
        : "Ce membre n'a pas encore renseigné son identité."),
      options.surEdition
        ? el("button.btn.btn--primaire", { onclick: options.surEdition },
            icone("profil", 15), "Créer ma fiche")
        : null
    );
  }

  const ligne = (cle, valeur) => valeur
    ? el("div.fiche__ligne", el("span.fiche__cle", cle), el("span.fiche__valeur", valeur))
    : null;

  return el("div.fiche",
    el("div.fiche__entete",
      personnage.rank ? el("span.fiche__grade", personnage.rank) : null,
      el("span.fiche__nom", nomAffiche(personnage, profil)),
      el("span.pousse"),
      options.surEdition
        ? el("button.btn.btn--fantome.btn--icone", {
            "aria-label": "Modifier la fiche", onclick: options.surEdition
          }, icone("crayon", 15))
        : null
    ),
    ligne("Corps", personnage.corps),
    ligne("Promotion", personnage.promotion),
    ligne("Origine", personnage.origin),
    ligne("Naissance", personnage.born),
    personnage.bio ? el("div.fiche__bio", personnage.bio) : null
  );
}

/**
 * Ouvre l'éditeur de fiche. Les grades et corps proposés viennent de l'univers
 * choisi pour l'espace : dans une académie militaire, on ne se déclare pas
 * « directeur marketing ».
 */
export async function editerFiche({ classe, personnage, utilisateurId, profil }) {
  const grades = gradesDisponibles(classe);
  const corps = corpsDisponibles(classe);
  const libre = { valeur: "", libelle: "— non précisé —" };

  const champs = [
    {
      cle: "name", label: "Nom du personnage", requis: true,
      valeur: personnage?.name || "",
      placeholder: "Jean Marchand",
      aide: "C'est ce nom qui signera vos carnets et vos questions."
    },
    grades.length
      ? { cle: "rank", label: "Grade", type: "select", valeur: personnage?.rank || "",
          options: [libre, ...grades.map((g) => ({ valeur: g, libelle: g }))] }
      : { cle: "rank", label: "Grade", valeur: personnage?.rank || "" },
    corps.length
      ? { cle: "corps", label: "Corps ou unité", type: "select", valeur: personnage?.corps || "",
          options: [libre, ...corps.map((c) => ({ valeur: c, libelle: c }))] }
      : { cle: "corps", label: "Corps ou unité", valeur: personnage?.corps || "" },
    { cle: "promotion", label: "Promotion", valeur: personnage?.promotion || "",
      placeholder: "104ᵉ brigade d'entraînement" },
    { cle: "origin", label: "Origine", valeur: personnage?.origin || "",
      placeholder: "District de Shiganshina" },
    { cle: "born", label: "Naissance", valeur: personnage?.born || "",
      placeholder: "an 835, au printemps",
      aide: "Telle que votre personnage la dirait — pas une date du calendrier réel." },
    { cle: "bio", label: "Ce que l'on sait de lui", type: "textarea", lignes: 4,
      valeur: personnage?.bio || "" }
  ];

  const sortie = await formulaire({
    titre: personnage ? "Modifier ma fiche" : "Ma fiche de personnage",
    large: true,
    note: `Visible des membres de cette ${L("classe")}. Votre compte, lui, reste privé.`,
    champs,
    libelle: "Enregistrer"
  });
  if (!sortie) return null;

  try {
    const enregistree = await personnages.enregistrer(classe.id, utilisateurId, {
      name: sortie.name,
      rank: sortie.rank || null,
      corps: sortie.corps || null,
      promotion: sortie.promotion || null,
      origin: sortie.origin || null,
      born: sortie.born || null,
      bio: sortie.bio || null
    });
    succes("Fiche enregistrée", nomAffiche(enregistree, profil));
    return enregistree;
  } catch (err) {
    erreur("Enregistrement impossible", messageErreur(err));
    return null;
  }
}

/**
 * Invite discrète, affichée à qui entre dans un espace RP sans fiche.
 * Ni bloquante ni culpabilisante : on peut travailler sans, simplement le nom
 * du compte servira de signature.
 */
export function inviteFiche(classe, surEdition) {
  if (universDe(classe) === "aucun") return null;
  return el("div.carte", { style: { borderColor: "var(--ligne-laiton)" } },
    el("div.ligne-flex",
      icone("profil", 16),
      el("div", { style: { flex: "1", minWidth: "0" } },
        el("b.petit", "Vous n'avez pas encore de fiche de personnage"),
        el("p.petit.doux", { style: { margin: "4px 0 0" } },
          "Sans elle, c'est le nom de votre compte qui apparaît dans les appels et "
          + "au bas de vos écrits — ce qui casse la scène pour tout le monde.")
      ),
      el("button.btn.btn--primaire", { onclick: surEdition }, "Créer ma fiche")
    )
  );
}
