import { getServiceClient } from "./supabase.js";

export async function requireAdmin(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Admin-Login fehlt.");

  const supabase = getServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Admin-Login ist ungueltig.");

  const { data: admin, error: adminError } = await supabase
    .from("admins")
    .select("user_id, email")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (adminError) throw adminError;
  if (!admin) throw new Error("Dieser Login hat keine Adminrechte.");

  return { supabase, user: userData.user, admin };
}

export function makeInviteCode(prefix = "WM") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const token = Array.from({ length: 10 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join("");
  return `${prefix}-${token.slice(0, 5)}-${token.slice(5)}`;
}
