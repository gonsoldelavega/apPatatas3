import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let supabaseClient = null;
let supabaseClientPromise = null;

async function loadPublicConfig() {
  try {
    const response = await fetch("/api/public-config", {
      method: "GET",
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`public-config-${response.status}`);
    const payload = await response.json();
    if (!payload?.supabaseUrl || !payload?.supabaseAnonKey) {
      throw new Error("missing_supabase_public_config");
    }
    return {
      ...payload,
      supabaseUrl: String(payload.supabaseUrl || "").trim(),
      supabaseAnonKey: String(payload.supabaseAnonKey || "").trim()
    };
  } catch (_error) {
    throw new Error("No se pudo cargar configuración de Supabase");
  }
}

export async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (!supabaseClientPromise) {
    supabaseClientPromise = (async () => {
      const config = await loadPublicConfig();
      supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
      return supabaseClient;
    })().catch(error => {
      supabaseClientPromise = null;
      throw error;
    });
  }
  return supabaseClientPromise;
}

export async function getAll(tabla) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(tabla)
    .select("*");

  if (error) throw error;
  return data || [];
}

export async function insert(tabla, datos) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(tabla)
    .insert(datos)
    .select();

  if (error) throw error;
  return data || [];
}

export async function update(tabla, id, datos) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(tabla)
    .update(datos)
    .eq("id", id)
    .select();

  if (error) throw error;
  return data || [];
}

export async function remove(tabla, id) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from(tabla)
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}
