/* ---------------------------------------------------------------------------
 * CLASSE PARALLÈLE — Configuration publique
 *
 * L'URL et la clé « publishable » sont publiques par nature : elles voyagent
 * dans chaque requête du navigateur. Toute la sécurité repose sur les
 * politiques RLS définies dans supabase/migrations/, jamais sur le secret de
 * ces deux valeurs.
 *
 * Ne collez JAMAIS ici une clé de service (service_role / sb_secret_…) : elle
 * contourne la RLS et donnerait à n'importe quel visiteur un accès total.
 *
 * Champs vides = MODE DÉMONSTRATION : les données restent dans le navigateur
 * et la synchronisation se limite aux onglets du même poste. Chaque onglet
 * peut alors ouvrir un compte différent, ce qui permet de jouer le duo
 * professeur / élève sur une seule machine.
 * ------------------------------------------------------------------------- */
window.OJM_CONFIG = {
  supabaseUrl: "https://rcxnnomthawosncwoemz.supabase.co",
  supabaseAnonKey: "sb_publishable_Y_LIzg8cVW_Ek51jMbaVgg_TS7kfYpc",

  // Nom affiché dans l'interface. Laissez tel quel pour la plateforme
  // générique, ou mettez le nom de votre établissement / serveur RP : c'est
  // le seul endroit à changer pour habiller le site à vos couleurs.
  academyName: "Classe Parallèle",
  academyMotto: "L'école qui tourne à côté du jeu",

  // Vocabulaire RP personnalisable (voir src/core/lexique.js pour la liste
  // complète des termes, ou l'écran Réglages › Vocabulaire RP).
  lexique: {}
};
