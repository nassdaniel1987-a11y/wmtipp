import assert from "node:assert/strict";
import test from "node:test";
import {
  getKoTipPromptMatches,
  shouldShowKoTipPrompt,
} from "../src/lib/koTipPrompt.js";

const futureKickoff = "2099-06-28T19:00:00.000Z";
const pastKickoff = "2020-06-28T19:00:00.000Z";

test("shouldShowKoTipPrompt zeigt den Hinweis nur für Teilnehmer mit sichtbaren offenen KO-Spielen", () => {
  const koMatches = [{ id: "ko-r32-01", phase: "r32", kickoffAt: futureKickoff }];

  assert.equal(shouldShowKoTipPrompt({ participant: { id: "p1" }, koVisible: true, koMatches }), true);
  assert.equal(shouldShowKoTipPrompt({ participant: null, koVisible: true, koMatches }), false);
  assert.equal(shouldShowKoTipPrompt({ participant: { id: "p1" }, koVisible: false, koMatches }), false);
  assert.equal(shouldShowKoTipPrompt({ participant: { id: "p1" }, koVisible: true, koMatches, dismissed: true }), false);
  assert.equal(shouldShowKoTipPrompt({ participant: { id: "p1" }, koVisible: true, koMatches: [{ ...koMatches[0], kickoffAt: pastKickoff }] }), false);
});

test("getKoTipPromptMatches liefert die ersten offenen KO-Spiele nach Spielnummer", () => {
  const matches = [
    { id: "ko-r32-03", phase: "r32", matchNumber: 75, kickoffAt: futureKickoff },
    { id: "m01", phase: "group", matchNumber: 1, kickoffAt: futureKickoff },
    { id: "ko-r32-01", phase: "r32", matchNumber: 73, kickoffAt: futureKickoff },
    { id: "ko-r32-02", phase: "r32", matchNumber: 74, kickoffAt: pastKickoff },
  ];

  assert.deepEqual(
    getKoTipPromptMatches(matches, { limit: 2 }).map((match) => match.id),
    ["ko-r32-01", "ko-r32-03"],
  );
});
