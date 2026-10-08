// Blocus Assault — données de base
// Grands lycées pré-chargés (positions approximatives du bâtiment principal).
// Tous les autres lycées du monde sont chargés à la volée depuis OpenStreetMap.
window.BA_CONFIG = {
  supabaseUrl: "https://rcxnnomthawosncwoemz.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjeG5ub210aGF3b3NuY3dvZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NzMwMDQsImV4cCI6MjEwMDU0OTAwNH0.SkUiClpJMigMDVjJ9X9wjjLf9Hy1Pi0uKolMBE2O1Sw",
  overpass: ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"],
  statusWindowHours: 6,
  // Clé Google Maps JavaScript API (facultative). Si elle est renseignée, la carte
  // en direct s'affiche sur le fond Google Maps (plan / satellite) avec tous les
  // signalements par-dessus. Sans clé, le bouton « G » ouvre Google Maps intégré.
  googleMapsKey: "",
};

// [id, nom, ville, pays, lat, lng]
window.BA_SEED = [
  ["henri4", "Lycée Henri-IV", "Paris", "FR", 48.8462, 2.3477],
  ["llg", "Lycée Louis-le-Grand", "Paris", "FR", 48.8483, 2.3442],
  ["stlouis", "Lycée Saint-Louis", "Paris", "FR", 48.8509, 2.3418],
  ["charlemagne", "Lycée Charlemagne", "Paris", "FR", 48.8545, 2.3610],
  ["condorcet", "Lycée Condorcet", "Paris", "FR", 48.8749, 2.3263],
  ["fenelon", "Lycée Fénelon", "Paris", "FR", 48.8535, 2.3418],
  ["janson", "Lycée Janson-de-Sailly", "Paris", "FR", 48.8637, 2.2775],
  ["voltaire", "Lycée Voltaire", "Paris", "FR", 48.8600, 2.3880],
  ["lavoisier", "Lycée Lavoisier", "Paris", "FR", 48.8434, 2.3407],
  ["turgot", "Lycée Turgot", "Paris", "FR", 48.8653, 2.3613],
  ["buffon", "Lycée Buffon", "Paris", "FR", 48.8433, 2.3115],
  ["duruy", "Lycée Victor-Duruy", "Paris", "FR", 48.8547, 2.3156],
  ["hoche", "Lycée Hoche", "Versailles", "FR", 48.8079, 2.1338],
  ["ginette", "Lycée Sainte-Geneviève", "Versailles", "FR", 48.7960, 2.1290],
  ["lakanal", "Lycée Lakanal", "Sceaux", "FR", 48.7794, 2.2955],
  ["parc", "Lycée du Parc", "Lyon", "FR", 45.7703, 4.8508],
  ["ampere", "Lycée Ampère", "Lyon", "FR", 45.7639, 4.8337],
  ["thiers", "Lycée Thiers", "Marseille", "FR", 43.2990, 5.3818],
  ["fermat", "Lycée Pierre-de-Fermat", "Toulouse", "FR", 43.6046, 1.4424],
  ["montaigne", "Lycée Michel-Montaigne", "Bordeaux", "FR", 44.8378, -0.5812],
  ["clemenceau", "Lycée Clemenceau", "Nantes", "FR", 47.2196, -1.5497],
  ["kleber", "Lycée Kléber", "Strasbourg", "FR", 48.5899, 7.7596],
  ["faidherbe", "Lycée Faidherbe", "Lille", "FR", 50.6311, 3.0604],
  ["massena", "Lycée Masséna", "Nice", "FR", 43.7004, 7.2717],
  ["chateaubriand", "Lycée Chateaubriand", "Rennes", "FR", 48.1196, -1.6640],
  ["joffre", "Lycée Joffre", "Montpellier", "FR", 43.6155, 3.8810],
  ["champollion", "Lycée Champollion", "Grenoble", "FR", 45.1870, 5.7240],
  ["lyautey", "Lycée Lyautey", "Casablanca", "MA", 33.5847, -7.6280],
  ["descartes", "Lycée Descartes", "Rabat", "MA", 34.0131, -6.8365],
  ["mermoz", "Lycée Jean-Mermoz", "Dakar", "SN", 14.7225, -17.4747],
  ["blaisepascal", "Lycée Blaise-Pascal", "Abidjan", "CI", 5.3360, -4.0170],
  ["cdg", "Lycée Français Charles de Gaulle", "Londres", "GB", 51.4945, -0.1764],
  ["lfny", "Lycée Français de New York", "New York", "US", 40.7685, -73.9516],
  ["eton", "Eton College", "Windsor", "GB", 51.4917, -0.6094],
  ["harrow", "Harrow School", "Londres", "GB", 51.5726, -0.3349],
  ["exeter", "Phillips Exeter Academy", "Exeter", "US", 42.9823, -70.9516],
  ["stuy", "Stuyvesant High School", "New York", "US", 40.7179, -74.0139],
  ["tjhsst", "Thomas Jefferson HS for Science and Technology", "Alexandria", "US", 38.8183, -77.1683],
  ["parini", "Liceo Classico Giuseppe Parini", "Milan", "IT", 45.4732, 9.1919],
  ["visconti", "Liceo Ennio Quirino Visconti", "Rome", "IT", 41.8985, 12.4784],
  ["cnba", "Colegio Nacional de Buenos Aires", "Buenos Aires", "AR", -34.6094, -58.3735],
  ["inba", "Instituto Nacional", "Santiago", "CL", -33.4446, -70.6510],
  ["raffles", "Raffles Institution", "Singapour", "SG", 1.3469, 103.8433],
  ["sydgram", "Sydney Grammar School", "Sydney", "AU", -33.8775, 151.2097],
  ["seoulsci", "Seoul Science High School", "Séoul", "KR", 37.5885, 126.9970],
  ["yersin", "Lycée Alexandre-Yersin", "Hanoï", "VN", 21.0500, 105.8000],
];

// Types de signalement
window.BA_KINDS = {
  blocus:    { label: "Blocus total",        icon: "⛔", color: "#ff2d4b", status: true, sev: 3 },
  partiel:   { label: "Blocus partiel",      icon: "🚧", color: "#ff8a1f", status: true, sev: 2 },
  debloque:  { label: "Débloqué / accès OK", icon: "✅", color: "#22d37a", status: true, sev: 0 },
  calme:     { label: "Calme, cours normaux", icon: "🟢", color: "#22d37a", status: true, sev: 0 },
  annule:    { label: "Cours annulés / fermé", icon: "🔒", color: "#a46bff", status: true, sev: 1 },
  police:    { label: "Police présente",     icon: "🚓", color: "#3c8dff", sev: 1 },
  lacrymo:   { label: "Gaz lacrymogène",     icon: "😶‍🌫️", color: "#c2d400", sev: 3, urgent: true },
  incendie:  { label: "Incendie / feu",      icon: "🔥", color: "#ff4d00", sev: 3, urgent: true },
  portail:   { label: "Portail cassé / forcé", icon: "🚪", color: "#ff6b6b", sev: 2 },
  intrusion: { label: "Intrusion",           icon: "⚠️", color: "#ff3b3b", sev: 3, urgent: true },
  manif:     { label: "Manifestation / cortège", icon: "📣", color: "#ffb800", sev: 1 },
  bouchon:   { label: "Embouteillage",       icon: "🚗", color: "#ff9f43", sev: 1 },
  transport: { label: "Bus / tram perturbés", icon: "🚌", color: "#00bcd4", sev: 1 },
  danger:    { label: "Danger / violences",  icon: "🆘", color: "#ff0040", sev: 3, urgent: true },
  medical:   { label: "Besoin médical",      icon: "🩹", color: "#ff5ca8", sev: 3, urgent: true },
  aide:      { label: "Aidez-nous (eau, infos…)", icon: "🙋", color: "#ffd166", sev: 2, urgent: true },
  info:      { label: "Info générale",       icon: "ℹ️", color: "#9aa4b2", sev: 0 },
};

window.BA_STATUS = {
  blocus:   { label: "BLOQUÉ",         color: "#ff2d4b" },
  partiel:  { label: "PARTIEL",        color: "#ff8a1f" },
  annule:   { label: "FERMÉ",          color: "#a46bff" },
  incident: { label: "INCIDENTS",      color: "#ffd000" },
  debloque: { label: "ACCÈS OK",       color: "#22d37a" },
  calme:    { label: "CALME",          color: "#22d37a" },
  none:     { label: "PAS D'INFO",     color: "#6b7686" },
};
