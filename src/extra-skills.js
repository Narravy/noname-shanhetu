import { createRemainingRewardSkills } from './extra-reward-skills.js';

/**
 * Reward skills whose official OL spell differs from a same-name native skill,
 * or whose native implementation is only installed by another game mode.
 * Sources: cha_spell.json (desc and ActiveTip), cha_spellextend.json (no
 * overrides for these IDs). Keep the original spell ID, not the reward ID.
 */
export function createExtraSkills({ lib, game, get, _status }) {
  const key = id => `sht_skill_${id}`;
  const alive = player => player && (!player.isIn || player.isIn());
  const sameSide = (player, target) => player === target || (typeof player.side === 'boolean' && target?.side === player.side);
  const random = cards => cards.randomGet ? cards.randomGet() : cards[Math.floor(Math.random() * cards.length)];
  const discardable = (card, player, id) => lib.filter.cardDiscardable(card, player, key(id));
  const skills = {};

  // XiuLuo's original ActiveTip explicitly asks for a hand card as the cost.
  const matchingJudges = (player, suit) => player.getCards('j').filter(card =>
    discardable(card, player, 351) && (suit == null || get.suit(card, player) === suit));
  const xiuluoCost = (card, player) => discardable(card, player, 351) && matchingJudges(player, get.suit(card, player)).length > 0;
  skills[key(351)] = {
    trigger: { player: 'phaseZhunbeiBegin' }, direct: true,
    filter: (event, player) => player.getCards('h').some(card => xiuluoCost(card, player)),
    async content(event, trigger, player) {
      while (alive(player) && player.getCards('h').some(card => xiuluoCost(card, player))) {
        const result = await player.chooseToDiscard('h', '修罗：弃置一张手牌，再弃置一张同花色判定牌', card => xiuluoCost(card, player))
          .set('ai', card => 8 - get.value(card)).forResult();
        if (!result.bool || !result.cards?.length) break;
        player.logSkill(key(351));
        const cards = matchingJudges(player, get.suit(result.cards[0], player));
        if (!cards.length) break;
        const chosen = cards.length === 1 ? cards : (await player.chooseButton(['修罗：弃置一张同花色的判定牌', cards], true).forResult()).links;
        if (chosen?.length) await player.discard(chosen);
      }
    },
  };

  skills[key(386)] = {
    locked: true,
    mod: { cardUsable(card, player, count) { if (card.name === 'sha' && player.getEquip(1)) return count + 1; } },
    group: [key(386) + '_armor', key(386) + '_mount', key(386) + '_treasure'],
    subSkill: {
      armor: {
        trigger: { player: 'damageBegin4' }, forced: true,
        filter: (event, player) => !!player.getEquip(2) && event.num > 1,
        // Official: prevent damage greater than one, not reduce it to one.
        async content(event, trigger) { trigger.cancel(); },
      },
      mount: {
        trigger: { player: 'phaseDrawBegin2' }, forced: true,
        filter: (event, player) => !event.numFixed && !!(player.getEquip(3) || player.getEquip(4)),
        async content(event, trigger) { trigger.num++; },
      },
      treasure: {
        trigger: { player: 'phaseJudgeBefore' }, forced: true,
        filter: (event, player) => !!player.getEquip(5),
        async content(event, trigger) { trigger.cancel(); },
      },
    },
  };

  skills[key(622)] = {
    trigger: { player: 'phaseZhunbeiBegin' }, forced: true,
    filter: (event, player) => player.countCards('j') > 0,
    async content(event, trigger, player) { await player.discard(random(player.getCards('j'))); },
  };

  skills[key(887)] = {
    trigger: { player: 'phaseDrawBegin1' },
    filter: (event, player) => !event.numFixed && player.maxHp > player.hp,
    check: (event, player) => player.maxHp - player.hp >= 2 || player.countCards('h') >= 2,
    async content(event, trigger, player) {
      trigger.changeToZero();
      const cards = get.cards(player.maxHp - player.hp + 1, true);
      const shown = (await player.showCards(cards, '再起', true).set('delay_time', Math.min(4, cards.length)).forResult()).cards;
      const hearts = shown.filter(card => get.suit(card) === 'heart');
      const remaining = shown.filter(card => get.suit(card) !== 'heart');
      if (hearts.length) await player.recover(hearts.length);
      if (remaining.length) await player.gain(remaining, 'gain2');
    },
  };

  skills[key(948)] = {
    trigger: { source: 'damageBegin1', player: 'damageBegin3' }, forced: true,
    filter(event, player, triggername) {
      return triggername === 'damageBegin1' ? _status.currentPhase !== player : _status.currentPhase === player;
    },
    async content(event, trigger) { trigger.num++; },
  };

  skills[key(994)] = {
    trigger: { player: 'judgeEnd' },
    filter(event) {
      const card = event.result?.card;
      return !!card && get.position(card, true) === 'o' && (card.name === 'sha' || get.type(card) === 'trick' && get.tag(card, 'damage'));
    },
    check: event => get.value(event.result.card) > 0,
    async content(event, trigger, player) {
      await player.gain(trigger.result.card, 'gain2');
      const current = _status.currentPhase;
      if (!alive(current)) return;
      const choice = await player.chooseBool('筑围：令当前回合角色本回合手牌上限和使用【杀】次数上限各+1？')
        .set('ai', () => get.attitude(player, current) > 0).forResult();
      if (!choice.bool) return;
      current.addTempSkill(key(994) + '_buff', 'phaseAfter');
      current.addMark(key(994) + '_buff', 1, false);
    },
    subSkill: {
      buff: {
        charlotte: true, onremove: true, mark: true,
        intro: { content: '本回合手牌上限与使用【杀】次数上限各增加#' },
        mod: {
          maxHandcard(player, count) { return count + player.countMark(key(994) + '_buff'); },
          cardUsable(card, player, count) { if (card.name === 'sha') return count + player.countMark(key(994) + '_buff'); },
        },
      },
    },
  };

  skills[key(1139)] = {
    trigger: { player: 'damageEnd' }, forced: true, logTarget: 'source',
    filter: (event, player) => alive(event.source) && event.source !== player && player.countCards('h') === 0 && event.source.countCards('he') > 0,
    async content(event, trigger) { await trigger.source.randomDiscard(); },
  };

  skills[key(1328)] = {
    trigger: { player: 'phaseZhunbeiBegin' }, forced: true,
    filter: (event, player) => game.hasPlayer(other => other !== player && !sameSide(player, other) && get.distance(player, other) === 1),
    async content(event, trigger, player) {
      const targets = game.filterPlayer(other => other !== player && !sameSide(player, other) && get.distance(player, other) === 1);
      if (targets.sortBySeat) targets.sortBySeat();
      for (const target of targets) if (alive(target)) await target.damage(1, player, 'fire');
    },
    group: key(1328) + '_reduce',
    subSkill: {
      reduce: {
        trigger: { player: 'damageBegin4' }, forced: true,
        filter: event => event.num >= 2,
        async content(event, trigger) { trigger.num--; },
      },
    },
  };

  skills[key(1507)] = {
    trigger: { source: 'damageBegin1' }, forced: true,
    filter: event => event.card?.name === 'sha',
    async content(event, trigger) { trigger.num++; },
    mod: { targetInRange(card) { if (card.name === 'sha') return true; } },
    group: key(1507) + '_vulnerability',
    subSkill: {
      vulnerability: {
        trigger: { player: 'damageBegin3' }, forced: true,
        filter: (event, player) => _status.currentPhase !== player && !!event.card && get.type2(event.card) === 'trick',
        async content(event, trigger) { trigger.num++; },
      },
    },
  };

  skills[key(14033)] = {
    trigger: { player: 'useCardToPlayered' }, forced: true, logTarget: 'target',
    filter: (event, player) => event.target.countCards('h') <= player.countCards('h'),
    async content(event, trigger) { trigger.getParent().directHit.add(trigger.target); },
  };

  skills[key(14046)] = {
    trigger: { player: 'dying' }, forced: true, limited: true,
    filter: (event, player) => !player.storage[key(14046)],
    async content(event, trigger, player) {
      player.storage[key(14046)] = true;
      player.awakenSkill(key(14046));
      if (player.isTurnedOver()) await player.turnOver(false);
      if (player.isLinked()) await player.link(false);
      if (player.hp < player.maxHp) await player.recover(player.maxHp - player.hp);
      if (player.countCards('h') < player.maxHp) await player.draw(player.maxHp - player.countCards('h'));
      if (game.hasPlayer(other => other !== player && sameSide(player, other))) player.restoreSkill(key(14046));
    },
  };

  skills[key(14067)] = {
    trigger: { global: 'damageBegin1' }, forced: true,
    filter: (event, player) => !!event.source && sameSide(player, event.source),
    async content(event, trigger, player) {
      if (sameSide(player, trigger.player)) { trigger.cancel(); return; }
      trigger.num++;
      // Draw for the damage actually caused, after prevention/armour modifiers.
      trigger.shtBuwuOwners ||= [];
      if (!trigger.shtBuwuOwners.includes(player)) trigger.shtBuwuOwners.push(player);
    },
    group: key(14067) + '_draw',
    subSkill: {
      draw: {
        trigger: { global: 'damageEnd' }, forced: true, popup: false,
        filter: (event, player) => event.num > 0 && event.shtBuwuOwners?.includes(player),
        async content(event, trigger, player) { await player.draw(trigger.num); },
      },
    },
  };

  const colorCount = (player, color) => player.countCards('h', card => get.color(card, player) === color);
  const extraTarget = (trigger, player, target) => !trigger.targets.includes(target) &&
    lib.filter.targetEnabled2(trigger.card, player, target) && lib.filter.targetInRange(trigger.card, player, target);
  skills[key(4007)] = {
    trigger: { player: 'useCard2' }, direct: true, locked: true,
    filter(event, player) {
      const info = get.info(event.card);
      return get.color(event.card, player) === 'red' && colorCount(player, 'black') > colorCount(player, 'red') &&
        event.targets?.length > 0 && info.allowMultiple !== false && !info.multitarget && game.hasPlayer(target => extraTarget(event, player, target));
    },
    async content(event, trigger, player) {
      const result = await player.chooseTarget('夏晟：为此红色牌增加一名目标', (card, owner, target) => extraTarget(trigger, player, target))
        .set('ai', target => get.effect(target, trigger.card, player, player)).forResult();
      if (result.bool && result.targets?.length) {
        player.logSkill(key(4007), result.targets);
        trigger.targets.push(result.targets[0]);
      }
    },
    group: key(4007) + '_draw',
    subSkill: {
      draw: {
        trigger: { player: 'useCard' }, forced: true,
        filter: (event, player) => get.color(event.card, player) === 'black' && colorCount(player, 'red') > colorCount(player, 'black'),
        async content(event, trigger, player) { await player.draw(); },
      },
    },
  };

  Object.assign(skills, createRemainingRewardSkills({ lib, game, get, _status }));
  for (const [name, skill] of Object.entries(skills)) skill.shtOriginalSpellId = Number(name.slice('sht_skill_'.length));
  return skills;
}
