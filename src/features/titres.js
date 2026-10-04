/* ---------------------------------------------------------------------------
 * Les titres.
 *
 * Roi, reine, commandant… L'administration les attribue ; ils ne donnent
 * aucun droit sur la plateforme. Ce qu'ils changent, c'est la scène : le
 * souverain siège sur le trône, couronne en tête et manteau sur les épaules,
 * et on l'appelle par son titre.
 * ------------------------------------------------------------------------- */

export const TITRES = [
  { cle: "roi", libelle: "Roi", trone: true, couronne: "couronne", manteau: true },
  { cle: "reine", libelle: "Reine", trone: true, couronne: "couronne", manteau: true },
  { cle: "prince", libelle: "Prince", couronne: "diademe" },
  { cle: "princesse", libelle: "Princesse", couronne: "diademe" },
  { cle: "noble", libelle: "Noble" },
  { cle: "ministre", libelle: "Ministre" },
  { cle: "juge", libelle: "Juge" },
  { cle: "commandant", libelle: "Commandant" },
  { cle: "capitaine", libelle: "Capitaine" },
  { cle: "chef_escouade", libelle: "Chef d'escouade" },
  { cle: "marchand", libelle: "Marchand" }
];

const PAR_CLE = new Map(TITRES.map((t) => [t.cle, t]));

export const ficheTitre = (cle) => PAR_CLE.get(cle) || null;

/** Le titre tel qu'on le lit : le libellé choisi par l'administration, sinon celui du catalogue. */
export function libelleTitre(porteur) {
  if (!porteur?.titre) return "";
  return String(porteur.titre_libelle || "").trim() || ficheTitre(porteur.titre)?.libelle || "";
}

/** « Commandant Erwin » — ou le nom seul. */
export function nomTitre(porteur, nom) {
  const t = libelleTitre(porteur);
  return t && nom ? prefixer(t, nom) : nom || t;
}

/** « Roi » + « Fritz » → « Roi Fritz » ; mais « Roi » + « Roi_Fritz » reste « Roi_Fritz ». */
export function prefixer(titre, nom) {
  const debut = String(nom).toLowerCase().replace(/[_\s-]+/g, " ").trim();
  return debut.startsWith(String(titre).toLowerCase()) ? nom : `${titre} ${nom}`;
}

/** Ce titre fait-il siéger sur le trône ? */
export const siegeSurLeTrone = (cle) => Boolean(ficheTitre(cle)?.trone);
