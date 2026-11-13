// The public client omits the refined-effect table. These effect adapters follow
// the supplied trait reference video's descriptions; the local catalog records
// their provenance. No native character or other game mode is modified here.
const number = value => Number(value) || 0;
const normalized = value => String(value || '').replace(/<[^>]*>/g, '').replace(/\s/g, '').replace(/[【】「」]/g, '').replace(/[，；：]/g, ',').replace(/每一轮/g, '每轮');
const limitFrom = text => {
  let match = text.match(/每(回合|轮|局(?:游戏)?)限(?:制)?(\d+)次/);
  if (match) return { period: match[1].startsWith('局') ? 'battle' : match[1] === '轮' ? 'round' : 'turn', limit: number(match[2]) };
  if (/每轮(?:限)?一次/.test(text)) return { period: 'round', limit: 1 };
  if (/每轮限两次/.test(text)) return { period: 'round', limit: 2 };
  if (/每回合(?:限)?一次/.test(text)) return { period: 'turn', limit: 1 };
  if (/每回合(?:前|首次|首张)/.test(text)) return { period: 'turn', limit: number(text.match(/每回合前(\d+)/)?.[1]) || 1 };
  if (/每轮(?:前|首次|首张|你(?:的)?首张)/.test(text)) return { period: 'round', limit: number(text.match(/每轮前(\d+)/)?.[1]) || 1 };
  return {};
};

export function compileCharacterTrait(row) {
  if (!row) return { bonuses: {}, effects: [], supported: false };
  if (row.effect || row.effects) return { bonuses: row.bonuses || {}, effects: row.effects || [row.effect], supported: true };
  const text = normalized(row.description || row.desc);
  const bonuses = { ...(row.bonuses || {}) };
  const effects = [];
  const add = (kind, values = {}) => effects.push({ kind, ...limitFrom(text), ...values });
  const match = expression => text.match(expression);
  let m;
  if (m = match(/^体力上限([+-]\d+)/)) bonuses.hp = number(m[1]);
  if (m = match(/^(?:初始|起始)手牌\+(\d+)/)) bonuses.startingCards = number(m[1]);
  if (m = match(/^(?:初始手牌\+\d+,)?摸牌阶段摸牌\+(\d+)$/)) bonuses.draw = number(m[1]);
  if (m = match(/^(?:初始手牌\+\d+,)?出杀次数\+(\d+)$/)) bonuses.slashCount = number(m[1]);
  if (m = match(/^手牌上限\+(\d+)$/)) bonuses.handLimit = number(m[1]);
  if (m = match(/每回合你可多使用(\d+)次酒/)) add('wine_limit', { amount: number(m[1]) });

  if (/发动(?:限定技|出牌阶段限一次的技能)后/.test(text)) {
    const kindPrefix = /出牌阶段限一次/.test(text) ? 'once_skill_' : 'limited_';
    if (m = match(/回复(\d+)点体力/)) add(kindPrefix + 'heal', { amount: number(m[1]) });
    else if (m = match(/(?:摸|获得)(\d+)张牌/)) add(kindPrefix + 'draw', { amount: number(m[1]) });
    else if (m = match(/随机(?:一|1)名敌方造成(\d+)点伤害/)) add(kindPrefix + 'damage', { amount: number(m[1]) });
    else if (/视为使用一张酒/.test(text)) add(kindPrefix + 'wine');
  } else if (/对其他角色造成的伤害无视护甲/.test(text)) add('ignore_shield');
  else if (/你与其他角色的距离(?:始终)?为1/.test(text)) add('distance_one');
  else if (/桃不计入手牌上限/.test(text)) add('tao_hand');
  else if (/过河拆桥.*目标手牌可见/.test(text)) add('guohe_visible');
  else if (/过河拆桥.*至多(?:弃置|弃置目标|弃置其)(?:2|两)张牌/.test(text)) add('guohe_double');
  else if (/顺手牵羊.*无距离限制/.test(text)) add('shunshou_range');
  else if (/火攻.*结算后.*获得.*展示的牌/.test(text)) add('huogong_gain', { period: 'turn', limit: 4 });
  else if (/与你决斗.*(?:两|2)张杀/.test(text)) add('duel_double');
  else if (/前4张南蛮入侵/.test(text)) add('aoe_double', { card: 'nanman', period: 'turn', limit: 4 });
  else if (/前4张万箭齐发/.test(text)) add('aoe_double', { card: 'wanjian', period: 'turn', limit: 4 });
  else if (/回合外获得的牌.*无距离限制/.test(text)) add('offturn_range');
  else if (/回合外获得的牌.*无次数限制/.test(text)) add('offturn_unlimited');
  else if (/无视目标防具/.test(text)) add('sha_armor', /每轮.*首张/.test(text) ? { period: 'round', limit: 1 } : {});
  else if (/(?:不可被响应|无法被响应|不能被抵消)/.test(text)) {
    const card = /普通锦囊牌/.test(text) ? 'trick' : /酒杀/.test(text) ? 'sha_jiu' : 'sha';
    add('unrespondable', { card, ...(/每轮.*首张/.test(text) ? { period: 'round', limit: 1 } : {}) });
  } else if (m = match(/从第(\d+)轮开始,你的出杀次数\+(\d+)/)) add('later_slash', { round: number(m[1]), amount: number(m[2]) });
  else if (/下次出杀次数\+/.test(text)) add('hurt_next_slash', { amount: number(match(/次数\+(\d+)/)?.[1]) });
  else if (/下次造成的伤害\+/.test(text)) add('hurt_next_damage', { amount: number(match(/伤害\+(\d+)/)?.[1]), period: 'round', limit: 1 });
  else if (/随机弃置其/.test(text) && /杀/.test(text)) add('sha_discard', { amount: number(match(/弃置其(\d+)/)?.[1]) });
  else if (/伤害\+/.test(text)) {
    const amount = number(match(/伤害\+(\d+)/)?.[1]);
    const card = /锦囊牌造成的/.test(text) ? 'trick' : /杀造成的/.test(text) || /回合内杀/.test(text) ? 'sha' : /技能伤害/.test(text) ? 'skill' : undefined;
    const condition = /目标未受伤/.test(text) ? 'healthy' : /目标拥有护甲/.test(text) ? 'shield' : /手牌数大于等于你的/.test(text) ? 'hand_ge' : /体力值大于等于你的/.test(text) ? 'hp_ge' : /体力唯一最少/.test(text) ? 'least_hp_own_turn' : /回合外造成/.test(text) ? 'offturn' : undefined;
    const nature = /火焰伤害/.test(text) ? 'fire' : /雷电伤害/.test(text) ? 'thunder' : undefined;
    add('damage_bonus', { amount, card, condition, nature, fromRound: number(match(/从第(\d+)轮开始/)?.[1]) || undefined });
  } else if (/伤害-/.test(text)) {
    add('damage_reduce', { amount: number(match(/伤害-(\d+)/)?.[1]), hpAtMost: number(match(/体力值不大于(\d+)/)?.[1]) || undefined, period: 'round', limit: 1 });
  } else if (/对伤害来源造成/.test(text)) add('retaliate', { amount: number(match(/造成(\d+)点伤害/)?.[1]) || 1 });
  else if (/随机.*造成.*伤害/.test(text) && /回合开始/.test(text)) add('phase_damage', { amount: number(match(/造成(\d+)点伤害/)?.[1]) || 1, targets: number(match(/随机(\d+)名/)?.[1]) || 1, self: /对自己/.test(text) });
  else if (/弃牌阶段弃置了手牌.*造成.*伤害/.test(text)) add('discard_damage', { amount: number(match(/造成(\d+)点伤害/)?.[1]) || 1 });
  else if (/游戏开始时.*(?:所有角色|全场).*伤害/.test(text)) add('opening_damage_all', { amount: number(match(/(?:造成|受到)(\d+)点伤害/)?.[1]) || 1 });
  else if (/每轮开始时.*获得.*护甲/.test(text)) add('round_armor', { amount: number(match(/获得(\d+)点护甲/)?.[1]), cap: number(match(/上限(\d+)点/)?.[1]) || undefined });
  else if (/游戏开始时.*获得.*护甲/.test(text)) add('opening_armor', { amount: number(match(/获得(\d+)点护甲/)?.[1]) });
  else if (/回复体力时.*多回复/.test(text)) add('heal_boost', { amount: number(match(/多回复(\d+)/)?.[1]) || 1, period: 'turn', limit: number(match(/前(\d+)次/)?.[1]) || 1 });
  else if (/受到.*伤害后.*回复/.test(text)) add('hurt_heal', { amount: number(match(/回复(\d+)/)?.[1]) || 1, card: /决斗/.test(text) ? 'juedou' : /锦囊牌/.test(text) ? 'trick' : undefined, period: 'round', limit: number(match(/前(\d+)次/)?.[1]) || 1 });
  else if (/第\d+轮回合开始时.*回复/.test(text)) add('round_heal', { amount: number(match(/回复(\d+)/)?.[1]), round: number(match(/第(\d+)轮/)?.[1]) });
  else if (/第\d+回合开始时.*回复/.test(text)) add('own_turn_heal', { amount: number(match(/回复(\d+)/)?.[1]), turn: number(match(/第(\d+)回合/)?.[1]) });
  else if (/每轮开始时.*回复/.test(text)) add('round_heal', { amount: number(match(/回复(\d+)/)?.[1]) });
  else if (/回合结束时.*回复/.test(text)) add('end_heal', { amount: number(match(/回复(\d+)/)?.[1]) || 1, everyTurn: /^每回合结束/.test(text) });
  else if (/每轮首次使用桃/.test(text)) add('tao_heal', { amount: number(match(/回复(\d+)/)?.[1]) || 1, period: 'round', limit: 1 });
  else if (/击杀其他角色后.*摸/.test(text)) add('kill_draw', { amount: number(match(/摸(\d+)/)?.[1]) });
  else if (/回合开始时.*获得.*随机锦囊牌/.test(text)) add('phase_random_trick', { amount: number(match(/获得(\d+)/)?.[1]) });
  else if (/回合结束时.*获得.*随机锦囊牌/.test(text)) add('end_random_trick', { amount: number(match(/获得(\d+)/)?.[1]) });
  else if (/游戏开始时.*(?:获得|摸).*随机手牌/.test(text)) add('opening_draw', { amount: number(match(/(?:获得|摸)(\d+)/)?.[1]) });
  else if (/回合开始时.*获得/.test(text) || /回合结束时.*获得/.test(text) || /游戏开始时.*获得/.test(text)) {
    const cards = [...text.matchAll(/(?:获得|和)(\d+)张(闪|杀|决斗|过河拆桥|顺手牵羊|火攻|南蛮入侵|万箭齐发)/g)].map(m => ({ name: ({闪:'shan',杀:'sha',决斗:'juedou',过河拆桥:'guohe',顺手牵羊:'shunshou',火攻:'huogong',南蛮入侵:'nanman',万箭齐发:'wanjian'})[m[2]], amount: number(m[1]) }));
    if (cards.length) add(/游戏开始/.test(text) ? 'opening_cards' : /回合结束/.test(text) ? 'end_cards' : 'phase_cards', { cards });
  } else if (/每轮杀首次造成伤害后/.test(text)) add('sha_draw', { amount: number(match(/摸(\d+)/)?.[1]), period: 'round', limit: 1 });
  else if (/弃牌阶段未弃过手牌/.test(text)) add('discard_draw', { amount: number(match(/摸(\d+)/)?.[1]), noDiscard: true });
  else if (/弃牌阶段弃置过手牌.*摸/.test(text) || /弃牌阶段弃置了手牌.*摸/.test(text)) add('discard_draw', { amount: number(match(/(?:最多可摸|最多摸|摸)(\d+)/)?.[1]), equal: /等量牌/.test(text) });
  else if (/其他角色的回合开始时.*摸/.test(text)) add('other_turn_draw', { amount: number(match(/摸(\d+)/)?.[1]) });
  else if (/回合外失去红色手牌.*摸/.test(text)) add('lose_hand_draw', { amount: number(match(/摸(\d+)/)?.[1]), red: true, offturn: true });
  else if (/回合外失去手牌.*摸/.test(text)) add('lose_hand_draw', { amount: number(match(/摸(\d+)/)?.[1]), offturn: true });
  else if (/失去(?:装备区|最后)的.*牌.*摸/.test(text)) add(/最后/.test(text) ? 'lose_last_hand_draw' : 'lose_equip_draw', { amount: number(match(/摸(\d+)/)?.[1]) });
  else if (/受到伤害后.*摸/.test(text)) add('hurt_draw', { amount: number(match(/摸(\d+)/)?.[1]), ...(/每回合首次/.test(text) ? { period: 'turn', limit: 1 } : {}) });
  else if (/使用锦囊牌造成伤害后.*摸/.test(text)) add('trick_damage_draw', { amount: number(match(/摸(\d+)/)?.[1]) });
  else if (/使用锦囊牌后.*摸/.test(text)) add('trick_draw', { amount: number(match(/摸(\d+)/)?.[1]) });
  else if (/获得其他角色的牌时.*摸/.test(text)) add('gain_other_draw', { amount: number(match(/摸(\d+)/)?.[1]) });
  return { bonuses, effects, supported: Object.keys(bonuses).length > 0 || effects.length > 0 };
}

export function characterTraitBonuses(ids = [], traits = []) {
  const table = new Map(traits.map(row => [String(row.id), row]));
  const result = { hp: 0, startingCards: 0, draw: 0, slashCount: 0, armor: 0, armorGain: 0, handLimit: 0, damage: 0 };
  for (const id of ids) for (const [key, value] of Object.entries(compileCharacterTrait(table.get(String(id))).bonuses)) if (key in result) result[key] += number(value);
  return result;
}

export function characterTraitSkillIds(ids = [], traits = []) {
  const table = new Map(traits.map(row => [String(row.id), row]));
  return ids.flatMap((id, slot) => compileCharacterTrait(table.get(String(id))).effects.map((_, index) => `sht_trait_${slot}_${id}_${index}`));
}

export function createCharacterTraitSkills({ lib, game, get, _status }, traits = []) {
  const skill = {}, translate = {};
  const alive = player => !player.isIn || player.isIn();
  const enemies = player => game.players.filter(target => target !== player && target.side !== player.side && alive(target));
  const choose = list => list.length ? list[Math.floor((get.rand ? get.rand(0, 999999) / 1000000 : Math.random()) * list.length)] : null;
  const parent = (event, name) => event.getParent?.(name, true, true);
  const normalDamage = event => typeof event.notLink !== 'function' || event.notLink();
  const state = (player, id) => (player._shtCharacterTraitState ||= {})[id] ||= { count: 0, period: undefined, events: new WeakSet() };
  const token = period => period === 'round' ? game.roundNumber || 0 : period === 'turn' ? game.phaseNumber || 0 : 'battle';
  const available = (player, id, effect) => { const s = state(player, id); return !effect.limit || s.period !== token(effect.period) || s.count < effect.limit; };
  const consume = (player, id, effect) => { const s = state(player, id), t = token(effect.period); if (s.period !== t) { s.period = t; s.count = 0; } s.count++; };
  const cardType = card => get.type2 ? get.type2(card) : lib.card[card?.name]?.type;
  const matchesCard = (event, name) => !name || (name === 'trick' ? cardType(event.card) === 'trick' : name === 'skill' ? !event.card : event.card?.name === name);
  const emitCards = async (player, rows) => {
    const cards = [];
    for (const row of rows) for (let i = 0; i < row.amount; i++) {
      if (!lib.card[row.name]) continue;
      const tuple = choose((lib.card.list || []).filter(tuple => tuple[2] === row.name));
      const card = game.createCard(row.name, tuple?.[0] || 'spade', tuple?.[1] || 1, tuple?.[3]);
      card.destroyed = (card, position) => position === 'discardPile' || position === 'cardPile';
      cards.push(card);
    }
    if (cards.length) await player.gain(cards, 'gain2');
  };
  const randomTricks = async (player, count) => {
    const pool = (lib.card.list || []).filter(tuple => ['trick', 'delay'].includes(lib.card[tuple[2]]?.type));
    const rows = Array.from({ length: count }, () => choose(pool)).filter(Boolean).map(tuple => ({ name: tuple[2], amount: 1 }));
    await emitCards(player, rows);
  };
  const loss = (event, player) => event.getl?.(player) || (event.player === player && event.name === 'lose' ? event : null);
  const lossTriggers = { player: 'loseAfter', global: ['equipAfter', 'addJudgeAfter', 'gainAfter', 'loseAsyncAfter', 'addToExpansionAfter'] };
  const dealt = (target, amount, player) => target.damage(amount, player, 'nocard');
  const forced = (id, effect, trigger, action, filter = () => true, extras = {}) => ({
    charlotte: true, forced: true, popup: false, trigger,
    filter(event, player) { return Boolean(player._shanhetuSpec?.traitIds) && available(player, id, effect) && filter(event, player); },
    async content(event, trigger, player) { consume(player, id, effect); await action(trigger, player, event); },
    ...extras,
  });
  const opening = (id, effect, action) => forced(id, { ...effect, period: 'battle', limit: 1 }, { global: 'gameStart' }, (event, player) => action(player));
  const make = (id, e) => {
    switch (e.kind) {
      case 'wine_limit': return { charlotte: true, mod: { cardUsable(card, player, count) { if (card.name === 'jiu') return count + e.amount; } } };
      case 'distance_one': return { charlotte: true, mod: { globalFrom() { return -Infinity; }, attackFrom() { return 1; } } };
      case 'tao_hand': return { charlotte: true, mod: { ignoredHandcard(card) { if (get.name(card) === 'tao') return true; }, cardDiscardable(card, player, reason) { if (reason === 'phaseDiscard' && get.name(card) === 'tao') return false; } } };
      case 'shunshou_range': return { charlotte: true, mod: { targetInRange(card) { if (card.name === 'shunshou') return true; } } };
      case 'later_slash': return { charlotte: true, mod: { cardUsable(card, player, count) { if (card.name === 'sha' && game.roundNumber >= e.round) return count + e.amount; } } };
      case 'ignore_shield': return forced(id, e, { source: 'damageBegin1' }, event => { event.nohujia = true; }, (event, player) => event.player !== player);
      case 'damage_bonus': return forced(id, e, { source: 'damageBegin1' }, event => { event.num += e.amount; }, (event, player) => {
        if (!normalDamage(event) || !matchesCard(event, e.card) || e.fromRound && game.roundNumber < e.fromRound) return false;
        if (e.nature && !(get.hasNature ? get.hasNature(event, e.nature) : event.nature === e.nature)) return false;
        const target = event.player;
        if (e.condition === 'healthy' && target.hp < target.maxHp) return false;
        if (e.condition === 'shield' && !(target.hujia > 0)) return false;
        if (e.condition === 'hand_ge' && target.countCards('h') < player.countCards('h')) return false;
        if (e.condition === 'hp_ge' && target.hp < player.hp) return false;
        if (e.condition === 'offturn' && _status.currentPhase === player) return false;
        if (e.condition === 'least_hp_own_turn' && (_status.currentPhase !== player || game.players.some(other => other !== player && other.hp <= player.hp))) return false;
        return true;
      });
      case 'damage_reduce': return forced(id, e, { player: 'damageBegin3' }, (event, player) => { if (!e.hpAtMost || player.hp <= e.hpAtMost) event.num = Math.max(0, event.num - e.amount); }, event => event.num > 0);
      case 'limited_draw': case 'limited_heal': case 'limited_damage': case 'once_skill_damage': case 'once_skill_heal': case 'once_skill_wine': return forced(id, e, { player: ['useSkillAfter', 'logSkill'] }, async (event, player) => {
        const key = event.log_event || event; state(player, id).events.add(key);
        if (e.kind.endsWith('_draw')) await player.draw(e.amount);
        else if (e.kind.endsWith('_heal')) await player.recover(e.amount);
        else if (e.kind.endsWith('_wine')) { if (player.hasUseTarget?.({ name: 'jiu', isCard: true })) await player.chooseUseTarget({ name: 'jiu', isCard: true }, true, false); }
        else { const target = choose(enemies(player)); if (target) await dealt(target, e.amount, player); }
      }, (event, player) => {
        const name = get.sourceSkillFor ? get.sourceSkillFor(event) : event.skill;
        const info = lib.skill[name] || lib.skill[event.skill];
        if (!info || info.charlotte || state(player, id).events.has(event.log_event || event)) return false;
        if (e.kind.startsWith('limited_')) return info.limited === true;
        const description = get.skillInfoTranslation?.(name, player) || lib.translate[name + '_info'] || '';
        return /出牌阶段限一次/.test(description) && _status.currentPhase === player;
      });
      case 'opening_draw': return opening(id, e, player => player.draw(e.amount));
      case 'opening_armor': return opening(id, e, player => player.changeHujia(e.amount, 'gain'));
      case 'opening_cards': return opening(id, e, player => emitCards(player, e.cards));
      case 'opening_damage_all': return opening(id, e, async player => { for (const target of game.players.slice()) if (alive(target)) await target.damage(e.amount, 'nosource', 'nocard'); });
      case 'phase_cards': case 'end_cards': return forced(id, e, { player: e.kind === 'phase_cards' ? 'phaseBegin' : 'phaseEnd' }, (event, player) => emitCards(player, e.cards));
      case 'phase_random_trick': case 'end_random_trick': return forced(id, e, { player: e.kind === 'phase_random_trick' ? 'phaseBegin' : 'phaseEnd' }, (event, player) => randomTricks(player, e.amount));
      case 'phase_damage': return forced(id, e, { player: 'phaseBegin' }, async (event, player) => {
        const pool = enemies(player), targets = [];
        for (let i = 0; i < e.targets && pool.length; i++) { const target = choose(pool); targets.push(target); pool.splice(pool.indexOf(target), 1); }
        if (e.self) await dealt(player, e.amount, player);
        for (const target of targets) if (alive(target)) await dealt(target, e.amount, player);
      }, (event, player) => e.self || enemies(player).length > 0);
      case 'round_armor': return forced(id, e, { global: 'roundStart' }, (event, player) => player.changeHujia(e.amount, 'gain', e.cap));
      case 'round_heal': return forced(id, e.round ? { ...e, period: 'battle', limit: 1 } : e, e.round ? { player: 'phaseBegin' } : { global: 'roundStart' }, (event, player) => player.recover(e.amount), () => !e.round || game.roundNumber === e.round);
      case 'own_turn_heal': return forced(id, e, { player: 'phaseBegin' }, async (event, player) => { const s = state(player, id); s.turn = (s.turn || 0) + 1; if (s.turn === e.turn) await player.recover(e.amount); });
      case 'end_heal': return forced(id, e, e.everyTurn ? { global: 'phaseEnd' } : { player: 'phaseEnd' }, (event, player) => player.recover(e.amount), (event, player) => player.hp < player.maxHp);
      case 'heal_boost': return forced(id, e, { player: 'recoverBegin' }, event => { event.num += e.amount; }, (event, player) => player.hp < player.maxHp && event.num > 0);
      case 'hurt_heal': return forced(id, e, { player: 'damageEnd' }, (event, player) => player.recover(e.amount), event => matchesCard(event, e.card));
      case 'tao_heal': return forced(id, e, { player: 'useCardAfter' }, (event, player) => player.recover(e.amount), event => event.card?.name === 'tao');
      case 'kill_draw': return forced(id, e, { source: 'dieAfter' }, (event, player) => player.draw(e.amount), (event, player) => event.player !== player);
      case 'hurt_draw': return forced(id, e, { player: 'damageEnd' }, (event, player) => player.draw(e.amount));
      case 'sha_draw': return forced(id, e, { source: 'damageSource' }, (event, player) => player.draw(e.amount), event => event.card?.name === 'sha');
      case 'trick_damage_draw': return forced(id, e, { source: 'damageSource' }, (event, player) => player.draw(e.amount), event => matchesCard(event, 'trick'));
      case 'trick_draw': return forced(id, e, { player: 'useCardAfter' }, (event, player) => player.draw(e.amount), event => cardType(event.card) === 'trick');
      case 'other_turn_draw': return forced(id, e, { global: 'phaseBegin' }, (event, player) => player.draw(e.amount), (event, player) => event.player !== player);
      case 'gain_other_draw': return forced(id, e, { player: 'gainAfter', global: 'loseAsyncAfter' }, (event, player) => player.draw(e.amount), (event, player) => {
        const gained = event.getg?.(player) || (event.player === player ? event.cards || [] : []);
        return gained.length > 0 && game.players.some(other => other !== player && (event.getl?.(other)?.cards2 || []).some(card => gained.includes(card)));
      });
      case 'lose_hand_draw': case 'lose_equip_draw': case 'lose_last_hand_draw': return forced(id, e, lossTriggers, (event, player) => player.draw(e.amount), (event, player) => {
        const lost = loss(event, player); if (!lost || e.offturn && _status.currentPhase === player) return false;
        const cards = e.kind === 'lose_equip_draw' ? lost.es : lost.hs;
        if (!cards?.length || e.red && !cards.some(card => get.color(card, false) === 'red')) return false;
        return e.kind !== 'lose_last_hand_draw' || player.countCards('h') === 0;
      });
      case 'discard_draw': case 'discard_damage': return forced(id, e, { player: 'phaseDiscardEnd' }, async (event, player) => {
        const count = player.getHistory('lose', entry => entry.type === 'discard' && parent(entry, 'phaseDiscard') === event).reduce((sum, entry) => sum + (entry.hs?.length || 0), 0);
        if (e.kind === 'discard_draw') await player.draw(e.equal ? Math.min(count, e.amount) : e.amount);
        else { const target = choose(enemies(player)); if (target) await dealt(target, e.amount, player); }
      }, (event, player) => (player.getHistory('lose', entry => entry.type === 'discard' && parent(entry, 'phaseDiscard') === event && entry.hs?.length).length > 0) !== Boolean(e.noDiscard));
      case 'retaliate': return forced(id, e, { player: 'damageEnd' }, (event, player) => dealt(event.source, e.amount, player), (event, player) => event.source && event.source !== player && alive(event.source));
      case 'hurt_next_damage': return {
        ...forced(id, e, { player: 'damageEnd' }, (event, player) => { state(player, id).armed = true; }, (event, player) => _status.currentPhase !== player),
        group: id + '_apply',
      };
      case 'hurt_next_slash': return {
        ...forced(id, e, { player: 'damageEnd' }, (event, player) => { state(player, id).extra = e.amount; }, (event, player) => _status.currentPhase !== player),
        mod: { cardUsable(card, player, count) { if (card.name === 'sha') return count + (state(player, id).extra || 0); } }, group: id + '_clear',
      };
      case 'unrespondable': return forced(id, e, { player: 'useCard1' }, event => { event.directHit ||= []; for (const player of game.players) if (!event.directHit.includes(player)) event.directHit.push(player); }, event => e.card === 'trick' ? lib.card[event.card?.name]?.type === 'trick' : (e.card === 'sha_jiu' ? ['sha', 'jiu'].includes(event.card?.name) : event.card?.name === 'sha'));
      case 'sha_armor': return {
        ...forced(id, e, { player: 'useCard1' }, event => { (event._shtTraitIgnoreArmor ||= new Set()).add(id); }, event => event.card?.name === 'sha'),
        group: id + '_target',
      };
      case 'sha_discard': return forced(id, e, { source: 'damageSource' }, async event => {
        const pool = event.player.getDiscardableCards ? event.player.getDiscardableCards(event.source, 'he') : event.player.getCards('he');
        const cards = []; for (let i = 0; i < e.amount && pool.length; i++) { const card = choose(pool); cards.push(card); pool.splice(pool.indexOf(card), 1); }
        if (cards.length) await event.player.discard(cards);
      }, event => event.card?.name === 'sha' && alive(event.player) && event.player.countCards('he') > 0);
      case 'guohe_visible': case 'guohe_double': return forced(id, e, { player: 'discardPlayerCardBefore' }, event => {
        if (e.kind === 'guohe_visible') event.visible = true;
        else event.selectButton = [1, Math.min(2, event.target.countDiscardableCards?.(event.player, event.position || 'hej') || event.target.countCards('hej'))];
      }, event => Boolean(parent(event, 'guohe')));
      case 'duel_double': return forced(id, e, { player: 'useCardToPlayered', target: 'useCardToTargeted' }, (event, player) => {
        const map = event.getParent().customArgs, id = event.target.playerid;
        const other = event.player === player ? event.target : event.player;
        const arg = map[id] ||= {}; (arg.shaReq ||= {})[other.playerid] = Math.max(2, arg.shaReq[other.playerid] || 1);
      }, event => event.card?.name === 'juedou');
      case 'aoe_double': return {
        ...forced(id, e, { player: 'useCard1' }, event => { (event._shtTraitDoubleResponse ||= new Set()).add(id); }, event => event.card?.name === e.card), group: id + '_target',
      };
      case 'huogong_gain': return forced(id, e, { player: 'huogongAfter' }, async (event, player) => {
        const cards = (event.cards2 || event.showResult?.cards || []).filter(card => get.owner(card) === event.target && (!lib.filter?.canBeGained || lib.filter.canBeGained(card, player, event.target)));
        if (cards.length) await player.gain(cards, event.target, 'giveAuto');
      }, event => event.cards2?.length > 0 || event.showResult?.cards?.length > 0);
      case 'offturn_range': case 'offturn_unlimited': return {
        ...forced(id, e, { player: 'gainAfter', global: 'loseAsyncAfter' }, (event, player) => {
          const cards = event.getg?.(player) || (event.player === player ? event.cards || [] : []);
          const s = state(player, id); s.cards ||= new WeakSet(); for (const card of cards) { if (_status.currentPhase !== player) s.cards.add(card); else s.cards.delete(card); }
        }, (event, player) => (event.getg?.(player) || (event.player === player ? event.cards || [] : [])).length > 0),
        mod: {
          targetInRange(card, player) { const cards = card.cards?.length ? card.cards : [card]; if (e.kind === 'offturn_range' && cards.every(c => state(player, id).cards?.has(c))) return true; },
          cardUsable(card, player) { const cards = card.cards?.length ? card.cards : [card]; if (e.kind === 'offturn_unlimited' && cards.every(c => state(player, id).cards?.has(c))) return Infinity; },
        },
        ...(e.kind === 'offturn_unlimited' ? { group: id + '_free' } : {}),
      };
      default: throw new Error('Unsupported character trait effect: ' + e.kind);
    }
  };
  for (const row of traits) {
    const compiled = compileCharacterTrait(row);
    for (let slot = 0; slot < 4; slot++) compiled.effects.forEach((effect, index) => {
      const id = `sht_trait_${slot}_${row.id}_${index}`;
      skill[id] = make(id, effect);
      translate[id] = '武将特质'; translate[id + '_info'] = row.description || row.desc || '';
      if (effect.kind === 'hurt_next_damage') skill[id + '_apply'] = forced(id + '_apply', {}, { source: 'damageBegin1' }, (event, player) => { state(player, id).armed = false; event.num += effect.amount; }, (event, player) => state(player, id).armed && normalDamage(event));
      if (effect.kind === 'hurt_next_slash') skill[id + '_clear'] = forced(id + '_clear', {}, { player: 'phaseAfter' }, (event, player) => { state(player, id).extra = 0; });
      if (effect.kind === 'sha_armor') skill[id + '_target'] = forced(id + '_target', {}, { player: 'useCardToPlayered' }, event => {
        event.target.addTempSkill('qinggang2'); const cards = event.target.storage.qinggang2 ||= []; if (!cards.includes(event.card)) cards.push(event.card); event.target.markSkill?.('qinggang2');
      }, event => event.getParent()._shtTraitIgnoreArmor?.has(id));
      if (effect.kind === 'aoe_double') skill[id + '_target'] = forced(id + '_target', {}, { player: 'useCardToPlayered' }, event => {
        const arg = (event.getParent().customArgs[event.target.playerid] ||= {}), key = effect.card === 'nanman' ? 'shaRequired' : 'shanRequired'; arg[key] = Math.max(2, arg[key] || 1);
      }, event => event.getParent()._shtTraitDoubleResponse?.has(id));
      if (effect.kind === 'offturn_unlimited') skill[id + '_free'] = forced(id + '_free', {}, { player: 'useCard1' }, (event, player) => {
        event.addCount = false; const stat = player.getStat().card; if (typeof stat[event.card.name] === 'number') stat[event.card.name]--;
      }, (event, player) => event.addCount !== false && event.cards?.length > 0 && event.cards.every(card => state(player, id).cards?.has(card)));
    });
  }
  return { skill, translate };
}
