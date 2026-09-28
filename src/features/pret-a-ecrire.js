/* ---------------------------------------------------------------------------
 * Prêt à écrire.
 *
 * Au-dessus du jeu, on n'a pas le temps de fouiller : on veut écrire. Ce
 * geste fait, dans l'ordre et pour de vrai, ce que ferait la main — sortir le
 * cahier du sac, sortir un crayon, le prendre. Il ne fabrique rien : si le
 * crayon est resté en salle ou à la maison, il n'y a rien à sortir, et l'on
 * n'écrit pas. La règle reste la même, seul le chemin est plus court.
 *
 * Fonctionne avec le bureau de séance (features/bureau.js) comme avec celui
 * de la maison (features/bureau-maison.js) : ils ont la même forme.
 * ------------------------------------------------------------------------- */
import { OUTILS_REQUIS } from "./portee.js";
import { fiche, nomObjet } from "./affaires.js";

const ORDRE = ["crayon", "stylo-plume", "plume"];      // ce qui écrit seul d'abord
const range = (liste) => [...liste].sort((a, b) => ORDRE.indexOf(a.kind) - ORDRE.indexOf(b.kind));

/** Ce qui manque pour écrire, en une phrase et un geste. Ne touche à rien. */
export function diagnostic(bureau) {
  const verdict = bureau.peutFaire("ecrire");
  const cahier = bureau.cahiersSurLeBureau()[0] || null;
  if (verdict.ok && cahier) return { pret: true, cahier };
  const outilPose = range(bureau.surLeBureau().filter((o) => OUTILS_REQUIS.ecrire.includes(o.kind)))[0];
  const outilSac = range(bureau.dansMonSac().filter((o) => OUTILS_REQUIS.ecrire.includes(o.kind)))[0];
  const cahierSac = bureau.cahiersDansMonSac()[0];
  const faisable = (cahier || cahierSac) && (verdict.ok || outilPose || outilSac);
  let phrase;
  if (!cahier && !cahierSac) phrase = "Aucun cahier sur vous.";
  else if (!verdict.ok && !outilPose && !outilSac) phrase = verdict.message || "Rien pour écrire.";
  else if (!cahier) phrase = "Votre cahier est dans le sac.";
  else if (outilPose) phrase = `Prenez ${nomObjet(outilPose).toLowerCase()} en main.`;
  else phrase = `${nomObjet(outilSac)} est dans le sac.`;
  return { pret: false, faisable: Boolean(faisable), phrase, cahier, outil: outilPose || outilSac || null };
}

/**
 * Sortir le cahier et un outil, prendre l'outil. Renvoie le cahier posé
 * (ou null) et le verdict final.
 */
export async function pretAEcrire(bureau) {
  let cahier = bureau.cahiersSurLeBureau()[0] || null;
  if (!cahier) {
    const c = bureau.cahiersDansMonSac()[0];
    if (c && await bureau.sortir(c, "cahier")) cahier = c;
  }

  const tenu = bureau.enMain();
  if (!(tenu && OUTILS_REQUIS.ecrire.includes(tenu.kind))) {
    let outil = range(bureau.surLeBureau().filter((o) => OUTILS_REQUIS.ecrire.includes(o.kind)))[0];
    if (!outil) {
      const o = range(bureau.dansMonSac().filter((x) => OUTILS_REQUIS.ecrire.includes(x.kind)))[0];
      if (o && await bureau.sortir(o, "objet")) outil = o;
    }
    // Une plume sans encrier ne trace pas : on sort l'encrier avec elle.
    if (outil && fiche(outil.kind)?.encre && !bureau.surLeBureau().some((o) => o.kind === "encrier")) {
      const encrier = bureau.dansMonSac().find((o) => o.kind === "encrier");
      if (encrier) await bureau.sortir(encrier, "objet");
    }
    if (outil) bureau.prendre(outil);
  }
  return { cahier, verdict: bureau.peutFaire("ecrire") };
}
