/* ---------------------------------------------------------------------------
 * Administration : comptes, rôles, journaux, modération.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { pilote, profils, rbac, journal } from "../data/index.js";
import { entete, blocVide, avatar, statistique } from "../ui/fragments.js";
import { estAdmin, LIBELLES_ROLES } from "../core/permissions.js";
import { confirmer, menu } from "../ui/modal.js";
import { erreur, toast, messageErreur } from "../ui/toast.js";
import { dateCourte, heure, aplatir } from "../core/util.js";

export default async function vueAdministration() {
  if (!estAdmin()) {
    return {
      noeud: el("div.page", blocVide("Accès refusé",
        "Cet espace est réservé à l'administration de l'académie.",
        { libelle: "Accueil", action: () => aller("/") })),
      titre: "Administration"
    };
  }

  let actif = "comptes";
  let filtre = "";
  const contenu = el("div");
  const barre = el("div.onglets", { role: "tablist" });

  const noeud = el("div.page.page--large",
    entete("Administration", "Comptes et journaux",
      "Les droits réels sont appliqués par la base de données ; cet écran ne fait qu'en refléter l'état."),
    barre, contenu
  );

  const ONGLETS = [
    { cle: "comptes", libelle: "Comptes" },
    { cle: "roles", libelle: "Rôles et permissions" },
    { cle: "journaux", libelle: "Journaux" }
  ];

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
