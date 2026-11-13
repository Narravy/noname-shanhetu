import { lib, game, get } from "noname";

// Names and effect text are supplied by the OL catalog at registration time. The
// weapon ranges below are sys_playcard.GamePlayCards.card.h, not inferred from art.
export const EXTRA_CARD_DEFINITIONS = [
	{ name: "断魂", id: 20824, subtype: "equip1", range: 2, image: "qinggang", effect: "pierce" },
	{ name: "昆仑镜", id: 20825, subtype: "equip5", image: "muniu", effect: "mirror" },
	{ name: "铁甲胄", id: 20830, subtype: "equip2", image: "baiyin", effect: "sacrifice" },
	{ name: "暗器飞刃", id: 20829, subtype: "equip1", range: 5, image: "qilin", effect: "silence" },
	{ name: "小型连弩", id: 20791, subtype: "equip1", range: 1, image: "zhuge", effect: "crossbow" },
	{ name: "螭纹玉佩", id: 20826, subtype: "equip5", image: "muniu", effect: "jade" },
	{ name: "平安符", id: 20827, subtype: "equip5", image: "muniu", effect: "talisman" },
	{ name: "无双方天戟", id: 20301, subtype: "equip1", range: 4, image: "fangtian", effect: "halberd" },
	{ name: "束发紫金冠", id: 20302, subtype: "equip5", image: "muniu", effect: "crown" },
	{ name: "红锦百花袍", id: 20303, subtype: "equip2", image: "tengjia", effect: "elementRobe" },
	{ name: "玲珑狮蛮带", id: 20304, subtype: "equip2", image: "bagua", effect: "belt" },
	{ name: "鬼龙斩月刀", id: 20306, subtype: "equip1", range: 3, image: "qinglong", effect: "redSlash" },
	{ name: "国风玉袍", id: 20307, subtype: "equip2", image: "renwang", effect: "trickRobe" },
	{ name: "赤炎镇魂琴", id: 20308, subtype: "equip1", range: 4, image: "zhuque", effect: "fire" },
	{ name: "奇门八阵", id: 20309, subtype: "equip2", image: "bagua", effect: "eightGates" },
	{ name: "虚妄之冕", id: 20313, subtype: "equip5", image: "muniu", effect: "drawCrown" },
	{ name: "三略", id: 20329, subtype: "equip5", image: "muniu", effect: "strategies" },
	{ name: "照骨镜", id: 20335, subtype: "equip5", image: "muniu", effect: "copyMirror" },
	{ name: "鸾凤和鸣剑", id: 20315, subtype: "equip1", range: 3, image: "cixiong", effect: "elementSword" },
	{ name: "镔铁双戟", id: 20322, subtype: "equip1", range: 3, image: "guanshi", effect: "ironHalberd" },
];

function armorWorks(event, player) {
	if (player.hasSkillTag("unequip2")) return false;
	const source = event.source || (event.player !== player ? event.player : null);
	return !source?.hasSkillTag("unequip", false, { name: event.card?.name, target: player, card: event.card });
}

function sealableSkills(target) {
	return target.getSkills(null, false, false).filter(id => {
		const info = lib.skill[id];
		return info && !info.charlotte && !info.equipSkill && !get.is.locked(id, target);
	});
}

function namedEquipment(player, name) {
	return player.getCards("e", card => lib.translate[get.name(card)] === name);
}

const temporarySkills = {
	sht_card_20825_ward: {
		charlotte: true, forced: true, popup: false,
		trigger: { player: "damageBegin4" },
		filter(event, player) { return event.card && get.type2(event.card) === "trick" && (player.storage.sht_card_20825_names || []).includes(get.name(event.card)); },
		async content(event, trigger) { trigger.cancel(); },
		mark: true, marktext: "镜", intro: { content(storage, player) { return "防止以下锦囊造成的伤害：" + (player.storage.sht_card_20825_names || []).map(name => get.translation(name)).join("、"); } },
	},
	sht_card_20830_ward: {
		charlotte: true, forced: true, popup: false, mark: true, marktext: "胄",
		intro: { content: "本回合防止受到的伤害" },
		trigger: { player: "damageBegin4" },
		async content(event, trigger) { trigger.cancel(); },
	},
	sht_card_20829_used: { charlotte: true, onremove: true },
	sht_card_20829_disabled: {
		charlotte: true, mark: true, marktext: "封",
		intro: { content: "部分非锁定技失效，直到自己的回合结束" },
		onremove(player) { player.enableSkill("sht_card_20829_disabled"); },
	},
	sht_card_20322_bonus: {
		charlotte: true, onremove: true,
		mod: { cardUsable(card, player, count) { if (card.name === "sha") return count + (player.storage.sht_card_20322_bonus || 0); } },
	},
};

const factories = {
	pierce: () => ({
		forced: true, trigger: { source: "damageBegin1" },
		async content(event, trigger) { trigger.nohujia = true; },
	}),
	mirror: () => ({
		forced: true, trigger: { player: "damageEnd" },
		filter(event) { return event.card && get.type2(event.card) === "trick"; },
		async content(event, trigger, player) {
			const names = player.storage.sht_card_20825_names ||= [];
			const name = get.name(trigger.card);
			if (!names.includes(name)) names.push(name);
			// The protection is explicitly for the remainder of this battle.
			player.addSkill("sht_card_20825_ward");
			player.markSkill("sht_card_20825_ward");
		},
	}),
	sacrifice: () => ({
		trigger: { player: "damageBegin4" },
		filter(event, player) { return (event.num > 1 || event.num >= player.hp + (event.nohujia || player.hasSkillTag("nohujia") ? 0 : player.hujia || 0)) && armorWorks(event, player) && namedEquipment(player, "铁甲胄").length > 0; },
		check(event, player) { return get.damageEffect(player, event.source, player, event.nature) < 0; },
		async content(event, trigger, player) {
			const card = namedEquipment(player, "铁甲胄")[0];
			if (!card) return;
			await player.loseToDiscardpile(card);
			if (player.getCards("e").includes(card)) return;
			player.addTempSkill("sht_card_20830_ward", { global: "phaseAfter" });
			trigger.cancel();
		},
	}),
	silence: () => ({
		forced: true, trigger: { source: "damageBegin1" },
		filter(event, player) { return event.player !== player && !(player.storage.sht_card_20829_used || []).includes(event.player.playerid) && sealableSkills(event.player).length > 0; },
		async content(event, trigger, player) {
			const target = trigger.player, skills = sealableSkills(target);
			if (!skills.length) return;
			const skill = skills.randomGet();
			player.addTempSkill("sht_card_20829_used", { global: "phaseAfter" });
			(player.storage.sht_card_20829_used ||= []).push(target.playerid);
			target.addTempSkill("sht_card_20829_disabled", { player: "phaseAfter" });
			target.disableSkill("sht_card_20829_disabled", skill);
			game.log(target, "的技能", "#g【" + get.translation(skill) + "】", "失效直到其回合结束");
		},
	}),
	crossbow: () => ({ mod: { cardUsable(card, player, count) { if (card.name === "sha") return count + 1; } } }),
	jade: () => ({
		forced: true, trigger: { player: ["phaseUseEnd", "phaseDrawBegin2"] },
		filter(event, player) { return event.name === "phaseUse" ? player.isDamaged() : !event.numFixed && !player.isDamaged(); },
		async content(event, trigger, player) { if (trigger.name === "phaseUse") await player.recover(1); else trigger.num += 2; },
	}),
	talisman: () => ({
		forced: true, trigger: { player: "phaseDrawBegin2" },
		filter(event, player) { return !event.numFixed && player.stat.some(turn => turn.kill > 0); },
		async content(event, trigger, player) { trigger.num += player.stat.reduce((sum, turn) => sum + (turn.kill || 0), 0); },
	}),
	halberd: () => ({
		trigger: { source: "damageSource" },
		filter(event) { return event.card?.name === "sha"; },
		check: () => true,
		async content(event, trigger, player) {
			const target = trigger.player;
			let discard = false;
			if (target.isIn() && player.canDiscard(target, "he")) {
				const result = await player.chooseControl("摸一张牌", "弃置其一张牌").set("ai", () => get.attitude(player, target) < 0 && target.countCards("e") > 0 ? 1 : 0).forResult();
				discard = result.index === 1;
			}
			if (discard) await player.discardPlayerCard(target, "he", true);
			else await player.draw(1);
		},
	}),
	crown: () => ({
		direct: true, trigger: { player: "phaseZhunbeiBegin" },
		async content(event, trigger, player) {
			const result = await player.chooseTarget("束发紫金冠：是否对一名其他角色造成1点伤害？", (card, owner, target) => owner !== target).set("ai", target => get.damageEffect(target, player, player)).forResult();
			if (result.bool) { player.logSkill("sht_card_20302_skill", result.targets); await result.targets[0].damage(1, player); }
		},
	}),
	elementRobe: () => ({
		forced: true, trigger: { player: "damageBegin4" },
		filter(event, player) { return game.hasNature(event) && armorWorks(event, player); },
		async content(event, trigger) { trigger.cancel(); },
	}),
	belt: () => ({
		trigger: { target: "useCardToTargeted" },
		filter(event, player) { return event.player !== player && event.targets.length === 1 && armorWorks(event, player); },
		check(event, player) { return get.effect(player, event.card, event.player, player) < 0; },
		async content(event, trigger, player) {
			const result = await player.judge(card => get.suit(card) === "heart" ? 2 : -1).forResult();
			if (result.bool) trigger.getParent().excluded.add(player);
		},
	}),
	redSlash: () => ({
		forced: true, trigger: { player: "useCardToPlayered" },
		filter(event, player) { return event.card.name === "sha" && get.color(event.card, player) === "red"; },
		async content(event, trigger) { trigger.getParent().directHit.add(trigger.target); },
	}),
	trickRobe: () => ({
		mod: { targetEnabled(card, source, target) { if (source !== target && get.type(card) === "trick" && armorWorks({ player: source, card }, target)) return false; } },
	}),
	fire: () => ({
		forced: true, trigger: { source: "damageBegin1" }, priority: 5,
		async content(event, trigger) { game.setNature(trigger, "fire"); },
	}),
	eightGates: () => ({
		forced: true, trigger: { target: "shaBefore" },
		filter(event, player) { return armorWorks(event, player); },
		async content(event, trigger) { trigger.cancel(); },
	}),
	drawCrown: () => ({
		forced: true, trigger: { player: "phaseDrawBegin2" },
		filter(event) { return !event.numFixed; },
		async content(event, trigger) { trigger.num += 2; },
		mod: { maxHandcard(player, count) { return count - 1; } },
	}),
	strategies: () => ({
		mod: {
			attackRange(player, count) { return count + 1; },
			maxHandcard(player, count) { return count + 1; },
			cardUsable(card, player, count) { if (card.name === "sha") return count + 1; },
		},
	}),
	copyMirror: () => ({
		direct: true, trigger: { player: "phaseUseEnd" },
		filter(event, player) { return player.hasCard(card => ["basic", "trick"].includes(get.type(card)) && player.hasUseTarget({ name: get.name(card), nature: get.nature(card), isCard: true }), "h"); },
		async content(event, trigger, player) {
			const result = await player.chooseCard("h", "照骨镜：展示一张基本牌或普通锦囊牌，视为使用之", card => ["basic", "trick"].includes(get.type(card)) && player.hasUseTarget({ name: get.name(card), nature: get.nature(card), isCard: true }))
				.set("ai", card => player.getUseValue({ name: get.name(card), nature: get.nature(card), isCard: true })).forResult();
			if (!result.bool) return;
			const card = result.cards[0];
			player.logSkill("sht_card_20335_skill");
			await player.showCards(card, "照骨镜");
			await player.chooseUseTarget({ name: get.name(card), nature: get.nature(card), isCard: true }, true);
		},
	}),
	elementSword: () => ({
		trigger: { player: "useCardToPlayered" },
		filter(event) { return event.card.name === "sha" && (game.hasNature(event.card, "fire") || game.hasNature(event.card, "thunder")); },
		check(event, player) { return get.attitude(player, event.target) <= 0; },
		async content(event, trigger, player) {
			const target = trigger.target;
			const result = await target.chooseToDiscard("he", "鸾凤和鸣剑：弃置一张牌，否则令" + get.translation(player) + "摸一张牌")
				.set("ai", card => get.attitude(target, player) > 0 ? -1 : 6 - get.value(card)).forResult();
			if (!result.bool) await player.draw(1);
		},
	}),
	ironHalberd: () => ({
		trigger: { player: ["shaMiss", "eventNeutralized"] },
		filter(event) { return event.card?.name === "sha" && !event.sht_card_20322_handled; },
		check(event, player) { return player.hp > 1 && (player.hp > 2 || player.hasCard(card => get.name(card) === "tao", "h")); },
		async content(event, trigger, player) {
			trigger.sht_card_20322_handled = true;
			await player.loseHp(1);
			if (!player.isIn()) return;
			const cards = (trigger.cards || trigger.card.cards || []).filter(card => ["o", "d"].includes(get.position(card, true)));
			if (cards.length) await player.gain(cards, "gain2");
			await player.draw(1);
			player.addTempSkill("sht_card_20322_bonus", { global: "phaseAfter" });
			player.storage.sht_card_20322_bonus = (player.storage.sht_card_20322_bonus || 0) + 1;
		},
	}),
};

/** Register only missing OL equipment; preserve all native card and skill definitions. */
export function installExtraCards(catalog) {
	const sources = [
		...(catalog.cards || []).map(card => ({ ...card, id: Number(card.cardId) })),
		...(catalog.enemyReferences?.cards || catalog.references?.cards || []),
	].filter(card => card.id > 0);
	const installed = [];
	const skills = new Set();
	for (const definition of EXTRA_CARD_DEFINITIONS) {
		if (Object.keys(lib.card).some(id => !id.startsWith("sht_card_") && lib.translate[id] === definition.name)) continue;
		const variants = sources.filter(card => card.name === definition.name);
		if (!variants.length) continue;
		const skillId = `sht_card_${definition.id}_skill`;
		if (!lib.skill[skillId]) {
			lib.skill[skillId] = { equipSkill: true, ...factories[definition.effect]() };
			lib.translate[skillId] = definition.name;
			lib.translate[skillId + "_info"] = variants[0].description;
			skills.add(skillId);
		}
		for (const source of variants) {
			const id = `sht_card_${source.id}`;
			if (installed.some(item => item.id === id)) continue;
			if (!lib.card[id]) {
				lib.card[id] = {
					fullskin: true, cardimage: lib.card[definition.image] ? definition.image : definition.subtype === "equip2" ? "bagua" : "zhuge",
					type: "equip", subtype: definition.subtype, skills: [skillId],
					...(definition.range ? { distance: { attackFrom: 1 - definition.range } } : {}),
					ai: { equipValue: definition.subtype === "equip2" ? 7 : 6 },
					shtOriginalCardId: source.id,
				};
				lib.translate[id] = definition.name;
				lib.translate[id + "_info"] = source.description;
				game.finishCard(id);
			}
			installed.push({ id, sourceId: source.id, name: definition.name, description: source.description, skillId });
		}
	}
	for (const [id, skill] of Object.entries(temporarySkills)) {
		if (lib.skill[id]) continue;
		lib.skill[id] = skill;
		skills.add(id);
	}
	for (const id of skills) game.finishSkill(id);
	return installed;
}
