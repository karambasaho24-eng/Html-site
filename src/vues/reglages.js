/* ---------------------------------------------------------------------------
 * Réglages : affichage, cohabitation Roblox, raccourcis, vocabulaire RP,
 * connexion Supabase, données locales.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { entete } from "../ui/fragments.js";
import { config, definirConfig, reinitialiserConfig } from "../core/config.js";
import { pilote } from "../data/index.js";
import { DENSITES, appliquerDensite, appliquerTheme, raccourcis, definirRaccourci, reinitialiserRaccourcis, libelleCombinaison } from "../core/interface.js";
import { L, lexiqueActuel, definirLexique, PRESETS, appliquerPreset, presetActuel } from "../core/lexique.js";
import { confirmer, formulaire } from "../ui/modal.js";
import { succes, erreur, toast } from "../ui/toast.js";
import { local, poids } from "../core/util.js";

const ONGLETS = [
  { cle: "affichage", libelle: "Affichage" },
  { cle: "roblox", libelle: "Cohabitation Roblox" },
  { cle: "raccourcis", libelle: "Raccourcis" },
  { cle: "lexique", libelle: "Vocabulaire RP" },
  { cle: "connexion", libelle: "Connexion" },
  { cle: "donnees", libelle: "Données locales" }
];

const LIBELLES_ACTIONS = {
  "cahier.ouvrir": "Ouvrir le dernier cahier",
  "cahiers.liste": "Mes cahiers",
  "classes.liste": "Mes classes",
  "tableau.ouvrir": "Salle de cours",
  "notes.ouvrir": "Notes personnelles",
  "recherche.ouvrir": "Recherche globale",
  "densite.cycler": "Changer de densité",
  "densite.minimal": "Basculer en mode minimal",
  "page.suivante": "Page suivante",
  "page.precedente": "Page précédente",
  "page.nouvelle": "Nouvelle page",
  "aide.raccourcis": "Aide des raccourcis"
};

export default async function vueReglages({ requete }) {
  let actif = requete?.onglet || "affichage";
  const contenu = el("div");
  const barre = el("div.onglets", { role: "tablist" });

  const noeud = el("div.page",
    entete("Réglages", "Préférences", "Ce qui est propre à ce poste reste sur ce poste."),
    barre, contenu
  );

  function peindreBarre() {
    render(barre, ONGLETS.map((o) => el("button.onglet", {
      role: "tab", "aria-selected": String(o.cle === actif),
      onclick: () => { actif = o.cle; peindreBarre(); peindre(); }
    }, o.libelle)));
  }

  function peindre() {
    const rendus = {
      affichage: sectionAffichage, roblox: sectionRoblox, raccourcis: sectionRaccourcis,
      lexique: sectionLexique, connexion: sectionConnexion, donnees: sectionDonnees
    };
    render(contenu, (rendus[actif] || sectionAffichage)());
  }

  /* --- Affichage ------------------------------------------------------------ */
  function sectionAffichage() {
    return el("div.pile",
      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Thème")),
        el("div.panneau__corps",
          el("div.groupe-btn",
            el("button.btn", {
              "aria-pressed": String(etat.theme === "nuit"),
              onclick: () => { appliquerTheme("nuit"); peindre(); }
            }, "Nuit"),
            el("button.btn", {
              "aria-pressed": String(etat.theme === "jour"),
              onclick: () => { appliquerTheme("jour"); peindre(); }
            }, "Jour")
          ),
          el("p.petit.faible", { style: { marginTop: "var(--e-3)", marginBottom: 0 } },
            "Le cahier conserve son parchemin dans les deux thèmes.")
        )
      )
    );
  }

  /* --- Roblox ---------------------------------------------------------------- */
  function sectionRoblox() {
    return el("div.pile",
      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Densité de l'interface")),
        el("div.panneau__corps.panneau__corps--serre",
          el("div.liste", DENSITES.map((d) => el("div.liste__item.liste__item--cliquable", {
            "aria-current": String(etat.densite === d.cle),
            onclick: () => { appliquerDensite(d.cle); peindre(); }
          },
            el("div.liste__principal",
              el("div.liste__nom", d.libelle),
              el("div.liste__detail", d.aide)
            ),
            el("div.liste__fin", etat.densite === d.cle ? icone("coche", 15) : null)
          )))
        )
      ),
      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Bonnes pratiques")),
        el("div.panneau__corps",
          el("ul.doux.petit", { style: { paddingLeft: "1.2em", margin: 0 } },
            el("li", "Le site ne s'injecte pas dans Roblox et ne modifie pas le jeu : il s'utilise dans une fenêtre à côté."),
            el("li", "En mode Compact, la navigation passe en icônes ; en mode Minimal, seul le cahier reste."),
            el("li", "Toute la logique scolaire vit ici, ce qui évite d'alourdir le serveur RP."),
            el("li", `Raccourci : ${libelleCombinaison(raccourcis()["densite.cycler"])} pour changer de densité.`)
          )
        )
      )
    );
  }

  /* --- Raccourcis -------------------------------------------------------------- */
  function sectionRaccourcis() {
    const table = raccourcis();
    return el("div.pile",
      el("div.panneau",
        el("div.panneau__entete",
          el("span.panneau__titre", "Raccourcis clavier"),
          el("button.btn.btn--fantome.petit", {
            onclick: () => { reinitialiserRaccourcis(); peindre(); toast("Raccourcis réinitialisés"); }
          }, "Réinitialiser")
        ),
        el("div.panneau__corps.panneau__corps--serre",
          el("div.liste", Object.entries(table).map(([action, combinaison]) =>
            el("div.liste__item",
              el("div.liste__principal",
                el("div.liste__nom", LIBELLES_ACTIONS[action] || action),
                el("div.liste__detail", action)
              ),
              el("div.liste__fin",
                el("kbd", libelleCombinaison(combinaison)),
                el("button.btn.btn--fantome.btn--icone", {
                  "aria-label": "Modifier",
                  onclick: async () => {
                    const sortie = await formulaire({
                      titre: LIBELLES_ACTIONS[action] || action,
                      note: "Séquence (« g c ») ou combinaison (« mod+\\ », « alt+ArrowRight »).",
                      champs: [{ cle: "combinaison", label: "Raccourci", valeur: combinaison, requis: true }]
                    });
                    if (!sortie) return;
                    definirRaccourci(action, sortie.combinaison);
                    peindre();
                  }
                }, icone("crayon", 14))
              )
            ))
          )
        )
      )
    );
  }

  /* --- Lexique ------------------------------------------------------------------ */
  function sectionLexique() {
    const actuel = lexiqueActuel();
    const preset = presetActuel();

    return el("div.pile",
      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Nature de vos espaces")),
        el("div.panneau__corps.panneau__corps--serre",
          el("div.liste", Object.entries(PRESETS).map(([cle, p]) =>
            el("div.liste__item.liste__item--cliquable", {
              "aria-current": String(cle === preset),
              onclick: () => {
                appliquerPreset(cle);
                succes(`Vocabulaire « ${p.libelle} »`, "Rechargez pour l'appliquer partout.");
                peindre();
              }
            },
              el("div.liste__principal",
                el("div.liste__nom", p.libelle),
                el("div.liste__detail", p.aide)
              ),
              el("div.liste__fin", cle === preset ? icone("coche", 15) : null)
            )))
        )
      ),
      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Ajustement mot à mot")),
        el("div.panneau__corps",
          el("p.petit.doux",
            "Partez d'un jeu ci-dessus, puis retouchez les termes qui ne collent pas tout à fait."),
          el("button.btn", {
            onclick: async () => {
              const sortie = await formulaire({
                titre: "Vocabulaire RP", large: true,
                champs: ["Classe", "Classes", "Eleve", "Eleves", "Professeur", "Cours", "Cahier", "Tableau", "Session"]
                  .map((terme) => ({ cle: terme, label: terme, valeur: actuel[terme] || "" })),
                libelle: "Appliquer"
              });
              if (!sortie) return;
              definirLexique(sortie);
              succes("Vocabulaire mis à jour", "Rechargez pour l'appliquer partout.");
              peindre();
            }
          }, icone("crayon", 15), "Personnaliser les termes")
        )
      ),
      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Aperçu")),
        el("div.panneau__corps.panneau__corps--serre",
          el("div.liste", ["Classe", "Eleve", "Professeur", "Cahier", "Tableau", "Session"].map((terme) =>
            el("div.liste__item",
              el("div.liste__principal", el("div.liste__nom", terme)),
              el("div.liste__fin", el("span.etiq", L(terme)))
            ))
          )
        )
      )
    );
  }

  /* --- Connexion ------------------------------------------------------------------ */
  function sectionConnexion() {
    let champUrl, champCle;
    return el("div.pile",
      el("div.panneau",
        el("div.panneau__entete",
          el("span.panneau__titre", "Projet Supabase"),
          el("span.etiq", pilote.mode === "supabase" ? "Connecté" : "Mode démonstration")
        ),
        el("div.panneau__corps",
          el("p.petit.doux",
            "L'URL et la clé publique sont publiques par nature : la sécurité repose sur les politiques RLS "
            + "définies dans supabase/migrations/. Ne collez jamais ici une clé de service."),

          el("label.champ",
            el("span.champ__label", "URL du projet"),
            champUrl = el("input.saisie", {
              value: config.supabaseUrl || "", placeholder: "https://xxxx.supabase.co",
              spellcheck: "false"
            })
          ),
          el("label.champ",
            el("span.champ__label", "Clé publique (anon / publishable)"),
            champCle = el("input.saisie", {
              value: config.supabaseAnonKey || "", placeholder: "eyJ… ou sb_publishable_…",
              spellcheck: "false", type: "password"
            }),
            el("span.champ__aide", "Disponible dans Supabase › Project Settings › API.")
          ),
          el("div.ligne-flex",
            el("button.btn.btn--primaire", {
              onclick: async () => {
                const url = champUrl.value.trim();
                const cle = champCle.value.trim();
                if (url && !/^https:\/\/.+/.test(url)) {
                  erreur("URL invalide", "Elle doit commencer par https://");
                  return;
                }
                if (cle.startsWith("sb_secret") || cle.includes("service_role")) {
                  erreur("Clé refusée", "Cette clé est une clé de service : elle ne doit jamais être exposée dans un site.");
                  return;
                }
                definirConfig({ supabaseUrl: url, supabaseAnonKey: cle });
                const ok = await confirmer({
                  titre: "Recharger l'application",
                  message: "La configuration est enregistrée. Recharger maintenant pour l'appliquer ?",
                  libelle: "Recharger"
                });
                if (ok) location.reload();
              }
            }, "Enregistrer"),
            el("button.btn", {
              onclick: async () => {
                const ok = await confirmer({
                  titre: "Revenir en mode démonstration",
                  message: "La configuration locale sera effacée. Les données déjà enregistrées dans Supabase ne sont pas touchées.",
                  libelle: "Effacer"
                });
                if (!ok) return;
                reinitialiserConfig();
                location.reload();
              }
            }, "Effacer la configuration locale")
          )
        )
      ),

      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Mise en place")),
        el("div.panneau__corps",
          el("ol.doux.petit", { style: { paddingLeft: "1.2em", margin: 0 } },
            el("li", "Créez un projet sur supabase.com."),
            el("li", "Exécutez dans l'ordre les fichiers de supabase/migrations/ dans l'éditeur SQL."),
            el("li", "Copiez l'URL et la clé publique ci-dessus, ou renseignez-les dans config.js."),
            el("li", "Rechargez : l'application bascule automatiquement en mode réel.")
          )
        )
      )
    );
  }

  /* --- Données locales --------------------------------------------------------------- */
  function sectionDonnees() {
    const cles = Object.keys(localStorage).filter((c) => c.startsWith("ojm."));
    const taille = cles.reduce((s, c) => s + (localStorage.getItem(c)?.length || 0), 0);

    return el("div.pile",
      el("div.panneau",
        el("div.panneau__entete", el("span.panneau__titre", "Stockage de ce navigateur")),
        el("div.panneau__corps",
          el("p.petit.doux",
            `${cles.length} entrées · environ ${poids(taille)}. `
            + "Y sont conservés : préférences, notes personnelles de séance et brouillons non encore envoyés."),
          el("div.ligne-flex.enrouler",
            el("button.btn", {
              onclick: () => {
                const donnees = Object.fromEntries(cles.map((c) => [c, localStorage.getItem(c)]));
                const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: "application/json" });
                const lien = document.createElement("a");
                lien.href = URL.createObjectURL(blob);
                lien.download = `ojm-donnees-locales-${new Date().toISOString().slice(0, 10)}.json`;
                lien.click();
                URL.revokeObjectURL(lien.href);
              }
            }, icone("telecharger", 15), "Exporter"),
            el("button.btn.btn--danger", {
              onclick: async () => {
                const ok = await confirmer({
                  titre: "Effacer les données locales",
                  message: "Préférences, brouillons et notes de séance non synchronisés seront perdus. "
                    + (pilote.mode === "local"
                      ? "En mode démonstration, TOUS vos contenus disparaîtront."
                      : "Vos contenus enregistrés dans Supabase ne sont pas touchés."),
                  libelle: "Effacer", danger: true
                });
                if (!ok) return;
                for (const cle of cles) localStorage.removeItem(cle);
                if (pilote.mode === "local") {
                  for (const cle of Object.keys(localStorage)) {
                    if (cle.startsWith("ojm.local.")) localStorage.removeItem(cle);
                  }
                }
                location.reload();
              }
            }, icone("corbeille", 15), "Effacer")
          )
        )
      )
    );
  }

  peindreBarre();
  peindre();
  return { noeud, titre: "Réglages" };
}
