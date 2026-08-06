import test from "node:test";
import assert from "node:assert/strict";
import { createStatsService } from "../src/services/statsService.js";

test("incrementa y devuelve copias seguras de las estadísticas", () => {
  const stats = createStatsService({ messages: 2 });

  assert.equal(stats.increment("messages"), 3);
  assert.equal(stats.increment("spam", 4), 4);

  const snapshot = stats.getAll();
  snapshot.messages = 999;

  assert.equal(stats.get("messages"), 3);
  assert.deepEqual(stats.getAll(), {
    messages: 3,
    warns: 0,
    kicks: 0,
    bans: 0,
    spam: 4,
    flood: 0,
    deleted: 0
  });
});

test("reinicia un contador o todos", () => {
  const stats = createStatsService({ warns: 3, bans: 2 });

  assert.equal(stats.reset("warns"), 0);
  assert.equal(stats.get("bans"), 2);

  assert.deepEqual(stats.reset(), {
    messages: 0,
    warns: 0,
    kicks: 0,
    bans: 0,
    spam: 0,
    flood: 0,
    deleted: 0
  });
});

test("rechaza contadores y cantidades inválidas", () => {
  const stats = createStatsService();

  assert.throws(() => stats.increment("unknown"), /Contador desconocido/);
  assert.throws(() => stats.increment("messages", 0), /entero positivo/);
  assert.throws(() => stats.increment("messages", -2), /entero positivo/);
});
