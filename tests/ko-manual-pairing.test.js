import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTeamFlagLookup,
  buildManualKnockoutSaveRequest,
  normalizeKnockoutOverride,
  resolveTeamFlagCode,
} from "../src/lib/koManualPairing.js";

test("normalizeKnockoutOverride trimmt leere manuelle KO-Eingaben heraus", () => {
  assert.deepEqual(normalizeKnockoutOverride({ teamA: " Deutschland ", teamB: " " }), {
    teamA: "Deutschland",
  });
});

test("buildManualKnockoutSaveRequest speichert genau ein manuell gesetztes KO-Spiel", () => {
  assert.deepEqual(
    buildManualKnockoutSaveRequest("ko-r32-01", { teamA: "Deutschland", teamB: "Brasilien" }),
    {
      mode: "apply",
      scope: "partial",
      updateIds: ["ko-r32-01"],
      manualPairings: {
        "ko-r32-01": {
          teamA: "Deutschland",
          teamB: "Brasilien",
        },
      },
    },
  );
});

test("buildManualKnockoutSaveRequest gibt null zurück, wenn keine Mannschaft gesetzt ist", () => {
  assert.equal(buildManualKnockoutSaveRequest("ko-r32-01", { teamA: " ", teamB: "" }), null);
});

test("resolveTeamFlagCode findet Flaggen auch über deutsche Admin-Teamnamen", () => {
  const flagLookup = buildTeamFlagLookup([
    {
      team_a: "Germany",
      flag_code_a: "de",
      team_b: "Brazil",
      flag_code_b: "br",
    },
  ]);

  assert.equal(resolveTeamFlagCode(flagLookup, "Deutschland"), "de");
  assert.equal(resolveTeamFlagCode(flagLookup, " brasilien "), "br");
});
