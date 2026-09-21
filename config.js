/* ---------------------------------------------------------------------------
 * OJM ACADEMY — Configuration publique
 *
 * Renseignez ici l'URL et la clé publique (anon / publishable) de votre projet
 * Supabase. Ces deux valeurs sont publiques par nature : la sécurité repose sur
 * les politiques RLS définies dans supabase/migrations/.
 *
 * Laissez les champs vides pour démarrer en MODE DÉMONSTRATION : les données
 * restent dans le navigateur et la synchronisation se fait entre les onglets
 * d'un même poste (utile pour tester le duo professeur / élève).
 * ------------------------------------------------------------------------- */
window.OJM_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",

  // Nom de l'établissement affiché dans l'interface.
  academyName: "OJM Academy",
  academyMotto: "Ordre · Justice · Mérite",

  // Vocabulaire RP personnalisable (voir src/core/lexique.js pour la liste).
  lexique: {}
};
