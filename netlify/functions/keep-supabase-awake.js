import { getServiceClient, json } from "./_shared/supabase.js";

export default async () => {
  try {
    const supabase = getServiceClient();
    const { error } = await supabase
      .from("matches")
      .select("id")
      .limit(1);

    if (error) throw error;

    return json({
      ok: true,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error.message || "Supabase keep-alive fehlgeschlagen.",
      },
      500,
    );
  }
};

export const config = {
  schedule: "17 4 * * *",
};
