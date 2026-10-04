/* ---------------------------------------------------------------------------
 * Administration et modération.
 *
 * Deux métiers, un seul écran :
 *
 *   · la MODÉRATION veille sur ce qui circule. Elle relit les remises (qui a
 *     tendu quoi, à qui, où), note ce qu'elle constate — fiable, douteux,
 *     faux —, lit le journal, voit chaque personnage, retire un papier,
 *     écrit à un joueur ou fait une annonce à tous ;
 *   · l'ADMINISTRATION fait tout cela, et nomme : les rôles (modérateur,
 *     administrateur…) et les titres de personnage (roi, commandant…).
 *
 * Les droits réels sont appliqués par la base (voir 0029) ; cet écran ne
 * fait qu'en refléter l'état.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { profils, rbac, journal, papiers, auth, moderation } from "../data/index.js";
import { entete, blocVide, avatar, statistique } from "../ui/fragments.js";
import { estAdmin, estModerateur, peutNommer, estSuperAdmin, LIBELLES_ROLES } from "../core/permissions.js";
import { confirmer, formulaire, menu, ouvrirModale } from "../ui/modal.js";
import { erreur, succes, toast, messageErreur } from "../ui/toast.js";
import { dateCourte, heure, depuis, aplatir } from "../core/util.js";
import { rendrePapier, MODELES } from "../features/papier.js";
import { TITRES, libelleTitre } from "../features/titres.js";

// Facile à dicter en jeu : deux mots, quatre chiffres.
function motDePasseAuHasard() {
  const mots = ["Rempart", "Plume", "Encrier", "Bougie", "Pupitre", "Muraille", "Craie", "Horloge", "Lanterne", "Cadet"];
  const n = new Uint32Array(3); crypto.getRandomValues(n);
  return `${mots[n[0] % mots.length]}-${mots[n[1] % mots.length]}-${1000 + (n[2] % 9000)}`;
}

/* Ce que la modération constate sur une remise. */
const VERDICTS = {
  fiable:     { libelle: "Fiable", teinte: "etiq--ok" },
  douteux:    { libelle: "Douteux", teinte: "etiq--attn" },
  faux:       { libelle: "Faux", teinte: "etiq--alerte" },
  a_verifier: { libelle: "À vérifier", teinte: "etiq--info" },
  note:       { libelle: "Note", teinte: "" }
};

const ETATS = {
  offered:  ["En attente", "etiq--attn"],
  accepted: ["Gardé", "etiq--ok"],
  refused:  ["Refusé", "etiq--alerte"],
  withdrawn:["Retiré", ""]
};

/* Le journal, en français. */
const ACTIONS = {
  "papier.tendu": "a tendu un papier",
  "papier.presence_confirmee": "a confirmé la présence de l'émetteur",
  "papier.presence_niee": "a nié la présence de l'émetteur",
  "papier.accepted": "a gardé un papier",
  "papier.refused": "a refusé un papier",
  "papier.withdrawn": "a retiré sa remise",
  "papier.moderation": "a lu un papier (modération)",
  "objet.tendu": "a tendu ou demandé un objet",
  "objet.accepted": "a accepté une remise d'objet",
  "objet.refused": "a refusé une remise d'objet",
  "objet.returned": "a rendu un objet",
  "objet.withdrawn": "a retiré une remise d'objet",
  "cahier.tendu": "a tendu un cahier",
  "cahier.accepted": "a pris un cahier",
  "cahier.refused": "a refusé un cahier",
  "cahier.returned": "a rendu un cahier",
  "compte.role": "a changé un rôle",
  "compte.titre": "a attribué un titre",
  "compte.code_cree": "a créé un code de rôle",
  "compte.supprime": "a supprimé un compte",
  "personnage.banni": "a banni un personnage",
  "compte.code_utilise": "a utilisé un code de rôle",
  "compte.code_refuse": "a tapé un code de rôle invalide",
  "moderation.note": "a noté une remise",
  "moderation.annonce": "a fait une annonce à tous",
  "moderation.message": "a écrit à un joueur",
  "moderation.papier_retire": "a retiré un papier",
  "session.start": "a ouvert une séance",
  "session.end": "a clos une séance",
  "affaires.confiscation": "a confisqué un objet"
};
const FAMILLES = [
  { cle: "", libelle: "Tout" },
  { cle: "papier.", libelle: "Papiers" },
  { cle: "objet.", libelle: "Objets" },
  { cle: "cahier.", libelle: "Cahiers" },
  { cle: "compte.", libelle: "Comptes" },
  { cle: "moderation.", libelle: "Modération" },
  { cle: "session.", libelle: "Séances" }
];

const nomTitre = (cle) => TITRES.find((t) => t.cle === cle)?.libelle || cle;

/** Ce qui fait remonter une remise dans « À vérifier ». */
function signaux(r) {
  const s = [];
  if (r.presence === false) s.push({ cle: "niee", libelle: "Présence niée", teinte: "etiq--alerte" });
  if (!String(r.description || "").trim()) s.push({ cle: "sans", libelle: "Sans description", teinte: "etiq--attn" });
  if (r.lieu && r.lieu_reception && aplatir(r.lieu) !== aplatir(r.lieu_reception)) {
    s.push({ cle: "lieux", libelle: "Lieux différents", teinte: "etiq--attn" });
  }
  if (!r.attested) s.push({ cle: "atteste", libelle: "Sans attestation", teinte: "etiq--attn" });
  if (r.state === "offered" && Date.now() - new Date(r.created_at).getTime() > 24 * 3600e3) {
    s.push({ cle: "attente", libelle: "Sans réponse depuis 24 h", teinte: "" });
  }
  return s;
}

export default async function vueAdministration() {
  if (!estModerateur()) {
    return {
      noeud: el("div.page", blocVide("Accès refusé",
        "Cet espace est réservé à l'administration et à la modération.",
        { libelle: "Accueil", action: () => aller("/") })),
      titre: "Administration"
    };
  }

  const admin = estAdmin();
  const nomme = peutNommer();
  let actif = "verifier";
  let filtre = "";
  let famille = "";
  let filtreRemises = "tout";
  const contenu = el("div");
  const barre = el("div.onglets", { role: "tablist" });

  const noeud = el("div.page.page--large",
    entete(admin ? "Administration" : "Modération", admin ? "Administration et modération" : "Modération",
      "Les droits réels sont appliqués par la base de données ; cet écran ne fait qu'en refléter l'état."),
    barre, contenu
  );

  const ONGLETS = [
    { cle: "verifier", libelle: "À vérifier" },
    { cle: "remises", libelle: "Remises" },
    { cle: "journal", libelle: "Journal" },
    { cle: "personnages", libelle: "Personnages" },
    { cle: "annonce", libelle: "Annonces" },
    admin ? { cle: "comptes", libelle: "Comptes et rôles" } : null,
    admin ? { cle: "roles", libelle: "Permissions" } : null
  ].filter(Boolean);

  function peindreBarre() {
    render(barre, ONGLETS.map((o) => el("button.onglet", {
      role: "tab", "aria-selected": String(o.cle === actif),
      onclick: () => { actif = o.cle; peindreBarre(); peindre(); }
    }, o.libelle)));
  }

  async function peindre() {
    render(contenu, el("p.petit.faible", "Chargement…"));
    try {
      const sections = {
        verifier: () => sectionRemises({ seulementSignalees: true }),
        remises: () => sectionRemises({ seulementSignalees: false }),
        journal: sectionJournal,
        personnages: sectionPersonnages,
        annonce: sectionAnnonces,
        comptes: sectionComptes,
        roles: sectionRoles
      };
      render(contenu, await (sections[actif] || sections.verifier)());
    } catch (err) {
      render(contenu, blocVide("Chargement impossible", messageErreur(err)));
    }
  }

  /* ======================================================================
     Les remises : ce qui circule, et ce qui demande un regard
     ==================================================================== */
  async function sectionRemises({ seulementSignalees }) {
    let toutes = [];
    try { toutes = await papiers.circulation(300); }
    catch (err) { return blocVide("Registre indisponible", messageErreur(err)); }

    const avecSignaux = toutes.map((r) => ({ ...r, signaux: signaux(r) }));
    const tranchees = (r) => r.notes.some((n) => ["fiable", "faux"].includes(n.verdict));
    let visibles = seulementSignalees
      ? avecSignaux.filter((r) => r.signaux.length && !tranchees(r))
      : avecSignaux;
    if (!seulementSignalees && filtreRemises !== "tout") {
      visibles = visibles.filter((r) => filtreRemises === "contestees" ? r.presence === false : r.state === filtreRemises);
    }

    const entete = seulementSignalees
      ? el("p.petit.faible",
          "Les remises sans description, celles dont la présence a été niée, celles dont les deux lieux "
          + "ne concordent pas, ou restées sans réponse. Une remise notée « fiable » ou « faux » quitte la liste.")
      : el("div.ligne-flex.enrouler",
          [["tout", "Toutes"], ["offered", "En attente"], ["accepted", "Gardées"], ["refused", "Refusées"], ["contestees", "Présence niée"]]
            .map(([cle, libelle]) => el("button.puce", {
              type: "button", "aria-pressed": String(filtreRemises === cle),
              style: filtreRemises === cle ? { borderColor: "var(--laiton)" } : null,
              onclick: () => { filtreRemises = cle; peindre(); }
            }, libelle)));

    return el("div.pile",
      el("div.stats",
        statistique(toutes.length, "remises récentes"),
        statistique(avecSignaux.filter((r) => r.signaux.some((s) => s.cle === "sans")).length, "sans description"),
        statistique(avecSignaux.filter((r) => r.presence === false).length, "présences niées"),
        statistique(avecSignaux.filter((r) => r.signaux.length && !tranchees(r)).length, "à vérifier")
      ),
      entete,
      visibles.length
        ? el("div.moderation__liste", visibles.map(carteRemise))
        : blocVide(seulementSignalees ? "Rien à vérifier" : "Aucune remise",
            seulementSignalees ? "Toutes les remises récentes sont décrites et concordent." : "")
    );
  }

  function carteRemise(r) {
    const [libelleEtat, teinte] = ETATS[r.state] || ETATS.offered;
    const nom = (p) => p?.display_name || "?";
    return el("article.moderation__carte",
      el("div.moderation__tete",
        el("span.etiq", { class: teinte }, libelleEtat),
        ...r.signaux.map((s) => el("span.etiq", { class: s.teinte }, s.libelle)),
        el("span.pousse"),
        el("span.petit.faible", `${dateCourte(r.created_at)} ${heure(r.created_at)}`)),
      el("div.moderation__titre",
        el("strong", r.papier?.title || "Papier supprimé"),
        el("span.petit.faible", ` · ${MODELES[r.papier?.model]?.libelle || "Papier"}`)),
      el("dl.moderation__faits",
        el("dt", "De"), el("dd", nom(r.expediteur)),
        el("dt", "À"), el("dd", nom(r.destinataire)),
        el("dt", "Lieu (émetteur)"), el("dd", r.lieu || el("span.faible", "—")),
        el("dt", "Lieu (destinataire)"), el("dd", r.lieu_reception || el("span.faible", r.presence == null ? "pas encore répondu" : "—")),
        el("dt", "Présence"), el("dd",
          r.presence === true ? "Confirmée par le destinataire"
            : r.presence === false ? el("strong", { style: { color: "var(--alerte)" } }, "Niée par le destinataire")
            : el("span.faible", "En attente de réponse")),
        el("dt", "Scène"), el("dd", r.description ? el("em", r.description) : el("span.faible", "Aucune description"))),
      r.notes.length
        ? el("div.moderation__notes", r.notes.map((n) => el("div.moderation__note",
            el("span.etiq", { class: VERDICTS[n.verdict]?.teinte || "" }, VERDICTS[n.verdict]?.libelle || n.verdict),
            n.body ? el("span", n.body) : null,
            el("span.petit.faible", ` · ${depuis(n.created_at)}`))))
        : null,
      el("div.moderation__actions",
        ...["fiable", "douteux", "faux"].map((v) => el("button.btn.btn--petit", {
          type: "button", onclick: () => noter(r, v)
        }, VERDICTS[v].libelle)),
        el("button.btn.btn--petit.btn--fantome", { type: "button", onclick: () => noter(r, "note") }, "Annoter…"),
        el("span.pousse"),
        r.papier ? el("button.btn.btn--petit.btn--fantome", { type: "button", onclick: () => lirePapier(r) },
          icone("oeil", 14), "Lire") : null,
        el("button.btn.btn--petit.btn--fantome", { type: "button", onclick: (e) => menuRemise(e.currentTarget, r) },
          icone("points", 14)))
    );
  }

  async function noter(r, verdict) {
    let texte = "";
    if (verdict === "note" || verdict === "douteux" || verdict === "faux") {
      const sortie = await formulaire({
        titre: `${VERDICTS[verdict].libelle} — « ${r.papier?.title || "papier"} »`,
        note: "Ce que vous avez constaté (lieu vérifié en jeu, témoins, incohérence…). Visible de la modération seule.",
        champs: [{ cle: "texte", label: "Constat", type: "textarea", requis: verdict === "note", valeur: "" }],
        libelle: "Noter"
      });
      if (!sortie) return;
      texte = sortie.texte;
    }
    try {
      await moderation.noter({ genre: "paper_handoff", cible: r.id, verdict, texte, auteur: etat.utilisateur.id });
      toast(`Remise notée : ${VERDICTS[verdict].libelle.toLowerCase()}`);
      await peindre();
    } catch (err) { erreur("Note impossible", messageErreur(err)); }
  }

  function menuRemise(ancre, r) {
    menu(ancre, [
      { titre: r.papier?.title || "Remise" },
      { libelle: `Écrire à ${r.expediteur?.display_name || "l'émetteur"}`, icone: "papier",
        action: () => ecrireA(r.expediteur) },
      { libelle: `Écrire à ${r.destinataire?.display_name || "au destinataire"}`, icone: "papier",
        action: () => ecrireA(r.destinataire) },
      r.papier ? { separateur: true } : null,
      r.papier ? { libelle: "Retirer ce papier", icone: "corbeille", danger: true, action: () => retirerPapier(r) } : null
    ]);
  }

  async function retirerPapier(r) {
    const ok = await confirmer({
      titre: "Retirer ce papier",
      message: `« ${r.papier.title} » disparaîtra pour tout le monde, et ses remises avec lui. `
        + "Le retrait est inscrit au journal.",
      libelle: "Retirer", danger: true
    });
    if (!ok) return;
    try { await papiers.retirer(r.paper_id); succes("Papier retiré"); await peindre(); }
    catch (err) { erreur("Retrait impossible", messageErreur(err)); }
  }

  async function lirePapier(remise) {
    await ouvrirModale({
      titre: "Lecture de modération",
      large: true,
      corps: () => el("div",
        el("p.petit.faible",
          `Remis par ${remise.expediteur?.display_name || "?"} à `
          + `${remise.destinataire?.display_name || "?"}.`),
        rendrePapier(remise.papier, { auteur: remise.expediteur })),
      actions: [{ libelle: "Fermer", variante: "primaire", valeur: true }]
    });
    journal.ecrire({
      class_id: remise.class_id || null, user_id: etat.utilisateur.id,
      action: "papier.moderation", meta: { papier: remise.paper_id, remise: remise.id }
    });
  }

  /* ======================================================================
     Le journal : tout ce qui s'est passé, dans l'ordre
     ==================================================================== */
  async function sectionJournal() {
    const entrees = await moderation.journal({}, 400);
    const ids = new Set();
    for (const e of entrees) {
      if (e.user_id) ids.add(e.user_id);
      for (const k of ["de", "a", "cible", "auteur"]) if (e.meta?.[k]) ids.add(e.meta[k]);
    }
    const gens = new Map((await profils.parIds([...ids])).map((p) => [p.id, p]));
    const nom = (id) => gens.get(id)?.display_name || "—";
    const visibles = entrees.filter((e) => {
      if (famille && !e.action.startsWith(famille)) return false;
      if (!filtre) return true;
      const texte = `${nom(e.user_id)} ${nom(e.meta?.a)} ${nom(e.meta?.de)} ${nom(e.meta?.cible)} ${e.meta?.titre || ""} ${e.meta?.lieu || ""}`;
      return aplatir(texte).includes(aplatir(filtre));
    });

    const detail = (e) => {
      const m = e.meta || {};
      const bouts = [];
      if (m.titre) bouts.push(`« ${m.titre} »`);
      if (m.a && e.action !== "papier.presence_confirmee" && e.action !== "papier.presence_niee") bouts.push(`à ${nom(m.a)}`);
      if (m.de && e.user_id !== m.de) bouts.push(`de ${nom(m.de)}`);
      if (m.cible && e.action.startsWith("compte.")) bouts.push(`${m.nom || nom(m.cible)} : ${m.avant || "—"} → ${m.apres || "—"}`);
      else if (m.cible && e.action === "moderation.message") bouts.push(`à ${nom(m.cible)}`);
      if (m.lieu) bouts.push(`— ${m.lieu}`);
      if (m.lieu_reception && m.lieu_reception !== m.lieu) bouts.push(`(reçu : ${m.lieu_reception})`);
      if (m.sans_description) bouts.push("· sans description");
      if (m.verdict) bouts.push(`: ${VERDICTS[m.verdict]?.libelle || m.verdict}`);
      if (m.destinataires) bouts.push(`(${m.destinataires} destinataires)`);
      return bouts.join(" ");
    };

    return el("div.pile",
      el("div.ligne-flex.enrouler",
        FAMILLES.map((f) => el("button.puce", {
          type: "button", style: famille === f.cle ? { borderColor: "var(--laiton)" } : null,
          onclick: () => { famille = f.cle; peindre(); }
        }, f.libelle)),
        el("input.saisie", {
          type: "search", placeholder: "Un nom, un lieu, un titre…", value: filtre,
          style: { maxWidth: "260px", marginLeft: "auto" },
          oninput: (e) => { filtre = e.target.value; clearTimeout(e.target._t); e.target._t = setTimeout(peindre, 250); }
        })),
      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", `${visibles.length} action${visibles.length > 1 ? "s" : ""}`)),
        el("div.panneau__corps.panneau__corps--serre",
          visibles.length
            ? el("div.journal", visibles.map((e) => el("div.journal__ligne",
                el("span.journal__heure", `${dateCourte(e.created_at)} ${heure(e.created_at)}`),
                el("span", el("strong", nom(e.user_id)), " ", ACTIONS[e.action] || e.action, " ",
                  el("span.faible", detail(e))))))
            : el("p.petit.faible", { style: { padding: "var(--e-4)", margin: 0 } }, "Rien à afficher.")))
    );
  }

  /* ======================================================================
     Les personnages : chaque compte, son titre, ses fiches
     ==================================================================== */
  async function sectionPersonnages() {
    const [comptes, fiches] = await Promise.all([
      moderation.comptes(500),
      moderation.fiches(500).catch(() => [])
    ]);
    const fichesDe = new Map();
    for (const f of fiches) {
      if (!fichesDe.has(f.user_id)) fichesDe.set(f.user_id, []);
      fichesDe.get(f.user_id).push(f);
    }
    const visibles = filtre
      ? comptes.filter((p) => aplatir(`${p.display_name} ${libelleTitre(p)} ${(fichesDe.get(p.id) || []).map((f) => f.name).join(" ")}`).includes(aplatir(filtre)))
      : comptes;

    return el("div.pile",
      el("input.saisie", {
        type: "search", placeholder: "Rechercher un joueur, un personnage, un titre…", value: filtre,
        oninput: (e) => { filtre = e.target.value; clearTimeout(e.target._t); e.target._t = setTimeout(peindre, 250); }
      }),
      el("div.moderation__liste", visibles.map((p) => {
        const sesFiches = fichesDe.get(p.id) || [];
        const titre = libelleTitre(p);
        return el("article.moderation__carte",
          el("div.moderation__tete",
            avatar(p),
            el("div", { style: { flex: "1", minWidth: "0" } },
              el("strong", p.display_name),
              el("div.petit.faible",
                [LIBELLES_ROLES[p.role_key] || p.role_key,
                 p.last_seen_at ? `vu ${depuis(p.last_seen_at)}` : null,
                 `inscrit ${dateCourte(p.created_at)}`].filter(Boolean).join(" · "))),
            titre ? el("span.etiq.etiq--info", titre) : null,
            el("button.btn.btn--fantome.btn--icone", {
              "aria-label": "Actions", onclick: (e) => menuPersonnage(e.currentTarget, p, sesFiches)
            }, icone("points", 15))),
          sesFiches.length
            ? el("ul.moderation__fiches", sesFiches.map((f) => el("li",
                el("strong", f.name || "(sans nom)"),
                [f.rank, f.corps, f.origin].filter(Boolean).length
                  ? el("span.faible", ` — ${[f.rank, f.corps, f.origin].filter(Boolean).join(", ")}`) : null)))
            : el("p.petit.faible", { style: { margin: 0 } }, "Aucune fiche de personnage."));
      }))
    );
  }

  function menuPersonnage(ancre, p, fiches) {
    menu(ancre, [
      { titre: p.display_name },
      { libelle: "Lui écrire", icone: "papier", action: () => ecrireA(p) },
      nomme && p.id !== etat.utilisateur.id ? { libelle: "Titre du personnage…", icone: "drapeau", action: () => donnerTitre(p) } : null,
      p.id !== etat.utilisateur.id ? { libelle: "Bannir le personnage…", icone: "croix", danger: true, action: () => bannir(p) } : null,
      ...fiches.map((f) => ({
        libelle: `Supprimer la fiche « ${f.name || "sans nom"} »`, icone: "corbeille", danger: true,
        action: async () => {
          const ok = await confirmer({
            titre: "Supprimer la fiche", danger: true, libelle: "Supprimer",
            message: `La fiche « ${f.name || "sans nom"} » de ${p.display_name} sera supprimée. Le compte reste.`
          });
          if (!ok) return;
          try { await moderation.supprimerFiche(f.id); succes("Fiche supprimée"); await peindre(); }
          catch (err) { erreur("Suppression impossible", messageErreur(err)); }
        }
      }))
    ]);
  }

  async function donnerTitre(p) {
    const sortie = await formulaire({
      titre: `Titre — ${p.display_name}`,
      note: "Un titre ne donne aucun droit sur le site : il change la mise en scène. "
        + "Un roi ou une reine siège sur le trône en audience, couronne en tête.",
      champs: [
        { cle: "titre", label: "Titre", type: "select", valeur: p.titre || "",
          options: [{ valeur: "", libelle: "Aucun" }, ...TITRES.map((t) => ({ valeur: t.cle, libelle: t.libelle }))] },
        { cle: "libelle", label: "Libellé exact (facultatif)", type: "text", valeur: p.titre_libelle || "",
          aide: "Par exemple « Commandant du Bataillon d'exploration ». Sinon, le nom du titre." }
      ],
      libelle: "Attribuer"
    });
    if (!sortie) return;
    try {
      await profils.titrer(p.id, sortie.titre || null, sortie.titre ? sortie.libelle : null);
      succes(sortie.titre ? `${p.display_name} : ${sortie.libelle || nomTitre(sortie.titre)}` : "Titre retiré");
      await peindre();
    } catch (err) { erreur("Attribution impossible", messageErreur(err)); }
  }

  async function ecrireA(p) {
    if (!p) return;
    const sortie = await formulaire({
      titre: `Écrire à ${p.display_name}`,
      note: "Le message arrive dans ses notifications, signé de la modération. Il est inscrit au journal.",
      champs: [
        { cle: "titre", label: "Objet", type: "text", requis: true, valeur: "" },
        { cle: "corps", label: "Message", type: "textarea", valeur: "" }
      ],
      libelle: "Envoyer"
    });
    if (!sortie) return;
    try { await moderation.ecrire(p.id, sortie.titre, sortie.corps || null); succes("Message envoyé"); }
    catch (err) { erreur("Envoi impossible", messageErreur(err)); }
  }

  /* ======================================================================
     Les annonces : à tout le monde, d'un coup
     ==================================================================== */
  async function sectionAnnonces() {
    let titre, corps;
    const passees = (await moderation.journal({ action: "moderation.annonce" }, 30).catch(() => []));
    const auteurs = new Map((await profils.parIds([...new Set(passees.map((e) => e.user_id).filter(Boolean))])).map((p) => [p.id, p]));
    return el("div.pile",
      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Annonce à tous les joueurs")),
        el("div.panneau__corps",
          el("p.petit.faible", "Chaque compte la reçoit dans ses notifications. Elle est inscrite au journal."),
          el("label.champ", el("span.champ__label", "Titre"),
            titre = el("input.saisie", { maxlength: "120", placeholder: "Rassemblement devant le QG à 21 h" })),
          el("label.champ", el("span.champ__label", "Texte"),
            corps = el("textarea.zone", { rows: "4", maxlength: "2000", placeholder: "Les détails…" })),
          el("button.btn.btn--primaire", {
            type: "button",
            onclick: async (e) => {
              const bouton = e.currentTarget;
              if (!titre.value.trim()) { titre.focus(); titre.classList.add("champ--erreur"); return; }
              const ok = await confirmer({
                titre: "Envoyer l'annonce", libelle: "Envoyer",
                message: `« ${titre.value.trim()} » sera envoyée à tous les comptes.`
              });
              if (!ok) return;
              bouton.disabled = true;
              try {
                const n = await moderation.annoncer(titre.value.trim(), corps.value.trim() || null);
                succes("Annonce envoyée", `${n} destinataire${n > 1 ? "s" : ""}.`);
                await peindre();
              } catch (err) { erreur("Envoi impossible", messageErreur(err)); }
              finally { bouton.disabled = false; }
            }
          }, icone("cloche", 15), "Envoyer à tous"))),
      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Dernières annonces")),
        el("div.panneau__corps.panneau__corps--serre",
          passees.length
            ? el("div.journal", passees.map((e) => el("div.journal__ligne",
                el("span.journal__heure", `${dateCourte(e.created_at)} ${heure(e.created_at)}`),
                el("span", el("strong", e.meta?.titre || "—"), el("span.faible",
                  ` · ${auteurs.get(e.user_id)?.display_name || "—"} · ${e.meta?.destinataires ?? "?"} destinataires`)))))
            : el("p.petit.faible", { style: { padding: "var(--e-4)", margin: 0 } }, "Aucune annonce pour l'instant.")))
    );
  }

  /* ======================================================================
     Les comptes : rôles, titres, mots de passe (administration)
     ==================================================================== */
  async function sectionComptes() {
    const tous = await moderation.comptes(500);
    const visibles = filtre
      ? tous.filter((p) => aplatir(`${p.display_name} ${p.roblox_name || ""}`).includes(aplatir(filtre)))
      : tous;

    return el("div.pile",
      el("div.stats",
        statistique(tous.length, "comptes"),
        statistique(tous.filter((p) => ["admin", "super_admin"].includes(p.role_key)).length, "administrateurs"),
        statistique(tous.filter((p) => p.role_key === "moderator").length, "modérateurs"),
        statistique(tous.filter((p) => p.titre).length, "titrés")
      ),
      el("p.petit.faible",
        nomme
          ? "Seul un administrateur nomme un administrateur ou un modérateur. Seul un super administrateur fait un super administrateur. On ne change jamais son propre rôle."
          : "Vous pouvez consulter les comptes ; seul un administrateur change un rôle ou un titre."),
      el("input.saisie", {
        type: "search", placeholder: "Rechercher un compte…", value: filtre,
        oninput: (e) => { filtre = e.target.value; clearTimeout(e.target._t); e.target._t = setTimeout(peindre, 250); }
      }),
      el("div.panneau", el("div.panneau__corps.panneau__corps--serre",
        visibles.length
          ? el("div.liste", visibles.map((p) => el("div.liste__item",
              avatar(p),
              el("div.liste__principal",
                el("div.liste__nom", p.display_name),
                el("div.liste__detail",
                  [p.roblox_name ? `En jeu : ${p.roblox_name}` : null,
                   `inscrit ${dateCourte(p.created_at)}`].filter(Boolean).join(" · "))
              ),
              el("div.liste__fin",
                libelleTitre(p) ? el("span.etiq.etiq--info", libelleTitre(p)) : null,
                el("span.etiq", LIBELLES_ROLES[p.role_key] || p.role_key),
                p.id !== etat.utilisateur.id && nomme
                  ? el("button.btn.btn--fantome.btn--icone", {
                      "aria-label": "Modifier", onclick: (e) => menuCompte(e.currentTarget, p)
                    }, icone("points", 15))
                  : p.id === etat.utilisateur.id ? el("span.petit.faible", "vous") : null
              )
            )))
          : el("p.petit.faible", { style: { padding: "var(--e-4)", margin: 0 } }, "Aucun compte.")
      ))
    );
  }

  function menuCompte(ancre, profil) {
    const roles = Object.entries(LIBELLES_ROLES)
      .filter(([cle]) => estSuperAdmin() || (cle !== "super_admin"));
    const intouchable = profil.role_key === "super_admin" && !estSuperAdmin();
    menu(ancre, [
      { titre: profil.display_name },
      { libelle: "Nouveau mot de passe…", action: () => nouveauMotDePasse(profil) },
      { libelle: "Titre du personnage…", action: () => donnerTitre(profil) },
      { libelle: "Lui écrire…", action: () => ecrireA(profil) },
      intouchable ? null : { libelle: "Bannir le personnage…", danger: true, action: () => bannir(profil) },
      intouchable ? null : { libelle: "Supprimer le compte…", danger: true, action: () => supprimerCompte(profil) },
      intouchable ? { titre: "Super administrateur — seul un super administrateur y touche" } : { titre: "Rôle" },
      ...(intouchable ? [] : roles.map(([cle, libelle]) => ({
        libelle: libelle + (profil.role_key === cle ? "  ✓" : ""),
        action: async () => {
          if (profil.role_key === cle) return;
          const ok = await confirmer({
            titre: "Changer le rôle",
            message: `${profil.display_name} deviendra « ${libelle} ». Les permissions associées s'appliqueront immédiatement. `
              + "Le changement est inscrit au journal.",
            libelle: "Changer"
          });
          if (!ok) return;
          try {
            await profils.nommer(profil.id, cle);
            toast("Rôle modifié");
            await peindre();
          } catch (err) {
            erreur("Modification impossible", messageErreur(err));
          }
        }
      })))
    ]);
  }

  /* Bannir le personnage : le compte reste, le personnage part, la raison s'affiche au joueur. */
  async function bannir(profil) {
    const sortie = await formulaire({
      titre: `Bannir le personnage de ${profil.display_name}`,
      note: "Son titre, son apparence et ses fiches de personnage disparaissent ; son compte reste. "
        + "À sa prochaine visite, il lit la raison et doit recommencer un nouveau personnage. Inscrit au journal.",
      champs: [{ cle: "raison", label: "Raison (le joueur la lira)", type: "textarea", requis: true, valeur: "" }],
      libelle: "Bannir le personnage"
    });
    if (!sortie) return;
    try {
      await moderation.bannir(profil.id, sortie.raison);
      succes("Personnage banni", profil.display_name);
      await peindre();
    } catch (err) { erreur("Bannissement impossible", messageErreur(err)); }
  }

  /* Supprimer un compte : on retape son pseudo, pour ne pas se tromper de ligne. */
  async function supprimerCompte(profil) {
    const sortie = await formulaire({
      titre: `Supprimer le compte de ${profil.display_name}`,
      note: "Définitif : le compte, ses fiches, ses cahiers, ses papiers, ses affaires et les espaces "
        + "qu'il a créés disparaissent. La suppression est inscrite au journal.",
      champs: [{ cle: "pseudo", label: `Retapez « ${profil.display_name} » pour confirmer`, type: "text", requis: true, valeur: "" }],
      libelle: "Supprimer définitivement"
    });
    if (!sortie) return;
    if (sortie.pseudo.toLowerCase() !== profil.display_name.toLowerCase()) {
      erreur("Pseudo différent", "Rien n'a été supprimé.");
      return;
    }
    try {
      await profils.supprimerCompte(profil.id);
      succes("Compte supprimé", profil.display_name);
      await peindre();
    } catch (err) { erreur("Suppression impossible", messageErreur(err)); }
  }

  /* Le joueur a oublié son mot de passe : on lui en donne un nouveau, qu'on
     lui transmet en jeu. Il pourra le changer depuis son profil. */
  async function nouveauMotDePasse(profil) {
    const sortie = await formulaire({
      titre: `Nouveau mot de passe — ${profil.display_name}`,
      note: "Transmettez-le au joueur en jeu ; il pourra le changer depuis son profil.",
      champs: [{ cle: "mdp", label: "Mot de passe", type: "text", valeur: motDePasseAuHasard(), requis: true,
                 aide: "Huit caractères minimum." }],
      libelle: "Appliquer"
    });
    if (!sortie) return;
    if (sortie.mdp.length < 8) { erreur("Mot de passe trop court", "Huit caractères au minimum."); return; }
    try {
      await auth.remettreMotDePasse(profil.id, sortie.mdp);
      succes("Mot de passe changé", `${profil.display_name} peut entrer avec « ${sortie.mdp} ».`);
    } catch (err) {
      erreur("Changement impossible", messageErreur(err));
    }
  }

  async function sectionRoles() {
    const roles = await rbac.roles();
    const parRole = new Map();
    for (const role of roles) parRole.set(role.key, await rbac.pourRole(role.key));

    return el("div.pile",
      el("p.petit.doux",
        "Référentiel appliqué par la base (tables roles, permissions, role_permissions) et vérifié par les "
        + "politiques RLS. Modifier ces attributions se fait par migration SQL."),
      roles.map((role) => el("div.panneau",
        el("div.panneau__entete",
          el("span.panneau__titre", role.label),
          el("span.petit.faible", `rang ${role.rank}`)
        ),
        el("div.panneau__corps",
          el("div.ligne-flex.enrouler",
            (parRole.get(role.key) || []).map((p) => el("span.etiq", p)),
            !(parRole.get(role.key) || []).length ? el("span.petit.faible", "Aucune permission.") : null
          )
        )
      ))
    );
  }

  peindreBarre();
  await peindre();
  return { noeud, titre: admin ? "Administration" : "Modération" };
}
