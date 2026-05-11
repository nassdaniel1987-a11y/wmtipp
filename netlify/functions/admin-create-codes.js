import { makeInviteCode, requireAdmin } from "./_shared/admin.js";
import { json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json();
    const count = Math.max(1, Math.min(100, Number(body.count) || 10));
    const prefix = String(body.prefix || "WM").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8) || "WM";

    const rows = Array.from({ length: count }, () => ({
      code: makeInviteCode(prefix),
      status: "free",
    }));

    const { data, error } = await supabase
      .from("invite_codes")
      .insert(rows)
      .select("id, code, status, created_at");

    if (error) throw error;
    return json({ codes: data });
  } catch (error) {
    return json({ error: error.message || "Codes konnten nicht erstellt werden." }, 401);
  }
};

export const config = {
  path: "/api/admin-create-codes",
};
