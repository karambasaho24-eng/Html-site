/* ---------------------------------------------------------------------------
 * Le circuit d'un document : écrire, signer, donner.
 *
 * Avant, tendre un papier demandait trois fenêtres empilées (rédiger, choisir
 * les destinataires, attester la proximité). Ici, c'est un seul parcours en
 * trois étapes, sur place, qu'on suit de haut en bas :
 *
 *   1. Écrire  — le modèle, un titre, le texte ; l'aperçu se dessine en direct.
 *   2. Signer  — on relit, on signe. Signé, le document est figé : c'est ce
 *                qui le fait exister pour les autres. Avant, c'est un brouillon
 *                qui reste sur ce poste.
 *   3. Donner  — on choisit la personne, on confirme être à côté d'elle en
 *                jeu, et c'est parti. Elle l'accepte (ou non) de son côté.
 *
 * La proximité passe par `portee()` : le jour où le jeu saura la mesurer, la
 * case à cocher disparaîtra d'elle-même.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { emettre } from "../core/bus.js";
import { local, uid } from "../core/util.js";
import { nomAffiche } from "../core/rp.js";
import { papiers, membres as depotMembres, personnages, profils } from "../data/index.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";
import { rendrePapier, LISTE_MODELES, MODELES } from "./papier.js";
import { portee } from "./proximite.js";
import { lieuxRecents, retenirLieu } from "./lieux.js";

/* --- Les brouillons : ils restent sur ce poste tant qu'on n'a pas signé --- */
const cleBrouillons = () => `ojm.brouillons.${etat.utilisateur?.id || "anonyme"}`;

export function brouillons() {
  return (local.lire(cleBrouillons(), []) || []).filter((b) => b && b.id);
}

export function garderBrouillon(b) {
  const liste = brouillons().filter((x) => x.id !== b.id);
  local.ecrire(cleBrouillons(), [{ ...b, maj: new Date().toISOString() }, ...liste].slice(0, 30));
}

export function jeterBrouillon(id) {
  local.ecrire(cleBrouillons(), brouillons().filter((b) => b.id !== id));
}

/* --- Ceux à qui l'on peut donner : les gens de toutes mes classes ---------- */
async function gensDeMesClasses() {
  const parId = new Map();
  const fiches = new Map();
  const ouvertes = etat.classes.filter((c) => !c.archived);
  await Promise.all(ouvertes.map(async (classe) => {
    const [equipe, index] = await Promise.all([
      depotMembres.liste(classe.id).catch(() => []),
      personnages.index(classe.id).catch(() => new Map())
    ]);
    for (const m of equipe) {
      if (m.status !== "active" || m.user_id === etat.utilisateur.id || parId.has(m.user_id)) continue;
      parId.set(m.user_id, { user_id: m.user_id, profil: m.profil, classe });
      if (index.get(m.user_id)) fiches.set(m.user_id, index.get(m.user_id));
    }
  }));
  const nomDe = (p) => {
    const n = nomAffiche(fiches.get(p.user_id), p.profil || p);
    return n && n !== "—" ? n : (p.profil?.display_name || "Quelqu'un");
  };
  return { gens: [...parId.values()].sort((a, b) => nomDe(a).localeCompare(nomDe(b))), nomDe };
}

/**
 * @param {object} o
 * @param {object} [o.brouillon]  Un brouillon à reprendre (étape 1).
 * @param {object} [o.papier]     Un document déjà signé à donner (étape 3).
 * @param {Function} [o.surFin]   Appelé quand on referme le circuit.
 */
export function creerCircuit({ brouillon = null, papier = null, surFin = () => {} } = {}) {
  const b = brouillon
    ? { ...brouillon }
    : { id: uid(), model: "note", title: "", body: "", seal: "" };
  let signe = papier || null;
  let etape = signe ? 3 : 1;
  let choisi = null;

  const noeud = el("section.circuit", { "aria-label": "Nouveau document" });

  function peindre() {
    render(noeud,
      el("div.circuit__haut",
        el("ol.circuit__etapes",
          [["Écrire", 1], ["Signer", 2], ["Donner", 3]].map(([mot, n]) => el("li.circuit__etape", {
            dataset: { etat: n < etape ? "fait" : n === etape ? "actif" : "" },
            "aria-current": n === etape ? "step" : null
          }, el("span.circuit__num", n < etape ? icone("coche", 12) : String(n)), el("span", mot)))),
        el("button.circuit__fermer", { type: "button", "aria-label": "Fermer", onclick: fermer }, icone("croix", 15))),
      etape === 1 ? etapeEcrire() : etape === 2 ? etapeSigner() : etapeDonner());
  }

  function fermer() {
    // Rien n'est perdu : ce qui est écrit et pas encore signé reste en brouillon.
    if (!signe && (b.body.trim() || b.title.trim())) garderBrouillon(b);
    surFin();
  }

  const apercu = (signature) => rendrePapier(
    { ...b, title: b.title || MODELES[b.model].titreDefaut, created_at: new Date().toISOString() },
    { auteur: signature ? etat.profil : null });

  /* --- 1. Écrire ---------------------------------------------------------- */
  function etapeEcrire() {
    const zoneApercu = el("div.circuit__apercu", apercu(false));
    const redessiner = () => render(zoneApercu, apercu(false));
    let corps;
    return el("div.circuit__corps",
      el("div.circuit__formulaire",
        el("p.circuit__consigne", "Choisissez le type de document, puis écrivez."),
        el("div.circuit__modeles", LISTE_MODELES.map((m) => el("button.puce.circuit__modele", {
          type: "button", "aria-pressed": String(m.cle === b.model), title: m.resume,
          onclick: () => {
            const ancienDefaut = MODELES[b.model].titreDefaut;
            b.model = m.cle;
            if (!b.title.trim() || b.title === ancienDefaut) b.title = "";
            peindre();
          }
        }, m.libelle))),
        el("label.champ",
          el("span.champ__label", "Titre"),
          el("input.saisie", {
            value: b.title, placeholder: MODELES[b.model].titreDefaut, maxlength: 120,
            oninput: (e) => { b.title = e.currentTarget.value; redessiner(); }
          })),
        el("label.champ",
          el("span.champ__label", "Texte"),
          corps = el("textarea.zone", {
            rows: 6, value: b.body, placeholder: MODELES[b.model].placeholder,
            oninput: (e) => { b.body = e.currentTarget.value; e.currentTarget.classList.remove("champ--erreur"); redessiner(); }
          })),
        el("div.circuit__boutons",
          el("button.btn.btn--fantome", { type: "button", onclick: () => { garderBrouillon(b); succes("Brouillon gardé"); surFin(); } },
            "Garder en brouillon"),
          el("button.btn.btn--primaire", { type: "button", onclick: () => {
            if (!b.body.trim()) { corps.classList.add("champ--erreur"); corps.focus(); return; }
            etape = 2; peindre();
          } }, "Suivant : signer", icone("chevronD", 14)))),
      zoneApercu);
  }

  /* --- 2. Signer ---------------------------------------------------------- */
  function etapeSigner() {
    const modele = MODELES[b.model];
    const zoneApercu = el("div.circuit__apercu", apercu(false));
    let bouton;
    async function signer() {
      bouton.disabled = true;
      zoneApercu.classList.add("circuit__apercu--signe");
      render(zoneApercu, apercu(true));
      try {
        signe = await papiers.creer({
          title: (b.title || modele.titreDefaut).trim(),
          body: b.body.trim(),
          model: b.model,
          seal: modele.cachet ? (b.seal.trim() || null) : null,
          class_id: null,
          author_id: etat.utilisateur.id
        });
      } catch (err) {
        erreur("Signature impossible", messageErreur(err));
        bouton.disabled = false;
        return;
      }
      jeterBrouillon(b.id);
      emettre("papiers:change");
      // Le temps de voir l'encre se poser, puis on passe à la remise.
      setTimeout(() => { etape = 3; peindre(); }, 650);
    }
    return el("div.circuit__corps",
      el("div.circuit__formulaire",
        el("p.circuit__consigne", "Relisez. En signant, le document est figé : il ne pourra plus être modifié."),
        modele.cachet ? el("label.champ",
          el("span.champ__label", "Mention du cachet (facultatif)"),
          el("input.saisie", {
            value: b.seal, placeholder: "Vu et approuvé", maxlength: 40,
            oninput: (e) => { b.seal = e.currentTarget.value; render(zoneApercu, apercu(false)); }
          })) : null,
        el("div.circuit__signature",
          el("span.circuit__signature-nom", etat.profil?.display_name || "Vous"),
          el("span.circuit__signature-trait")),
        el("div.circuit__boutons",
          el("button.btn.btn--fantome", { type: "button", onclick: () => { etape = 1; peindre(); } },
            icone("chevronG", 14), "Modifier"),
          bouton = el("button.btn.btn--primaire", { type: "button", onclick: signer },
            icone("plume", 15), "Signer le document"))),
      zoneApercu);
  }

  /* --- 3. Donner ---------------------------------------------------------- */
  function etapeDonner() {
    const liste = el("div.circuit__gens", el("p.dep__calme", "Chargement des personnes…"));
    const resultats = el("div.circuit__resultats");
    const confirmation = el("div.circuit__confirmation");
    let tous = { gens: [], nomDe: (p) => p.profil?.display_name || "Quelqu'un" };

    function ligne(p) {
      return el("button.circuit__personne", {
        type: "button", "aria-pressed": String(choisi?.user_id === p.user_id),
        onclick: () => { choisi = p; peindreListe(); peindreConfirmation(); }
      },
        el("span.circuit__initiale", (tous.nomDe(p)[0] || "?").toUpperCase()),
        el("span.circuit__personne-nom", tous.nomDe(p)),
        p.classe ? el("span.circuit__personne-lieu", p.classe.name) : null);
    }

    function peindreListe() {
      const visibles = [...tous.gens];
      if (choisi && !visibles.some((g) => g.user_id === choisi.user_id)) visibles.unshift(choisi);
      render(liste, visibles.length ? visibles.map(ligne)
        : el("p.dep__calme", "Personne dans vos classes. Cherchez la personne par son pseudo."));
    }

    let delai = null;
    function chercher(texte) {
      clearTimeout(delai);
      delai = setTimeout(async () => {
        if (texte.trim().length < 2) { render(resultats, []); return; }
        const trouves = (await profils.chercher(texte).catch(() => []))
          .filter((p) => p.id !== etat.utilisateur.id).slice(0, 6);
        render(resultats, trouves.length
          ? trouves.map((p) => el("button.puce", { type: "button", onclick: () => {
              choisi = { user_id: p.id, profil: p };
              render(resultats, []);
              peindreListe(); peindreConfirmation();
            } }, "+ ", p.display_name))
          : el("span.petit.faible", "Aucun pseudo ne correspond."));
      }, 220);
    }

    async function peindreConfirmation() {
      if (!choisi) {
        render(confirmation, el("p.circuit__consigne", "Touchez la personne à qui vous donnez le document."));
        return;
      }
      const nom = tous.nomDe(choisi);
      const etatPortee = await portee(choisi.user_id);
      let coche = null;
      let lieu = null;
      let bouton;
      const recents = lieuxRecents();

      async function donner() {
        if (etatPortee === "inconnu" && !coche.checked) {
          coche.closest(".case").classList.add("case--exigee");
          coche.focus();
          return;
        }
        bouton.disabled = true;
        const ou = lieu.value.trim() || null;
        try {
          await papiers.tendre({
            paper_id: signe.id, from_user: etat.utilisateur.id, to_user: choisi.user_id,
            class_id: choisi.classe?.id || null, session_id: etat.sessionActive?.id || null,
            attested: true, lieu: ou, description: null
          });
        } catch (err) {
          erreur("Le document n'est pas parti", messageErreur(err));
          bouton.disabled = false;
          return;
        }
        if (ou) retenirLieu(ou);
        emettre("papiers:change");
        terminer(nom);
      }

      render(confirmation,
        el("div.circuit__donner",
          el("p.circuit__qui", "Vous donnez « ", el("b", signe.title), " » à ", el("b", nom), "."),
          etatPortee === "proche"
            ? el("p.circuit__portee.circuit__portee--proche", icone("coche", 14), ` ${nom} est à côté de vous en jeu.`)
            : etatPortee === "loin"
              ? el("p.circuit__portee.circuit__portee--loin", icone("alerte", 14),
                  ` ${nom} est trop loin en jeu. Rapprochez-vous pour lui donner le document.`)
              : el("label.case.circuit__case",
                  coche = el("input", { type: "checkbox",
                    onchange: (e) => e.currentTarget.closest(".case").classList.remove("case--exigee") }),
                  el("span", `Je suis à côté de ${nom} en jeu.`)),
          el("label.champ",
            el("span.champ__label", "Où êtes-vous ? (facultatif)"),
            lieu = el("input.saisie", { value: recents[0] || "", placeholder: "Salle de classe, couloir…", maxlength: 120 })),
          el("div.circuit__boutons",
            el("button.btn.btn--fantome", { type: "button", onclick: surFin }, "Garder pour plus tard"),
            bouton = el("button.btn.btn--primaire", {
              type: "button", disabled: etatPortee === "loin", onclick: donner
            }, icone("echange", 15), `Donner à ${nom}`))));
    }

    function terminer(nom) {
      render(noeud,
        el("div.circuit__fini",
          el("span.circuit__fini-icone", icone("coche", 26)),
          el("h2", "Document donné"),
          el("p", el("b", nom), " le reçoit maintenant. Il doit l'accepter de son côté ; vous suivez la réponse dans « Mes documents »."),
          el("div.circuit__boutons",
            el("button.btn.btn--fantome", { type: "button", onclick: surFin }, "Terminé"),
            el("button.btn.btn--primaire", { type: "button", onclick: () => {
              Object.assign(b, { id: uid(), model: "note", title: "", body: "", seal: "" });
              signe = null; choisi = null; etape = 1; peindre();
            } }, icone("plus", 14), "Écrire un autre document"))));
    }

    gensDeMesClasses().then((r) => { tous = r; peindreListe(); });
    peindreConfirmation();

    return el("div.circuit__corps.circuit__corps--donner",
      el("div.circuit__formulaire",
        el("p.circuit__consigne", "À qui le donnez-vous ?"),
        liste,
        el("label.champ",
          el("span.champ__label", "Quelqu'un d'autre ? Son pseudo"),
          el("input.saisie", { type: "search", placeholder: "Pseudo du joueur…", autocomplete: "off",
            oninput: (e) => chercher(e.currentTarget.value) }),
          resultats)),
      el("div.circuit__droite",
        el("div.circuit__apercu.circuit__apercu--petit", rendrePapier(signe, { auteur: etat.profil })),
        confirmation));
  }

  peindre();
  return { noeud };
}
