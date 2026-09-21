/* ---------------------------------------------------------------------------
 * Pictogrammes. Trait fin, registre institutionnel, jamais de couleur propre.
 * ------------------------------------------------------------------------- */
import { el } from "./dom.js";

const TRACES = {
  accueil:    "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5",
  cahier:     "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM7 20a3 3 0 0 1 3-3h8M8 8h7M8 12h7",
  cahiers:    "M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h5",
  classe:     "M12 3 22 8l-10 5L2 8zM6 10.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5",
  cours:      "M4 5h16v12H4zM9 21h6M12 17v4",
  tableau:    "M3 4h18v12H3zM8 20l4-4 4 4M7 11l2.5-3 2 2.4L14 7l3 4",
  documents:  "M6 2h8l4 4v16H6zM14 2v4h4M9 12h6M9 16h6M9 8h2",
  exercices:  "M9 4h9a2 2 0 0 1 2 2v14H9zM9 4a3 3 0 0 0-3 3v13M13 9h4M13 13h4",
  profil:     "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  eleves:     "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 20a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M18 20h4a6 6 0 0 0-4-5.6",
  archives:   "M3 6h18v4H3zM5 10v10h14V10M10 14h4",
  recherche:  "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3",
  cloche:     "M18 16V11a6 6 0 0 0-12 0v5l-2 3h16zM10 22h4",
  reglages:   "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z",
  plus:       "M12 5v14M5 12h14",
  moins:      "M5 12h14",
  croix:      "M6 6l12 12M18 6 6 18",
  coche:      "M5 13l4 4L19 7",
  chevronD:   "M9 6l6 6-6 6",
  chevronG:   "M15 6l-6 6 6 6",
  chevronB:   "M6 9l6 6 6-6",
  crayon:     "M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16z",
  stylo:      "M3 21l3-1 12-12a2.1 2.1 0 0 0-3-3L3 17zM14 5l3 3",
  surligneur: "M4 20h16M6 16l8-8 4 4-8 8H6z",
  gomme:      "M8 20H4l-1-3 11-11a2.5 2.5 0 0 1 3.5 0l3 3a2.5 2.5 0 0 1 0 3.5L12 20z",
  forme:      "M4 4h16v16H4z",
  cercle:     "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  ligne:      "M4 20 20 4",
  fleche:     "M4 20 20 4M13 4h7v7",
  texte:      "M5 5h14M12 5v14M9 19h6",
  image:      "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6",
  annuler:    "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12H9",
  refaire:    "M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h5",
  corbeille:  "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6",
  appareil:   "M4 8h4l2-3h4l2 3h4v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  main:       "M8 13V5a1.6 1.6 0 1 1 3.2 0v6.5M11.2 11V4a1.6 1.6 0 1 1 3.2 0v7M14.4 11.5V6.5a1.6 1.6 0 1 1 3.2 0V15a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.3-2.5L4.5 15a1.7 1.7 0 0 1 2.6-2z",
  interro:    "M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.9-.9 1.6v.6M12 17h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  sondage:    "M6 20V10M12 20V4M18 20v-7",
  chrono:     "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 9v4l2.5 2.5M9 2h6",
  megaphone:  "M4 10v4a1 1 0 0 0 1 1h3l6 4V5L8 9H5a1 1 0 0 0-1 1ZM18 9a4 4 0 0 1 0 6",
  oeil:       "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  oeilBarre:  "M3 3l18 18M10.6 5.2A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.2 6.6A16.8 16.8 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.2-.9M9.9 9.9a3 3 0 0 0 4.2 4.2",
  lien:       "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5",
  cadenas:    "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  cadenasOuvert: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.5-2",
  dossier:    "M3 6h6l2 2h10v11H3z",
  etoile:     "m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6.1L12 16.8 6.7 19.7l1.1-6.1L3.4 9.4l6-.8z",
  televerser: "M12 16V4M7 9l5-5 5 5M4 17v3h16v-3",
  telecharger:"M12 4v12M7 11l5 5 5-5M4 17v3h16v-3",
  sortie:     "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  entree:     "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M5 12h11",
  menu:       "M4 7h16M4 12h16M4 17h16",
  points:     "M12 6h.01M12 12h.01M12 18h.01",
  copier:     "M9 9h10v12H9zM5 15H3V3h12v2",
  balance:    "M12 3v18M7 21h10M12 6 4 9l3 6 3-6zM12 6l8 3-3 6-3-6z",
  bouclier:   "M12 3l8 3v6c0 4.5-3.2 8.3-8 9.8-4.8-1.5-8-5.3-8-9.8V6z",
  drapeau:    "M5 21V4M5 4h13l-2.5 4L18 12H5",
  calendrier: "M4 6h16v15H4zM4 10h16M9 3v4M15 3v4",
  horloge:    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  pause:      "M8 5v14M16 5v14",
  lecture:    "M7 4l12 8-12 8z",
  stop:       "M6 6h12v12H6z",
  rejouer:    "M4 12a8 8 0 1 1 2.3 5.6M4 12V7M4 12h5",
  grille:     "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  liste:      "M4 6h16M4 12h16M4 18h16",
  livre:      "M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2zM20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2z",
  robot:      "M8 3v3M16 3v3M5 8h14v11H5zM9 13h.01M15 13h.01M9.5 16h5",
};

export function icone(nom, taille = 18) {
  const d = TRACES[nom] || TRACES.points;
  const svg = el("svg", {
    viewBox: "0 0 24 24", width: taille, height: taille,
    fill: "none", stroke: "currentColor", "stroke-width": "1.6",
    "stroke-linecap": "round", "stroke-linejoin": "round",
    "aria-hidden": "true", focusable: "false"
  });
  for (const trace of d.split("  ")) {
    svg.appendChild(el("path", { d: trace.trim() }));
  }
  return svg;
}

export const nomsIcones = Object.keys(TRACES);
