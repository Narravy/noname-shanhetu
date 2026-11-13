const ids = value => String(value || '').split(/[;,]/).map(Number).filter(id => id > 0);

export function runMutationRows(catalog, run) {
  if (!run) return [];
  const selected = [...(run.mutations || []), ...(run.fixedMutations || [])];
  const byId = new Map((catalog.rules.seed || []).map(row => [Number(row.seed), row]));
  return [...new Set(selected.map(Number))].map(id => byId.get(id)).filter(Boolean);
}

export function mutationDisplay(row) {
  return { id: Number(row.seed), seedId: Number(row.seed), name: row.name,
    description: row.desc || '', picture: row.pic || '', level: Number(row.level) || 1,
    rewardDescription: row.desc1 || '' };
}

export function fixedMutationIds(difficulty) {
  return [...new Set([...(difficulty?.seedIds || ids(difficulty?.raw?.seed)),
    ...(difficulty?.debuffIds || ids(difficulty?.raw?.debuff))])];
}

// The public client receives candidate IDs from its server. The offline policy
// draws three distinct eligible entries uniformly, then saves that offer once.
// EX-only rules (5057+) are supplied by the chosen desperate stage instead.
export function mutationPool(catalog, run, allowed) {
  return (catalog.rules.seed || []).filter(row => Number(row.seed) < 5057
    && (!allowed || allowed(row, run) !== false));
}

export function mutationReward(catalog, run) {
  const items = new Map();
  let scoreBonusPercent = 0;
  for (const row of runMutationRows(catalog, run)) {
    for (const item of String(row.item || '').split(';').filter(Boolean)) {
      const [id, quantity] = item.split(',').map(Number);
      if (id > 0 && quantity > 0) items.set(id, (items.get(id) || 0) + quantity);
    }
    scoreBonusPercent += Number(String(row.desc1 || '').match(/战绩分\+(\d+)%/)?.[1] || 0);
  }
  return { items: [...items].map(([id, quantity]) => ({ id, quantity })), scoreBonusPercent };
}
