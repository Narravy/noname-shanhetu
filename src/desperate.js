// EX difficulty identifiers belong to the existing 困难/噩梦/炼狱 groups.
// They are separate configurations, not a sixth major difficulty group.
const valueId = value => Number(value && typeof value === 'object' ? value.id : value) || 1;
export function isDesperateDifficulty(value) {
  const id = valueId(value);
  return id >= 101 && id <= 109 || id >= 111 && id <= 119 || id >= 121 && id <= 129;
}
export function baseDifficultyId(value) {
  const id = valueId(value);
  if (!isDesperateDifficulty(id)) return id;
  return (3 + Math.floor((id - 101) / 10)) * 5;
}
export function desperateStage(value) {
  return isDesperateDifficulty(value) ? (valueId(value) - 100) % 10 : 0;
}
/** Offline progress deliberately omits OL account level, currency and dates. */
export function desperateUnlockState(profile, difficulty) {
  if (!isDesperateDifficulty(difficulty)) return { unlocked:true, reason:'' };
  const id = valueId(difficulty), stage = desperateStage(id), previous = stage > 1 ? id - 1 : baseDifficultyId(id);
  const required = stage > 1 ? 1 : 10;
  const completed = new Set(profile?.clearRecords?.[previous] || []).size;
  return { unlocked:completed >= required, previousId:previous, required, completed,
    reason:completed >= required ? '' : stage > 1 ? '请先通关上一档绝境' : `需以10名不同武将通关对应难度5（${completed}/10）` };
}
function field(raw, name, difficulty) {
  if (!isDesperateDifficulty(difficulty)) return '';
  const suffix = Math.floor((valueId(difficulty) - 101) / 10) + 1;
  return String(raw?.[`${name}_JJ${suffix}`] || '');
}
/** JQ.parseJJListField + mergeJJList: collect reached adds/removals, then remove.
 * A later entry cannot re-add something removed by an earlier reached entry. */
export function applyDesperateList(list, raw, name, difficulty) {
  const id = valueId(difficulty), added = [], removed = new Set();
  for (const entry of field(raw, name, id).split(';')) {
    const [threshold, ...values] = entry.split(',');
    if (!values.length || !Number.isFinite(Number(threshold)) || Number(threshold) > id) continue;
    for (const value of values) {
      const removal = value.startsWith('_'), parsed = Number(removal ? value.slice(1) : value);
      if (Number.isFinite(parsed) && parsed > 0) { if (removal) removed.add(parsed); else added.push(parsed); }
    }
  }
  return list.concat(added).filter(id => !removed.has(id));
}
/** JQ.ExtraAttributeDesperate adds thresholded raw attributes after growth. */
export function desperateAttributes(raw, difficulty) {
  const id = valueId(difficulty), attributes = {};
  for (const entry of field(raw, 'att', id).split(';')) {
    const [threshold, key, value] = entry.split(',');
    if (!key || !Number.isFinite(Number(threshold)) || !Number.isFinite(Number(value)) || Number(threshold) > id) continue;
    attributes[key] = (attributes[key] || 0) + Number(value);
  }
  return attributes;
}
