/* ---------------------------------------------------------------------------
 * Fragments d'interface réutilisés d'une vue à l'autre.
 * ------------------------------------------------------------------------- */
import { el } from "./dom.js";
import { icone } from "./icons.js";
import { L } from "../core/lexique.js";
import { depuis, initiales, tronquer, duree, pluriel } from "../core/util.js";
import { LIBELLES_ROLES_CLASSE } from "../core/permissions.js";

const COUVERTURES = {
  parchment: "linear-gradient(160deg, #e8dcc4, #cbb994)",
  cuir:      "linear-gradient(160deg, #4a3527, #2c1f16)",
  ardoise:   "linear-gradient(160deg, #3d525c, #22303a)",
  olive:     "linear-gradient(160deg, #6f7d4d, #3f4a2b)",
  oxblood:   "linear-gradient(160deg, #7c3a3a, #4a2020)",
  encre:     "linear-gradient(160deg, #2a323a, #14181d)"
};

const NOMS_SUPPORT = { feuille: "Feuille", cahier: "Cahier", carnet: "Carnet", dossier: "Dossier" };

export function vignetteCahier(cahier, options = {}) {
  const support = cahier.support || "cahier";
  return el("a.dos-cahier", { href: `#/cahier/${cahier.id}` },
    el("span.dos-cahier__vignette", {
      dataset: { support },
      style: { background: COUVERTURES[cahier.cover] || COUVERTURES.parchment }
    }),
    el("span.dos-cahier__infos",
      el("span.dos-cahier__titre", cahier.title),
      cahier.subtitle ? el("span.petit.faible", cahier.subtitle) : null,
      el("span.etiq-support", NOMS_SUPPORT[support] || "Cahier"),
      el("span.petit.faible",
        cahier.kind === "shared" ? `${L("Cahier")} commun` : `Modifié ${depuis(cahier.updated_at || cahier.created_at)}`),
      options.pages != null ? el("span.petit.faible", pluriel(options.pages, "page")) : null
    )
  );
}

export function carteClasse(classe, options = {}) {
  const membre = classe.membre;
  return el("a.carte.carte--classe.carte--cliquable", {
    href: `#/classe/${classe.id}`, dataset: { teinte: classe.color || "olive" }
  },
    el("div.carte__entete",
      el("div", { style: { flex: "1", minWidth: "0" } },
        el("div.carte__titre.tronque", classe.name),
        el("div.carte__meta", [classe.subject, classe.level].filter(Boolean).join(" · ") || "—")
      ),
      membre ? el("span.etiq", LIBELLES_ROLES_CLASSE[membre.role] || membre.role) : null
    ),
    classe.description ? el("p.petit.doux", tronquer(classe.description, 110)) : null,
    el("div.carte__pied",
      classe.locked ? el("span.etiq.etiq--attn", icone("cadenas", 12), "Verrouillée") : null,
      options.enDirect ? el("span.etiq.etiq--direct", "En direct") : null,
      options.code !== false && classe.code ? el("span.mono", classe.code) : null,
      options.membres != null ? el("span", { class: "pousse" }, pluriel(options.membres, L("eleve"), L("eleves"))) : null
    )
  );
}

export function blocVide(titre, message, action = null) {
  return el("div.vide",
    el("span.vide__titre", titre),
    message ? el("p", message) : null,
    action ? el("button.btn.btn--primaire", { onclick: action.action }, action.libelle) : null
  );
}

export function avatar(profil, options = {}) {
  const classes = ["avatar"];
  if (options.grand) classes.push("avatar--grand");
  if (options.prof) classes.push("avatar--prof");
  if (profil?.avatar_url) {
    return el("img", {
      class: classes.join(" "), src: profil.avatar_url,
      alt: profil.display_name || "", loading: "lazy"
    });
  }
  return el("span", { class: classes.join(" ") }, initiales(profil?.display_name));
}

export function pastillePresence(statut) {
  const map = { present: "present", away: "away", absent: "absent", offline: "offline" };
  return el("span.pastille", { class: `pastille--${map[statut] || "offline"}` });
}

export function etiquetteStatutSession(session) {
  if (!session) return null;
  if (session.status === "live") return el("span.etiq.etiq--direct", "En direct");
  if (session.status === "ended") return el("span.etiq", "Terminée");
  return el("span.etiq.etiq--info", "Programmée");
}

export function statistique(valeur, libelle) {
  return el("div.stat",
    el("div.stat__valeur", String(valeur)),
    el("div.stat__label", libelle)
  );
}

export function jauge(valeur, total, options = {}) {
  const pourcent = total > 0 ? Math.round((valeur / total) * 100) : 0;
  return el("div.jauge", { title: `${valeur} / ${total}` },
    el("div.jauge__remplissage", {
      class: options.ok ? "jauge__remplissage--ok" : "",
      style: { width: `${pourcent}%` }
    })
  );
}

export function ligneEleve(entree, options = {}) {
  const { profil, status, activite } = entree;
  return el("div.eleve", { class: options.mainLevee ? "eleve--main-levee" : "" },
    pastillePresence(status),
    avatar(profil, { prof: options.prof }),
    el("div.eleve__infos",
      el("div.eleve__nom", profil?.display_name || "Participant"),
      el("div.eleve__activite", activite || "—")
    ),
    options.fin || null
  );
}

export function barreOutils(...contenus) {
  return el("div.ligne-flex.enrouler", contenus);
}

export function separateur() {
  return el("span", { style: { width: "1px", height: "20px", background: "var(--ligne)" } });
}

/** Encart « zone Roblox » : rappelle la cohabitation avec le jeu. */
export function encartRoblox() {
  return el("div.zone-roblox",
    icone("robot", 22),
    el("p", { style: { margin: "var(--e-2) 0 0" } },
      el("b", "Espace Roblox"), el("br"),
      el("span.petit", "Réduisez la fenêtre (densité Compact ou Minimal) pour placer le jeu à côté du cahier.")
    )
  );
}

export function chrono(secondes, etatMinuterie = "idle", libelle = null) {
  return el("span.chrono", { dataset: { etat: etatMinuterie } },
    libelle ? el("span.chrono__label", libelle) : null,
    el("span", duree(secondes))
  );
}

export function entete(surtitre, titre, sous = null, actions = null) {
  return el("div.page__entete",
    el("div.page__titre",
      surtitre ? el("span.page__surtitre", surtitre) : null,
      el("h1", titre),
      sous ? el("span.page__sous", sous) : null
    ),
    actions ? el("div.page__actions", actions) : null
  );
}

export function onglets(liste, actif, surChangement) {
  return el("div.onglets", { role: "tablist" },
    liste.map((o) => el("button.onglet", {
      role: "tab", "aria-selected": String(o.cle === actif),
      onclick: () => surChangement(o.cle)
    }, o.libelle, o.compteur ? el("span.compteur", ` ${o.compteur}`) : null))
  );
}
