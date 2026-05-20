import { requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

function cleanAliases(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  }
  return [...new Set(String(value || "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const { id, displayName, teamName, aliases, active = true } = await req.json();
    const cleanName = String(displayName || "").trim();
    if (cleanName.length < 2) return json({ error: "Spielername fehlt." }, 400);

    const row = {
      ...(id ? { id } : {}),
      display_name: cleanName,
      team_name: String(teamName || "").trim() || null,
      aliases: cleanAliases(aliases),
      active: Boolean(active),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("players")
      .upsert(row, { onConflict: "id" })
      .select("id, display_name, team_name, aliases, active, updated_at")
      .single();

    if (error) throw error;
    return json({ player: data });
  } catch (error) {
    return json({ error: error.message || "Spieler konnte nicht gespeichert werden." }, 401);
  }
};

export const config = {
  path: "/api/admin-save-player",
};
