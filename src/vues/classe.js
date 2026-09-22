/* ---------------------------------------------------------------------------
 * Fiche de classe : aperçu, membres, sessions, cahier commun, documents,
 * exercices, annonces, présences, réglages.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { L } from "../core/lexique.js";
import { classes as depotClasses, membres as depotMembres, sessions as depotSessions, cahiers, annonces, documents, exercices, journal, notifications } from "../data/index.js";
import { activerClasse, rafraichirClasses } from "../core/session.js";
import { entete, blocVide, avatar, statistique, etiquetteStatutSession, vignetteCahier } from "../ui/fragments.js";
import { encadre, LIBELLES_ROLES_CLASSE } from "../core/permissions.js";
import { confirmer, formulaire, demander, menu } from "../ui/modal.js";
import { erreur, succes, toast, messageErreur } from "../ui/toast.js";
import { copier, dateCourte, dateHeure, depuis, pluriel, poids } from "../core/util.js";

const ONGLETS = [
  { cle: "apercu", libelle: "Aperçu" },
  { cle: "membres", libelle: "Membres" },
  { cle: "sessions", libelle: "Sessions" },
  { cle: "cahier", libelle: "Cahier commun" },
  { cle: "documents", libelle: "Documents" },
  { cle: "exercices", libelle: "Exercices" },
  { cle: "annonces", libelle: "Annonces" },
  { cle: "reglages", libelle: "Réglages", staff: true }
];

export default async function vueClasse({ params, requete }) {
  const classe = await activerClasse(params.id);
  if (!classe) {
    return {
      noeud: el("div.page", blocVide("Classe introuvable",
        "Le code a peut-être été régénéré, ou votre accès a été retiré.",
        { libelle: "Retour à mes classes", action: () => aller("/classes") })),
      titre: "Classe introuvable"
    };
  }

  const staff = encadre();
  let ongletActif = requete?.onglet || "apercu";
  const contenu = el("div");
  const sessionEnCours = await depotSessions.enCours(classe.id).catch(() => null);

  const barreOnglets = el("div.onglets", { role: "tablist" });

  const noeud = el("div.page",
    entete(
      [classe.subject, classe.level].filter(Boolean).join(" · ") || L("Classe"),
      classe.name,
      classe.description || null,
      [
        sessionEnCours
          ? el("button.btn.btn--primaire", { onclick: () => aller(`/classe/${classe.id}/salle`) },
              icone("entree", 15), "Rejoindre la session")
          : staff
            ? el("button.btn.btn--primaire", { onclick: demarrerSession },
                icone("lecture", 15), "Démarrer une session")
            : null,
        staff ? el("button.btn", { onclick: (e) => menuClasse(e.currentTarget) },
          icone("points", 15), "Gérer") : null
      ]
    ),
    sessionEnCours ? el("div.carte.carte--classe", {
      dataset: { teinte: classe.color }, style: { marginBottom: "var(--e-5)" }
    },
      el("div.ligne-flex.ligne-flex--entre.enrouler",
        el("div",
          el("div.ligne-flex", el("span.etiq.etiq--direct", "En direct"),
            el("b", sessionEnCours.title)),
          el("span.petit.faible", `Ouverte ${depuis(sessionEnCours.started_at)}`)
        ),
        el("button.btn", { onclick: () => aller(`/classe/${classe.id}/salle`) }, "Entrer")
      )
    ) : null,
    barreOnglets,
    contenu
  );

  function peindreOnglets() {
    render(barreOnglets, ONGLETS.filter((o) => !o.staff || staff).map((o) =>
      el("button.onglet", {
        role: "tab", "aria-selected": String(o.cle === ongletActif),
        onclick: () => { ongletActif = o.cle; peindreOnglets(); peindreContenu(); }
      }, o.libelle)
    ));
  }

  async function peindreContenu() {
    render(contenu, el("p.faible.petit", "Chargement…"));
    const rendus = {
      apercu: ongletApercu, membres: ongletMembres, sessions: ongletSessions,
      cahier: ongletCahier, documents: ongletDocuments, exercices: ongletExercices,
      annonces: ongletAnnonces, reglages: ongletReglages
    };
    try {
      render(contenu, await (rendus[ongletActif] || ongletApercu)());
    } catch (err) {
      render(contenu, blocVide("Chargement impossible", messageErreur(err)));
    }
  }

  /* --- Aperçu -------------------------------------------------------------- */
  async function ongletApercu() {
    const [equipe, listeSessions, listeAnnonces] = await Promise.all([
      depotMembres.liste(classe.id),
      depotSessions.liste(classe.id, 6),
      annonces.liste({ class_id: classe.id }, 4)
    ]);
    const eleves = equipe.filter((m) => m.role === "student" && m.status === "active");
    const encadrants = equipe.filter((m) => ["teacher", "assistant"].includes(m.role));
    const terminees = listeSessions.filter((s) => s.status === "ended");

    return el("div.colonnes",
      el("div.pile",
        el("div.stats",
          statistique(eleves.length, L("eleves")),
          statistique(terminees.length, "séances tenues"),
          statistique(encadrants.length, "encadrants"),
          statistique(listeSessions.length, "sessions")
        ),
        staff ? el("div.panneau",
          el("div.panneau__entete", el("span.panneau__titre", "Code d'accès"), icone("lien", 15)),
          el("div.panneau__corps.centre",
            el("div.code-classe.code-classe--grand", classe.code),
            el("p.petit.doux", { style: { marginTop: "var(--e-3)" } },
              `Annoncez ce code en jeu : les ${L("eleves")} le saisissent sur la page d'accueil.`),
            el("div.ligne-flex", { style: { justifyContent: "center" } },
              el("button.btn", {
                onclick: async () => { await copier(classe.code); toast("Code copié"); }
              }, icone("copier", 15), "Copier"),
              el("button.btn", { onclick: regenerer }, icone("rejouer", 15), "Régénérer")
            )
          )
        ) : null,
        el("div.panneau",
          el("div.panneau__entete", el("span.panneau__titre", "Dernières sessions")),
          el("div.panneau__corps.panneau__corps--serre",
            listeSessions.length
              ? el("div.liste", listeSessions.map(ligneSession))
              : el("p.petit.faible", { style: { padding: "var(--e-4)", margin: 0 } }, "Aucune session tenue.")
          )
        )
      ),
      el("div.pile",
        el("div.panneau",
          el("div.panneau__entete", el("span.panneau__titre", "Encadrants")),
          el("div.panneau__corps.panneau__corps--serre",
            el("div.liste", encadrants.map((m) => el("div.liste__item",
              avatar(m.profil, { prof: true }),
              el("div.liste__principal",
                el("div.liste__nom", m.profil?.display_name || "—"),
                el("div.liste__detail", LIBELLES_ROLES_CLASSE[m.role])
              )
            )))
          )
        ),
        el("div.panneau",
          el("div.panneau__entete", el("span.panneau__titre", "Annonces")),
          el("div.panneau__corps",
            listeAnnonces.length
              ? listeAnnonces.map((a) => el("div.annonce", { dataset: { niveau: a.level } },
                  el("div.annonce__titre", depuis(a.created_at)),
                  el("div.annonce__corps", a.title),
                  a.body ? el("p.petit.doux", { style: { margin: "6px 0 0" } }, a.body) : null
                ))
              : el("p.petit.faible", { style: { margin: 0 } }, "Aucune annonce.")
          )
        )
      )
    );
  }

  function ligneSession(session) {
    return el("div.liste__item.liste__item--cliquable", {
      onclick: () => aller(session.status === "live"
        ? `/classe/${classe.id}/salle`
        : `/archive/${session.id}`)
    },
      el("div.liste__principal",
        el("div.liste__nom", session.title),
        el("div.liste__detail",
          session.started_at ? dateHeure(session.started_at) : "Programmée",
          session.summary?.participants != null ? ` · ${pluriel(session.summary.participants, "participant")}` : "")
      ),
      el("div.liste__fin", etiquetteStatutSession(session))
    );
  }

  /* --- Membres -------------------------------------------------------------- */
  async function ongletMembres() {
    const equipe = await depotMembres.liste(classe.id);
    const enAttente = equipe.filter((m) => m.status === "pending");
    const actifs = equipe.filter((m) => m.status === "active");
    const exclus = equipe.filter((m) => m.status === "banned");

    const bloc = (titre, liste, options = {}) => !liste.length ? null : el("div.panneau",
      el("div.panneau__entete",
        el("span.panneau__titre", titre),
        el("span.petit.faible", String(liste.length))
      ),
      el("div.panneau__corps.panneau__corps--serre",
        el("div.liste", liste.map((m) => ligneMembre(m, options)))
      )
    );

    return el("div.pile",
      enAttente.length && staff
        ? bloc("Demandes en attente", enAttente, { attente: true })
        : null,
      bloc("Membres actifs", actifs),
      staff ? bloc("Accès révoqués", exclus, { exclu: true }) : null,
      !equipe.length ? blocVide("Aucun membre",
        `Communiquez le code ${classe.code} pour que les ${L("eleves")} rejoignent la classe.`) : null
    );
  }

  function ligneMembre(membre, options = {}) {
    const moi = membre.user_id === etat.utilisateur.id;
    return el("div.liste__item",
      avatar(membre.profil, { prof: ["teacher", "assistant"].includes(membre.role) }),
      el("div.liste__principal",
        el("div.liste__nom", (membre.profil?.display_name || "—") + (moi ? " (vous)" : "")),
        el("div.liste__detail",
          [LIBELLES_ROLES_CLASSE[membre.role],
           membre.profil?.roblox_name ? `Roblox : ${membre.profil.roblox_name}` : null,
           `inscrit ${depuis(membre.joined_at)}`].filter(Boolean).join(" · "))
      ),
      el("div.liste__fin",
        membre.muted ? el("span.etiq.etiq--attn", "Silencieux") : null,
        options.attente ? el("span.etiq.etiq--info", "En attente") : null,
        options.exclu ? el("span.etiq.etiq--alerte", "Révoqué") : null,
        staff && !moi
          ? el("button.btn.btn--fantome.btn--icone", {
              "aria-label": "Actions", onclick: (e) => menuMembre(e.currentTarget, membre)
            }, icone("points", 15))
          : null
      )
    );
  }

  function menuMembre(ancre, membre) {
    const majorer = async (patch, message) => {
      try { await depotMembres.majorer(membre.id, patch); toast(message); await peindreContenu(); }
      catch (err) { erreur("Action impossible", messageErreur(err)); }
    };

    menu(ancre, [
      { titre: membre.profil?.display_name || "Membre" },
      membre.status === "pending" && {
        libelle: "Accepter l'inscription", icone: "coche",
        action: () => majorer({ status: "active" }, "Inscription acceptée")
      },
      membre.status === "pending" && {
        libelle: "Refuser", icone: "croix", danger: true,
        action: () => majorer({ status: "banned" }, "Inscription refusée")
      },
      membre.status === "active" && { titre: "Rôle dans la classe" },
      ...(membre.status === "active"
        ? Object.entries(LIBELLES_ROLES_CLASSE).map(([cle, libelle]) => ({
            libelle: libelle + (membre.role === cle ? "  ✓" : ""),
            action: () => majorer({ role: cle }, `Rôle : ${libelle}`)
          }))
        : []),
      membre.status === "active" && { separateur: true },
      membre.status === "active" && {
        libelle: membre.muted ? "Rendre la parole" : "Mettre en silencieux",
        icone: membre.muted ? "megaphone" : "cadenas",
        action: () => majorer({ muted: !membre.muted }, membre.muted ? "Parole rendue" : "Mis en silencieux")
      },
      membre.status !== "banned" && {
        libelle: "Expulser de la classe", icone: "sortie", danger: true,
        action: async () => {
          const ok = await confirmer({
            titre: "Expulser ce membre",
            message: `${membre.profil?.display_name} perdra l'accès à la classe. Ses cahiers personnels restent les siens.`,
            libelle: "Expulser", danger: true
          });
          if (ok) majorer({ status: "banned" }, "Membre expulsé");
        }
      },
      membre.status === "banned" && {
        libelle: "Rétablir l'accès", icone: "entree",
        action: () => majorer({ status: "active" }, "Accès rétabli")
      }
    ].filter(Boolean));
  }

  /* --- Sessions ------------------------------------------------------------- */
  async function ongletSessions() {
    const liste = await depotSessions.liste(classe.id, 60);
    if (!liste.length) {
      return blocVide("Aucune session",
        staff ? "Démarrez une session pour ouvrir le tableau et accueillir les élèves." : "Le professeur n'a pas encore ouvert de session.",
        staff ? { libelle: "Démarrer une session", action: demarrerSession } : null);
    }
    return el("div.panneau", el("div.panneau__corps.panneau__corps--serre",
      el("div.liste", liste.map(ligneSession))
    ));
  }

  /* --- Cahier commun --------------------------------------------------------- */
  async function ongletCahier() {
    let commun = await cahiers.commun(classe.id);
    if (!commun && staff) {
      commun = await cahiers.creer({
        class_id: classe.id, owner_id: etat.utilisateur.id, kind: "shared",
        title: `Cahier commun — ${classe.name}`, cover: "cuir",
        color: classe.color, icon: "book", collaborative: false
      });
    }
    if (!commun) return blocVide("Pas de cahier commun", "Le professeur n'en a pas encore ouvert.");

    const autres = (await cahiers.deClasse(classe.id)).filter((c) => c.id !== commun.id);

    return el("div.pile",
      el("div.grille.grille--2",
        vignetteCahier(commun),
        ...autres.map((c) => vignetteCahier(c))
      ),
      staff ? el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Mode d'écriture")),
        el("div.panneau__corps",
          el("p.petit.doux",
            commun.collaborative
              ? "Les élèves peuvent contribuer au cahier commun."
              : "Seuls les encadrants écrivent ; les élèves consultent."),
          el("button.btn", {
            onclick: async () => {
              await cahiers.majorer(commun.id, { collaborative: !commun.collaborative });
              toast(commun.collaborative ? "Cahier passé en lecture seule" : "Collaboration activée");
              await peindreContenu();
            }
          }, commun.collaborative ? "Repasser en lecture seule" : "Activer la collaboration")
        )
      ) : null
    );
  }

  /* --- Documents ------------------------------------------------------------- */
  async function ongletDocuments() {
    const liste = await documents.liste({ class_id: classe.id });
    const visibles = staff ? liste : liste.filter((d) => d.shared);
    if (!visibles.length) {
      return blocVide("Aucun document",
        staff ? "Importez un PDF, une image ou une fiche depuis l'onglet Documents." : "Le professeur n'a encore rien distribué.",
        staff ? { libelle: "Ouvrir la bibliothèque", action: () => aller("/documents") } : null);
    }
    return el("div.panneau", el("div.panneau__corps.panneau__corps--serre",
      el("div.liste", visibles.map((d) => el("div.liste__item.liste__item--cliquable", {
        onclick: () => ouvrirDocument(d)
      },
        icone(d.kind === "image" ? "image" : "documents", 16),
        el("div.liste__principal",
          el("div.liste__nom", d.title),
          el("div.liste__detail", `${poids(d.size_bytes)} · ajouté ${depuis(d.created_at)}`)
        ),
        el("div.liste__fin", d.shared ? el("span.etiq.etiq--ok", "Distribué") : el("span.etiq", "Privé"))
      )))
    ));
  }

  async function ouvrirDocument(document_) {
    try {
      const url = await documents.url(document_);
      window.open(url, "_blank", "noopener");
      journal.ecrire({
        class_id: classe.id, user_id: etat.utilisateur.id,
        action: "document.open", meta: { document: document_.id }
      });
    } catch (err) {
      erreur("Document indisponible", messageErreur(err));
    }
  }

  /* --- Exercices -------------------------------------------------------------- */
  async function ongletExercices() {
    const liste = await exercices.liste({ class_id: classe.id });
    const visibles = staff ? liste : liste.filter((e) => e.status !== "draft");
    if (!visibles.length) {
      return blocVide("Aucun exercice",
        staff ? "Préparez un exercice puis lancez-le pendant la session." : "Rien à faire pour l'instant.",
        staff ? { libelle: "Créer un exercice", action: () => aller(`/exercices?classe=${classe.id}`) } : null);
    }
    return el("div.panneau", el("div.panneau__corps.panneau__corps--serre",
      el("div.liste", visibles.map((ex) => el("a.liste__item", { href: `#/exercice/${ex.id}` },
        icone("exercices", 16),
        el("div.liste__principal",
          el("div.liste__nom", ex.title),
          el("div.liste__detail", `${dateCourte(ex.created_at)}${ex.exam_mode ? " · examen" : ""}`)
        ),
        el("div.liste__fin", etiquetteExercice(ex))
      )))
    ));
  }

  /* --- Annonces ---------------------------------------------------------------- */
  async function ongletAnnonces() {
    const liste = await annonces.liste({ class_id: classe.id }, 40);
    return el("div.pile",
      staff ? el("button.btn.btn--primaire", { onclick: publierAnnonce },
        icone("megaphone", 15), "Publier une annonce") : null,
      liste.length
        ? el("div.pile", liste.map((a) => el("div.annonce", { dataset: { niveau: a.level } },
            el("div.ligne-flex.ligne-flex--entre",
              el("div.annonce__titre", dateHeure(a.created_at)),
              staff ? el("button.btn.btn--fantome.btn--icone", {
                "aria-label": "Supprimer",
                onclick: async () => {
                  if (await confirmer({ titre: "Supprimer l'annonce", message: a.title, libelle: "Supprimer", danger: true })) {
                    await annonces.supprimer(a.id); await peindreContenu();
                  }
                }
              }, icone("corbeille", 14)) : null
            ),
            el("div.annonce__corps", a.title),
            a.body ? el("p.petit.doux", { style: { margin: "var(--e-2) 0 0" } }, a.body) : null
          )))
        : blocVide("Aucune annonce", "Les annonces du professeur s'afficheront ici.")
    );
  }

  async function publierAnnonce() {
    const sortie = await formulaire({
      titre: "Publier une annonce",
      champs: [
        { cle: "title", label: "Annonce", placeholder: "La certification aura lieu demain à 18 h.", requis: true },
        { cle: "body", label: "Détail (facultatif)", type: "textarea" },
        { cle: "level", label: "Importance", type: "select", valeur: "info", options: [
          { valeur: "info", libelle: "Information" },
          { valeur: "important", libelle: "Important" },
          { valeur: "alert", libelle: "Urgent" }
        ] }
      ],
      libelle: "Publier"
    });
    if (!sortie) return;
    try {
      await annonces.creer({
        class_id: classe.id, session_id: null, author_id: etat.utilisateur.id,
        title: sortie.title, body: sortie.body || null, level: sortie.level
      });
      await notifications.diffuser(classe.id, {
        kind: "annonce", titre: `Annonce — ${classe.name}`,
        corps: sortie.title, lien: `/classe/${classe.id}?onglet=annonces`
      }).catch(() => {});
      succes("Annonce publiée");
      await peindreContenu();
    } catch (err) {
      erreur("Publication impossible", messageErreur(err));
    }
  }

  /* --- Réglages ----------------------------------------------------------------- */
  async function ongletReglages() {
    const ligne = (titre, description, controle) => el("div.liste__item",
      el("div.liste__principal",
        el("div.liste__nom", titre),
        el("div.liste__detail", description)
      ),
      el("div.liste__fin", controle)
    );

    const bascule = (champ, actif, libelleActif, libelleInactif) =>
      el("button.btn", {
        onclick: async () => {
          await depotClasses.majorer(classe.id, { [champ]: !actif });
          Object.assign(classe, { [champ]: !actif });
          await rafraichirClasses();
          await peindreContenu();
        }
      }, actif ? libelleActif : libelleInactif);

    return el("div.pile",
      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Accès")),
        el("div.panneau__corps.panneau__corps--serre", el("div.liste",
          ligne("Code d'accès", `Actuel : ${classe.code}`,
            el("button.btn", { onclick: regenerer }, icone("rejouer", 14), "Régénérer")),
          ligne("Inscriptions", classe.join_open ? "Ouvertes" : "Fermées",
            bascule("join_open", classe.join_open, "Fermer", "Ouvrir")),
          ligne("Verrouillage", classe.locked ? "La classe est verrouillée" : "La classe est ouverte",
            bascule("locked", classe.locked, "Déverrouiller", "Verrouiller")),
          ligne("Validation manuelle", classe.require_approval ? "Chaque inscription est validée" : "Entrée directe avec le code",
            bascule("require_approval", classe.require_approval, "Désactiver", "Activer"))
        ))
      ),
      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Identité")),
        el("div.panneau__corps",
          el("button.btn", { onclick: modifierClasse }, icone("crayon", 15), "Modifier nom, matière, couleur")
        )
      ),
      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Fin de vie")),
        el("div.panneau__corps.panneau__corps--serre", el("div.liste",
          ligne("Archiver", "La classe reste consultable mais n'accepte plus de session.",
            bascule("archived", classe.archived, "Désarchiver", "Archiver")),
          ligne("Supprimer", "Sessions, tableau, cahier commun et exercices seront perdus.",
            el("button.btn.btn--danger", { onclick: supprimerClasse }, "Supprimer"))
        ))
      )
    );
  }

  /* --- Actions ------------------------------------------------------------------ */
  async function demarrerSession() {
    const titre = await demander({
      titre: "Démarrer une session",
      label: "Intitulé de la séance",
      placeholder: "Session 01 — Fondements du droit",
      aide: "Laissez vide pour une numérotation automatique.",
      libelle: "Démarrer"
    });
    if (titre === null && titre !== "") { /* annulation */ }
    try {
      await depotSessions.demarrer(classe.id, titre || null);
      await notifications.diffuser(classe.id, {
        kind: "session", titre: `${classe.name} — session ouverte`,
        corps: "Le cours commence.", lien: `/classe/${classe.id}/salle`
      }).catch(() => {});
      aller(`/classe/${classe.id}/salle`);
    } catch (err) {
      erreur("Démarrage impossible", messageErreur(err));
    }
  }

  async function regenerer() {
    const ok = await confirmer({
      titre: "Régénérer le code",
      message: "L'ancien code cessera immédiatement de fonctionner. Les membres déjà inscrits ne sont pas affectés.",
      libelle: "Régénérer"
    });
    if (!ok) return;
    try {
      const nouveau = await depotClasses.regenererCode(classe.id);
      classe.code = nouveau;
      succes("Nouveau code", nouveau);
      await peindreContenu();
    } catch (err) {
      erreur("Régénération impossible", messageErreur(err));
    }
  }

  async function modifierClasse() {
    const sortie = await formulaire({
      titre: "Modifier la classe",
      champs: [
        { cle: "name", label: "Nom", valeur: classe.name, requis: true },
        { cle: "description", label: "Description", type: "textarea", valeur: classe.description || "" },
        { cle: "subject", label: "Matière", valeur: classe.subject || "" },
        { cle: "level", label: "Niveau", valeur: classe.level || "" },
        { cle: "color", label: "Couleur", type: "select", valeur: classe.color, options: [
          { valeur: "olive", libelle: "Olive" }, { valeur: "laiton", libelle: "Laiton" },
          { valeur: "ardoise", libelle: "Ardoise" }, { valeur: "oxblood", libelle: "Bordeaux" },
          { valeur: "pourpre", libelle: "Pourpre" }, { valeur: "encre", libelle: "Encre" }
        ] }
      ]
    });
    if (!sortie) return;
    await depotClasses.majorer(classe.id, sortie);
    Object.assign(classe, sortie);
    await rafraichirClasses();
    aller(`/classe/${classe.id}`);
    succes("Classe mise à jour");
  }

  async function supprimerClasse() {
    const ok = await confirmer({
      titre: "Supprimer la classe",
      message: `« ${classe.name} » et tout son contenu seront définitivement perdus. Les cahiers personnels des élèves ne sont pas touchés.`,
      libelle: "Supprimer définitivement", danger: true
    });
    if (!ok) return;
    try {
      await depotClasses.supprimer(classe.id);
      await rafraichirClasses();
      succes("Classe supprimée");
      aller("/classes");
    } catch (err) {
      erreur("Suppression impossible", messageErreur(err));
    }
  }

  function menuClasse(ancre) {
    menu(ancre, [
      { titre: classe.name },
      { libelle: "Copier le code", icone: "copier", action: async () => { await copier(classe.code); toast("Code copié"); } },
      { libelle: "Régénérer le code", icone: "rejouer", action: regenerer },
      { separateur: true },
      { libelle: "Modifier la classe", icone: "crayon", action: modifierClasse },
      { libelle: "Publier une annonce", icone: "megaphone", action: publierAnnonce },
      { libelle: "Présences et archives", icone: "archives", action: () => aller(`/archives?classe=${classe.id}`) }
    ]);
  }

  peindreOnglets();
  await peindreContenu();

  return { noeud, titre: classe.name };
}

function etiquetteExercice(ex) {
  if (ex.status === "live") return el("span.etiq.etiq--direct", "En cours");
  if (ex.status === "draft") return el("span.etiq", "Brouillon");
  if (ex.status === "graded") return el("span.etiq.etiq--ok", "Corrigé");
  return el("span.etiq.etiq--info", "Fermé");
}
