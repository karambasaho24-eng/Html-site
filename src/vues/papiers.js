/* ---------------------------------------------------------------------------
 * La sacoche.
 *
 * D'un côté ce qu'on a rédigé et qu'on peut encore tendre, de l'autre ce
 * qu'on nous a tendu. Un papier reçu attend une décision : on le lit, puis on
 * le garde ou on le refuse. Tant qu'on n'a pas tranché, il reste en main.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { papiers, personnages, membres as depotMembres } from "../data/index.js";
import { entete, blocVide } from "../ui/fragments.js";
import { menu, confirmer } from "../ui/modal.js";
import { erreur, succes, toast, messageErreur } from "../ui/toast.js";
import { depuis } from "../core/util.js";
import {
  rendrePapier, composerPapier, tendrePapier, recevoirPapier, MODELES
} from "../features/papier.js";

const ETATS = {
  offered:  { libelle: "En attente", etiq: "etiq--attn" },
  accepted: { libelle: "Gardé", etiq: "etiq--ok" },
  refused:  { libelle: "Refusé", etiq: "etiq--alerte" },
  withdrawn:{ libelle: "Retiré", etiq: "" }
};

export default async function vuePapiers() {
  let onglet = "recus";
  const zone = el("div");
  const onglets = el("div.salle__panneau-onglets", { role: "tablist" });

  const noeud = el("div.page",
    entete("Ma sacoche", "Papiers",
      "Ce que vous avez rédigé, et ce qu'on vous a remis en main propre.",
      [el("button.btn.btn--primaire", { onclick: rediger },
        icone("plus", 15), "Rédiger un papier")]),
    onglets,
    zone
  );

  let mesPapiers = [];
  let recus = [];
  let fiches = new Map();

  async function charger() {
    [mesPapiers, recus] = await Promise.all([
      papiers.mesPapiers(etat.utilisateur.id).catch(() => []),
      papiers.recus(etat.utilisateur.id).catch(() => [])
    ]);
    // Le nom du personnage prime sur celui du compte, partout.
    const classesVues = [...new Set(recus.map((r) => r.class_id).filter(Boolean))];
    fiches = new Map();
    for (const c of classesVues) {
      const index = await personnages.index(c).catch(() => new Map());
      for (const [k, v] of index) if (!fiches.has(k)) fiches.set(k, v);
    }
  }

  function peindre() {
    const enAttente = recus.filter((r) => r.state === "offered").length;
    render(onglets,
      [{ cle: "recus", libelle: "Reçus", compteur: enAttente },
       { cle: "mes", libelle: "Rédigés par moi", compteur: mesPapiers.length }]
        .map((o) => el("button.onglet", {
          role: "tab", "aria-selected": String(o.cle === onglet),
          onclick: () => { onglet = o.cle; peindre(); }
        }, o.libelle, o.compteur ? el("span.pastille-compteur", String(o.compteur)) : null)));

    render(zone, onglet === "recus" ? panneauRecus() : panneauMes());
  }

  /* --- Ce qu'on m'a tendu ---------------------------------------------------- */
  function panneauRecus() {
    if (!recus.length) {
      return blocVide("Rien dans la sacoche",
        "Personne ne vous a encore tendu de papier. Cela se fait en face à face, en séance.");
    }
    return el("div.grille.grille--2", recus.map((remise) => {
      const etatLu = ETATS[remise.state] || ETATS.offered;
      return el("div.papier-carte",
        el("div.papier-carte__entete",
          el("span.etiq", { class: etatLu.etiq }, etatLu.libelle),
          el("span.petit.faible",
            "de ", nomDe(remise.from_user, remise.auteur), " · ", depuis(remise.created_at))
        ),
        remise.papier
          ? el("button.papier-carte__objet", {
              type: "button",
              "aria-label": `Ouvrir « ${remise.papier.title} »`,
              onclick: () => ouvrirRecu(remise)
            }, rendrePapier(remise.papier, {
              auteur: remise.auteur, fiche: fiches.get(remise.from_user), miniature: true
            }))
          : el("p.petit.faible", "Ce papier n'est plus disponible."),
        remise.state === "offered"
          ? el("div.papier-carte__pied",
              el("button.btn.btn--primaire", { onclick: () => ouvrirRecu(remise) },
                "Le prendre en main"))
          : null
      );
    }));
  }

  async function ouvrirRecu(remise) {
    const decision = await recevoirPapier(remise, { fiche: fiches.get(remise.from_user) });
    if (!decision) return;
    await charger();
    peindre();
  }

  /* --- Ce que j'ai écrit ----------------------------------------------------- */
  function panneauMes() {
    if (!mesPapiers.length) {
      return blocVide("Aucun papier rédigé",
        "Un mot, un ordre, une convocation : choisissez un modèle et écrivez.",
        { libelle: "Rédiger un papier", action: rediger });
    }
    return el("div.grille.grille--2", mesPapiers.map((p) => el("div.papier-carte",
      el("div.papier-carte__entete",
        el("span.etiq", MODELES[p.model]?.libelle || "Papier"),
        el("span.petit.faible", depuis(p.created_at)),
        el("span.pousse"),
        el("button.btn.btn--fantome.btn--icone", {
          "aria-label": "Actions", onclick: (e) => actions(e.currentTarget, p)
        }, icone("points", 15))
      ),
      el("div.papier-carte__objet", rendrePapier(p, {
        auteur: etat.profil, miniature: true
      }))
    )));
  }

  function actions(ancre, papier) {
    menu(ancre, [
      { libelle: "Le tendre à quelqu'un", icone: "main", action: () => remettre(papier) },
      { libelle: "Le reprendre", icone: "crayon", action: () => modifier(papier) },
      {
        libelle: "En faire des copies", icone: "copier",
        action: async () => {
          try {
            const copies = await papiers.dupliquer(papier.id, 1);
            succes(`Copie faite (${copies.length})`);
            await charger(); peindre();
          } catch (err) { erreur("Copie impossible", messageErreur(err)); }
        }
      },
      { separateur: true },
      {
        libelle: "Déchirer", icone: "corbeille", danger: true,
        action: async () => {
          const ok = await confirmer({
            titre: "Déchirer ce papier",
            message: `« ${papier.title} » disparaîtra de votre sacoche. `
              + "Les exemplaires déjà remis restent chez ceux qui les ont pris.",
            libelle: "Déchirer", danger: true
          });
          if (!ok) return;
          try { await papiers.supprimer(papier.id); await charger(); peindre(); }
          catch (err) { erreur("Impossible", messageErreur(err)); }
        }
      }
    ]);
  }

  async function rediger() {
    const cree = await composerPapier({ classe: etat.classeActive || null });
    if (!cree) return;
    await charger(); onglet = "mes"; peindre();
  }

  async function modifier(papier) {
    const maj = await composerPapier({ classe: etat.classeActive || null, papier });
    if (!maj) return;
    await charger(); peindre();
  }

  /**
   * Hors séance, on tend un papier aux membres d'une classe que l'on partage :
   * c'est la seule population dont on peut dire qu'on la croise.
   */
  async function remettre(papier) {
    const classe = etat.classes.find((c) => c.id === papier.class_id)
      || etat.classeActive
      || etat.classes[0];
    if (!classe) {
      toast("Rejoignez un espace avant de remettre un papier.");
      return;
    }
    const equipe = await depotMembres.liste(classe.id).catch(() => []);
    const index = await personnages.index(classe.id).catch(() => new Map());
    const candidats = equipe
      .filter((m) => m.status === "active")
      .map((m) => ({ user_id: m.user_id, profil: m.profil, nom: m.profil?.display_name }));

    const fait = await tendrePapier({ papier, classe, candidats, fiches: index });
    if (fait) { await charger(); peindre(); }
  }

  function nomDe(userId, profil) {
    const fiche = fiches.get(userId);
    return fiche?.name?.trim() || profil?.display_name || "Quelqu'un";
  }

  await charger();
  peindre();
  return { noeud, titre: "Ma sacoche" };
}
