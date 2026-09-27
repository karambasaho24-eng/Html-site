/* ---------------------------------------------------------------------------
 * Les objets trouvés d'une salle.
 *
 * Ce qu'un élève laisse derrière lui reste dans la salle. Il ne revient pas
 * tout seul : c'est l'encadrement qui décide de rouvrir la salle, de laisser
 * entrer quelqu'un, ou de rendre lui-même l'objet à son propriétaire. Chacun
 * de ces gestes est volontaire, et il se lit au registre.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { ouvrirModale } from "../ui/modal.js";
import { succes, erreur, messageErreur } from "../ui/toast.js";
import { depuis } from "../core/util.js";
import { nomAffiche } from "../core/rp.js";
import { salles, membres, personnages, sessions } from "../data/index.js";
import { nomType, imageObjet } from "./affaires.js";

export async function ouvrirObjetsTrouves({ classe }) {
  const zone = el("div.trouves");
  let gens = new Map();
  let fiches = new Map();
  try {
    gens = new Map((await membres.liste(classe.id)).map((m) => [m.user_id, m.profil]));
    fiches = await personnages.index(classe.id).catch(() => new Map());
  } catch { /* les noms manqueront, pas les objets */ }
  const nomDe = (id) => nomAffiche(fiches.get(id), gens.get(id)) || "Quelqu'un";

  async function peindre() {
    render(zone, el("p.petit.faible", "On fait le tour de la salle…"));
    let restes = [];
    try { restes = await salles.oublies(classe.id); }
    catch (err) { render(zone, el("p.petit", messageErreur(err))); return; }

    const seance = await sessions.enCours(classe.id).catch(() => null);
    const jusqua = classe.settings?.salle_ouverte_jusqua;
    const ouverte = seance?.status === "live" || (jusqua && new Date(jusqua).getTime() > Date.now());

    render(zone,
      el("div.trouves__porte",
        el("span.etiq", { class: ouverte ? "etiq--ok" : "etiq--attn" },
          icone(ouverte ? "entree" : "bouclier", 12),
          ouverte
            ? (seance?.status === "live" ? " Ouverte : une séance s'y tient"
              : ` Ouverte jusqu'à ${new Date(jusqua).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`)
            : " Fermée"),
        el("span.pousse"),
        seance?.status === "live" ? null : ouverte
          ? el("button.btn.btn--petit", { onclick: () => agir(() => salles.fermer(classe), "Salle fermée") },
              "Fermer la salle")
          : el("button.btn.btn--petit.btn--primaire", {
              onclick: () => agir(() => salles.ouvrir(classe, 30), "Salle ouverte 30 minutes")
            }, "Autoriser l'accès à la salle (30 min)")),

      restes.length
        ? el("ul.trouves__liste", restes.map((r) => el("li.trouves__ligne",
            el("span.trouves__figure", { style: { backgroundImage: `url("${imageObjet(r.kind || "cahier")}")` } }),
            el("div.trouves__quoi",
              el("b", r.label || nomType(r.kind)),
              el("span.petit.faible", " à ", nomDe(r.owner_id),
                r.place === "bureau" ? " · sur son bureau" : " · resté dans la salle",
                r.place_at ? ` · ${depuis(r.place_at)}` : "")),
            el("span.pousse"),
            ouverte ? null : el("button.btn.btn--petit.btn--fantome", {
              title: "Lui seul peut entrer, pendant 20 minutes",
              onclick: () => agir(() => salles.laissezPasser(classe, r.owner_id, 20),
                `${nomDe(r.owner_id)} peut entrer 20 minutes`)
            }, "Laisser entrer"),
            el("button.btn.btn--petit", {
              onclick: () => agir(() => salles.restituer(r.genre, r.id),
                `Rendu à ${nomDe(r.owner_id)}`)
            }, icone("main", 12), " Restituer l'objet"))))
        : el("p.petit.faible", "Rien n'a été oublié ici.")
    );
  }

  async function agir(geste, message) {
    try { await geste(); succes(message); await peindre(); }
    catch (err) { erreur("Impossible", messageErreur(err)); }
  }

  await ouvrirModale({
    titre: `Objets trouvés — ${classe.name}`,
    corps: () => {
      peindre();
      return el("div",
        el("p.petit.faible",
          "Ce qui a été laissé reste ici. Personne ne le reprend à distance : il faut "
          + "que la salle soit ouverte et que son propriétaire y revienne — ou que vous le lui rendiez."),
        zone);
    },
    actions: [{ libelle: "Fermer", valeur: true }]
  });
}
