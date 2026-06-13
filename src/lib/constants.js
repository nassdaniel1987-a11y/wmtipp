// Geteilte Konstanten, die WM- und Bundesliga-Bereich gemeinsam nutzen.
export const AUTO_SAVE_DELAY_MS = 650;

export const groupFilters = ["alle", "deutschland", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
export const codeStatusLabels = {
  free: "frei",
  claimed: "vergeben",
  disabled: "ungültig",
};
export const competitions = {
  wm2026: {
    id: "wm-2026",
    name: "WM 2026",
    adminLabel: "WM-Verwaltung",
    publicEnabled: true,
  },
  bundesliga: {
    id: "bundesliga",
    name: "Bundesliga",
    adminLabel: "Bundesliga-Version",
    publicEnabled: false,
  },
};
export const KO_PHASES = ["r32", "r16", "quarter", "semi", "third", "final"];
export const KO_PHASE_LABELS = {
  r32: "Sechzehntelfinale",
  r16: "Achtelfinale",
  quarter: "Viertelfinale",
  semi: "Halbfinale",
  third: "Spiel um Platz 3",
  final: "Finale",
};
