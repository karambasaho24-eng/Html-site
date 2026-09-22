/* ---------------------------------------------------------------------------
 * Administration : comptes, rôles, journaux, modération.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { pilote, profils, rbac, journal, papiers } from "../data/index.js";
import { entete, blocVide, avatar, statistique } from "../ui/fragments.js";
import { estAdmin, estModerateur, LIBELLES_ROLES } from "../core/permissions.js";
import { confirmer, menu, ouvrirModale } from "../ui/modal.js";
import { erreur, toast, messageErreur } from "../ui/toast.js";
import { dateCourte, heure, depuis, aplatir } from "../core/util.js";
import { rendrePapier, MODELES } from "../features/papier.js";

export default async function vueAdministration() {
  if (!estModerateur()) {
    return {
      noeud: el("div.page", blocVide("Accès refusé",
        "Cet espace est réservé à l'administration et à la modération.",
        { libelle: "Accueil", action: () => aller("/") })),
      titre: "Administration"
    };
  }

  // Un modérateur n'administre pas les comptes : il surveille ce qui circule.
  const admin = estAdmin();
  let actif = admin ? "comptes" : "papiers";
  let filtre = "";
  const contenu = el("div");
  const barre = el("div.onglets", { role: "tablist" });

  const noeud = el("div.page.page--large",
    entete("Administration", "Comptes et journaux",
      "Les droits réels sont appliqués par la base de données ; cet écran ne fait qu'en refléter l'état."),
    barre, contenu
  );

  const ONGLETS = [
    admin ? { cle: "comptes", libelle: "Comptes" } : null,
    admin ? { cle: "roles", libelle: "Rôles et permissions" } : null,
    { cle: "papiers", libelle: "Papiers en circulation" },
    { cle: "journaux", libelle: "Journaux" }
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
      if (actif === "comptes") render(contenu, await sectionComptes());
      else if (actif === "roles") render(contenu, await sectionRoles());
      else if (actif === "papiers") render(contenu, await sectionPapiers());
      else render(contenu, await sectionJournaux());
    } catch (err) {
      render(contenu, blocVide("Chargement impossible", messageErreur(err)));
    }
  }

  async function sectionComptes() {
    const tous = await pilote.table("profiles").liste({}, { ordre: "created_at", sens: "desc", limite: 300 });
    const visibles = filtre
      ? tous.filter((p) => aplatir(`${p.display_name} ${p.roblox_name || ""}`).includes(aplatir(filtre)))
      : tous;

    return el("div.pile",
      el("div.stats",
        statistique(tous.length, "comptes"),
        statistique(tous.filter((p) => ["teacher", "instructor"].includes(p.role_key)).length, "enseignants"),
        statistique(tous.filter((p) => p.role_key === "student").length, "élèves"),
        statistique(tous.filter((p) => ["admin", "super_admin", "director"].includes(p.role_key)).length, "administration")
      ),
      el("input.saisie", {
        type: "search", placeholder: "Rechercher un compte…", value: filtre,
        oninput: (e) => { filtre = e.target.value; peindre(); }
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
                el("span.etiq", LIBELLES_ROLES[p.role_key] || p.role_key),
                p.id !== etat.utilisateur.id
                  ? el("button.btn.btn--fantome.btn--icone", {
                      "aria-label": "Modifier le rôle",
                      onclick: (e) => menuCompte(e.currentTarget, p)
                    }, icone("points", 15))
                  : el("span.petit.faible", "vous")
              )
            )))
          : el("p.petit.faible", { style: { padding: "var(--e-4)", margin: 0 } }, "Aucun compte.")
      ))
    );
  }

  function menuCompte(ancre, profil) {
    menu(ancre, [
      { titre: profil.display_name },
      { titre: "Rôle global" },
      ...Object.entries(LIBELLES_ROLES).map(([cle, libelle]) => ({
        libelle: libelle + (profil.role_key === cle ? "  ✓" : ""),
        action: async () => {
          const ok = await confirmer({
            titre: "Changer le rôle",
            message: `${profil.display_name} deviendra « ${libelle} ». Les permissions associées s'appliqueront immédiatement.`,
            libelle: "Changer"
          });
          if (!ok) return;
          try {
            await profils.majorer(profil.id, { role_key: cle });
            toast("Rôle modifié");
            await peindre();
          } catch (err) {
            erreur("Modification impossible", messageErreur(err));
          }
        }
      }))
    ]);
  }

  /**
   * Ce qui circule. Un modérateur voit passer les remises et peut lire un
   * papier signalé — il ne décide jamais à la place du destinataire :
   * accepter ou refuser reste un geste de personnage.
   */
  async function sectionPapiers() {
    let recents = [];
    try { recents = await papiers.circulation(200); }
    catch (err) { return blocVide("Registre indisponible", messageErreur(err)); }

    if (!recents.length) {
      return blocVide("Rien ne circule",
        "Aucun papier n'a encore été tendu sur cette plateforme.");
    }

    const ETATS = {
      offered:  ["En attente", "etiq--attn"],
      accepted: ["Gardé", "etiq--ok"],
      refused:  ["Refusé", "etiq--alerte"],
      withdrawn:["Retiré", ""]
    };

    return el("div.panneau",
      el("p.petit.faible", { style: { padding: "var(--e-4)", margin: 0 } },
        "Les deux cents dernières remises. Ouvrir un papier est une lecture, "
        + "inscrite au journal comme telle."),
      el("div.liste", recents.map((r) => {
        const [libelle, teinte] = ETATS[r.state] || ETATS.offered;
        return el("div.liste__item",
          el("span.etiq", { class: teinte }, libelle),
          el("div", { style: { flex: "1", minWidth: "0" } },
            el("div.tronque", r.papier?.title || "Papier supprimé"),
            el("div.petit.faible",
              `${MODELES[r.papier?.model]?.libelle || "Papier"} · `
              + `${r.expediteur?.display_name || "?"} → ${r.destinataire?.display_name || "?"}`
              + ` · ${depuis(r.created_at)}`)
          ),
          r.attested
            ? el("span.etiq.etiq--info", { title: "Proximité attestée par l'émetteur" }, "En main propre")
            : el("span.etiq", { title: "Aucune attestation de proximité" }, "Sans attestation"),
          r.papier ? el("button.btn.btn--fantome.btn--icone", {
            "aria-label": `Lire « ${r.papier.title} »`,
            onclick: () => lirePapier(r)
          }, icone("oeil", 15)) : null
        );
      }))
    );
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

  async function sectionRoles() {
    const [roles, permissions] = await Promise.all([rbac.roles(), rbac.permissions()]);
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

  async function sectionJournaux() {
    const entrees = await journal.liste({}, 200);
    const profilsLies = await profils.parIds([...new Set(entrees.map((e) => e.user_id).filter(Boolean))]);
    const index = new Map(profilsLies.map((p) => [p.id, p]));

    return el("div.panneau",
      el("div.panneau__entete", el("span.panneau__titre", "200 dernières actions")),
      el("div.panneau__corps.panneau__corps--serre",
        entrees.length
          ? el("div.journal", entrees.map((e) => el("div.journal__ligne",
              el("span.journal__heure", `${dateCourte(e.created_at)} ${heure(e.created_at)}`),
              el("span", `${index.get(e.user_id)?.display_name || "—"} · ${e.action}`)
            )))
          : el("p.petit.faible", { style: { padding: "var(--e-4)", margin: 0 } }, "Journal vide.")
      )
    );
  }

  peindreBarre();
  await peindre();
  return { noeud, titre: "Administration" };
}
