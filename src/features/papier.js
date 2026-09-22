/* ---------------------------------------------------------------------------
 * Les papiers que l'on se remet en main propre.
 *
 * Un ordre de mission n'est pas un mot plié en quatre, et une convocation ne
 * ressemble pas à un laissez-passer. Chaque modèle a donc sa mise en page,
 * son en-tête et son pied — sinon tout se vaut, et plus rien ne pèse.
 *
 * Le geste compte autant que le contenu : on tend le papier à quelqu'un qui
 * se tient devant soi, et qui reste libre de le prendre ou de le refuser.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { papiers, personnages } from "../data/index.js";
import { ouvrirModale, confirmer } from "../ui/modal.js";
import { succes, erreur, toast, messageErreur } from "../ui/toast.js";
import { exigerProximite } from "./proximite.js";
import { dateRP, heureRP, reglagesRP, nomAffiche, identiteComplete, universDe } from "../core/rp.js";
import { dateCourte, heure } from "../core/util.js";

/* ===========================================================================
   Les modèles
   ========================================================================= */
export const MODELES = {
  note: {
    libelle: "Mot",
    resume: "Quelques lignes griffonnées, pliées en quatre.",
    titreDefaut: "Mot",
    cachet: false,
    placeholder: "Retrouve-moi derrière l'armurerie après l'appel."
  },
  ordre: {
    libelle: "Ordre de mission",
    resume: "Une consigne qui engage celui qui la reçoit.",
    titreDefaut: "Ordre de mission",
    cachet: true,
    placeholder: "Vous rejoindrez le poste avancé avant la relève du soir."
  },
  convocation: {
    libelle: "Convocation",
    resume: "On est attendu, à une heure et à un endroit.",
    titreDefaut: "Convocation",
    cachet: true,
    placeholder: "Vous êtes convoqué au rapport, salle du conseil."
  },
  laissezpasser: {
    libelle: "Laissez-passer",
    resume: "Une carte qui ouvre un passage, et qu'on présente.",
    titreDefaut: "Laissez-passer",
    cachet: true,
    placeholder: "Autorisé à franchir le mur intérieur, escorte comprise."
  },
  rapport: {
    libelle: "Rapport",
    resume: "Ce qu'on a vu, consigné pour la hiérarchie.",
    titreDefaut: "Rapport de service",
    cachet: false,
    placeholder: "Nature des faits, heure, témoins, suites données."
  }
};

export const LISTE_MODELES = Object.entries(MODELES)
  .map(([cle, m]) => ({ cle, ...m }));

/* ===========================================================================
   Rendu : chaque modèle a sa forme
   ========================================================================= */

/**
 * Dessine un papier tel qu'il se présente dans la main.
 *
 * @param {object} papier             La ligne `papers`.
 * @param {object} [options]
 * @param {object} [options.auteur]   Profil de l'émetteur.
 * @param {object} [options.fiche]    Sa fiche de personnage.
 * @param {object} [options.classe]   Pour le calendrier RP.
 * @param {boolean} [options.miniature] Version réduite, sans corps développé.
 */
export function rendrePapier(papier, options = {}) {
  const modele = MODELES[papier.model] || MODELES.note;
  const regles = reglagesRP(options.classe);
  const enRP = universDe(options.classe) !== "aucun";
  const quand = papier.created_at || new Date().toISOString();
  const dateLisible = enRP ? dateRP(quand, regles) : dateCourte(quand);
  const heureLisible = enRP ? heureRP(quand) : heure(quand);
  const signature = options.auteur
    ? (enRP ? identiteComplete(options.fiche, options.auteur) : options.auteur.display_name)
    : "—";

  const corps = el("div.papier__corps",
    (papier.body || "").split("\n").map((ligne) =>
      ligne.trim() ? el("p", ligne) : el("p.papier__blanc", " "))
  );

  const noeud = el("article.papier", {
    dataset: { modele: papier.model || "note" },
    class: options.miniature ? "papier--miniature" : ""
  });

  if (papier.model === "laissezpasser") {
    noeud.append(
      el("div.papier__perforation", { "aria-hidden": "true" }),
      el("header.papier__entete",
        el("span.papier__surtitre", "Laissez-passer"),
        el("h3.papier__titre", papier.title || modele.titreDefaut)
      ),
      corps,
      el("footer.papier__pied",
        el("div.papier__mention",
          el("span.papier__cle", "Délivré le"), el("span", dateLisible)),
        el("div.papier__mention",
          el("span.papier__cle", "Par"), el("span", signature)),
        cachet(papier, modele)
      )
    );
    return noeud;
  }

  if (papier.model === "rapport") {
    noeud.append(
      el("header.papier__entete.papier__entete--formulaire",
        el("h3.papier__titre", papier.title || modele.titreDefaut),
        el("div.papier__champs",
          champ("Rédigé par", signature),
          champ("Date", dateLisible),
          champ("Moment", heureLisible))
      ),
      el("div.papier__reglure", corps),
      el("footer.papier__pied",
        el("div.papier__signature",
          el("span.papier__cle", "Signature"),
          el("span.papier__trait", { "aria-hidden": "true" }),
          el("span.papier__paraphe", signature))
      )
    );
    return noeud;
  }

  if (papier.model === "note") {
    noeud.append(
      el("div.papier__pliure", { "aria-hidden": "true" }),
      papier.title && papier.title !== modele.titreDefaut
        ? el("h3.papier__titre", papier.title) : null,
      corps,
      el("footer.papier__pied", el("span.papier__paraphe", signature))
    );
    return noeud;
  }

  // Ordre de mission et convocation : en-tête officiel, bande, cachet.
  noeud.append(
    el("div.papier__bande", { "aria-hidden": "true" }),
    el("header.papier__entete",
      el("span.papier__surtitre", modele.libelle),
      el("h3.papier__titre", papier.title || modele.titreDefaut),
      el("span.papier__date", `${dateLisible} · ${heureLisible}`)
    ),
    corps,
    el("footer.papier__pied",
      el("div.papier__signature",
        el("span.papier__cle", "Pour l'autorité"),
        el("span.papier__paraphe", signature)),
      cachet(papier, modele)
    )
  );
  return noeud;

  function champ(cle, valeur) {
    return el("div.papier__mention",
      el("span.papier__cle", cle), el("span", valeur));
  }
}

function cachet(papier, modele) {
  if (!modele.cachet) return null;
  const mention = (papier.seal || "").trim();
  return el("div.papier__cachet", { "aria-label": mention ? `Cachet : ${mention}` : "Cachet" },
    el("span.papier__cachet-anneau", { "aria-hidden": "true" }),
    el("span.papier__cachet-texte", mention || "Vu et approuvé")
  );
}

/* ===========================================================================
   Composition
   ========================================================================= */

/**
 * Rédiger un papier. L'aperçu se redessine à chaque frappe : on voit
 * l'objet qu'on est en train de faire, pas un formulaire.
 */
export async function composerPapier({ classe = null, papier = null } = {}) {
  const depart = papier || { model: "note", title: "", body: "", seal: "" };
  const brouillon = {
    model: depart.model || "note",
    title: depart.title || "",
    body: depart.body || "",
    seal: depart.seal || ""
  };

  const apercu = el("div.papier-apercu");
  const fiche = classe
    ? await personnages.pour(classe.id, etat.utilisateur.id).catch(() => null)
    : null;

  let champTitre, champCorps, champCachet, zoneCachet;

  const sortie = await ouvrirModale({
    titre: papier ? "Reprendre le papier" : "Rédiger un papier",
    large: true,
    corps: () => {
      const noeud = el("div.composeur",
        el("div.composeur__formulaire",
          el("div.champ",
            el("span.champ__label", "Modèle"),
            el("div.modeles", LISTE_MODELES.map((m) => el("button.modele", {
              type: "button",
              dataset: { modele: m.cle },
              "aria-pressed": String(m.cle === brouillon.model),
              onclick: (e) => {
                brouillon.model = m.cle;
                noeud.querySelectorAll(".modele").forEach((b) =>
                  b.setAttribute("aria-pressed", String(b.dataset.modele === brouillon.model)));
                if (!champTitre.value.trim()
                    || LISTE_MODELES.some((x) => x.titreDefaut === champTitre.value.trim())) {
                  champTitre.value = m.titreDefaut;
                  brouillon.title = m.titreDefaut;
                }
                champCorps.placeholder = m.placeholder;
                zoneCachet.hidden = !m.cachet;
                redessiner();
              }
            },
              el("span.modele__figure", { dataset: { modele: m.cle }, "aria-hidden": "true" }),
              el("span.modele__nom", m.libelle),
              el("span.modele__resume", m.resume)
            )))
          ),

          el("label.champ",
            el("span.champ__label", "Intitulé"),
            champTitre = el("input.saisie", {
              value: brouillon.title || MODELES[brouillon.model].titreDefaut,
              oninput: (e) => { brouillon.title = e.currentTarget.value; redessiner(); }
            })
          ),

          el("label.champ",
            el("span.champ__label", "Texte"),
            champCorps = el("textarea.zone", {
              rows: 7, value: brouillon.body,
              placeholder: MODELES[brouillon.model].placeholder,
              oninput: (e) => { brouillon.body = e.currentTarget.value; redessiner(); }
            })
          ),

          zoneCachet = el("label.champ",
            el("span.champ__label", "Mention portée au cachet"),
            champCachet = el("input.saisie", {
              value: brouillon.seal, placeholder: "Vu et approuvé",
              oninput: (e) => { brouillon.seal = e.currentTarget.value; redessiner(); }
            }),
            el("span.champ__aide", "Quatre ou cinq mots, pas davantage : c'est un cachet.")
          )
        ),
        el("div.composeur__apercu",
          el("span.composeur__legende", "Ce que le destinataire aura en main"),
          apercu)
      );
      brouillon.title = brouillon.title || MODELES[brouillon.model].titreDefaut;
      zoneCachet.hidden = !MODELES[brouillon.model].cachet;
      redessiner();
      return noeud;
    },
    actions: [
      { libelle: "Annuler", valeur: null },
      {
        libelle: papier ? "Enregistrer" : "Rédiger", variante: "primaire",
        action: async () => {
          if (!brouillon.body.trim()) {
            champCorps.focus();
            champCorps.classList.add("champ--erreur");
            return false;
          }
          const donnees = {
            title: (brouillon.title || MODELES[brouillon.model].titreDefaut).trim(),
            body: brouillon.body.trim(),
            model: brouillon.model,
            seal: MODELES[brouillon.model].cachet ? (brouillon.seal.trim() || null) : null
          };
          try {
            return papier
              ? await papiers.majorer(papier.id, donnees)
              : await papiers.creer({
                  ...donnees,
                  class_id: classe?.id || null,
                  author_id: etat.utilisateur.id
                });
          } catch (err) {
            erreur("Papier non enregistré", messageErreur(err));
            return false;
          }
        }
      }
    ]
  });

  function redessiner() {
    render(apercu, rendrePapier(
      { ...brouillon, created_at: papier?.created_at || new Date().toISOString() },
      { auteur: etat.profil, fiche, classe }
    ));
  }

  if (sortie) succes(papier ? "Papier repris" : "Papier rédigé");
  return sortie || null;
}

/* ===========================================================================
   Remise en main propre
   ========================================================================= */

/**
 * Tendre un papier. La proximité est exigée avant le geste, et l'attestation
 * est conservée avec la remise : si quelqu'un conteste plus tard, la trace
 * dit qui a déclaré quoi.
 */
export async function tendrePapier({ papier, classe = null, session = null, candidats = [], fiches = new Map() }) {
  const disponibles = candidats.filter((c) => c?.user_id && c.user_id !== etat.utilisateur.id);
  if (!disponibles.length) {
    toast("Personne à qui le tendre pour l'instant.");
    return false;
  }

  const choisis = new Set();
  let exemplaires = 1;

  const valide = await ouvrirModale({
    titre: "Tendre le papier",
    corps: () => el("div",
      el("p.petit.faible",
        "Choisissez qui se tient devant vous. Un exemplaire part par destinataire ; "
        + "au-delà, les copies restent dans votre sacoche."),
      el("div.remise__liste", disponibles.map((c) => el("label.case.remise__ligne",
        el("input", {
          type: "checkbox",
          onchange: (e) => {
            if (e.currentTarget.checked) choisis.add(c.user_id); else choisis.delete(c.user_id);
          }
        }),
        el("span", nomAffiche(fiches.get(c.user_id), c.profil || c) || c.nom || "Participant")
      ))),
      el("label.champ",
        el("span.champ__label", "Exemplaires par destinataire"),
        el("input.saisie", {
          type: "number", min: "1", max: "10", value: "1",
          oninput: (e) => { exemplaires = Math.max(1, Math.min(10, Number(e.currentTarget.value) || 1)); }
        }),
        el("span.champ__aide", "Un ordre affiché en plusieurs endroits, par exemple."))
    ),
    actions: [
      { libelle: "Annuler", valeur: false },
      {
        libelle: "Continuer", variante: "primaire",
        action: () => choisis.size > 0 || (toast("Choisissez au moins une personne."), false)
      }
    ]
  });
  if (!valide) return false;

  const premier = disponibles.find((c) => choisis.has(c.user_id));
  const proche = await exigerProximite({
    motif: "papier",
    cible: premier?.profil || premier,
    personnage: fiches.get(premier?.user_id),
    detail: `« ${papier.title} » — ${choisis.size} destinataire${choisis.size > 1 ? "s" : ""}`
  });
  if (!proche) return false;

  try {
    const copies = exemplaires > 1
      ? [papier, ...(await papiers.dupliquer(papier.id, exemplaires - 1))]
      : [papier];

    for (const destinataire of choisis) {
      for (const copie of copies) {
        await papiers.tendre({
          paper_id: copie.id, from_user: etat.utilisateur.id, to_user: destinataire,
          class_id: classe?.id || null, session_id: session?.id || null, attested: true
        });
      }
    }
    succes(`Papier tendu à ${choisis.size} personne${choisis.size > 1 ? "s" : ""}`);
    return true;
  } catch (err) {
    erreur("Remise impossible", messageErreur(err));
    return false;
  }
}

/**
 * Recevoir. Le destinataire lit d'abord, décide ensuite : on ne refuse pas un
 * papier sans l'avoir regardé, mais on n'est jamais forcé de le garder.
 */
export async function recevoirPapier(remise, { classe = null, fiche = null } = {}) {
  const decision = await ouvrirModale({
    titre: "On vous tend un papier",
    large: true,
    corps: () => el("div.reception",
      el("p.petit.faible",
        nomAffiche(fiche, remise.auteur), " vous tend ce document."),
      el("div.reception__main", rendrePapier(remise.papier, {
        auteur: remise.auteur, fiche, classe
      })),
      el("p.petit.faible.reception__note",
        icone("bouclier", 12),
        " Le refuser est un choix de personnage : l'émetteur en sera informé.")
    ),
    actions: [
      { libelle: "Plus tard", valeur: null },
      { libelle: "Refuser", variante: "danger", valeur: "refused" },
      { libelle: "Le garder", variante: "primaire", valeur: "accepted" }
    ]
  });
  if (!decision) return null;

  try {
    await papiers.repondre(remise.id, decision);
    succes(decision === "accepted" ? "Papier gardé" : "Papier refusé");
    return decision;
  } catch (err) {
    erreur("Réponse non enregistrée", messageErreur(err));
    return null;
  }
}

/** Détruire un papier reçu qu'on avait gardé. Rien ne s'efface du registre. */
export async function dechirerPapier(remise) {
  const ok = await confirmer({
    titre: "Déchirer ce papier",
    message: `« ${remise.papier?.title || "Ce document"} » ne sera plus dans vos affaires. `
      + "La remise, elle, reste inscrite au registre.",
    libelle: "Déchirer", danger: true
  });
  if (!ok) return false;
  try {
    await papiers.repondre(remise.id, "refused");
    return true;
  } catch (err) {
    erreur("Impossible", messageErreur(err));
    return false;
  }
}
