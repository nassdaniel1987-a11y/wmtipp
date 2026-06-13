import { getServiceClient } from "./supabase.js";

// Auth-Fehler tragen status 401, damit die Functions sie von DB-/Serverfehlern
// (status 500) unterscheiden koennen, statt jeden Fehler als 401 auszugeben.
function adminAuthError(message) {
  const error = new Error(message);
  error.status = 401;
  return error;
}

export async function requireAdmin(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw adminAuthError("Admin-Login fehlt.");

  const supabase = getServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) throw adminAuthError("Admin-Login ist ungültig.");

  const { data: admin, error: adminError } = await supabase
    .from("admins")
    .select("user_id, email")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (adminError) throw adminError;
  if (!admin) throw adminAuthError("Dieser Login hat keine Adminrechte.");

  return { supabase, user: userData.user, admin };
}

export function makeInviteCode(prefix = "WM") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const token = Array.from({ length: 10 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join("");
  return `${prefix}-${token.slice(0, 5)}-${token.slice(5)}`;
}
