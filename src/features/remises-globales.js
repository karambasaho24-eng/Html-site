/* ---------------------------------------------------------------------------
 * Les remises, partout sur le site.
 *
 * On ne tend pas un papier qu'en séance : dans la rue, à la taverne, on se
 * croise. Dès qu'on vous tend quelque chose, une notification apparaît, où
 * que vous soyez sur le site — et « La lire » ouvre la question qui compte :
 * cette personne est-elle bien devant vous ?
 *
 * Celui qui a tendu apprend la réponse : gardé, refusé, ou « il dit que vous
 * n'étiez pas devant lui ».
 * ------------------------------------------------------------------------- */
import { temps, papiers, profils, personnages } from "../data/index.js";
import { etat, observer } from "../core/store.js";
import { toast } from "../ui/toast.js";
import { emettre } from "../core/bus.js";
import { recevoirPapier } from "./papier.js";

let canal = null;
let pourQui = null;

export function surveillerRemises() {
  observer("utilisateur", brancher);
  brancher(etat.utilisateur);
}

function brancher(utilisateur) {
  const id = utilisateur?.id || null;
  if (id === pourQui) return;
  canal?.fermer();
  canal = null;
  pourQui = id;
  if (!id) return;
  canal = temps.sabonner({
    cle: `remises:${id}`,
    tables: [
      { table: "paper_handoffs", filtre: `to_user=eq.${id}` },
      { table: "paper_handoffs", filtre: `from_user=eq.${id}` }
    ],
    surChangement: ({ type, nouveau, ancien }) => surRemise(type, nouveau, ancien).catch(() => {})
  });
}

const dejaVu = new Set();

async function surRemise(type, nouveau, ancien) {
  const moi = etat.utilisateur?.id;
  if (!nouveau || !moi) return;
  emettre("remises:change", nouveau);
  // La salle a sa propre annonce ; on n'en fait pas deux.
  const enSalle = etat.route?.nom === "salle";

  if (type === "INSERT" && nouveau.to_user === moi && !dejaVu.has(`in:${nouveau.id}`)) {
    dejaVu.add(`in:${nouveau.id}`);
    if (enSalle && nouveau.session_id) return;
    const [auteur] = await profils.parIds([nouveau.from_user]).catch(() => []);
    toast("📄 On vous tend un papier", {
      corps: `${auteur?.display_name || "Quelqu'un"}${nouveau.lieu ? ` — ${nouveau.lieu}` : ""}. Est-il devant vous ?`,
      type: "attn", duree: 15000,
      action: { libelle: "Répondre", action: () => ouvrir(nouveau.id) }
    });
    return;
  }

  if (type === "UPDATE" && nouveau.from_user === moi) {
    const cle = `out:${nouveau.id}:${nouveau.state}:${nouveau.presence}`;
    if (dejaVu.has(cle)) return;
    dejaVu.add(cle);
    const [qui] = await profils.parIds([nouveau.to_user]).catch(() => []);
    const nom = qui?.display_name || "Le destinataire";
    if (nouveau.presence === false && ancien?.presence !== false) {
      toast("Remise contestée", {
        corps: `${nom} indique que vous n'étiez pas devant lui. C'est inscrit au registre.`,
        type: "alerte", duree: 10000
      });
    } else if (nouveau.state === "accepted" && ancien?.state !== "accepted") {
      toast("Papier gardé", { corps: `${nom} a pris votre papier.`, duree: 6000 });
    } else if (nouveau.state === "refused" && nouveau.presence !== false && ancien?.state !== "refused") {
      toast("Papier refusé", { corps: `${nom} n'a pas voulu de votre papier.`, type: "attn", duree: 7000 });
    }
  }
}

async function ouvrir(remiseId) {
  const recus = await papiers.recus(etat.utilisateur.id).catch(() => []);
  const remise = recus.find((r) => r.id === remiseId);
  if (!remise) return;
  let fiche = null;
  if (remise.class_id) fiche = (await personnages.index(remise.class_id).catch(() => new Map())).get(remise.from_user) || null;
  await recevoirPapier(remise, { fiche });
  emettre("remises:change", remise);
}
