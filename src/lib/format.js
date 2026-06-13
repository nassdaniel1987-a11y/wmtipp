// Geteilte Format-, Zeit- und Deadline-Helfer (reine Funktionen).

export function chunkArray(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  );
}

export function clampScore(value) {
  return Math.max(0, Math.min(12, value));
}

export function formatDate(date) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${date}T12:00:00`));
}

export function formatNumericDate(date) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

export function formatDateTime(value) {
  if (!value) return "noch offen";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getBundesligaTipCountdown(match, nowMs = Date.now()) {
  const kickoffMs = new Date(match?.kickoffAt).getTime();
  if (!Number.isFinite(kickoffMs)) return null;
  const remainingMs = kickoffMs - nowMs;
  if (remainingMs <= 0 || remainingMs > 5 * 60 * 1000) return null;
  const seconds = Math.ceil(remainingMs / 1000);
  return {
    urgent: seconds <= 60,
    label: `Schließt in ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
  };
}

export function formatDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function isLockedForUsers(match) {
  if (!match?.kickoffAt) return false;
  return new Date(match.kickoffAt).getTime() <= Date.now();
}

export function getTournamentDeadline(matches) {
  const timestamps = matches
    .map((match) => match.kickoffAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.min(...timestamps)).toISOString();
}

export function getGroupDeadline(matches, groupKey) {
  const timestamps = matches
    .filter((match) => match.groupKey === groupKey)
    .map((match) => match.kickoffAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.min(...timestamps)).toISOString();
}

export function isDeadlinePassed(deadline) {
  return deadline ? new Date(deadline).getTime() <= Date.now() : false;
}
