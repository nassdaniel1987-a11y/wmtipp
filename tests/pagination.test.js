import assert from "node:assert/strict";
import test from "node:test";
import { fetchAllPages } from "../netlify/functions/_shared/pagination.js";

// Mini-Mock eines Supabase-Query-Builders: nur .range(from, to) wird gebraucht.
function makeQueryFactory(rows, calls) {
  return () => ({
    range(from, to) {
      calls.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    },
  });
}

test("fetchAllPages sammelt Zeilen über mehrere Seiten ein", async () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({ index }));
  const calls = [];
  const result = await fetchAllPages(makeQueryFactory(rows, calls), 2);

  assert.deepEqual(result, rows);
  // [0,1]=2, [2,3]=2, [4,5]=1 (<2 -> Stop)
  assert.deepEqual(calls, [[0, 1], [2, 3], [4, 5]]);
});

test("fetchAllPages macht bei exaktem Vielfachen eine zusätzliche leere Seite", async () => {
  const rows = Array.from({ length: 4 }, (_, index) => ({ index }));
  const calls = [];
  const result = await fetchAllPages(makeQueryFactory(rows, calls), 2);

  assert.equal(result.length, 4);
  // [0,1]=2, [2,3]=2, [4,5]=0 (<2 -> Stop)
  assert.deepEqual(calls, [[0, 1], [2, 3], [4, 5]]);
});

test("fetchAllPages überschreitet das 1000-Zeilen-Limit (Regressionsschutz)", async () => {
  const rows = Array.from({ length: 3021 }, (_, index) => ({ index }));
  const calls = [];
  const result = await fetchAllPages(makeQueryFactory(rows, calls), 1000);

  assert.equal(result.length, 3021);
  assert.equal(calls.length, 4); // 1000 + 1000 + 1000 + 21
});

test("fetchAllPages gibt für leere Tabellen ein leeres Array zurück", async () => {
  const result = await fetchAllPages(() => ({ range: () => Promise.resolve({ data: [], error: null }) }), 1000);
  assert.deepEqual(result, []);
});

test("fetchAllPages wirft bei Query-Fehler", async () => {
  await assert.rejects(
    fetchAllPages(() => ({ range: () => Promise.resolve({ data: null, error: new Error("boom") }) }), 1000),
    /boom/,
  );
});
