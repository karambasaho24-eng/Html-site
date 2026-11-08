/* ---------------------------------------------------------------------------
 * Administration › Apparence — la page « Paramètres » de Whitelist Hub.
 *
 * Même méthode, mêmes réglages, même mise en page (ses classes viennent de
 * waitlist.css) : la couleur du verre en pastilles ou en couleur libre, la
 * marque, le logo, l'icône d'onglet, le fond (vidéo ou lien YouTube), la
 * musique, la transparence et le flou du verre, le zoom et l'assombrissement
 * du fond. Chaque réglage a sa remise à zéro. Tout est enregistré et diffusé en
 * direct à toutes les personnes connectées.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { toast, erreur, messageErreur } from "../ui/toast.js";
import { panneauFond } from "../ui/selecteur-fond.js";
import {
  apparenceActuelle, enregistrer, reinitialiser, toutReinitialiser, televerser,
  importPossible, estFichierReglage, NUANCES
} from "../features/apparence.js";

const IMAGES = "image/png,image/jpeg,image/webp,image/gif";

export function sectionApparence() {
  const racine = el("div.apparence");
  const surErreur = (err) => erreur("Enregistrement impossible", messageErreur(err));
  const peindre = () => render(racine, page());

  const regler = (cle, valeur) => {
    const ancien = apparenceActuelle()[cle];
    enregistrer({ [cle]: valeur }, { surErreur, jeter: estFichierReglage(cle) && ancien !== valeur ? [ancien] : [] });
  };

  /* --- Briques de la page : celles de Whitelist Hub ------------------------- */
  const rst = (cle) => el("button.rst", {
    type: "button", title: "Réinitialiser ce réglage", "aria-label": "Réinitialiser ce réglage",
    onclick: () => { reinitialiser(cle); peindre(); toast("Réglage réinitialisé"); }
  }, icone("annuler", 13));

  const fld = (libelle, cle, champ, id, classe) =>
    el("div.fld" + (classe ? "." + classe : ""),
      el("span.lbl", el("label", { for: id }, libelle), rst(cle)), champ);

  const c = apparenceActuelle();
  const texte = (libelle, cle) => fld(libelle, cle, el("input", {
    id: `ap-${cle}`, maxlength: estFichierReglage(cle) ? 300 : 40, value: c[cle],
    oninput: (e) => regler(cle, e.target.value)
  }), `ap-${cle}`);
  const curseur = (libelle, cle, min, max) => fld(libelle, cle, el("input", {
    id: `ap-${cle}`, type: "range", min, max, value: c[cle],
    oninput: (e) => regler(cle, Number(e.target.value))
  }), `ap-${cle}`, "full");
  const note = (texte_) => el("p.note.full", icone("reglages", 16), texte_);

  /* --- Importer un fichier : format et poids vérifiés comme sur Whitelist Hub --- */
  const envoyer = (cle, id, libelleOk, accepte, formatsMsg, maxOctets, maxMsg, attente) =>
    el("input", {
      id, type: "file", accept: accepte,
      onchange: async (e) => {
        const f = e.target.files[0];
        e.target.value = "";
        if (!f) return;
        if (!importPossible()) return toast("Import indisponible en démonstration", { corps: "Collez plutôt un lien https://…" });
        if (!accepte.split(",").includes(f.type)) return toast(formatsMsg);
        if (f.size > maxOctets) return toast(maxMsg);
        toast(attente);
        try {
          regler(cle, await televerser(f, cle));
          peindre();
          toast(libelleOk);
        } catch (err) { surErreur(err); }
      }
    });

  const nuances = el("div.swatches",
    NUANCES.map((n) => el("button.swt", {
      type: "button", title: n.n, "aria-label": n.n, style: { "--c": n.c }, dataset: { v: n.c },
      class: c.tint === n.c ? "on" : "",
      onclick: () => { regler("tint", n.c); const ci = racine.querySelector("input[type=color]"); if (ci) ci.value = n.c; }
    })),
    el("label.swt.cust", { title: "Couleur personnalisée" },
      el("input", { type: "color", value: c.tint, "aria-label": "Couleur personnalisée", oninput: (e) => regler("tint", e.target.value) })));

  const fondImage = () => panneauFond({
    titre: "Fond d'écran du site (image)",
    aide: "L'image se voit à travers le verre, pour tout le monde (une vidéo, si vous en réglez une plus bas, passe devant). Chacun peut aussi mettre la sienne dans Réglages.",
    lire: () => ({ fond: apparenceActuelle().fond, voile: apparenceActuelle().dim }),
    ecrire: (patch) => { if ("fond" in patch) regler("fond", patch.fond); return true; },
    octetsMax: 350_000, lien: true, voile: false
  });

  function page() {
    return el("div.pile",
      fondImage(),
      el("div.panel.form",
        el("div.full.tintbox",
          el("div.g", el("b", "Couleur du verre"), el("small", "Une seule couleur : toute l'interface s'y adapte")),
          rst("tint"), nuances),
        texte("Marque", "nom"),
        fld("Logo : importer (PNG, JPG, WebP, GIF · 2 Mo max)", "logo",
          envoyer("logo", "ap-logo-f", "Logo enregistré", IMAGES, "Format non pris en charge (PNG, JPG, WebP ou GIF)", 2e6, "Image trop lourde (2 Mo max)", "Envoi…"), "ap-logo-f"),
        texte("Logo : lien https://… ou assets/logo.png", "logo"),
        fld("Icône de l'onglet : importer (PNG carré conseillé · 2 Mo max)", "icone",
          envoyer("icone", "ap-icone-f", "Icône enregistrée", IMAGES, "Format non pris en charge (PNG, JPG, WebP ou GIF)", 2e6, "Image trop lourde (2 Mo max)", "Envoi…"), "ap-icone-f"),
        texte("Icône de l'onglet : lien https://…", "icone"),
        fld("Fond : importer une vidéo (MP4/WebM · 50 Mo max)", "video",
          envoyer("video", "ap-video-f", "Vidéo enregistrée", "video/mp4,video/webm", "Format vidéo non pris en charge (MP4 ou WebM)", 52428800, "Vidéo trop lourde (50 Mo max)", "Envoi de la vidéo… (patientez)"), "ap-video-f"),
        texte("Fond : lien YouTube ou https://…", "video"),
        fld("Musique : importer un audio (MP3, OGG, WAV, M4A · 20 Mo max)", "audio",
          envoyer("audio", "ap-audio-f", "Audio enregistré", "audio/mpeg,audio/ogg,audio/wav,audio/mp4", "Format audio non pris en charge (MP3, OGG, WAV ou M4A)", 2e7, "Audio trop lourd (20 Mo max)", "Envoi de l'audio…"), "ap-audio-f"),
        texte("Musique : lien https://… (fichier audio direct)", "audio"),
        curseur("Volume de la musique", "vol", 0, 100),
        note("La musique joue en boucle pour tous les visiteurs. Les navigateurs interdisent le son automatique : elle démarre au premier clic ou à la première touche du visiteur, et se met en pause quand l'onglet est caché. Un lien YouTube ne marche pas ici (fichier audio uniquement)."),
        curseur("Transparence du verre", "glass", 0, 100),
        curseur("Flou du verre", "blur", 0, 24),
        note("Le flou donne l'effet « liquid glass » mais peut réduire les FPS sur une vidéo (0 = performances maximales). Les réglages sont bornés pour garder le texte lisible."),
        curseur("Zoom du fond", "zoom", 100, 180),
        curseur("Assombrissement", "dim", 0, 90),
        note("Performance : MP4 H.264 1080p max, sans son, boucle courte, ~10–20 Mo (YouTube est plus lourd). Les réglages sont enregistrés et visibles par tous les visiteurs."),
        el("button.btn.ghost.full", { type: "button", onclick: () => { toutReinitialiser(surErreur); peindre(); } }, "Réinitialiser")));
  }

  peindre();
  return racine;
}
