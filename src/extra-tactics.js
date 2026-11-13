import { lib, game, get, _status } from "noname";
import { rankTraits } from "./rank-traits.js";

const sameTeam = (owner, target) => target !== owner && target?.side === owner.side;
const enemy = (owner, target) => target && target !== owner && target.side !== owner.side;
const choose = values => values[Math.floor(Math.random() * values.length)];
const start = content => ({
	trigger: { global: "gameStart" },
	async content(event, trigger, player) {
		// A battle owns fresh actors. Replaying the startup event must not grant twice.
		const applied = player._shanhetuTacticStarts ||= new Set();
		const key = event.name || content;
		if (applied.has(key)) return;
		applied.add(key);
		await content(player);
	},
});
const damage = (num, filter = () => true) => ({ trigger: { source: "damageBegin1" }, filter, async content(event, trigger) { trigger.num += num; } });
const slash = num => ({ mod: { cardUsable(card, player, count) { if (card.name === "sha") return count + num; } } });
const draw = num => ({ trigger: { player: "phaseDrawBegin2" }, filter: event => !event.numFixed, async content(event, trigger) { trigger.num += num; } });
const openingDraw = num => start(async player => { await player.draw(num); });
const heal = num => ({ trigger: { player: "recoverBegin" }, async content(event, trigger) { trigger.num += num; } });

// hd_roguelike.plot.strpra -> sys_playcard.GamePlayCards (a=id, b=name,
// f=number, g=color). Keep every equally weighted physical card entry, including
// the diamond-A and club-A crossbows, with its original suit and point value.
const conjuredEquipment = {
	equip1: [
		[5, "贯石斧", "diamond", 5], [12, "方天画戟", "diamond", 12],
		[14, "诸葛连弩", "diamond", 1], [44, "麒麟弓", "heart", 5],
		[66, "诸葛连弩", "club", 1], [80, "雌雄双股剑", "spade", 2],
		[84, "青釭剑", "spade", 6], [96, "青龙偃月刀", "spade", 5],
		[103, "丈八蛇矛", "spade", 12], [108, "寒冰剑", "spade", 2],
		[122, "朱雀羽扇", "diamond", 1], [135, "古锭刀", "spade", 1],
	],
	equip2: [
		[67, "八卦阵", "club", 2], [107, "仁王盾", "club", 2],
		[136, "藤甲", "spade", 2], [148, "白银狮子", "club", 1],
		[313, "国风玉袍", "spade", 9], [315, "奇门八阵", "spade", 2],
	],
	equip5: [
		[319, "虚妄之冕", "club", 4], [4328, "束发紫金冠", "diamond", 1],
		[6009, "三略", "spade", 5], [6023, "天机图", "club", 12],
		[20826, "螭纹玉佩", "heart", 5], [20827, "平安符", "diamond", 13],
	],
};

function conjureEquipment(subtype) {
	return start(async player => {
		if (player.getEquips(subtype).length) return;
		// The independent 135-card pile deliberately contains no equipment.
		const definitions = Object.keys(lib.card).filter(name => lib.card[name]?.type === "equip" && lib.card[name].subtype === subtype && !lib.card[name].destroy);
		const choices = conjuredEquipment[subtype].map(([sourceId, label, suit, number]) => ({
			name: definitions.find(name => lib.translate[name] === label), sourceId, suit, number,
		})).filter(info => info.name && (!player.canEquip || player.canEquip(info.name)));
		if (!choices.length) return;
		const selected = choose(choices);
		const card = game.createCard(selected.name, selected.suit, selected.number);
		card._shanhetuSourceCardId = selected.sourceId;
		card.destroyed = (card, position) => position === "discardPile" || position === "cardPile";
		await player.equip(card);
	});
}

function firstTricks(count) {
	return {
		trigger: { player: "useCard" },
		filter(event, player) {
			const index = player.getHistory("useCard", item => get.type2(item.card) === "trick").indexOf(event);
			return get.type2(event.card) === "trick" && Boolean(get.tag(event.card, "damage")) && index >= 0 && index < count;
		},
		async content(event, trigger) { trigger.baseDamage = (trigger.baseDamage ?? 1) + 1; },
	};
}

function logistics(loss, bonus) {
	return {
		...start(async player => {
			const spec = player._shanhetuSpec;
			if (spec) spec.initialDraw = Math.max(0, (spec.initialDraw ?? spec.stats?.initialDraw ?? spec.startingCards ?? (spec.cards?.length ? 0 : 4)) - loss);
		}),
		group: `sht_tactic_${loss === 1 ? 2159 : bonus === 1 ? 2160 : 2161}_draw`,
		subSkill: { draw: { forced: true, ...draw(bonus) } },
	};
}

function bossOpening(num) {
	return start(async player => { if (player._shanhetuSpec?.boss) await player.draw(num); });
}

function supplyOpening(divisor) {
	return start(async player => {
		const num = Math.floor((player._shanhetuSpec?.cards?.length || 0) / divisor);
		if (num) await player.draw(num);
	});
}

function openingThunder(num) {
	return start(async player => {
		for (const target of [...game.players]) {
			if (!target.isIn || target.isIn()) await target.damage(num, "thunder", player);
		}
	});
}

function roundSlash(firstOnly) {
	return {
		trigger: { player: "useCard" },
		filter(event, player) {
			return event.card?.name === "sha" && game.roundNumber > 1 && (!firstOnly || player.getRoundHistory("useCard", item => item.card?.name === "sha").indexOf(event) === 0);
		},
		async content(event, trigger) { trigger.baseDamage = (trigger.baseDamage ?? 1) + game.roundNumber - 1; },
	};
}

function convertDamage(id, cardFilter) {
	return {
		// Resolve after offensive/defensive damage modifiers, before armor/HP loss.
		trigger: { source: "damageBegin4" }, priority: -10,
		filter(event, player) { return event.num > 0 && cardFilter(event.card) && player.storage[id] !== game.roundNumber; },
		async content(event, trigger, player) {
			player.storage[id] = game.roundNumber;
			trigger.cancel();
			await trigger.player.loseMaxHp(trigger.num);
		},
		onremove(player) { delete player.storage[id]; },
	};
}

function reverseJudge(cardName) {
	return {
		trigger: { player: "judgeBefore" },
		filter(event) { return event.cardname === cardName && !event._shanhetuReversedJudge; },
		async content(event, trigger) {
			if (trigger._shanhetuReversedJudge) return;
			trigger._shanhetuReversedJudge = true;
			const original = trigger.judge;
			trigger.judge = function (...args) { return -original.apply(this, args); };
		},
	};
}

function luckyNumber(number) {
	return {
		trigger: { player: "gainAfter" },
		filter(event) { return event.getParent()?.name === "draw" && event.cards.some(card => get.number(card) === number); },
		async content(event, trigger, player) {
			const count = trigger.cards.filter(card => get.number(card) === number).length;
			if (count) await player.draw(count);
		},
	};
}

function shareInitialTraits() {
	return start(async player => {
		const rank = Math.max(3, Math.min(5, Math.trunc(Number(player._shanhetuSpec?.rank) || 1)));
		const bonuses = rankTraits(rank);
		for (const ally of game.players.filter(target => sameTeam(player, target))) {
			// This is a shared rank package, not another copy for every provider.
			// Actors and their specs are rebuilt for the next encounter.
			const previousRank = ally._shanhetuSharedTraitRank || 1;
			if (previousRank >= rank) continue;
			const previous = rankTraits(previousRank);
			ally._shanhetuSharedTraitRank = rank;
			const spec = ally._shanhetuSpec ||= {};
			const stat = (key, fallback) => Number.isFinite(spec[key]) ? spec[key] : Number.isFinite(spec.stats?.[key]) ? spec.stats[key] : fallback;
			spec.initialDraw = stat("initialDraw", stat("startingCards", spec.cards?.length ? 0 : 4)) + bonuses.startingCards - previous.startingCards;
			spec.draw = stat("draw", 2) + bonuses.draw - previous.draw;
			spec.slashCount = stat("slashCount", 1) + bonuses.slashCount - previous.slashCount;
			const hp = bonuses.hp - previous.hp;
			if (hp > 0) {
				await ally.gainMaxHp(hp);
				await ally.recover(hp);
			}
		}
	});
}

function refillHand(minimum) {
	return {
		trigger: {
			player: ["loseAfter", "gainAfter"],
			global: ["gameDrawAfter", "equipAfter", "addJudgeAfter", "loseAsyncAfter", "addToExpansionAfter"],
		},
		filter(event, player) {
			if (player.countCards("h") >= minimum) return false;
			if (event.name === "gameDraw" || event.player === player) return true;
			return Boolean(event.getl?.(player)?.hs?.length || event.getg?.(player)?.length);
		},
		async content(event, trigger, player) {
			const missing = minimum - player.countCards("h");
			if (missing > 0) await player.draw(missing);
		},
	};
}

const implementations = {
	2021: () => ({ mod: { canBeDiscarded(card, by, owner) { if (by !== owner && get.position(card) === "e") return false; } } }),
	2022: () => conjureEquipment("equip1"),
	2025: () => bossOpening(2),
	2026: () => bossOpening(3),
	2027: () => bossOpening(4),
	2050: () => ({
		trigger: { source: "damageSource" },
		filter(event, player) { return event.card?.name === "sha" && player.getRoundHistory("sourceDamage", item => item.card?.name === "sha").indexOf(event) === 0; },
		async content(event, trigger, player) { await player.draw(1); },
	}),
	2051: () => slash(1),
	2052: () => slash(3),
	2054: () => start(async player => { await player.gainMaxHp(1); await player.recover(1); }),
	2057: () => start(async player => { await player.gainMaxHp(1); await player.recover(1); }),
	2058: () => start(async player => { await player.gainMaxHp(1); await player.recover(1); }),
	2061: () => draw(1),
	2062: () => draw(1),
	2063: () => draw(1),
	2064: () => openingDraw(1),
	2065: () => openingDraw(2),
	2066: () => openingDraw(3),
	2067: () => openingDraw(1),
	2068: () => openingDraw(1),
	2074: () => start(async player => { await player.changeHujia(6); }),
	2075: () => start(async player => { await player.changeHujia(1); }),
	2105: () => openingThunder(1),
	2106: () => openingThunder(2),
	2123: () => ({
		trigger: { target: "useCardToTarget" },
		filter(event, player) { return _status.currentPhase !== player && event.targets.length === 1 && get.type2(event.card) === "trick" && enemy(player, event.player) && event.player.countDiscardableCards(player, "he") > 0; },
		async content(event, trigger, player) { await trigger.player.randomDiscard({ num: 2, discarder: player, position: "he" }); },
	}),
	2134: () => ({ mod: { maxHandcard(player, count) { return count + 3; } } }),
	2159: () => logistics(1, 1),
	2160: () => logistics(2, 1),
	2161: () => logistics(2, 3),
	2165: () => ({ ...draw(1), filter(event, player) { return !event.numFixed && player.hp <= 5; } }),
	2168: () => ({ trigger: { source: "dieAfter" }, async content(event, trigger, player) { await player.recover(1); } }),
	2169: () => ({ trigger: { source: "dieAfter" }, async content(event, trigger, player) { await player.recover(2); } }),
	2170: () => ({ trigger: { source: "dieAfter" }, async content(event, trigger, player) { await player.recover(4); } }),
	2173: () => damage(3, event => !event.card && Boolean(game.findSkill(event))),
	2176: () => ({
		trigger: { player: "dyingAfter" },
		filter(event, player) { return player.hp > 0; },
		async content(event, trigger, player) {
			for (const target of game.players.filter(target => enemy(player, target))) await target.damage(3, player);
		},
	}),
	2178: () => ({ mod: { maxHandcard(player, count) { if (player._shanhetuSpec?.copper > 300) return count + 2; } } }),
	2179: () => start(async player => { if (player._shanhetuSpec?.copper > 500) await player.draw(2); }),
	2180: () => ({ ...draw(2), filter(event, player) { return !event.numFixed && player._shanhetuSpec?.copper > 700; } }),
	2181: () => damage(1, (event, player) => player._shanhetuSpec?.copper > 1000),
	2182: () => start(async player => { await player.recover(1); }),
	2183: () => ({
		trigger: { global: "phaseDrawBegin2" }, priority: -5,
		filter(event, player) { return !event.numFixed && event.num > 2 && enemy(player, event.player); },
		async content(event, trigger) { trigger.num = Math.max(2, trigger.num - 1); },
	}),
	2191: () => heal(1),
	2192: () => heal(2),
	2199: () => start(async player => { for (const ally of game.players.filter(target => sameTeam(player, target))) { await ally.gainMaxHp(3); await ally.recover(3); } }),
	2200: () => start(async player => { for (const ally of game.players.filter(target => sameTeam(player, target))) await ally.changeHujia(3); }),
	2201: () => ({ trigger: { global: "phaseDrawBegin2" }, filter(event, player) { return !event.numFixed && sameTeam(player, event.player); }, async content(event, trigger) { trigger.num += 2; } }),
	2202: () => start(async player => { for (const ally of game.players.filter(target => sameTeam(player, target))) await ally.draw(2); }),
	2203: () => ({
		trigger: { global: "roundStart" },
		filter(event, player) { return game.dead.some(target => sameTeam(player, target)); },
		async content(event, trigger, player) {
			// Restore the fallen ally in place; do not rebuild another actor or loadout.
			for (const ally of [...game.dead].filter(target => sameTeam(player, target))) await ally.reviveEvent(1);
		},
	}),
	2204: () => ({ mod: { cardUsable(card, player, count) { if (card.name === "sha") return count + 2 * game.players.filter(target => sameTeam(player, target)).length; } } }),
	2206: () => conjureEquipment("equip2"),
	2207: () => conjureEquipment("equip5"),
	2212: () => ({ mod: { selectTarget(card, player, range) { if (card.name === "juedou" && range[1] > 0) range[1] = Infinity; } } }),
	2222: () => supplyOpening(3),
	2223: () => supplyOpening(2),
	2224: () => supplyOpening(1),
	2226: () => ({ mod: { cardUsable(card, player, count) {
		if (card.name !== "sha") return;
		const spec = player._shanhetuSpec || {};
		return count + 2 * Math.max(0, (spec.skillSlots || 0) - (spec.extraSkillCount ?? spec.skills?.length ?? 0));
	} } }),
	2229: () => ({ trigger: { player: "phaseBegin" }, filter(event, player) { return player.hp > 4; }, async content(event, trigger, player) { await player.loseHp(1); await player.draw(1); } }),
	2231: () => refillHand(8),
	2232: () => ({ mod: { cardUsable(card) { if (card.name === "sha") return Infinity; } } }),
	2233: () => damage(1),
	2234: () => heal(1),
	2235: () => shareInitialTraits(),
	2236: () => ({
		trigger: { player: "dying" }, priority: 30, usable: 1,
		filter(event, player) { return player.hp <= 0; },
		async content(event, trigger, player) { await player.recover(1 - player.hp); },
	}),
	2237: () => roundSlash(false),
	2248: () => ({ trigger: { player: "useCard" }, filter(event) { return get.type(event.card) === "trick"; }, async content(event, trigger) { trigger.directHit.addArray(game.players); } }),
	2254: () => ({
		trigger: { player: "phaseBegin" },
		async content(event, trigger, player) {
			const gained = [];
			for (let i = 0; i < 4; i++) {
				const card = get.cardPile(card => get.type2(card) === "trick" && !gained.includes(card), undefined, "random");
				if (card) gained.push(card);
			}
			if (gained.length) await player.gain(gained, "gain2");
		},
	}),
	2255: () => roundSlash(true),
	2256: () => ({ trigger: { player: "phaseBegin" }, async content(event, trigger, player) { const card = get.cardPile(card => card.name === "wanjian"); if (card) await player.gain(card, "gain2"); } }),
	2257: () => ({ trigger: { player: "phaseBegin" }, async content(event, trigger, player) { const card = get.cardPile(card => card.name === "nanman"); if (card) await player.gain(card, "gain2"); } }),
	2300: () => convertDamage("sht_tactic_2300_round", card => card?.name === "sha"),
	2301: () => convertDamage("sht_tactic_2301_round", card => card && get.type2(card) === "trick"),
	2302: () => ({ mod: { globalFrom() { return -Infinity; } } }),
	2304: () => reverseJudge("lebu"),
	2305: () => reverseJudge("bingliang"),
	2306: () => ({ trigger: { global: "damageBegin1" }, filter(event, player) { return event.source !== event.player && enemy(player, event.source) && enemy(player, event.player); }, async content(event, trigger) { trigger.num++; } }),
	2307: () => ({
		trigger: { player: "compare", target: "compare" },
		filter(event, player) { return event.player !== player || !event.iwhile; },
		async content(event, trigger, player) {
			const key = trigger.player === player ? "num1" : "num2";
			trigger[key] = Math.min(13, trigger[key] + 3);
		},
	}),
	2309: () => damage(1, (event, player) => event.player.maxHp > player.maxHp),
	2310: () => start(async player => { await player.gainMaxHp(1); }),
	2311: () => start(async player => { await player.gainMaxHp(2); }),
	2312: () => firstTricks(1),
	2313: () => firstTricks(2),
	2314: () => ({
		trigger: { player: "recoverEnd" },
		filter(event, player) { return event.num > 0 && game.players.some(target => enemy(player, target)); },
		async content(event, trigger, player) { const target = choose(game.players.filter(target => enemy(player, target))); if (target) await target.damage(1, player); },
	}),
	2318: () => ({ trigger: { player: "dying" }, priority: 30, usable: 9, filter(event, player) { return player.hp <= 0; }, async content(event, trigger, player) { await player.recover(1); } }),
	2321: () => ({ ...heal(2), usable: 1 }),
	2322: () => ({ ...heal(2), usable: 2 }),
	2329: () => ({
		global: "sht_tactic_2329_global",
		subSkill: { global: { mod: { cardUsable(card, player, count) {
			if (card.name === "sha") return count + game.players.filter(owner => sameTeam(owner, player) && owner.hasSkill("sht_tactic_2329")).length;
		} } } },
	}),
	2363: () => ({
		trigger: { player: "useCard" },
		filter(event) { return get.type(event.card) === "trick" && Boolean(get.tag(event.card, "damage")); },
		async content(event, trigger) { trigger.effectCount = (trigger.effectCount ?? 1) + 1; },
	}),
	2364: () => ({
		trigger: { player: "phaseZhunbeiBegin" },
		filter(event, player) { return player.hp !== player.maxHp; },
		async content(event, trigger, player) { await player.changeHp(player.maxHp - player.hp); },
	}),
	2368: () => ({
		trigger: { player: "phaseBegin" },
		async content(event, trigger, player) { await player.loseHp(1); player.addTempSkill("sht_tactic_2368_slash", "phaseAfter"); },
		subSkill: { slash: { charlotte: true, ...slash(1) } },
	}),
};

for (let number = 1; number <= 13; number++) implementations[2267 + number] = () => luckyNumber(number);

/** Register isolated, source-ID keyed implementations; no existing zf_* skill is replaced. */
export function installExtraTactics(tactics) {
	const rarity = ["", "common", "rare", "epic", "legend", "legend"];
	const result = [];
	for (const source of tactics || []) {
		const createSkill = implementations[source.id];
		if (!createSkill) continue;
		const id = `sht_tactic_${source.id}`;
		if (!lib.zhanfa.get(id)) {
			lib.zhanfa.add({
				id, translate: source.name, info: source.description, rarity: rarity[source.rarity] || "common",
				skill: { charlotte: true, forced: true, ...createSkill() },
				card: { cardimage: "zf_erlianji", ai: { basic: { value: 7 } } },
			}, { id: "shanhetu", name: "山河图战法" });
			// Tactics are registered after the engine's normal skill-finalization pass.
			// Expand helpers/global mods now so their trigger hooks actually exist.
			game.finishSkill?.(id);
		}
		result.push({ id, sourceId: source.id, name: source.name, description: source.description, rarity: rarity[source.rarity] || "common" });
	}
	return result;
}
