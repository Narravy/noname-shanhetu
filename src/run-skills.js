// OL canChangeDefaultSkill / YI_WAWNG_JIE_KONG permits replacing a general's
// starting skills. Keep those slots separate from the expedition's extra slots.
export const ownedRewardSkillIds = run => [...(run?.skills || []), ...Object.values(run?.innateReplacements || {})];

export function getInnateSkillSlots(campaign, fallback = []) {
  const run = campaign.run;
  if (!run) return [];
  const source = campaign.storage.characterSkills?.(run.character) ?? fallback;
  return [...new Set(source)].map(nativeId => ({
    id: 'innate:' + nativeId, nativeId,
    rewardId: run.innateReplacements?.[nativeId],
    replaceable: run.tactics.includes(2221) || Object.hasOwn(run.innateReplacements || {}, nativeId),
  }));
}

export function grantRunSkill(campaign, id, replacement) {
  const run = campaign.run;
  if (ownedRewardSkillIds(run).includes(id)) throw new Error('已拥有此技能');
  if (typeof replacement === 'string' && replacement.startsWith('innate:')) {
    const slot = getInnateSkillSlots(campaign).find(slot => slot.id === replacement);
    if (!slot?.replaceable) throw new Error('当前不能替换此初始技能');
    run.innateReplacements ||= {};
    run.innateReplacements[slot.nativeId] = id;
    return;
  }
  if (run.skills.length >= run.skillSlots) {
    const index = Number(replacement);
    if (replacement === undefined || replacement === null || !Number.isInteger(index) || index < 0 || index >= run.skills.length) throw new Error('技能槽已满，请选择一个技能替换');
    run.skills[index] = id;
  } else run.skills.push(id);
}

export function validateRunSkills(campaign, run) {
  const replaced = run.innateReplacements;
  if (replaced === undefined) return;
  if (!replaced || Array.isArray(replaced) || typeof replaced !== 'object') throw new Error('初始技能替换记录无效');
  const originals = new Set(campaign.storage.characterSkills?.(run.character) || []);
  for (const [nativeId, rewardId] of Object.entries(replaced)) {
    if (!originals.has(nativeId) || !Number.isInteger(rewardId) || !campaign.catalog.indexes.skills.has(rewardId)) throw new Error('初始技能替换记录与武将不符');
  }
  const owned = ownedRewardSkillIds(run);
  if (new Set(owned).size !== owned.length) throw new Error('征程技能不能重复');
}

export function innateSkillsForView(view, hero) {
  if (view.campaign.run?.character !== hero?.id) return (hero?.skills || []).map(nativeId => ({
    nativeId, name: view.adapters.skillName(nativeId), description: view.adapters.skillDescription(nativeId), kind: 'skill',
  }));
  return getInnateSkillSlots(view.campaign, hero?.skills || []).map(slot => ({
    ...slot, kind: 'skill',
    ...(slot.rewardId ? { ...view.adapters.resolve('skill', slot.rewardId), nativeSlot: slot.nativeId } : {
      name: view.adapters.skillName(slot.nativeId), description: view.adapters.skillDescription(slot.nativeId),
    }),
  }));
}
