import { supabase } from "./supabaseClient.js";

export async function readApiPayload(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    if (import.meta.env.DEV && response.url.includes("/api/")) {
      throw new Error("Lokales Backend nicht erreichbar - für Admin- und API-Prüfungen `npm run dev:netlify` starten.");
    }
    throw new Error("Serverantwort konnte nicht verarbeitet werden.");
  }
  return response.json();
}

export async function apiGet(path, extraHeaders = {}) {
  const response = await fetch(path, { headers: extraHeaders });
  const payload = await readApiPayload(response);
  if (!response.ok) throw new Error(payload.error || "Serverfehler");
  return payload;
}

export async function apiPost(path, body, token, extraHeaders = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const payload = await readApiPayload(response);
  if (!response.ok) throw new Error(payload.error || "Serverfehler");
  return payload;
}

export async function loadDbMatches() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .order("match_number", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function loadResults() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("results")
    .select("match_id, score_a, score_b, winner, status, updated_at");

  if (error) throw error;
  return data ?? [];
}

export async function signInAdmin(email, password) {
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert.");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data.session;
}

export async function signOutAdmin() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getAdminSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}
