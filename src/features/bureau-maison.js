/* ---------------------------------------------------------------------------
 * Le bureau de la chambre.
 *
 * Chez soi, on a ses affaires devant soi — sauf celles qu'on a laissées
 * ailleurs, prêtées, perdues. Le sac est posé à côté : ce qui est dedans part
 * avec soi, ce qui est sur le bureau reste à la maison. Préparer son sac,
 * c'est donc prendre un objet du bureau et le mettre dedans, pas cocher une
 * case.
 *
 * Même contrat que features/bureau.js, pour que la scène s'en serve telle
 * quelle : surLeBureau, dansMonSac, sortir, ranger, prendre, enMain…
 * ------------------------------------------------------------------------- */
import { etat } from "../core/store.js";
import { local } from "../core/util.js";
import { affaires as depotAffaires, cahiers as depotCahiers } from "../data/index.js";
import { toast, erreur, messageErreur } from "../ui/toast.js";
import { fiche, nomObjet, indexer, indisponible } from "./affaires.js";
import { contexte, situer, dansLeSac, peutFaire, OUTILS_REQUIS } from "./portee.js";
import { dotationComplete } from "./cartable.js";

export function creerBureauMaison({ surChange = null } = {}) {
  const moi = etat.utilisateur.id;
  const ctx = contexte();
  let objets = [];
  let supports = [];
  const cleMain = "ojm.enmain.maison";
  let enMainId = local.lire(cleMain, null);

  async function charger() {
    objets = await depotAffaires.toutes(moi).catch(() => objets);
    if (!objets.length) {
      objets = await depotAffaires.assurerDotation(moi, dotationComplete()).catch(() => []);
    }
    supports = await depotCahiers.mesCahiers(moi).catch(() => supports);
    return api;
  }

  const index = () => indexer(objets);
  const aMoi = (o) => !indisponible(o, moi);
  const range = (o) => (o.place || "range") === "range";

  /** Sur le bureau de la chambre : rangé, hors de tout contenant, pas porté. */
  const surLeBureau = () => objets.filter((o) => aMoi(o) && range(o) && !o.container_id && !o.carried);
  const cahiersSurLeBureau = () => supports.filter((c) => range(c) && !c.container_id);
  const sacsPortes = () => objets.filter((o) => aMoi(o) && fiche(o.kind)?.contenant && o.carried && range(o) && !o.container_id);
  const dansMonSac = () => objets.filter((o) => aMoi(o) && !fiche(o.kind)?.contenant
    && situer(o, { moiId: moi, ctx, index: index() }).lieu === "sac");
  const cahiersDansMonSac = () => supports.filter((c) => range(c) && c.container_id && dansLeSac(c, index()));

  const enMain = () => {
    const o = enMainId ? objets.find((x) => String(x.id) === String(enMainId)) : null;
    return o && surLeBureau().some((x) => x.id === o.id) ? o : null;
  };
  function prendre(objet) {
    enMainId = objet ? String(objet.id) : null;
    local.ecrire(cleMain, enMainId);
    surChange?.();
  }

  /** Sortir du sac : l'objet se pose sur le bureau de la chambre. */
  async function sortir(chose, genre) {
    try {
      if (genre === "cahier") Object.assign(chose, await depotCahiers.rangerDans(chose, null));
      else Object.assign(chose, await depotAffaires.rangerDans(chose, null));
      surChange?.();
      return true;
    } catch (err) { erreur("Impossible de le sortir", messageErreur(err)); return false; }
  }

  function placeLibre(c) {
    return Number(c.capacity ?? fiche(c.kind)?.capacite ?? 0)
      - objets.filter((o) => String(o.container_id || "") === String(c.id)).reduce((t, o) => t + Number(o.size || 1), 0)
      - supports.filter((s) => String(s.container_id || "") === String(c.id)).reduce((t, s) => t + Number(s.size || 4), 0);
  }

  /** Mettre dans le sac : la trousse pour ce qui y va, sinon le sac porté. */
  async function ranger(chose, genre) {
    const taille = Number(chose.size || (genre === "cahier" ? 4 : 1));
    const ix = index();
    const porteurs = objets.filter((o) => fiche(o.kind)?.contenant && range(o) && aMoi(o)
      && (o.carried || dansLeSac(o, ix)) && String(o.id) !== String(chose.id));
    const petits = porteurs.filter((c) => (fiche(c.kind)?.capacite || 0) <= 8);
    const ordre = genre === "cahier" || taille > 2 ? porteurs.filter((c) => !petits.includes(c)).concat(petits)
      : petits.concat(porteurs.filter((c) => !petits.includes(c)));
    const cible = ordre.find((c) => placeLibre(c) >= taille);
    if (String(enMainId) === String(chose.id)) { enMainId = null; local.ecrire(cleMain, null); }
    if (!cible) {
      toast(sacsPortes().length ? "Plus de place dans votre sac" : "Vous n'avez pas de sac",
        { corps: sacsPortes().length ? "Sortez autre chose pour lui faire de la place." : "Prenez un sac pour emporter vos affaires.", type: "attn" });
      return false;
    }
    try {
      if (genre === "cahier") Object.assign(chose, await depotCahiers.rangerDans(chose, cible.id));
      else Object.assign(chose, await depotAffaires.rangerDans(chose, cible.id));
      surChange?.();
      return true;
    } catch (err) { erreur("Impossible de le ranger", messageErreur(err)); return false; }
  }

  /** Prendre un sac posé dans la chambre, pour le porter. */
  async function porter(contenant) {
    try {
      await depotAffaires.porter(contenant.id, true);
      contenant.carried = true;
      surChange?.();
    } catch (err) { erreur("Impossible", messageErreur(err)); }
  }

  /** Même règle qu'en séance : on écrit avec ce qu'on tient. */
  function peutFaireIci(action) {
    const base = peutFaire(action, objets, { moiId: moi, ctx });
    if (action !== "ecrire") return base;
    const outils = OUTILS_REQUIS.ecrire;
    const surTable = surLeBureau().filter((o) => outils.includes(o.kind));
    if (!base.ok) {
      return /encr/i.test(base.message || "") ? base : { ...base, message: "Aucun outil d'écriture disponible." };
    }
    const tenu = enMain();
    if (tenu && outils.includes(tenu.kind)) {
      const seul = objets.filter((o) => !outils.includes(o.kind) || o.id === tenu.id);
      return peutFaire("ecrire", seul, { moiId: moi, ctx });
    }
    const aPrendre = surTable[0];
    return aPrendre
      ? { ok: false, prendre: aPrendre, message: "Vous n'avez rien en main pour écrire.",
          conseil: `Prenez ${nomObjet(aPrendre).toLowerCase()} sur votre bureau.` }
      : { ok: false, message: "Aucun outil d'écriture sur votre bureau.",
          conseil: "Sortez un crayon ou une plume de votre sac." };
  }

  const api = {
    moi, ctx, charger, sortir, ranger, prendre, enMain, porter,
    surLeBureau, cahiersSurLeBureau, dansMonSac, cahiersDansMonSac, sacsPortes,
    objets: () => objets,
    supports: () => supports,
    peutFaire: peutFaireIci,
    laisserTout: async () => 0
  };
  return api;
}
