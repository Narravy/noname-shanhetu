import { createExtraSkills } from './extra-skills.js';

/** Reward/general spell variants use their OL IDs without overwriting native skills. */
export function installExtraSkills(catalog, dependencies) {
  const { lib, game } = dependencies;
  const sources = new Map([
    ...(catalog.enemyReferences?.skills || []), ...(catalog.spells || []),
    ...(catalog.skills || []).map(skill => ({ ...skill, id: skill.spellId })),
  ].map(source => [Number(source.id), source]));
  const definitions = createExtraSkills(dependencies);
  const installed = [], skipped = [];
  const sourceFor = id => sources.get(Number(/^sht_skill_(\d+)/.exec(id)?.[1]));
  const available = (id, visiting = new Set()) => {
    if (lib.skill[id]) return true;
    if (!definitions[id] || !sourceFor(id) || visiting.has(id)) return false;
    const next = new Set(visiting).add(id);
    return (definitions[id].shtDependencies || []).every(key => available(key, next));
  };
  for (const [id, definition] of Object.entries(definitions)) {
    const sourceId = Number(/^sht_skill_(\d+)/.exec(id)?.[1]), source = sources.get(sourceId);
    if (!source) continue;
    const missing = (definition.shtDependencies || []).filter(key => !available(key));
    if (missing.length) { skipped.push({ id, sourceId, missing }); continue; }
    if (!lib.skill[id]) {
      lib.skill[id] = { ...definition, shtOriginalSpellId: sourceId };
      lib.translate[id] = source.name;
      lib.translate[id + '_info'] = definition.shtApproximate
        ? [definition.shtImplementedDescription || source.description?.split('###')[0] || '', ...(definition.shtUnsupportedEffects || []).map(text => '尚未接入：' + text)].join('<br>')
        : source.description?.split('###')[0] || '';
      lib.translate[id + '_bg'] ||= source.name?.slice(0, 1) || '技';
    }
    installed.push({ id, sourceId, name: source.name });
  }
  for (const { id } of installed) game.finishSkill?.(id);
  return { installed, skipped };
}
