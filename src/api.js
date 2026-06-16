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

// --- Direkte Supabase-Reads (anon key + RLS) statt Netlify-Functions ---------
// Diese Pfade laufen ohne Function-Invocation direkt gegen Supabase. Die RLS
// erlaubt anon-SELECT auf diese oeffentlichen Tabellen.

export async function loadPlayers() {
  if (!supabase) return { players: [] };
  const { data, error } = await supabase
    .from("players")
    .select("id, display_name, team_name, aliases, active")
    .eq("active", true)
    .order("display_name");
  if (error) throw error;
  return { players: data ?? [] };
}

export async function loadSettings() {
  if (!supabase) return { settings: { ko_visible: false } };
  const { data, error } = await supabase.from("app_settings").select("key, value");
  if (error) throw error;
  const settings = { ko_visible: false };
  for (const row of data ?? []) settings[row.key] = row.value;
  return { settings };
}

export async function loadBonusResults() {
  if (!supabase) return { bonusResults: null };
  const { data, error } = await supabase
    .from("bonus_results")
    .select("id, champion, top_scorer, top_scorer_player_ids, group_winners, updated_at")
    .eq("id", "official")
    .maybeSingle();
  if (error) throw error;
  return { bonusResults: data ?? null };
}

// Rangliste aus dem vom Backend gepflegten Snapshot lesen (anon + Realtime).
// Faellt der Snapshot kalt aus (z. B. vor dem ersten Ergebnis), greift einmalig
// die bestehende Function als Fallback.
export async function loadRanking() {
  if (!supabase) return { ranking: [] };
  const { data, error } = await supabase
    .from("wm_ranking")
    .select("ranking")
    .eq("id", "wm")
    .maybeSingle();
  if (error) throw error;
  if (data?.ranking) return { ranking: data.ranking };
  // Kalt-Start-Fallback: einmalig die Function bemuehen, damit nie eine leere
  // Rangliste angezeigt wird, bevor der erste Snapshot geschrieben wurde.
  return apiGet("/api/ranking").catch(() => ({ ranking: [] }));
}

export async function loadTipTrends() {
  if (!supabase) return { trends: {} };
  const { data, error } = await supabase.rpc("wm_tip_trends");
  if (error) throw error;
  return { trends: data ?? {} };
}

// --- RPCs (SECURITY DEFINER, Invite-Code = Secret) ---------------------------

export async function resolveParticipant(code) {
  if (!supabase) return { participant: null, codeStatus: "missing" };
  const { data, error } = await supabase.rpc("resolve_participant", { p_code: code });
  if (error) throw new Error(error.message || "Teilnehmer konnte nicht geladen werden.");
  return data ?? { participant: null, codeStatus: "unknown" };
}

export async function loadMyTips(code) {
  if (!supabase) return { tips: [] };
  const { data, error } = await supabase.rpc("get_my_tips", { p_code: code });
  if (error) throw new Error(error.message || "Tipps konnten nicht geladen werden.");
  return { tips: data ?? [] };
}

export async function loadMyBonusTip(code) {
  if (!supabase) return { bonusTip: null };
  const { data, error } = await supabase.rpc("get_my_bonus_tip", { p_code: code });
  if (error) throw new Error(error.message || "Bonus-Tipps konnten nicht geladen werden.");
  return { bonusTip: data ?? null };
}

export async function claimCode(code, name) {
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert.");
  const { data, error } = await supabase.rpc("claim_invite_code", { p_code: code, p_name: name });
  if (error) throw new Error(error.message || "Code konnte nicht aktiviert werden.");
  return data;
}

export async function saveMyTips(code, tips) {
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert.");
  const { data, error } = await supabase.rpc("save_my_tips", { p_code: code, p_tips: tips });
  if (error) throw new Error(error.message || "Tipps konnten nicht gespeichert werden.");
  return data;
}

export async function saveMyBonusTips(code, { champion, topScorer, topScorerPlayerId, groupWinners }) {
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert.");
  const { data, error } = await supabase.rpc("save_my_bonus_tips", {
    p_code: code,
    p_champion: champion ?? null,
    p_top_scorer: topScorer ?? null,
    p_top_scorer_player_id: topScorerPlayerId ?? null,
    p_group_winners: groupWinners ?? {},
  });
  if (error) throw new Error(error.message || "Bonus-Tipps konnten nicht gespeichert werden.");
  return data;
}

// --- Realtime: Live-Updates statt Polling ------------------------------------

export function subscribeResults(onChange) {
  if (!supabase) return null;
  return supabase
    .channel("results-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "results" }, () => onChange())
    .subscribe();
}

export function subscribeRanking(onChange) {
  if (!supabase) return null;
  return supabase
    .channel("wm-ranking-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "wm_ranking" }, (payload) => {
      onChange(payload.new?.ranking ?? []);
    })
    .subscribe();
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

export async function apiGetWithAuth(path, token) {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await readApiPayload(response);
  if (!response.ok) throw new Error(payload.error || "Serverfehler");
  return payload;
}
