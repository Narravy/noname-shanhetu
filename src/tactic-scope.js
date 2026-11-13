// hd_roguelike.json / Tactics.plotdesc: these effects belong to the start of an
// expedition, rather than the start of each battle. Keep their initial-loadout
// grants intact, but exclude later shop and reward offers after that trigger.
export const EXPEDITION_START_ONLY_TACTIC_IDS = Object.freeze([
  2112, 2139, 2140, 2141, // 家财万贯 I–IV：开始征程时获得铜币
  2219, 2220,             // 和光盟 I–II：开始征程时获得特殊队友
  2138,                   // 传承：开局三选一获得一次稀有技能
  2113, 2114,             // 蒲元之助 I–II：开始剧本时获得蒲元装备
]);

const expeditionStartOnly = new Set(EXPEDITION_START_ONLY_TACTIC_IDS);

export const isExpeditionStartOnlyTactic = id => expeditionStartOnly.has(Number(id));
