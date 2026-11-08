/* ---------------------------------------------------------------------------
 * Un papier : on l'écrit, on le signe, on le donne ou on le jette. Seul celui
 * qui l'a en main le voit ici ; écrire coûte de l'encre (0048), comme dans un
 * cahier. Signé, le texte ne bouge plus ; les signatures gardent le nom RP
 * d'alors (0049).
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat, definir } from "../core/store.js";
import { aller } from "../core/router.js";
import { debounce, dateCourte } from "../core/util.js";
import { papiers, transferts, signatures, profils } from "../data/index.js";
import { blocVide } from "../ui/fragments.js";
import { confirmer, ouvrirModale } from "../ui/modal.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";
import { donner } from "../features/transferts.js";
import { chargerCommerce } from "../features/encre.js";
import { creerSignature, rendreSignature } from "../features/signature.js";

export default async function vuePapier({ params }) {
  const papier = await papiers.lire(params.id).catch(() => null);
  if (!papier || papier.holder_id !== etat.utilisateur.id) {
    return {
      noeud: el("div.page", blocVide("Papier introuvable",
        "Il a peut-être été donné, jeté, ou il n'est pas entre vos mains.",
        { libelle: "Revenir à mes affaires", action: () => aller("/") })),
      titre: "Papier introuvable"
    };
  }

  const [{ tendus }, signes] = await Promise.all([
    transferts.enAttente(etat.utilisateur.id).catch(() => ({ tendus: [] })),
    signatures.dePapier(papier.id).catch(() => [])
  ]);
  const tendu = tendus.some((r) => r.type === "papier" && r.objetId === papier.id);
  const fige = tendu || signes.length > 0 || Boolean(papier.seal);
  const etatSauve = el("span.petit.faible", { "aria-live": "polite" });

  const sauver = debounce(async () => {
    try {
      await papiers.majorer(papier.id, { title: titre.value.trim() || "Papier", body: corps.value });
      etatSauve.textContent = "Enregistré";
      chargerCommerce();
    } catch (err) {
      etatSauve.textContent = "";
      erreur("Non enregistré", messageErreur(err));
    }
  }, 700);

  const titre = el("input.papier__titre", {
    value: papier.title || "", placeholder: "Titre", "aria-label": "Titre du papier",
    readOnly: fige, oninput: () => { etatSauve.textContent = "…"; sauver(); }
  });
  const corps = el("textarea.papier__corps", {
    value: papier.body || "", placeholder: "Écrivez ici…", "aria-label": "Texte du papier",
    readOnly: fige, oninput: () => { etatSauve.textContent = "…"; sauver(); }
  });
  const feuille = el("article.papier", titre, corps,
    // Ancien sceau texte (avant 0049) : conservé tel quel.
    papier.seal ? el("p.papier__sceau", icone("cachet", 14), papier.seal) : null,
    signes.length ? el("div.papier__signatures", signes.map((s) => el("figure.papier__signature",
      rendreSignature(s, { hauteur: 56 }),
      el("figcaption.petit", `${s.nom_rp}, le ${dateCourte(s.created_at)}`)))) : null);

  /** Choisir sa signature (enregistrée ou nouvelle), la voir, confirmer. */
  async function signer() {
    const enregistree = etat.profil?.preferences?.signature || null;
    let sig = enregistree;
    if (enregistree) {
      const choix = await ouvrirModale({
        titre: "Signer ce papier",
        corps: () => el("div.pile", el("p.doux", "Votre signature enregistrée :"),
          el("div.signature__apercu", rendreSignature(enregistree, { hauteur: 72 }))),
        actions: [
          { libelle: "Une nouvelle", valeur: "nouvelle" },
          { libelle: "Utiliser celle-ci", variante: "primaire", valeur: "garder" }
        ]
      });
      if (!choix) return;
      if (choix === "nouvelle") sig = null;
    }
    if (!sig) sig = await creerSignature({ titre: "Signer ce papier" });
    if (!sig) return;

    let memoriser = !enregistree || sig !== enregistree;
    const ok = await ouvrirModale({
      titre: "Apposer la signature",
      corps: () => el("div.pile",
        el("div.papier__signature.signature__apercu", rendreSignature(sig, { hauteur: 72 }),
          el("figcaption.petit", `${etat.profil?.display_name || "—"}, le ${dateCourte(new Date().toISOString())}`)),
        el("p.petit.faible", "Une fois signé, le texte de ce papier ne pourra plus être modifié."),
        sig !== enregistree ? el("label.ligne-flex.petit",
          el("input", { type: "checkbox", checked: memoriser, onchange: (e) => { memoriser = e.currentTarget.checked; } }),
          "Enregistrer comme ma signature") : null),
      actions: [{ libelle: "Annuler", valeur: false }, { libelle: "Signer", variante: "primaire", valeur: true }]
    });
    if (!ok) return;
    try {
      await signatures.apposer(papier.id, sig);
      if (memoriser) {
        const maj = await profils.majorer(etat.profil.id, { preferences: { ...(etat.profil.preferences || {}), signature: sig } });
        if (maj) definir({ profil: maj });
      }
      succes("Papier signé");
      aller(`/papier/${papier.id}`, true);
    } catch (err) { erreur("Signature impossible", messageErreur(err)); }
  }

  async function jeter() {
    const ok = await confirmer({ titre: "Jeter ce papier",
      message: "Il disparaît pour de bon, pour tout le monde.", libelle: "Jeter", danger: true });
    if (!ok) return;
    try { await papiers.supprimer(papier.id); succes("Papier jeté"); aller("/"); }
    catch (err) { erreur("Impossible", messageErreur(err)); }
  }

  const gestes = el("div.papier__gestes",
    tendu ? el("span.etiq", icone("cadenas", 12), "Tendu : en attente de réponse") : [
      el("button.btn", { type: "button", onclick: signer }, icone("cachet", 15), "Signer"),
      el("button.btn.btn--primaire", { type: "button",
        onclick: async () => { if (await donner({ type: "papier", objetId: papier.id, titre: papier.title || "Papier" })) aller("/"); }
      }, icone("echange", 15), "Donner"),
      el("button.btn.btn--fantome", { type: "button", onclick: jeter }, icone("corbeille", 15), "Jeter")
    ],
    etatSauve);

  return { noeud: el("div.page.page--papier", gestes, feuille), titre: papier.title || "Papier" };
}
