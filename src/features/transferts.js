/* ---------------------------------------------------------------------------
 * Donner et recevoir un cahier ou un papier.
 *
 * Objet → Destinataire → Présence → Remise. Un objet donné n'a qu'un détenteur :
 * tant que l'autre n'a pas répondu, l'objet est verrouillé (la base y veille,
 * 0048) ; l'expéditeur peut le reprendre, le destinataire accepte ou refuse.
 * On ne devine pas qui est « à côté » : on cherche la personne par son nom RP.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { debounce } from "../core/util.js";
import { profils, transferts, cahiers, papiers, temps } from "../data/index.js";
import { ouvrirModale } from "../ui/modal.js";
import { succes, erreur, toast, messageErreur } from "../ui/toast.js";

const NOM = { cahier: "cahier", papier: "papier" };

/** Étape 2 : trouver la personne. Résout le profil choisi, ou null. */
function choisirDestinataire(titre) {
  let choisi = null;
  const liste = el("div.destinataires", { role: "listbox", "aria-label": "Joueurs trouvés" });
  const aide = el("p.petit.faible", "Tapez au moins une lettre de son nom RP.");

  const chercher = debounce(async (texte) => {
    const trouves = (await profils.chercher(texte, 8).catch(() => []))
      .filter((p) => p.id !== etat.utilisateur.id);
    aide.textContent = texte.trim() && !trouves.length ? "Personne ne porte ce nom." : "";
    render(liste, trouves.map((p) => el("button.destinataire", {
      type: "button", role: "option", "aria-selected": "false",
      onclick: (e) => {
        choisi = p;
        liste.querySelectorAll(".destinataire").forEach((b) => b.setAttribute("aria-selected", String(b === e.currentTarget)));
      }
    }, el("b", p.display_name || "Sans nom"))));
  }, 200);

  return ouvrirModale({
    titre: `À qui donner « ${titre} » ?`,
    corps: () => el("div.pile",
      el("label.champ", el("span.champ__label", "Nom RP"),
        el("input.saisie", { type: "search", autocomplete: "off", placeholder: "ex. Élodie, Kara…",
          oninput: (e) => chercher(e.currentTarget.value) })),
      aide, liste),
    actions: [
      { libelle: "Annuler", valeur: null },
      { libelle: "Continuer", variante: "primaire", action: () => choisi || (toast("Choisissez une personne."), false) }
    ]
  });
}

/** Le geste complet, depuis un objet déjà choisi. */
export async function donner({ type, objetId, titre }) {
  const vers = await choisirDestinataire(titre);
  if (!vers) return null;
  // Étape 3 : la présence. Une déclaration du joueur, pas une détection : le site ne
  // sait pas qui est à côté de qui dans Roblox (un script du jeu pourra le dire un jour).
  const present = await ouvrirModale({
    titre: "Remise en main propre",
    corps: () => el("div.pile",
      el("p", el("b", `Le joueur à qui vous souhaitez donner cet objet se trouve-t-il actuellement devant vous dans Roblox ?`)),
      el("p.petit.faible", `« ${titre} » part chez ${vers.display_name}, avec tout ce qu'il contient : vous ne l'aurez plus. `
        + "Tant qu'il n'a pas répondu, vous pouvez le reprendre.")),
    actions: [
      { libelle: "Non, il n'est pas devant moi.", valeur: "non" },
      { libelle: "Oui, il est devant moi.", variante: "primaire", valeur: "oui" }
    ]
  });
  if (present === "non") {
    await ouvrirModale({
      titre: "Remise impossible",
      corps: () => el("p", "Vous ne pouvez pas remettre physiquement un document à une personne qui n'est pas devant vous dans Roblox. "
        + "Cette action serait considérée comme du metagaming et ne serait pas comptabilisée. "
        + "Pour communiquer à distance, veuillez envoyer une missive sur Discord."),
      actions: [{ libelle: "Compris", variante: "primaire", valeur: true }]
    });
    return null;
  }
  if (present !== "oui") return null;
  try {
    const remise = await transferts.tendre(type, { objetId, titre, deId: etat.utilisateur.id, versId: vers.id });
    succes(`${type === "cahier" ? "Cahier" : "Papier"} tendu`, `${vers.display_name} doit l'accepter.`);
    return remise;
  } catch (err) {
    erreur("Impossible de le donner", /duplicate|unique/i.test(err?.message || "")
      ? "Il est déjà tendu à quelqu'un." : messageErreur(err));
    return null;
  }
}

/** Étape 1 depuis la manette : choisir l'objet parmi ce qu'on a en main. */
export async function choisirEtDonner() {
  const moi = etat.utilisateur.id;
  const [mesCahiers, mesPapiers, attente] = await Promise.all([
    cahiers.mesCahiers(moi).catch(() => []), papiers.enMain(moi).catch(() => []),
    transferts.enAttente(moi).catch(() => ({ tendus: [] }))]);
  const tendus = new Set(attente.tendus.map((r) => r.objetId));
  const objets = [
    ...mesCahiers.map((c) => ({ type: "cahier", objetId: c.id, titre: c.title })),
    ...mesPapiers.map((p) => ({ type: "papier", objetId: p.id, titre: p.title || "Papier sans titre" }))
  ].filter((o) => !tendus.has(o.objetId));
  if (!objets.length) { toast("Rien à donner", { corps: "Vous n'avez ni cahier ni papier en main." }); return null; }

  const objet = await ouvrirModale({
    titre: "Que voulez-vous donner ?",
    corps: (api) => el("div.destinataires", objets.map((o) => el("button.destinataire", {
      type: "button", onclick: () => api.fermer(o)
    }, icone(o.type === "cahier" ? "cahier" : "papier", 16), el("b", o.titre), el("span.petit.faible", NOM[o.type])))),
    actions: [{ libelle: "Annuler", valeur: null }]
  });
  return objet ? donner(objet) : null;
}

/**
 * Ce qu'on me tend et ce que j'ai tendu. Rend un noeud qui se repeint seul,
 * en direct quand l'autre agit ; vide (caché) quand rien n'attend.
 * `surChangement` : après un geste. Appeler `noeud.fermer()` en quittant la vue.
 */
export function panneauRemises({ surChangement = null, surCompte = null } = {}) {
  const noeud = el("section.remises", { hidden: true, "aria-live": "polite" });

  async function geste(action, remise, message) {
    try { await transferts[action](remise); if (message) succes(message); }
    catch (err) { erreur("Geste impossible", messageErreur(err)); }
    await peindre();
    surChangement?.(action, remise);
  }

  const ligne = (r, boutons, texte) => el("div.remise",
    icone(r.type === "cahier" ? "cahier" : "papier", 18),
    el("div.remise__texte", el("b", r.titre), el("span.petit.faible", texte)),
    el("div.remise__gestes", boutons));

  async function peindre() {
    const { recus, tendus } = await transferts.enAttente(etat.utilisateur.id)
      .catch(() => ({ recus: [], tendus: [] }));
    noeud.hidden = !recus.length && !tendus.length;
    surCompte?.(recus.length);
    render(noeud,
      recus.length ? el("h2.remises__titre", "On vous donne") : null,
      recus.map((r) => ligne(r, [
        el("button.btn.btn--primaire", { type: "button", onclick: () => geste("accepter", r, "C'est à vous") }, "Accepter"),
        el("button.btn", { type: "button", onclick: () => geste("refuser", r, null) }, "Refuser")
      ], `de ${r.de?.display_name || "quelqu'un"}`)),
      tendus.length ? el("h2.remises__titre", "En attente de réponse") : null,
      tendus.map((r) => ligne(r, [
        el("button.btn", { type: "button", onclick: () => geste("reprendre", r, "Repris") }, "Reprendre")
      ], `pour ${r.vers?.display_name || "quelqu'un"} · verrouillé`)));
  }

  noeud.peindre = peindre;
  peindre();
  let abonnement = null;
  try {
    const moi = etat.utilisateur.id;
    abonnement = temps.sabonner({
      cle: `remises:${moi}`,
      tables: ["notebook_handoffs", "paper_handoffs"].flatMap((table) =>
        ["to_user", "from_user"].map((col) => ({ table, filtre: `${col}=eq.${moi}` }))),
      surChangement: () => { peindre(); surChangement?.("direct"); }
    });
  } catch { /* temps réel indisponible : le panneau se met à jour à l'ouverture */ }
  noeud.fermer = () => abonnement?.fermer?.();
  return noeud;
}
