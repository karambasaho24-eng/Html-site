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
import { papiers, personnages, profils } from "../data/index.js";
import { ouvrirModale, confirmer } from "../ui/modal.js";
import { succes, erreur, toast, messageErreur } from "../ui/toast.js";
import { exigerProximite } from "./proximite.js";
import { dateRP, heureRP, reglagesRP, nomAffiche, identiteComplete, universDe } from "../core/rp.js";
import { dateCourte, heure } from "../core/util.js";
import { champLieu, retenirLieu } from "./lieux.js";
import { vignetteRemise, apparenceDe } from "./scene-remise.js";
import { enLisant } from "./lecture.js";

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
export async function composerPapier({ classe = null, papier = null, modele = null } = {}) {
  // `modele` permet d'arriver avec le bon papier déjà en main : depuis la
  // console, « une convocation » ne doit pas commencer par choisir un modèle.
  const depart = papier || { model: modele || "note", title: "", body: "", seal: "" };
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
 *
 * On dit aussi OÙ l'on est, et l'on peut décrire la scène. Sans description,
 * la remise remonte dans la liste de la modération : pas pour punir, pour
 * qu'on puisse vérifier.
 *
 * Les candidats sont ceux qu'on croise dans ses espaces ; on peut aussi
 * chercher quelqu'un par son pseudo — on se croise aussi dans la rue.
 */
export async function tendrePapier({ papier, classe = null, session = null, candidats = [], fiches = new Map() }) {
  const disponibles = candidats.filter((c) => c?.user_id && c.user_id !== etat.utilisateur.id);
  const choisis = new Map();            // user_id → { user_id, profil, nom }
  let exemplaires = 1;
  let description = "";
  const liste = el("div.remise__liste");
  const resultats = el("span.remise__resultats");
  // Une seule personne à portée : c'est sans doute elle.
  if (disponibles.length === 1) choisis.set(disponibles[0].user_id, disponibles[0]);
  const lieu = champLieu({
    libelle: "Où êtes-vous, en jeu ?", requis: true,
    valeur: classe && session ? `Salle — ${classe.name}` : ""
  });

  const nomDe = (c) => nomAffiche(fiches.get(c.user_id), c.profil || c) || c.nom || "Quelqu'un";
  const ligne = (c) => el("label.case.remise__ligne",
    el("input", {
      type: "checkbox", checked: choisis.has(c.user_id),
      onchange: (e) => { if (e.currentTarget.checked) choisis.set(c.user_id, c); else choisis.delete(c.user_id); }
    }),
    el("span", nomDe(c)),
    c.espace ? el("span.petit.faible", ` · ${c.espace.name}`) : null);

  function peindreListe() {
    const tous = [...disponibles, ...[...choisis.values()].filter((c) => !disponibles.some((d) => d.user_id === c.user_id))];
    liste.replaceChildren(...(tous.length ? tous.map(ligne)
      : [el("p.petit.faible", "Personne dans vos espaces : cherchez la personne par son pseudo.")]));
  }

  let delai = null;
  async function chercher(texte) {
    clearTimeout(delai);
    delai = setTimeout(async () => {
      const trouves = (await profils.chercher(texte).catch(() => []))
        .filter((p) => p.id !== etat.utilisateur.id);
      resultats.replaceChildren(...trouves.map((p) => el("button.puce", {
        type: "button",
        onclick: () => {
          choisis.set(p.id, { user_id: p.id, profil: p, nom: p.display_name });
          resultats.replaceChildren();
          peindreListe();
        }
      }, "+ ", p.display_name)));
      if (texte.trim().length >= 2 && !trouves.length) resultats.append(el("span.petit.faible", "Aucun pseudo ne correspond."));
    }, 220);
  }

  peindreListe();
  const valide = await ouvrirModale({
    titre: "Tendre le papier",
    corps: () => el("div.remise-form",
      el("p.petit.faible",
        "À qui le tendez-vous ? Un exemplaire part par destinataire ; "
        + "au-delà, les copies restent dans votre sacoche."),
      liste,
      el("label.champ",
        el("span.champ__label", "Quelqu'un d'autre ? Son pseudo"),
        el("input.saisie", {
          type: "search", placeholder: "Pseudo du joueur…", autocomplete: "off",
          oninput: (e) => chercher(e.currentTarget.value)
        }),
        resultats),
      lieu.noeud,
      el("label.champ",
        el("span.champ__label", "La scène, en quelques mots"),
        el("textarea.zone", {
          rows: "2", maxlength: "600",
          placeholder: "Je le lui glisse à la sortie de la taverne, à l'abri des regards…",
          oninput: (e) => { description = e.currentTarget.value; }
        }),
        el("span.champ__aide",
          "Facultatif. Sans description, la remise est signalée à la modération, qui vérifiera.")),
      el("label.champ",
        el("span.champ__label", "Exemplaires par destinataire"),
        el("input.saisie", {
          type: "number", min: "1", max: "10", value: "1",
          oninput: (e) => { exemplaires = Math.max(1, Math.min(10, Number(e.currentTarget.value) || 1)); }
        }))
    ),
    actions: [
      { libelle: "Annuler", valeur: false },
      {
        libelle: "Continuer", variante: "primaire",
        action: () => {
          if (!choisis.size) { toast("Choisissez au moins une personne."); return false; }
          if (!lieu.valeur()) {
            lieu.saisie.classList.add("champ--erreur");
            lieu.saisie.focus();
            toast("Dites où vous êtes", { corps: "Le lieu de la remise est demandé.", type: "attn" });
            return false;
          }
          return true;
        }
      }
    ]
  });
  if (!valide) return false;

  const premier = [...choisis.values()][0];
  const proche = await exigerProximite({
    motif: "papier",
    cible: premier?.profil || premier,
    personnage: fiches.get(premier?.user_id),
    detail: `« ${papier.title} » — ${choisis.size} destinataire${choisis.size > 1 ? "s" : ""} · ${lieu.valeur()}`,
    scene: {
      de: { nom: "Vous", avatar: apparenceDe(etat.profil ? { ...etat.profil, id: etat.utilisateur.id } : null), moi: true },
      a: { nom: nomDe(premier), avatar: apparenceDe(premier?.profil) },
      objet: "papier"
    }
  });
  if (!proche) return false;

  try {
    const copies = exemplaires > 1
      ? [papier, ...(await papiers.dupliquer(papier.id, exemplaires - 1))]
      : [papier];
    const ou = lieu.valeur();
    const scene = description.trim() || null;
    for (const c of choisis.values()) {
      for (const copie of copies) {
        await papiers.tendre({
          paper_id: copie.id, from_user: etat.utilisateur.id, to_user: c.user_id,
          // L'espace où l'on se croise, s'il y en a un ; dans la rue, aucun.
          class_id: c.espace?.id || (disponibles.some((d) => d.user_id === c.user_id) ? classe?.id || null : null),
          session_id: session?.id || null, attested: true,
          lieu: ou, description: scene
        });
      }
    }
    retenirLieu(ou);
  } catch (err) {
    erreur("Remise impossible", messageErreur(err));
    return false;
  }

  // Le geste : on tend le papier. L'autre doit maintenant dire qu'on est bien là.
  const vignette = vignetteRemise({
    de: { nom: "Vous", avatar: apparenceDe({ ...etat.profil, id: etat.utilisateur.id }), moi: true },
    a: { nom: nomDe(premier), avatar: apparenceDe(premier?.profil) },
    objet: "papier", vue: "de", phase: "tend"
  });
  await ouvrirModale({
    titre: "Papier tendu",
    surFermeture: () => vignette.detruire(),
    corps: () => el("div.reception",
      vignette.noeud,
      el("p",
        "Vous tendez « ", el("strong", papier.title), " » à ",
        el("strong", [...choisis.values()].map(nomDe).join(", ")), "."),
      el("p.petit.faible",
        "Restez près de lui en jeu : il reçoit une notification et doit confirmer, de son côté, "
        + "que vous êtes bien devant lui. Tant qu'il n'a pas répondu, le papier reste en attente."),
      avertissement("Cette remise est enregistrée — qui, à qui, où et quand. La modération peut la vérifier.")),
    actions: [{ libelle: "Compris", variante: "primaire", valeur: true }]
  });
  return true;
}

/** Le bandeau qui prévient : ce qui est dit ici est enregistré. */
export function avertissement(texte) {
  return el("div.avertissement", { role: "note" },
    icone("bouclier", 15),
    el("p", el("strong", "Attention. "), texte));
}

/**
 * Recevoir. D'abord la question qui fonde tout : la personne qui me tend ce
 * papier est-elle devant moi, en jeu ? Puis où je suis. Ensuite seulement, on
 * prend le papier, on le lit, on le garde ou on le refuse.
 *
 * Non : la remise est refusée, et cela reste au registre.
 */
export async function recevoirPapier(remise, { classe = null, fiche = null } = {}) {
  const auteur = nomAffiche(fiche, remise.auteur);
  const de = { nom: auteur, avatar: apparenceDe(remise.auteur) };
  const moi = { nom: "Vous", avatar: apparenceDe({ ...etat.profil, id: etat.utilisateur.id }), moi: true };

  // Un papier déjà tranché : on le relit, c'est tout.
  if (remise.state !== "offered") {
    await enLisant("papier", ouvrirModale({
      titre: remise.papier?.title || "Papier",
      large: true,
      corps: () => el("div.reception",
        el("div.reception__main", rendrePapier(remise.papier, { auteur: remise.auteur, fiche, classe }))),
      actions: [{ libelle: "Refermer", variante: "primaire", valeur: true }]
    }));
    return null;
  }

  // 1. Est-il bien devant moi ?
  if (remise.presence == null) {
    const vignette = vignetteRemise({ de, a: moi, objet: "papier", vue: "a", phase: "approche" });
    setTimeout(() => vignette.jouer("tend"), 2500);
    const lieu = champLieu({
      libelle: "Où êtes-vous, en jeu ?", requis: true,
      aide: remise.lieu ? `${auteur} dit être : ${remise.lieu}.` : null
    });
    const reponse = await ouvrirModale({
      titre: "On vous tend un papier",
      surFermeture: () => vignette.detruire(),
      corps: () => el("div.reception",
        vignette.noeud,
        el("p.reception__qui",
          el("strong", auteur), " vous tend « ", el("strong", remise.papier?.title || "un papier"), " »",
          remise.lieu ? ` — ${remise.lieu}` : "", "."),
        remise.description ? el("blockquote.reception__scene", remise.description) : null,
        el("p.reception__question", "Cette personne est-elle bien devant vous, en jeu ?"),
        lieu.noeud,
        avertissement("Votre réponse et cette remise sont enregistrées. Les modérateurs vérifient "
          + "que les informations sont exactes : qui, où, quand.")),
      actions: [
        { libelle: "Plus tard", valeur: null },
        { libelle: "Non, pas devant moi", variante: "danger", valeur: "non" },
        {
          libelle: "Oui, devant moi", variante: "primaire",
          action: () => {
            if (lieu.valeur()) return "oui";
            lieu.saisie.classList.add("champ--erreur");
            lieu.saisie.focus();
            return false;
          }
        }
      ]
    });
    if (!reponse) return null;
    try {
      await papiers.confirmerPresence(remise.id, { present: reponse === "oui", lieu: lieu.valeur() });
      if (lieu.valeur()) retenirLieu(lieu.valeur());
    } catch (err) {
      erreur("Réponse non enregistrée", messageErreur(err));
      return null;
    }
    if (reponse === "non") {
      toast("Remise refusée", {
        corps: `Vous avez indiqué que ${auteur} n'était pas devant vous. C'est inscrit au registre.`,
        type: "attn", duree: 8000
      });
      return "refused";
    }
    remise = { ...remise, presence: true, lieu_reception: lieu.valeur() };
  }

  // 2. On prend le papier, on le lit, on décide.
  const vignette = vignetteRemise({ de, a: moi, objet: "papier", vue: "a", phase: "tend" });
  setTimeout(() => vignette.jouer("prend"), 450);
  const decision = await enLisant("papier", ouvrirModale({
    titre: "Vous prenez le papier",
    large: true,
    surFermeture: () => vignette.detruire(),
    corps: () => el("div.reception",
      vignette.noeud,
      el("p.petit.faible", auteur, " vous a remis ce document",
        remise.lieu_reception ? ` — ${remise.lieu_reception}` : "", "."),
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
  }));
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
