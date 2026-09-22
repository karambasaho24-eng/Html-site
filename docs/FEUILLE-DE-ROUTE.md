# Feuille de route

Le cahier des charges demandait sept phases, et de ne pas tout construire d'un
coup. Voici où en est chacune, franchement.

## Livré

### Phase 1 — Fondations
Architecture, design, authentification, profils, cahiers personnels, pages,
sauvegarde différée avec brouillon local, densités d'affichage pour cohabiter
avec Roblox.

### Phase 2 — Classes
Création, code d'accès et régénération, inscription par code, validation
manuelle, rôles de classe, silencieux, expulsion, sessions numérotées.

### Phase 3 — Direct
Cahier commun, tableau interactif (9 outils, pages multiples, mode
participatif, curseurs distants, capture vers le cahier), synchronisation
temps réel filtrée par classe et par session, mode « suivre le professeur ».

### Phase 4 — Ressources
Import de PDF, images et fiches, dossiers, distribution à la classe,
conversion en pages de cahier, exercices à 10 types de questions.

### Phase 5 — Vie de classe
Présences automatiques et corrigibles, notifications, annonces, questions,
main levée, sondages, minuteries et compte à rebours, journal de séance.

### Phase 6 — Évaluation
Mode examen, suivi des copies en direct, correction manuelle et automatique,
notes, moyenne, progression, archives consultables, reprise d'une séance.

### Phase 7 — Finitions
Responsive PC → tablette → mobile, raccourcis configurables, assainissement du
HTML, gestion des coupures réseau, états vides soignés, navigation au clavier
et pièges de focus dans les modales.

## Ce qui reste à faire

Par ordre d'utilité réelle, pas de difficulté.

### Export PDF (prévu après la V1 par le cahier des charges)
L'impression du navigateur est déjà mise en forme pour le cahier
(`styles/responsive.css`, bloc `@media print`). Un vrai export — relevé de
notes, feuille de présence, dossier complet — demande une génération côté
serveur ou une bibliothèque supplémentaire.

### Édition collaborative fine du cahier commun
Aujourd'hui, deux personnes qui écrivent la même page au même instant : la
dernière écriture gagne. L'éditeur refuse d'écraser une saisie en cours et
prévient, mais il n'y a pas de fusion caractère par caractère. Un CRDT serait
un chantier à part entière ; il ne se justifie que si l'usage montre que
plusieurs encadrants rédigent vraiment ensemble.

### Recherche à grande échelle
La recherche globale parcourt les pages côté navigateur. Impeccable jusqu'à
quelques centaines de pages, à revoir au-delà : un index `tsvector` sur
`notebook_pages` et `documents` réglerait la question.

### Texte sélectionnable à l'import PDF
La conversion produit des images. Extraire le texte (pdf.js sait le faire)
donnerait des pages modifiables et indexables. Ce n'était pas nécessaire pour
la V1 et cela aurait alourdi la chaîne.

### Présence hors session
Le vert / orange / rouge vit pendant une session. Une présence globale
(« qui est en ligne sur la plateforme ») demanderait un canal permanent, pour
un intérêt pédagogique faible.

## Volontairement écarté

- **Toute intégration technique avec Roblox.** Le cahier des charges l'interdit
  et c'est la bonne décision : pas d'injection, pas de modification du client,
  pas de fausse passerelle. Le lien reste le code de classe et le pseudo Roblox
  renseigné sur le profil.
- **Une IA obligatoire.** La conversion de documents fonctionne sans service
  externe. Si une aide à la rédaction est souhaitée un jour, elle devra rester
  optionnelle et séparée, comme demandé.
- **Un framework et une étape de compilation.** Le site se dépose tel quel et
  reste modifiable sans chaîne d'outils.

## Propositions

Trois systèmes qui manquent à une école RP et qui ne sont pas dans le cahier
des charges. Aucun n'a été ajouté sans demande — ils sont posés ici pour
décision.

**Registre de certification.** Une école qui délivre des certifications a
besoin d'un registre : qui est certifié, en quoi, depuis quand, par qui.
Aujourd'hui l'information est dispersée dans `grades`. Une table `certifications`
avec une date de validité et un numéro vérifiable donnerait une vraie valeur RP
— un document opposable en jeu.

**Convocation.** Le professeur annonce une séance à l'avance ; les élèves la
voient arriver et confirment leur présence. Les sessions sont déjà
programmables (`status = 'planned'`) : il manque l'écran et la notification.

**Fiches d'affaire.** Pour une académie juridique, le cas pratique gagnerait à
devenir un objet durable — pièces jointes, parties, chronologie, conclusion —
plutôt qu'un simple énoncé d'exercice. C'est le système qui rapprocherait le
plus le site du RolePlay joué dans Roblox.
