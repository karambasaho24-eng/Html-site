/* ---------------------------------------------------------------------------
 * Pilote Supabase : Postgres (RLS), Realtime, Auth, Storage.
 * ------------------------------------------------------------------------- */
import { ErreurDonnees } from "./contrat.js";

const CDN = "https://esm.sh/@supabase/supabase-js@2.45.4";

function verifier({ data, error }) {
  if (error) throw new ErreurDonnees(error.message, error.code, error);
  return data;
}

/** Dépôt générique sur une table. */
function depot(sb, nom) {
  const filtrer = (q, filtre) => {
    for (const [cle, valeur] of Object.entries(filtre || {})) {
      if (valeur === undefined) continue;
      if (Array.isArray(valeur)) q = q.in(cle, valeur);
      else if (valeur === null) q = q.is(cle, null);
      else if (typeof valeur === "object" && valeur.operateur) q = q[valeur.operateur](cle, valeur.valeur);
      else q = q.eq(cle, valeur);
    }
    return q;
  };

  return {
    nom,
    async liste(filtre = {}, options = {}) {
      let q = filtrer(sb.from(nom).select(options.select || "*"), filtre);
      if (options.ordre) q = q.order(options.ordre, { ascending: options.sens !== "desc" });
      if (options.limite) q = q.limit(options.limite);
      return verifier(await q) || [];
    },
    async lire(id, options = {}) {
      const { data, error } = await sb.from(nom).select(options.select || "*").eq("id", id).maybeSingle();
      if (error) throw new ErreurDonnees(error.message, error.code, error);
      return data;
    },
    async creer(objet) {
      const { data, error } = await sb.from(nom).insert(objet).select().single();
      if (error) throw new ErreurDonnees(error.message, error.code, error);
      return data;
    },
    async creerPlusieurs(objets) {
      if (!objets.length) return [];
      return verifier(await sb.from(nom).insert(objets).select());
    },
    async majorer(id, patch) {
      const { data, error } = await sb.from(nom).update(patch).eq("id", id).select().single();
      if (error) throw new ErreurDonnees(error.message, error.code, error);
      return data;
    },
    async majorerOu(filtre, patch) {
      return verifier(await filtrer(sb.from(nom).update(patch), filtre).select());
    },
    async inserer(objet, conflit) {
      const { data, error } = await sb.from(nom)
        .upsert(objet, conflit ? { onConflict: conflit } : undefined).select().single();
      if (error) throw new ErreurDonnees(error.message, error.code, error);
      return data;
    },
    async supprimer(id) {
      const { error } = await sb.from(nom).delete().eq("id", id);
      if (error) throw new ErreurDonnees(error.message, error.code, error);
      return true;
    },
    async supprimerOu(filtre) {
      const { error } = await filtrer(sb.from(nom).delete(), filtre);
      if (error) throw new ErreurDonnees(error.message, error.code, error);
      return true;
    },
    async compter(filtre = {}) {
      let q = filtrer(sb.from(nom).select("id", { count: "exact", head: true }), filtre);
      const { count, error } = await q;
      if (error) throw new ErreurDonnees(error.message, error.code, error);
      return count || 0;
    }
  };
}

export async function creerPiloteSupabase(config) {
  const { createClient } = await import(/* @vite-ignore */ CDN);

  const sb = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 24 } },
    global: { headers: { "x-application": "ojm-academy" } }
  });

  const tables = {};
  const t = (nom) => (tables[nom] ||= depot(sb, nom));

  const rpc = async (nom, params) => {
    const { data, error } = await sb.rpc(nom, params);
    if (error) throw new ErreurDonnees(error.message, error.code, error);
    return data;
  };

  return {
    mode: "supabase",
    brut: sb,
    table: t,
    rpc,

    /* --- Authentification -------------------------------------------- */
    auth: {
      async session() {
        const { data } = await sb.auth.getSession();
        return data.session;
      },
      async utilisateur() {
        const { data } = await sb.auth.getUser();
        return data.user;
      },
      async inscrire({ email, motDePasse, nom, role }) {
        const { data, error } = await sb.auth.signUp({
          email, password: motDePasse,
          options: { data: { display_name: nom, role_key: role || "student" } }
        });
        if (error) throw new ErreurDonnees(error.message, error.code, error);
        return data;
      },
      async connecter({ email, motDePasse }) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: motDePasse });
        if (error) throw new ErreurDonnees(error.message, error.code, error);
        return data;
      },
      async lienMagique(email) {
        const { error } = await sb.auth.signInWithOtp({
          email, options: { emailRedirectTo: location.origin + location.pathname }
        });
        if (error) throw new ErreurDonnees(error.message, error.code, error);
        return true;
      },
      async reinitialiser(email) {
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + location.pathname
        });
        if (error) throw new ErreurDonnees(error.message, error.code, error);
        return true;
      },
      async deconnecter() { await sb.auth.signOut(); },
      surChangement(rappel) {
        const { data } = sb.auth.onAuthStateChange((evenement, session) => rappel(evenement, session));
        return () => data.subscription.unsubscribe();
      }
    },

    /* --- Temps réel ---------------------------------------------------- */
    temps: {
      sabonner({ cle, tables: abonnements = [], surChangement, diffusion = {}, presence = null }) {
        const canal = sb.channel(cle, {
          config: { broadcast: { self: false, ack: false }, presence: { key: presence?.cle || undefined } }
        });

        for (const abo of abonnements) {
          canal.on("postgres_changes", {
            event: abo.evenement || "*",
            schema: "public",
            table: abo.table,
            filter: abo.filtre || undefined
          }, (charge) => {
            surChangement?.({
              table: abo.table,
              type: charge.eventType,
              nouveau: charge.new,
              ancien: charge.old
            });
          });
        }

        for (const [evenement, rappel] of Object.entries(diffusion)) {
          canal.on("broadcast", { event: evenement }, ({ payload }) => rappel(payload));
        }

        if (presence) {
          canal.on("presence", { event: "sync" }, () => {
            const brut = canal.presenceState();
            const liste = Object.values(brut).flat();
            presence.surMaj?.(liste);
          });
        }

        canal.subscribe(async (statut) => {
          if (statut === "SUBSCRIBED" && presence?.meta) {
            await canal.track(presence.meta);
          }
          presence?.surStatut?.(statut);
        });

        return {
          canal,
          async envoyer(evenement, charge) {
            return canal.send({ type: "broadcast", event: evenement, payload: charge });
          },
          async majPresence(meta) {
            try { await canal.track(meta); } catch { /* canal fermé */ }
          },
          fermer() { sb.removeChannel(canal); }
        };
      }
    },

    /* --- Fichiers ------------------------------------------------------ */
    fichiers: {
      async televerser(fichier, chemin, seau = "documents") {
        const { error } = await sb.storage.from(seau)
          .upload(chemin, fichier, { upsert: true, contentType: fichier.type || undefined });
        if (error) throw new ErreurDonnees(error.message, error.code, error);
        return { chemin, seau };
      },
      async url(chemin, seau = "documents", secondes = 3600) {
        if (seau === "avatars") {
          return sb.storage.from(seau).getPublicUrl(chemin).data.publicUrl;
        }
        const { data, error } = await sb.storage.from(seau).createSignedUrl(chemin, secondes);
        if (error) throw new ErreurDonnees(error.message, error.code, error);
        return data.signedUrl;
      },
      async supprimer(chemin, seau = "documents") {
        const { error } = await sb.storage.from(seau).remove([chemin]);
        if (error) throw new ErreurDonnees(error.message, error.code, error);
        return true;
      }
    }
  };
}
