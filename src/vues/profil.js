/* ---------------------------------------------------------------------------
 * Profil : identité, progression, présences, favoris.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat, definir } from "../core/store.js";
import { aller } from "../core/router.js";
import { L } from "../core/lexique.js";
import { profils, notes as depotNotes, presence, favoris, fichiers } from "../data/index.js";
import { entete, avatar, statistique, jauge } from "../ui/fragments.js";
import { formulaire } from "../ui/modal.js";
import { erreur, succes, toast, messageErreur } from "../ui/toast.js";
import { LIBELLES_ROLES } from "../core/permissions.js";
import { dateCourte, dateHeure, duree, dureeLongue, heure, pluriel } from "../core/util.js";
import { deconnecter } from "../core/session.js";

export default async function vueProfil() {
  const profil = etat.profil;
  const ids = etat.classes.map((c) => c.id);

  const [mesNotes, monHistorique, mesFavoris] = await Promise.all([
    ids.length ? depotNotes.liste({ class_id: ids, user_id: etat.utilisateur.id }).catch(() => []) : [],
    presence.historique(etat.utilisateur.id, 30).catch(() => []),
    favoris.liste(etat.utilisateur.id).catch(() => [])
  ]);

  const moyenne = mesNotes.length
    ? (mesNotes.reduce((s, n) => s + (n.score / (n.max_score || 20)) * 20, 0) / mesNotes.length)
    : null;
  const tempsTotal = monHistorique.reduce((s, p) => s + (p.seconds || 0), 0);

  const noeud = el("div.page",
    entete("Mon dossier", profil?.display_name || "Profil",
      `${LIBELLES_ROLES[profil?.role_key] || profil?.role_key} · inscrit le ${dateCourte(profil?.created_at)}`,
      [el("button.btn", { onclick: modifier }, icone("crayon", 15), "Modifier")]),

    el("div.colonnes",
      el("div.pile",
        el("div.panneau",
          el("div.panneau__entete", el("span.panneau__titre", "Identité")),
          el("div.panneau__corps",
            el("div.ligne-flex", { style: { marginBottom: "var(--e-4)" } },
              avatar(profil, { grand: true, prof: ["teacher", "instructor"].includes(profil?.role_key) }),
              el("div",
                el("h3", profil?.display_name),
                profil?.roblox_name ? el("span.petit.doux", `En jeu : ${profil.roblox_name}`) : null,
                profil?.rp_rank ? el("div", el("span.etiq.etiq--laiton", profil.rp_rank)) : null
              )
            ),
            profil?.bio ? el("p.doux", profil.bio) : el("p.petit.faible", "Aucune présentation."),
            el("div.ligne-flex",
              el("label.btn",
                icone("televerser", 15), "Changer d'avatar",
                el("input", {
                  type: "file", accept: "image/png,image/jpeg,image/webp", hidden: true,
                  onchange: (e) => changerAvatar(e.target.files[0])
                })
              )
            )
          )
        ),

        mesNotes.length ? el("div.panneau",
          el("div.panneau__entete", el("span.panneau__titre", "Mes résultats")),
          el("div.panneau__corps.panneau__corps--serre",
            el("div.liste", mesNotes.map((n) => el("div.liste__item",
              el("div.liste__principal",
                el("div.liste__nom", n.label),
                el("div.liste__detail",
                  `${etat.classes.find((c) => c.id === n.class_id)?.name || "—"} · ${dateCourte(n.created_at)}`)
              ),
              el("div.liste__fin",
                el("span.etiq", `${n.score} / ${n.max_score}`)
              )
            )))
          )
        ) : null,

        el("div.panneau",
          el("div.panneau__entete", el("span.panneau__titre", `Mes ${L("presence")}s`)),
          el("div.panneau__corps.panneau__corps--serre",
            monHistorique.length
              ? el("div.liste", monHistorique.map((p) => el("div.liste__item",
                  el("div.liste__principal",
                    el("div.liste__nom", dateHeure(p.arrived_at)),
                    el("div.liste__detail",
                      `${p.status === "present" ? "Présent" : p.status === "away" ? "Absent temporaire" : "Absent"}`
                      + (p.left_at ? ` · sortie ${heure(p.left_at)}` : ""))
                  ),
                  el("div.liste__fin", el("span.mono.petit", duree(p.seconds)))
                )))
              : el("p.petit.faible", { style: { padding: "var(--e-4)", margin: 0 } }, "Aucune séance suivie.")
          )
        )
      ),

      el("div.pile",
        el("div.stats",
          statistique(etat.classes.length, L("classes")),
          statistique(monHistorique.length, "séances"),
          statistique(moyenne != null ? moyenne.toFixed(1) : "—", "moyenne /20"),
          statistique(dureeLongue(tempsTotal), "temps de cours")
        ),

        moyenne != null ? el("div.panneau",
          el("div.panneau__entete", el("span.panneau__titre", "Progression")),
          el("div.panneau__corps",
            el("p.petit.doux", `Moyenne générale sur ${pluriel(mesNotes.length, "évaluation")}.`),
            jauge(moyenne, 20, { ok: moyenne >= 10 })
          )
        ) : null,

        mesFavoris.length ? el("div.panneau",
          el("div.panneau__entete", el("span.panneau__titre", "Favoris")),
          el("div.panneau__corps.panneau__corps--serre",
            el("div.liste", mesFavoris.map((f) => el("div.liste__item",
              icone("etoile", 15),
              el("div.liste__principal", el("div.liste__nom", f.label || f.target_kind))
            )))
          )
        ) : null,

        el("div.panneau",
          el("div.panneau__entete", el("span.panneau__titre", "Compte")),
          el("div.panneau__corps.pile",
            el("span.petit.faible", etat.utilisateur.email || "—"),
            el("button.btn", { onclick: () => aller("/reglages") }, icone("reglages", 15), "Réglages"),
            el("button.btn.btn--danger", {
              onclick: async () => { await deconnecter(); aller("/connexion"); }
            }, icone("sortie", 15), "Se déconnecter")
          )
        )
      )
    )
  );

  async function modifier() {
    const sortie = await formulaire({
      titre: "Modifier mon profil",
      champs: [
        { cle: "display_name", label: "Nom affiché", valeur: profil.display_name, requis: true },
        { cle: "roblox_name", label: "Identité en jeu", valeur: profil.roblox_name || "",
          aide: "Votre pseudo sur le serveur. Il sert à l'encadrement pour vous "
              + "retrouver en jeu, et n'apparaît jamais à la place de votre personnage." },
        { cle: "rp_rank", label: "Grade ou fonction RP", valeur: profil.rp_rank || "" },
        { cle: "bio", label: "Présentation", type: "textarea", valeur: profil.bio || "" }
      ]
    });
    if (!sortie) return;
    try {
      const maj = await profils.majorer(profil.id, sortie);
      definir({ profil: maj });
      succes("Profil mis à jour");
      aller("/profil");
    } catch (err) {
      erreur("Mise à jour impossible", messageErreur(err));
    }
  }

  async function changerAvatar(fichier) {
    if (!fichier) return;
    if (fichier.size > 2 * 1024 * 1024) {
      erreur("Image trop lourde", "2 Mo maximum.");
      return;
    }
    try {
      const extension = (fichier.name.split(".").pop() || "png").toLowerCase();
      const chemin = `${etat.utilisateur.id}/avatar.${extension}`;
      await fichiers.televerser(fichier, chemin, "avatars");
      const url = await fichiers.url(chemin, "avatars");
      const maj = await profils.majorer(profil.id, { avatar_url: `${url}?v=${Date.now()}` });
      definir({ profil: maj });
      toast("Avatar mis à jour");
      aller("/profil");
    } catch (err) {
      erreur("Envoi impossible", messageErreur(err));
    }
  }

  return { noeud, titre: "Mon profil" };
}
