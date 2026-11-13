import { lib, game, ui, get, _status } from "noname";
import { createShanhetuDeck } from "./deck.js";
import { installBattleCardArt } from "./battle-card-art.js";
import { createMutationSkills } from "./mutation-battle.js";

const MODE = "shanhetu";
const CAMP = { friend: "sht_friend", enemy: "sht_enemy" };

export const TERRAIN_DEFINITIONS = {
	13273: { skill: "sht_highland", name: "高山", description: "回合结束时，流失1点体力" },
	13274: { skill: "sht_forest", name: "密林", description: "出牌阶段最多使用10张牌" },
	13275: { skill: "sht_plain", name: "平原", description: "出杀限制次数+1" },
	13276: { skill: "sht_river", name: "河流", description: "手牌上限至多为8" },
	13277: { skill: "sht_city", name: "城池", description: "与其他角色距离-1" },
	13278: { skill: "sht_battlefield", name: "战场", description: "摸牌阶段摸牌+2" },
};

function actorStat(actor, name, fallback) {
	const value = actor[name] ?? actor.stats?.[name];
	return Number.isFinite(value) ? value : fallback;
}

/** The catalog is read from this installation, so added/removed native tactics are respected. */
export function getNativeTacticsCatalog() {
	return (lib.zhanfa?.getList(true) || []).map(id => ({
		id,
		name: lib.translate[id] || id,
		description: lib.translate[`${id}_info`] || "",
		rarity: lib.zhanfa.getRarity(id, true),
	}));
}

export function validateBattleSpec(spec) {
	if (!spec || !spec.player || !Array.isArray(spec.enemies) || !spec.enemies.length) {
		throw new Error("关卡缺少主将或敌军，无法开始战斗。");
	}
	if (1 + (spec.allies?.length || 0) + spec.enemies.length > 16) {
		throw new Error("此关卡超过十六个座位，无法开始战斗。");
	}
	for (const actor of [spec.player, ...(spec.allies || []), ...spec.enemies]) {
		if (!actor || !actor.character) throw new Error("关卡存在未指定武将的角色。");
		for (const key of ["hp", "maxHp"]) {
			const value = actor[key] ?? actor.stats?.[key];
			if (value != null && (!Number.isFinite(value) || value <= 0)) {
				throw new Error(`武将 ${actor.character} 的${key === "hp" ? "体力" : "体力上限"}无效。`);
			}
		}
	}
	return spec;
}

function createStartingCard(info) {
	const data = typeof info === "string" ? { name: info } : info;
	if (!data || !lib.card[data.name]) return null;
	const card = game.createCard(data.name, data.suit || "spade", data.number || 1, data.nature);
	// The expedition supplies these cards again in the next encounter; they must not join
	// the ordinary discard/reshuffle cycle, but may still be used, equipped or transferred.
	card.destroyed = (card, position) => position === "discardPile" || position === "cardPile";
	card._shanhetuStartingCard = true;
	return card;
}

function installBattleDeck(spec) {
  const cards = spec.deck ? spec.deck.map(card => [...card]) : createShanhetuDeck();
	const missing = [...new Set(cards.map(card => card[2]))].filter(name => !lib.card[name]);
	if (missing.length) throw new Error("山河图牌堆所需卡牌未载入：" + missing.map(name => lib.translate[name] || name).join("、"));
	// The engine otherwise filters banned cards even for a fixed pile. Its
	// replacement marker keeps all 135 cards without changing the user's bans.
	for (const card of cards) card._replaced = true;
	lib.card.list = cards;
	lib.inpile = [];
	lib.inpile_nature = [];
	game.fixedPile = true;
}

function registerActor(spec, index) {
	if (lib.character[spec.character]) return spec.character;
	// An explicitly described NPC does not need an unrelated playable general as a substitute.
	const id = `sht_npc_${index}`;
	const tags = spec.portrait ? [`img:${spec.portrait}`] : ["img:image/character/default_silhouette_male.jpg"];
	lib.character[id] = [spec.sex || "male", spec.group || "qun", actorStat(spec, "maxHp", actorStat(spec, "hp", 4)), [], tags];
	lib.translate[id] = spec.title || spec.character;
	return id;
}

function initializeActor(player, spec, index, side) {
	const character = registerActor(spec, index);
	player.getId();
	player.init(character);
	if (spec.replaceSkills) player.clearSkills(true);
	else for (const skill of spec.removedSkills || []) player.removeSkill(skill);
	player.side = side;
	player.identity = side ? CAMP.friend : CAMP.enemy;
	player.identityShown = true;
	player.ai.shown = 1;
	player.setIdentity(player.identity, side ? "wei" : "qun");
	player.setSeatNum(index + 1);
	player._shanhetuSpec = spec;
	player.maxHp = actorStat(spec, "maxHp", player.maxHp);
	player.hp = Math.min(actorStat(spec, "hp", player.maxHp), player.maxHp);
	player._shanhetuBaseMaxHp = player.maxHp;
	player.hujia = Math.max(0, actorStat(spec, "armor", player.hujia || 0));
	player.addSkill("sht_encounter_stats");
	if (spec.rebirthAvailable) player.addSkill("sht_rebirth");
	if (spec.title) player.node.name.textContent = spec.title;
	if (spec.portrait) player.node.avatar.setBackgroundImage(spec.portrait);
	for (const skill of spec.skills || []) {
		if (lib.skill[skill]) player.addSkill(skill);
		else console.warn("[山河图] 当前安装缺少武将技能：", skill);
	}
	for (const tactic of spec.tactics || []) {
		if (lib.zhanfa?.get(tactic)) player.addZhanfa(tactic);
		else console.warn("[山河图] 当前安装缺少战法：", tactic);
	}
	const equipment = (spec.equips || []).map(createStartingCard).filter(Boolean);
	if (equipment.length) player.directequip(equipment);
	player.update();
}

function showBattleDescription(spec) {
	const panel = document.createElement("div");
	panel.className = "sht-battle-description";
	Object.assign(panel.style, {
		position: "absolute", top: "48px", left: "50%", transform: "translateX(-50%)",
		width: "max-content", height: "auto", maxWidth: "56%", padding: "7px 16px", borderRadius: "8px", zIndex: "3",
		background: "rgba(24,21,17,.85)", color: "#efddad", textAlign: "center",
		fontSize: "14px", pointerEvents: "none", lineHeight: "1.5", whiteSpace: "normal", writingMode: "horizontal-tb",
	});
	const title = document.createElement("div");
	Object.assign(title.style, { position: "relative", display: "block", width: "auto", height: "auto", whiteSpace: "nowrap" });
	title.textContent = spec.title || "山河图战役";
	panel.appendChild(title);
	if (spec.terrain?.name) {
		const field = document.createElement("div");
		field.textContent = `${spec.terrain.name}${spec.terrain.description ? " · " + spec.terrain.description : ""}`;
		field.style.fontSize = "12px";
		Object.assign(field.style, { position: "relative", display: "block", width: "auto", height: "auto", whiteSpace: "normal" });
		panel.appendChild(field);
	}
	ui.arena.appendChild(panel);
	return panel;
}

function installTerrain(spec) {
	if (!spec.terrain) return;
	const input = typeof spec.terrain === "object" ? spec.terrain : { id: spec.terrain };
	const terrain = { ...TERRAIN_DEFINITIONS[input.id], ...input };
	spec.terrain = terrain;
	for (const skill of [terrain.skill, ...(terrain.skills || [])]) {
		if (!skill || !lib.skill[skill]) continue;
		for (const player of game.players) player.addSkill(skill);
	}
}

const terrainSkills = {
	sht_rebirth: {
		charlotte: true, forced: true, priority: 20,
		trigger: { player: "dying" },
		filter(event, player) { return player.hp <= 0 && player._shanhetuSpec?.rebirthAvailable && !player._shanhetuRebirthUsed; },
		async content(event, trigger, player) {
			const choice = await player.chooseBool("是否发动重生？弃置判定区的牌、复原武将牌，将手牌摸至5、体力回复至5。每场征程限一次。")
				.set("ai", () => true).forResult();
			if (!choice.bool) return;
			player._shanhetuRebirthUsed = true;
			const judges = player.getCards("j");
			if (judges.length) await player.discard(judges);
			if (player.isTurnedOver()) await player.turnOver(false);
			if (player.isLinked()) await player.link(false);
			await player.recover(Math.max(0, Math.min(5, player.maxHp) - player.hp));
			if (player.countCards("h") < 5) await player.draw(5 - player.countCards("h"));
		},
	},
	sht_highland: {
		charlotte: true, forced: true,
		trigger: { player: "phaseEnd" },
		async content(event, trigger, player) { await player.loseHp(1); },
	},
	sht_forest: {
		charlotte: true,
		mod: {
			cardEnabled(card, player) {
				if (!player.isPhaseUsing()) return;
				const phase = _status.event.getParent("phaseUse", true, true);
				if (player.getHistory("useCard", entry => entry.getParent("phaseUse") === phase).length >= 10) return false;
			},
		},
	},
	sht_plain: {
		charlotte: true,
		mod: { cardUsable(card, player, count) { if (card.name === "sha") return count + 1; } },
	},
	sht_river: {
		charlotte: true, priority: 100,
		mod: { maxHandcardFinal(player, count) { return Math.min(8, count); } },
	},
	sht_city: {
		charlotte: true,
		mod: { globalFrom(from, to, distance) { return distance - 1; } },
	},
	sht_battlefield: {
		charlotte: true, forced: true,
		trigger: { player: "phaseDrawBegin2" },
		filter(event) { return !event.numFixed; },
		async content(event, trigger) { trigger.num += 2; },
	},
	sht_encounter_stats: {
		charlotte: true, silent: true,
		trigger: { player: "phaseDrawBegin2", global: "roundStart", source: ["damageBegin1", "dieAfter"] },
		filter(event, player) {
			const actor = player._shanhetuSpec;
			if (!actor) return false;
			if (event.name === "phaseDraw") return !event.numFixed && actorStat(actor, "draw", 2) !== 2;
			if (event.name !== "damage" && event.name !== "die") return actorStat(actor, "armorGain", 0) > 0;
			if (event.name === "damage") return actorStat(actor, "damageBonus", 0) !== 0;
			return event.name === "die" && actorStat(actor, "killDraw", 0) > 0;
		},
		async content(event, trigger, player) {
			const actor = player._shanhetuSpec;
			if (trigger.name === "phaseDraw") trigger.num = Math.max(0, trigger.num + actorStat(actor, "draw", 2) - 2);
			else if (trigger.name !== "damage" && trigger.name !== "die") {
				const cap = actorStat(actor, "maxArmor", 0);
				await player.changeHujia(actorStat(actor, "armorGain", 0), "gain", cap > 0 ? cap : undefined);
			}
			else if (trigger.name === "damage") trigger.num += actorStat(actor, "damageBonus", 0);
			else if (trigger.name === "die") await player.draw(actorStat(actor, "killDraw", 0));
		},
		mod: {
			maxHandcard(player, count) { return count + actorStat(player._shanhetuSpec || {}, "handLimit", 0); },
			cardUsable(card, player, count) {
				if (card.name === "sha" && player._shanhetuSpec) return count + actorStat(player._shanhetuSpec, "slashCount", 1) - 1;
			},
		},
	},
};

function captureOutcome(runtime, won) {
	const snapshot = player => ({
		character: player._shanhetuSpec.character,
		hp: player.isAlive() ? Math.max(0, player.hp) : 0,
		maxHp: player.maxHp,
		startupMaxHpBonus: player._shanhetuStartupMaxHpBonus ?? player.maxHp - player._shanhetuBaseMaxHp,
		temporaryHpDelta: player._shanhetuSpec.temporaryHpDelta || 0,
		temporaryMaxHpDelta: player._shanhetuSpec.temporaryMaxHpDelta || 0,
	});
	return {
		id: runtime.spec.id,
		won: won === true,
		...snapshot(runtime.hero),
		allies: runtime.allies.map(player => {
			const saved = snapshot(player);
			const maxHp = Math.max(1, saved.maxHp - saved.startupMaxHpBonus - saved.temporaryMaxHpDelta);
			return { ...saved, groupId: player._shanhetuSpec.campaignAllyId, maxHp,
				hp: saved.hp > 0 ? Math.max(1, Math.min(maxHp, saved.hp - saved.temporaryHpDelta)) : 0 };
		}),
		rounds: Math.max(0, game.roundNumber || 0),
		rebirthUsed: Boolean(runtime.hero._shanhetuRebirthUsed),
		reason: runtime.retreat ? "retreat" : won === true ? "victory" : "defeat",
	};
}

function returnToCampaign() {
	game.saveConfig("mode", MODE);
	localStorage.setItem(lib.configprefix + "directstart", "true");
	game.reload();
}

/**
 * A fresh engine session hosts one encounter. The campaign persists its settlement before
 * the return button is enabled; reloading then clears all event, temporary-skill and AI state.
 * cards = fixed opening cards, initialDraw = additional random cards (defaults to 0 if fixed
 * cards exist, otherwise 4). enemyFirst may select the first enemy as the opening player.
 */
export function createBattleMode({ openCampaign, finishBattle }) {
  const mutations = createMutationSkills({ lib, game, get, ui, _status });
	let runtime = null;
	let cardArt = null;
	async function settle(won) {
		if (!runtime || runtime.settling) return;
		runtime.settling = true;
		cardArt?.dispose();
		const outcome = captureOutcome(runtime, won);
		runtime.retreatControl?.remove();
		if (ui.continue_game) {
			ui.continue_game.close();
			delete ui.continue_game;
		}
		if (ui.restart) ui.restart.replace("保存征程…", function () {});
		try {
			await finishBattle(outcome);
			if (ui.restart) ui.restart.replace("返回山河图", returnToCampaign);
			else ui.restart = ui.create.control("返回山河图", returnToCampaign);
		} catch (error) {
			console.error("[山河图] 战斗结算保存失败", error);
			runtime.settling = false;
			if (ui.restart) ui.restart.replace("重试保存征程", () => settle(won));
			window.alert("征程尚未保存，请点击“重试保存征程”。\n" + (error?.message || error));
		}
	}

	return {
		name: MODE,
		async start(event) {
			game.no_continue_game = true;
			lib.init.onfree();
			const spec = await openCampaign();
			if (!spec) return;
			validateBattleSpec(spec);
			const actors = [spec.player, ...(spec.allies || []), ...spec.enemies];
			// Install before prepareArena schedules the initial shuffle and draw.
			installBattleDeck(spec);
			cardArt?.dispose();
			cardArt = installBattleCardArt({ lib, game, get, ui }, new URL("../", import.meta.url).href);
			game.prepareArena(actors.length);
			game.me = game.players[0];
			game.zhu = game.me;
			_status.mode = MODE;
			_status.roundStart = game.me;
			_status.videoInited = true;
			runtime = {
				spec, hero: game.me, allies: game.players.slice(1, 1 + (spec.allies?.length || 0)),
				enemies: game.players.slice(1 + (spec.allies?.length || 0)), settling: false, retreat: false,
			};
			actors.forEach((actor, index) => initializeActor(game.players[index], actor, index, index <= (spec.allies?.length || 0)));
			installTerrain(spec);
			runtime.description = showBattleDescription(spec);
			runtime.retreatControl = ui.create.system("撤退", function () {
				if (!_status.over && window.confirm("确定撤退吗？本次战斗将按失败结算。")) {
					runtime.retreat = true;
					game.over(false);
				}
			}, true);
			game.addVideo("init", null, game.players.map(player => ({
				name: player.name, identity: player.identity, nickname: player._shanhetuSpec.title || "",
			})));
			game.syncState();
			await event.trigger("gameStart");
			for (const player of [...game.players, ...game.dead]) {
				player._shanhetuStartupMaxHpBonus = player.maxHp - player._shanhetuBaseMaxHp;
			}
			if (_status.over) return;
			await game.gameDraw(game.me, player => {
				const actor = player._shanhetuSpec;
				return Math.max(0, actorStat(actor, "initialDraw", actorStat(actor, "startingCards", actor.cards?.length ? 0 : 4)));
			});
			for (const player of game.players) {
				const cards = (player._shanhetuSpec.cards || []).map(createStartingCard).filter(Boolean);
				if (cards.length) player.directgain(cards);
				player._start_cards = player.getCards("h");
			}
			if (_status.over) return;
			const first = spec.firstActorRule === 'highestHp'
				? game.players.reduce((best, player) => player.hp > best.hp ? player : best, game.me)
				: game.players[spec.firstActorIndex] || (spec.enemyFirst ? runtime.enemies[0] : game.me);
			_status.roundStart = first;
			await game.phaseLoop(first);
		},
		game: {
			no_continue_game: true,
			checkResult() {
				if (!runtime || _status.over) return;
				if (!runtime.hero.isAlive()) game.over(false);
				else if (!game.players.some(player => player.side === false)) game.over(true);
			},
			checkOnlineResult(player) { return player.side === true; },
			onover(won) { return settle(won); },
			getVideoName() { return [get.translation(runtime?.hero?.name || ""), "山河图 · " + (runtime?.spec.title || "诸侯伐董")]; },
			showIdentity() {
				for (const player of [...game.players, ...game.dead]) player.setIdentity();
			},
		},
		element: {
			player: {
				dieAfter() { game.checkResult(); },
				showIdentity() { this.identityShown = true; this.ai.shown = 1; this.setIdentity(); },
			},
		},
		get: {
			attitude(from, to) {
				if (!from || !to) return 0;
				return (from._trueMe || from).side === (to._trueMe || to).side ? 10 : -10;
			},
			rawAttitude(from, to) {
				if (!from || !to) return 0;
				return from.side === to.side ? 10 : -10;
			},
		},
		skill: { ...terrainSkills, ...mutations.skill },
		translate: {
			...mutations.translate,
			[CAMP.friend]: "盟", [CAMP.enemy]: "敌", [`${CAMP.friend}2`]: "联军", [`${CAMP.enemy}2`]: "敌军",
			sht_rebirth: "重生", sht_rebirth_info: "每场征程限一次。当你进入濒死状态时，你可以弃置判定区的牌、复原武将牌，将手牌摸至5，将体力回复至5。",
			...Object.fromEntries(Object.values(TERRAIN_DEFINITIONS).flatMap(terrain => [[terrain.skill, terrain.name], [`${terrain.skill}_info`, terrain.description]])),
		},
	};
}
