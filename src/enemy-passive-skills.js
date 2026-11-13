/** Enemy-only OL Rogue variants. No native player skill is replaced.
 * Source text: official cha_spell, IDs retained in every registered skill key.
 */
export function createEnemyPassiveSkills({ lib, game, get, _status, ui }) {
	const id = source => `sht_enemy_${source}`;
	const alive = () => (game.players || []).filter(player => !player.isIn || player.isIn());
	const foes = player => alive().filter(other => other !== player && other.side !== player.side);
	const allies = player => alive().filter(other => other !== player && other.side === player.side);
	const missingHp = player => Math.max(0, player.maxHp - player.hp);
	const round = () => Math.max(1, Number(game.roundNumber) || 1);
	const recoverableCards = event => (event.cards || []).filter(card => ['o', 'd'].includes(get.position(card, true)));
	const forcedDraw = count => ({
		trigger: { player: 'phaseDrawBegin2' }, forced: true,
		filter: event => !event.numFixed,
		async content(event, trigger, player) { trigger.num += count(player); },
	});
	const skill = {
		[id(887)]: {
			// cha_spellextend maps Rogue 酒池 to ZaiQi2019 (887), whose reveal
			// count is lost HP + 1, unlike ordinary ZaiQi (116).
			trigger: { player: 'phaseDrawBegin1' },
			filter(event, player) { return !event.numFixed && missingHp(player) > 0; },
			check(event, player) { return missingHp(player) >= 2 || player.countCards('h') >= 2; },
			async content(event, trigger, player) {
				trigger.changeToZero();
				const cards = get.cards(missingHp(player) + 1, true);
				// The engine's flash reveal moves these cards into ordering and
				// discards the unclaimed hearts when this skill finishes.
				const shown = (await player.showCards(cards, '再起', true)
					.set('delay_time', Math.min(4, cards.length)).forResult()).cards;
				const hearts = shown.filter(card => get.suit(card) === 'heart');
				const remaining = shown.filter(card => get.suit(card) !== 'heart');
				if (hearts.length) await player.recover(hearts.length);
				if (remaining.length) await player.gain(remaining, 'gain2');
			},
			ai: { threaten: 1.5 },
		},
		[id(14118)]: {
			locked: true,
			// The engine clamps ordinary distance to 1 after other modifiers/equipment.
			mod: { globalFrom() { return -Infinity; } },
		},
		[id(14130)]: {
			...forcedDraw(player => foes(player).length),
			mod: { maxHandcard(player, num) { return num + foes(player).length; } },
		},
		[id(14131)]: {
			mod: {
				cardUsable(card) { if (card.name === 'sha') return Infinity; },
				selectTarget(card, player, range) { if (card.name === 'sha' && range[1] !== -1) range[1] += 2; },
			},
		},
		[id(14136)]: {
			enable: 'phaseUse', usable: round,
			filterTarget(card, player, target) { return target !== player && player.canUse({ name: 'juedou', isCard: true }, target); },
			async content(event, trigger, player) { await player.useCard({ name: 'juedou', isCard: true }, event.target); },
			ai: { order: 8, result: { target(player, target) { return get.effect(target, { name: 'juedou' }, player, target); } } },
		},
		[id(14146)]: {
			...forcedDraw(() => alive().length),
			mod: { maxHandcardBase(player) { return player.maxHp; } },
		},
		[id(14162)]: {
			enable: 'chooseToUse', position: 'h', selectCard: 2, complexCard: true,
			viewAs: { name: 'wanjian' }, group: id('14162_exclude'),
			filterCard(card, player) {
				if (!ui) return false;
				const selected = ui.selected.cards;
				if (selected.length) return get.color(card, player) === get.color(selected[0], player);
				return player.getCards('h').some(other => other !== card && get.color(other, player) === get.color(card, player));
			},
			viewAsFilter(player) {
				const cards = player.getCards('h');
				return cards.some((card, index) => cards.slice(index + 1).some(other => get.color(card, player) === get.color(other, player)));
			},
			check(card) { return 7 - get.value(card); },
			ai: { order: 8 },
		},
		[id('14162_exclude')]: {
			trigger: { player: 'useCard2' }, direct: true, sourceSkill: id(14162),
			filter: event => event.card?.name === 'wanjian' && event.targets.length > 0,
			async content(event, trigger, player) {
				const result = await player.chooseTarget('乱击：可以令一名角色不成为此【万箭齐发】的目标', (card, owner, target) => trigger.targets.includes(target))
					.set('ai', target => -get.effect(target, trigger.card, player, player)).forResult();
				if (!result.bool || !result.targets?.length) return;
				const target = result.targets[0], index = trigger.targets.indexOf(target);
				if (index >= 0) { trigger.targets.splice(index, 1); player.logSkill(id(14162), target); }
			},
		},
		[id(14165)]: {
			trigger: { player: 'damageEnd' }, forced: true,
			filter(event, player) { return event.num > 0 && missingHp(player) > 0; },
			async content(event, trigger, player) { await player.recover(1); },
		},
		[id(14166)]: {
			trigger: { player: 'useCardToPlayered' },
			filter(event, player) { return event.card?.name === 'sha' && event.target !== player && event.target.countDiscardableCards(player, 'hej') > 0; },
			check(event, player) { return event.target.side !== player.side; },
			logTarget: 'target',
			async content(event, trigger, player) {
				const count = Math.min(Math.max(0, player.getAttackRange()), trigger.target.countDiscardableCards(player, 'hej'));
				if (count > 0) await player.discardPlayerCard(trigger.target, 'hej', count, true);
			},
		},
		[id(14170)]: {
			trigger: { player: 'useCard' }, forced: true,
			async content(event, trigger, player) { trigger.directHit.addArray(alive().filter(other => other !== player)); },
			ai: { directHit_ai: true },
		},
		[id(14171)]: {
			trigger: { player: 'damageBegin3', source: 'damageBegin1' }, forced: true,
			// The Rogue text says 最多, not 唯一最多: ties also qualify.
			filter(event, player) { return alive().every(other => other.countCards('h') <= player.countCards('h')); },
			async content(event, trigger) { trigger.num += round(); },
		},
		[id(14190)]: {
			enable: 'phaseUse', usable: 1,
			filter(event, player) { return alive().some(target => target !== player && target.hp > player.hp && player.canCompare(target)); },
			filterTarget(card, player, target) { return target !== player && target.hp > player.hp && player.canCompare(target); },
			async content(event, trigger, player) {
				const tiger = event.target;
				const comparison = await player.chooseToCompare(tiger).forResult();
				if (!comparison.bool) { await player.damage(1, tiger); return; }
				if (!alive().some(target => target !== tiger && tiger.inRange(target))) return;
				const result = await player.chooseTarget(true, '驱虎：选择其攻击范围内的一名角色', (card, owner, target) => target !== tiger && tiger.inRange(target))
					.set('ai', target => get.damageEffect(target, tiger, player)).forResult();
				const target = result.targets?.[0];
				if (target) await target.damage(Math.min(5, tiger.maxHp), tiger);
			},
			ai: { order: 8, result: { target(player, target) { return target.side === player.side ? -.1 : -1; } } },
		},
		[id(14192)]: {
			trigger: { player: 'damageEnd' }, forced: true,
			filter: event => event.num > 0,
			async content(event, trigger, player) { player.addMark('renjie', trigger.num * 4); },
			group: id('14192_discard'), marktext: '忍',
			intro: { content(storage, player) { return `共有${player.countMark('renjie')}枚“忍”`; } },
		},
		[id('14192_discard')]: {
			trigger: { player: 'loseAfter', global: 'loseAsyncAfter' }, forced: true, sourceSkill: id(14192),
			filter(event, player) {
				if (event.type !== 'discard' || event.getlx === false) return false;
				const phase = event.getParent('phaseDiscard');
				return phase?.name === 'phaseDiscard' && phase.player === player && event.getl(player)?.hs?.length > 0;
			},
			async content(event, trigger, player) { player.addMark('renjie', trigger.getl(player).hs.length * 4); },
		},
		[id(14193)]: {
			// Official DeriveSkills: 321,719,106,870,872,9019; the installed
			// jilue implements these revised ordinary skills, not Rogue 14194.
			shtDependencies: ['jilue', 'jilue_guicai', 'jilue_fangzhu', 'jilue_jizhi', 'jilue_zhiheng', 'jilue_wansha', 'rezhiheng', 'rewansha'],
			trigger: { player: 'phaseZhunbeiBegin' }, forced: true, juexingji: true,
			filter(event, player) { return !player.storage?.[id(14193)] && player.countMark('renjie') >= 4; },
			async content(event, trigger, player) {
				player.awakenSkill(id(14193));
				await player.addSkills('jilue');
			},
		},
		[id(14198)]: {
			trigger: { player: 'damageEnd' }, frequent: true,
			filter(event, player) { return event.num > 0 && (missingHp(player) > 0 || recoverableCards(event).length > 0); },
			async content(event, trigger, player) {
				const count = missingHp(player);
				if (count) await player.draw(count);
				const cards = recoverableCards(trigger);
				if (cards.length) await player.gain(cards, 'gain2');
			},
			ai: { maixie: true, maixie_hp: true },
		},
		[id(14200)]: {
			// All source enemy references pair this variant with spell 881 (HuaShenPo).
			shtDependencies: ['rehuashen'],
			trigger: { player: 'damageEnd' }, frequent: true,
			getIndex: event => event.num,
			filter(event, player) { return event.num > 0 && Boolean(player.storage?.rehuashen); },
			async content(event, trigger, player) { lib.skill.rehuashen.addHuashens(player, 3); },
		},
		[id(14203)]: {
			trigger: { player: 'phaseZhunbeiBegin' }, frequent: true,
			filter(event, player) { return missingHp(player) > 0; },
			async content(event, trigger, player) {
				const before = player.hp;
				await player.recover(missingHp(player));
				const restored = Math.max(0, player.hp - before);
				if (restored > 0) await player.draw(restored);
			},
		},
		[id(14204)]: {
			enable: ['chooseToUse', 'chooseToRespond'], position: 'hes', filterCard: true,
			viewAs: { name: 'sha' },
			viewAsFilter(player) { return player.countCards('hes') > 0; },
			prompt: '将一张牌当【杀】使用或打出',
			check(card) { const value = get.value(card); return _status.event?.name === 'chooseToRespond' ? 1 / Math.max(.1, value) : 5 - value; },
			mod: { targetInRange(card) { if (card.name === 'sha') return true; } },
			ai: { respondSha: true, skillTagFilter(player) { return player.countCards('hes') > 0; } },
		},
		[id(14210)]: {
			shtDependencies: ['benghuai', id(887)],
			enable: 'chooseToUse', position: 'hs',
			filterCard(card, player) { return get.color(card, player) === 'black'; },
			viewAs: { name: 'jiu' },
			viewAsFilter(player) { return player.countCards('hs', card => get.color(card, player) === 'black') > 0; },
			check(card) { return _status.event?.type === 'dying' ? 1 / Math.max(.1, get.value(card)) : 4 - get.value(card); },
			mod: { cardUsable(card) { if (card.name === 'jiu') return Infinity; } },
			group: id('14210_release'),
		},
		[id('14210_release')]: {
			trigger: { source: 'damageEnd' }, forced: true, sourceSkill: id(14210),
			filter(event, player) {
				return event.num > 0 && event.card?.name === 'sha' && event.getParent(2)?.jiu === true
					&& (player.hasSkill('benghuai') || !player.hasSkill(id(887)));
			},
			async content(event, trigger, player) {
				await player.removeSkills('benghuai');
				await player.addSkills(id(887));
			},
		},
		[id(14211)]: {
			trigger: { player: 'useCardToPlayered', target: 'useCardToTargeted' }, forced: true,
			filter(event) { return event.card?.name === 'sha' && event.player !== event.target; },
			async content(event, trigger, player) {
				const target = player === trigger.player ? trigger.target : player;
				const use = trigger.getParent();
				// Two owners of this same variant still require two dodges, not three.
				const processed = use._shtEnemyRoulinTargets ||= [];
				if (processed.includes(target.playerid)) return;
				processed.push(target.playerid);
				const args = (use.customArgs ||= {})[target.playerid] ||= {};
				args.shanRequired = typeof args.shanRequired === 'number' ? args.shanRequired + 1 : 2;
			},
		},
		[id(14212)]: {
			enable: 'phaseUse', usable: 1, position: 'he', filterCard: true, discard: false, lose: false, delay: false,
			filterTarget(card, player, target) { return player !== target; },
			async content(event, trigger, player) {
				const card = event.cards[0], target = event.target;
				const black = get.color(card, player) === 'black';
				await player.showCards(event.cards, '连诛');
				await player.give(event.cards, target);
				if (!black) return;
				const count = Math.max(0, target.hp);
				if (!count) return;
				const result = await target.chooseToDiscard('he', count, `连诛：弃置${count}张牌，或取消令其摸${count}张牌`).forResult();
				if (!result.bool) await player.draw(count);
			},
			check(card) { return (get.color(card) === 'black' ? 8 : 3) - get.value(card); },
			ai: { order: 6, result: { target(player, target) { return target.side === player.side ? 1 : -1; } } },
		},
		[id(14213)]: {
			shtDependencies: ['liuli'],
			trigger: { player: 'phaseJieshuBegin' }, forced: true,
			async content(event, trigger, player) {
				if (player.countCards('h') === 0) {
					const count = player.getHandcardLimit();
					if (count > 0) await player.draw(count);
				// addTempSkill preserves an existing permanent skill and renews an
				// existing temporary copy, as required by “直到你的下个回合”.
				} else player.addTempSkill('liuli', { player: 'phaseBegin' });
			},
		},
		[id(14214)]: {
			trigger: { player: 'damageEnd' }, forced: true, marktext: '怒', intro: { content: 'mark' },
			filter: event => event.num > 0,
			async content(event, trigger, player) {
				player.addMark(id(14214), 1);
				const count = Math.max(0, Number(trigger.source?.hp) || 0);
				if (count) await player.draw(count);
			},
			group: [id('14214_damage'), id('14214_clear')],
		},
		[id('14214_damage')]: {
			trigger: { source: 'damageBegin1' }, forced: true, sourceSkill: id(14214),
			filter(event, player) { return player.countMark(id(14214)) > 0; },
			async content(event, trigger, player) { trigger.num += player.countMark(id(14214)); },
		},
		[id('14214_clear')]: {
			trigger: { source: 'damageSource' }, forced: true, forceDie: true, popup: false, sourceSkill: id(14214),
			filter(event, player) { return event.num > 0 && player.countMark(id(14214)) > 0; },
			async content(event, trigger, player) { player.removeMark(id(14214), player.countMark(id(14214))); },
		},
		[id(14222)]: {
			trigger: { player: 'damageBegin4' }, forced: true,
			filter(event, player) { return allies(player).some(other => other.maxHp > player.maxHp); },
			async content(event, trigger) { trigger.cancel(); },
			group: id('14222_death'),
		},
		[id('14222_death')]: {
			trigger: { player: 'die' }, forced: true, forceDie: true, sourceSkill: id(14222),
			async content(event, trigger, player) { for (const target of allies(player)) if (!target.isIn || target.isIn()) await target.die(); },
		},
	};
	for (const [source, predicate, description] of [
		[14223, (card, player) => [1, 11, 12, 13].includes(get.number(card, player)), '字母点数的手牌视为【杀】'],
		[14224, (card, player) => get.color(card, player) === 'red', '红色手牌视为【杀】'],
	]) {
		const helper = id(`${source}_effect`);
		skill[id(source)] = {
			trigger: { player: 'die' }, forced: true, forceDie: true,
			async content(event, trigger, player) { for (const target of alive()) if (target !== player) target.addSkill(helper); },
		};
		skill[helper] = {
			charlotte: true, mark: true, marktext: '杀', intro: { content: description },
			mod: {
				cardname(card, player) { if (get.position(card) === 'h' && predicate(card, player)) return 'sha'; },
				cardnature(card, player) { if (get.position(card) === 'h' && predicate(card, player)) return false; },
			},
		};
	}
	for (const [source, kind] of [[14237, 'damage'], [14238, 'loseHp']]) {
		skill[id(source)] = {
			trigger: { player: 'phaseZhunbeiBegin' }, forced: true,
			async content(event, trigger, player) {
				const count = Math.max(1, Math.ceil((Number(player._shanhetuSpec?.difficultyGroup) || 1) / 2));
				const result = await player.chooseTarget(true, `${source === 14237 ? '哼将' : '哈将'}：选择一名角色`).set('ai', target => target.side !== player.side ? 10 : -10).forResult();
				const target = result.targets?.[0];
				if (!target) return;
				player.logSkill(id(source), target);
				if (kind === 'damage') await target.damage(count, player);
				else await target.loseHp(count);
				await player.recover(count);
			},
		};
	}
	return skill;
}
