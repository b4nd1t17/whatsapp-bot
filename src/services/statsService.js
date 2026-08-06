const DEFAULT_COUNTERS = Object.freeze({
  messages: 0,
  warns: 0,
  kicks: 0,
  bans: 0,
  spam: 0,
  flood: 0,
  deleted: 0
});

export function createStatsService(initial = {}) {
  const counters = { ...DEFAULT_COUNTERS };

  for (const [name, value] of Object.entries(initial)) {
    if (!(name in counters)) continue;
    counters[name] = toNonNegativeInteger(value);
  }

  function assertKnownCounter(name) {
    if (!(name in counters)) {
      throw new RangeError(`Contador desconocido: ${name}`);
    }
  }

  function increment(name, amount = 1) {
    assertKnownCounter(name);
    const delta = toPositiveInteger(amount);
    counters[name] += delta;
    return counters[name];
  }

  function get(name) {
    assertKnownCounter(name);
    return counters[name];
  }

  function getAll() {
    return { ...counters };
  }

  function reset(name) {
    if (name === undefined) {
      for (const key of Object.keys(counters)) counters[key] = 0;
      return getAll();
    }

    assertKnownCounter(name);
    counters[name] = 0;
    return 0;
  }

  return Object.freeze({ increment, get, getAll, reset });
}

function toNonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

function toPositiveInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError("La cantidad debe ser un entero positivo");
  }
  return Math.floor(number);
}

export const statsService = createStatsService();
