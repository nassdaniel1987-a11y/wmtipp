import { getServiceClient, json } from "./_shared/supabase.js";

function buildTrend(rows) {
  const total = rows.length;
  const trend = {
    total,
    homeWin: 0,
    draw: 0,
    awayWin: 0,
    homeWinPercent: 0,
    drawPercent: 0,
    awayWinPercent: 0,
  };

  if (total === 0) return trend;

  rows.forEach((row) => {
    const scoreA = Number(row.score_a);
    const scoreB = Number(row.score_b);
    if (scoreA > scoreB) trend.homeWin += 1;
    if (scoreA === scoreB) trend.draw += 1;
    if (scoreA < scoreB) trend.awayWin += 1;
  });

  trend.homeWinPercent = Math.round((trend.homeWin / total) * 100);
  trend.drawPercent = Math.round((trend.draw / total) * 100);
  trend.awayWinPercent = Math.max(0, 100 - trend.homeWinPercent - trend.drawPercent);

  return trend;
}

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("tips")
      .select("match_id, score_a, score_b");

    if (error) throw error;

    const grouped = new Map();
    (data ?? []).forEach((tip) => {
      const rows = grouped.get(tip.match_id) ?? [];
      rows.push(tip);
      grouped.set(tip.match_id, rows);
    });

    const trends = Object.fromEntries(
      Array.from(grouped.entries()).map(([matchId, rows]) => [matchId, buildTrend(rows)]),
    );

    return json({ trends });
  } catch (error) {
    return json({ error: error.message || "Community-Trend konnte nicht geladen werden." }, 500);
  }
};

export const config = {
  path: "/api/tip-trends",
};
