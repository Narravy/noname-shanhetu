import { applyDesperateList, baseDifficultyId, desperateAttributes, isDesperateDifficulty } from './desperate.js';
/**
 * Port of the OL client's wBt.getEnemyGrowCnt and JQ difficulty-list methods.
 * Raw growdouble/diffdouble and Difficult.hprate/drawrate are deliberately not applied:
 * the current client display formula does not use them. Server-only hidden adjustments
 * are not invented here. Source: backups/shanhetu-work/assets/roguelike-models.json.
 */
const TIERS = ["PT", "ZD", "KN", "EM", "LY"];
const number = value => Number(value) || 0;
const configList = value => String(value || "").split(";").filter(Boolean);
const positiveIds = value => configList(value).map(Number).filter(value => value > 0);

function applyListPatch(list, value) {
	const added = [], removed = [];
	for (const item of configList(value)) {
		if (item.startsWith("_")) removed.push(Number(item.slice(1)));
		else if (Number(item) > 0) added.push(Number(item));
	}
	return list.concat(added).filter(id => !removed.includes(id));
}

export function enemyListAtDifficulty(raw, field, tier, chapter = 1, difficulty = 0) {
	let list = positiveIds(raw[field]);
	for (const suffix of TIERS.slice(0, tier)) list = applyListPatch(list, raw[`${field}_${suffix}`]);
	const chapterField = { getspell: "getspell", carddesc: "getcard", equip: "getequip" }[field];
	if (chapterField) {
		let chapterList = [];
		for (let i = 2; i <= Math.min(3, chapter); i++) chapterList = applyListPatch(chapterList, raw[`${chapterField}_${i}`]);
		list = list.filter(id => !chapterList.includes(id)).concat(chapterList);
	}
  if (['getspell','carddesc','equip'].includes(field)) list = applyDesperateList(list, raw, field, difficulty);
  return [...new Set(list)];
}

function attributesAtDifficulty(raw, tier) {
	const attributes = {};
	for (const suffix of TIERS.slice(0, tier)) {
		for (const item of configList(raw[`att_${suffix}`])) {
			const [key, value] = item.split(",");
			if (key && Number.isFinite(Number(value))) attributes[key] = number(attributes[key]) + Number(value);
		}
	}
	return attributes;
}

function clientRound(value) {
	return value >= 1 ? Math.floor(value) : value >= 0 ? Math.ceil(value) : Math.floor(value);
}

/** Returns the existing general shape with resolved stats, skills, tactics and fixed cards. */
export function growEnemy(general, run, difficulty, rules, options = {}) {
	const raw = general.raw || (rules.General || []).find(entry =>
		Number(entry.generalgroup) === Number(general.groupId) && Number(entry.generalID) === Number(general.generalId)
	) || general;
	const id = number(difficulty.id || run.difficulty || 1);
  const tier = number(difficulty.group || difficulty.bdif || Math.ceil(baseDifficultyId(id) / 5));
	const chapter = number(options.chapter || run.chapter || 1);
	const month = number(run.accday ?? run.totalMonths ?? run.month ?? 0);
	const count = Math.max(1, number(options.enemyCount || 1));
	const type = options.boss ? 1 : options.elite ? 2 : 3;
	const growth = (rules.EnemyGrowth || []).find(row => number(row.moon) === month && number(row.diffnum) === id)
		|| (rules.EnemyGrowth || []).find(row => number(row.moon) === month && number(row.diffnum) === 0) || {};
	const elapsed = number(options.elapsedSinceReveal || 0);
	const showGrowth = (rules.EnemyShow || []).find(row => number(row.moon) === elapsed) || {};
	const chapterGrowth = (rules.EnemyDiffGrowth || []).find(row => number(row.diffnum) === tier && number(row.chap) === chapter) || {};
	const countRates = (rules.EnemyNumGrowth || []).find(row => number(row.type) === type && number(row.num) === count) || {};
	const modifiers = difficulty.modifiers || difficulty;
	// 5058's public configuration names a stronger third chapter but supplies
	// no numeric server formula. Offline, apply the documented chapter growth
	// once more before the existing enemy-count scaling and rounding.
	const strongOpponent = !options.friend && chapter === 3 && [...(run.mutations || []), ...(run.fixedMutations || [])]
		.some(value => number(value?.id ?? value) === 5058);
	const extra = attributesAtDifficulty(raw, tier);
  const desperateExtra = desperateAttributes(raw, id);
  for (const [key, value] of Object.entries(desperateExtra)) extra[key] = number(extra[key]) + value;
	function stat(key, base, modifierKey = key) {
		let addition = number(growth[key]) + number(showGrowth[key]) + number(chapterGrowth[key]) + number(modifiers[modifierKey]);
		if (strongOpponent) addition += number(chapterGrowth[key]);
		if (key === "hp") addition += number(growth.hp1) / 100;
		if (key === "draw") addition += number(growth.draw1) / 100;
		const rate = countRates[key] == null ? 1 : number(countRates[key]) / 100;
		return Math.max(key === "hp" ? 1 : 0, number(base) + (options.friend ? 0 : clientRound(addition * rate)) + number(extra[key]));
	}
	const hp = stat("hp", raw.hp ?? general.stats?.hp ?? 4);
	const baseHp = number(raw.hp ?? general.stats?.hp ?? 4);
	const baseMaxHp = number(raw.maxhp ?? general.stats?.maxHp ?? baseHp);
	const stats = {
		hp, maxHp: Math.max(hp, baseMaxHp + hp - baseHp),
		armor: stat("armor", raw.armor), armorGain: stat("getarmor", raw.getarmor),
		maxArmor: number(raw.maxarmor), draw: stat("draw", raw.draw ?? 2),
		startingCards: stat("cardnum", raw.cardnum ?? 4),
		slashCount: 1 + stat("exshatimes", raw.exshatimes, "skill"),
		damageBonus: stat("otherad", raw.otherad), killDraw: options.friend ? 0 : number(modifiers.killGetCard),
	};
  const skillIds = enemyListAtDifficulty(raw, "getspell", tier, chapter, id);
  const tacticIds = enemyListAtDifficulty(raw, "getzhanfa", tier, chapter, id);
  const cardIds = enemyListAtDifficulty(raw, "carddesc", tier, chapter, id);
  const equipIds = enemyListAtDifficulty(raw, "equip", tier, chapter, id);
	return {
		...general, raw, stats,
		skills: skillIds.map(id => ({ id, difficulty: "已按当前难度解析" })),
		tactics: tacticIds.map(id => ({ id })),
		cards: cardIds.map(id => ({ id, equipment: false })).concat(equipIds.map(id => ({ id, equipment: true }))),
		growth: { month, difficulty: id, tier, chapter, enemyCount: count, type, ...(isDesperateDifficulty(id) ? { desperate:true, baseDifficulty:baseDifficultyId(id) } : {}), ...(strongOpponent ? { strongOpponent:true } : {}), source: strongOpponent ? "OL客户端属性展示公式；强劲对手追加一份章节成长（本地规则）" : "OL客户端属性展示公式" },
	};
}
