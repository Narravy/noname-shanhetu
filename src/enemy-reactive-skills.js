/** Dedicated OL Rogue effects. Numeric IDs refer to the original spell table. */
export function createEnemyReactiveSkills({ lib, game, get, _status }) {
  const key = id => `sht_enemy_${id}`;
  const round = () => Math.max(1, Number(game.roundNumber) || 1);
  const alive = player => Boolean(player?.isIn());
  const others = player => game.filterPlayer(target => target !== player);
  const name = player => get.translation(player);
  const attitude = (player, target) => player.side !== undefined && target.side !== undefined
    ? (player.side === target.side ? 10 : -10) : get.attitude(player, target);
  const discardable = (card, player, skill) => lib.filter.cardDiscardable(card, player, skill);
  const sameSuit = (card, suit) => get.suit(card) === suit;

  function discardedThisTurn() {
    const cards = new Set();
    for (const move of game.getGlobalHistory('cardMove')) {
      for (const card of move.cards || []) {
        if (get.position(card, true) !== 'd') continue;
        if (move.name === 'cardsDiscard' || (move.name === 'lose' && move.position === card.parentNode)) cards.add(card);
      }
    }
    return [...cards];
  }

  async function awardDiscarded(event, trigger, player) {
    const available = discardedThisTurn();
    if (!available.length) return;
    const suits = [...new Set(available.map(card => get.suit(card)))];
    let suit = suits[0];
    if (suits.length > 1) {
      const result = await player.chooseControl(suits.map(value => get.translation(value)))
        .set('prompt', '封赏：选择一种花色').set('ai', () => 0).forResult();
      suit = suits[result.index ?? 0];
    }
    const result = await player.chooseButton(['封赏：选择任意张此花色的牌', available.filter(card => sameSuit(card, suit))], [1, Infinity], true)
      .set('ai', button => get.value(button.link)).forResult();
    const cards = (result.links || []).filter(card => get.position(card, true) === 'd' && sameSuit(card, suit));
    if (!cards.length) return;
    const selection = await player.chooseTarget(true, '封赏：将这些牌交给一名角色')
      .set('ai', target => attitude(player, target) / (target.countCards('h') + 1)).forResult();
    const target = selection.targets?.[0];
    if (!alive(target)) return;
    player.line(target, 'green');
    await target.gain(cards, 'gain2');
    if (target !== player && alive(player) && player.hasUseTarget({ name: 'jiu', isCard: true }, true, false)) {
      await player.chooseUseTarget({ name: 'jiu', isCard: true }, true, false);
    }
  }

  return {
    [key(14103)]: {
      trigger: { player: 'phaseZhunbeiBegin' }, forced: true,
      async content(event, trigger, player) {
        const count = Math.max(0, Math.floor(player.maxHp));
        let missing = 0;
        for (let i = 0; i < count; i++) {
          const card = get.cardPile2(card => get.name(card) === 'juedou');
          if (card) await player.gain(card, 'gain2');
          else missing++;
        }
        if (missing) {
          player.storage[key(14103)] = (player.storage[key(14103)] || 0) + missing;
          player.markSkill(key(14103));
        }
      },
      marktext: '缠', intro: { content: '攻击范围及出牌阶段使用杀的次数+#' },
      mod: {
        attackRange(player, num) { return num + (player.storage[key(14103)] || 0); },
        cardUsable(card, player, num) { if (card.name === 'sha') return num + (player.storage[key(14103)] || 0); },
      },
    },
    [key(14104)]: {
      trigger: { source: 'damageSource' }, forced: true,
      filter(event, player) {
        return event.num > 0 && event.player && event.player !== player &&
          player.side !== undefined && event.player.side !== undefined && event.player.side !== player.side;
      },
      async content(event, trigger, player) {
        if (alive(trigger.player)) trigger.player.addSkill(key(14105));
        await player.draw(Math.min(5, round()));
      },
    },
    [key(14105)]: {
      trigger: { player: 'phaseZhunbeiBegin' }, forced: true,
      async content(event, trigger, player) {
        const result = await player.judge(card => get.suit(card) === 'diamond' ? 1 : -1).forResult();
        if (result.suit === 'diamond' || (result.card && get.suit(result.card) === 'diamond')) player.removeSkill(key(14105));
        else await player.loseHp(round());
      },
      mark: true, marktext: '毒', intro: { content: '准备阶段判定：方块移除此技能，否则失去当前轮数点体力。' },
    },
    [key(14109)]: {
      enable: 'phaseUse', usable: 3,
      async content(event, trigger, player) {
        await player.loseHp(1);
        if (alive(player)) await player.recover(1);
      },
      ai: { order: 8, result: { player: player => player.hp > 1 ? 1 : -2 } },
    },
    [key(14113)]: {
      trigger: { global: 'phaseZhunbeiBegin' }, direct: true,
      filter(event, player) { return others(player).some(target => target.hp <= player.hp); },
      async content(event, trigger, player) {
        const result = await player.chooseTarget('狼袭：对一名体力值不大于你的其他角色造成1～2点随机伤害',
          (card, owner, target) => target !== owner && target.hp <= owner.hp)
          .set('ai', target => get.damageEffect(target, player, player)).forResult();
        if (!result.bool) return;
        const target = result.targets[0];
        player.logSkill(key(14113), target);
        await target.damage(get.rand(1, 2), player);
      },
    },
    [key(14135)]: {
      trigger: { player: 'damageBegin3' }, forced: true,
      filter(event) { return Boolean(event.card) && event.num > 0; },
      async content(event, trigger, player) {
        if (get.color(trigger.card) === 'red') await player.gainMaxHp(trigger.num);
        else await player.recover(trigger.num);
      },
    },
    [key(14139)]: {
      enable: 'phaseUse', usable: 2, position: 'he', selectCard: [0, 1],
      discard: false, lose: false, delay: false,
      filterCard(card, player) { return get.subtype(card) === 'equip1' && discardable(card, player, key(14139)); },
      filterTarget(card, player, target) { return target !== player; },
      check(card) { return 8 - get.value(card); },
      async content(event, trigger, player) {
        let counter = player.storage[key(14139)];
        if (!counter || counter.round !== round()) counter = { round: round(), count: 0 };
        counter.count++;
        player.storage[key(14139)] = counter;
        if (event.cards?.length) await player.discard(event.cards);
        else await player.loseHp(1);
        if (alive(event.target)) await event.target.damage(counter.count + 1, player);
      },
      ai: { order: 8, result: { target: -1, player: player => player.hp > 1 ? 0 : -2 } },
    },
    [key(14143)]: {
      trigger: { player: 'damageEnd' }, getIndex: event => event.num,
      filter(event) { return event.num > 0 && Boolean(event.source); },
      check(event, player) { return attitude(player, event.source) <= 0; },
      async content(event, trigger, player) {
        const result = await player.judge(card => get.color(card) === 'red' ? 1 : 0).forResult();
        const source = trigger.source;
        if (!alive(source)) return;
        const color = result.color || (result.card && get.color(result.card));
        if (color === 'red') await source.damage(2, player);
        else if (color === 'black') {
          const count = Math.min(2, source.countDiscardableCards(player, 'he'));
          if (count) await player.discardPlayerCard(source, count, 'he', true);
        }
      },
    },
    [key(14150)]: {
      trigger: { player: 'useCardToPlayered' },
      filter(event) { return event.targets?.length === 1 && ['sha', 'juedou'].includes(event.card.name); },
      check(event, player) { return attitude(player, event.targets[0]) <= 0; },
      async content(event, trigger, player) {
        const use = trigger.getParent();
        use.baseDamage = (typeof use.baseDamage === 'number' ? use.baseDamage : 1) + 2;
        const target = trigger.targets[0];
        player.when('useCardAfter').filter(finished => finished === use)
          .step(async () => {
            if (!alive(player) || !alive(target)) return;
            const damaged = game.hasPlayer2(current => current.hasHistory('damage', damage =>
              damage.num > 0 && damage.card === use.card && damage.getParent('useCard') === use));
            const sha = { name: 'sha', isCard: true };
            if (damaged || !target.canUse(sha, player, false)) return;
            const choice = await player.chooseBool('虎烈', `是否令${name(target)}视为对你使用一张杀？`)
              .set('choice', get.effect(player, sha, target, player) > 0).forResult();
            if (choice.bool && alive(target) && alive(player)) await target.useCard(sha, player, false);
          });
      },
    },
    [key(14153)]: {
      trigger: { player: 'phaseZhunbeiBegin' }, forced: true, juexingji: true,
      shtDependencies: ['reyingzi', 'gzyinghun'],
      derivation: ['reyingzi', 'gzyinghun'],
      filter(event, player) { return !player.storage[key(14153)] && player.isDamaged(); },
      async content(event, trigger, player) {
        player.storage[key(14153)] = true;
        player.awakenSkill(key(14153));
        await player.loseMaxHp(1);
        if (!alive(player)) return;
        // DeriveSkills="712,108": ordinary 英姿/英魂, not Rogue spell 14146.
        await player.addSkills(['reyingzi', 'gzyinghun']);
        player.addTempSkill(`${key(14153)}_end`, 'phaseAfter');
      },
      subSkill: {
        end: {
          trigger: { player: 'phaseJieshuBegin' }, forced: true, charlotte: true,
          async content(event, trigger, player) {
            player.removeSkill(`${key(14153)}_end`);
            let recover = false;
            if (player.isDamaged()) {
              const choice = await player.chooseControl('摸三张牌', '回复2点体力')
                .set('prompt', '魂姿：选择本回合的结束奖励')
                .set('ai', () => player.getDamagedHp() >= 2 ? 1 : 0).forResult();
              recover = choice.index === 1;
            }
            if (recover) await player.recover(2);
            else await player.draw(3);
          },
        },
      },
    },
    [key(14175)]: {
      enable: 'phaseUse', usable: 1,
      filterTarget(card, player, target) { return target !== player && target.countCards('h') > 0; },
      async content(event, trigger, player) {
        const target = event.target;
        // NORMAL_JINGNANG means a trick in the hand zone (KIt.GetHandTypeByBaseType).
        const hasTrick = target.countCards('h', card => get.type2(card) === 'trick' && discardable(card, target, key(14175))) > 0;
        if (hasTrick) {
          const choice = await target.chooseToDiscard('灭计：弃置一张锦囊牌，或取消并弃置所有手牌', 'h', 1,
            card => get.type2(card) === 'trick').set('ai', card => 12 - get.value(card)).forResult();
          if (choice.bool) return;
        }
        const hand = target.getCards('h', card => discardable(card, target, key(14175)));
        if (hand.length) await target.discard(hand);
      },
      ai: { order: 7, result: { target: -1 } },
    },
    [key(14176)]: {
      enable: 'phaseUse',
      filter(event, player) { return round() - (player.storage[key(14176)] ?? -Infinity) >= 2 && others(player).length > 0; },
      filterTarget(card, player, target) { return target !== player; },
      async content(event, trigger, player) {
        player.storage[key(14176)] = round();
        const targets = others(player);
        if (targets.sortBySeat) targets.sortBySeat(event.target);
        else { const start = targets.indexOf(event.target); targets.push(...targets.splice(0, Math.max(0, start))); }
        for (const target of targets) {
          if (!alive(target)) continue;
          const amount = Math.abs(player.countCards('h') - target.countCards('h'));
          const hand = target.getCards('h');
          let discard = false;
          // FenCheng2024Rogue presents both choices even for an empty hand.
          if (hand.every(card => discardable(card, target, key(14176)))) {
            const choice = await target.chooseControl('弃置所有手牌', `受到${amount}点火焰伤害`)
              .set('prompt', '焚城：请选择一项')
              .set('ai', () => amount >= target.hp || hand.length < amount * 2 ? 0 : 1).forResult();
            discard = choice.index === 0;
          }
          if (discard) await target.discard(hand);
          else if (amount > 0) await target.damage(amount, 'fire', player);
        }
      },
      ai: { order: 1, result: { target: -1 } },
    },
    [key(14206)]: {
      trigger: { player: 'phaseUseBegin' }, direct: true,
      filter(event, player) { return player.countCards('he', card => discardable(card, player, key(14206))) > 0 && others(player).length > 0; },
      async content(event, trigger, player) {
        const choice = await player.chooseToDiscard('凶逆：弃置一张牌，令其他角色各弃置五张同花色牌，否则减少1点体力上限', 'he')
          .set('ai', card => 8 - get.value(card)).forResult();
        if (!choice.bool) return;
        player.logSkill(key(14206), others(player));
        const suit = get.suit(choice.cards[0]);
        for (const target of others(player)) {
          if (!alive(target)) continue;
          let paid = false;
          if (target.countCards('he', card => sameSuit(card, suit) && discardable(card, target, key(14206))) >= 5) {
            const response = await target.chooseToDiscard(`凶逆：弃置五张${get.translation(suit)}牌，否则减少1点体力上限`, 'he', 5,
              card => sameSuit(card, suit)).set('ai', card => target.maxHp <= 1 ? 10 - get.value(card) : 0).forResult();
            paid = response.bool;
          }
          if (!paid) await target.loseMaxHp(1);
        }
      },
    },
    [key(14207)]: {
      enable: 'phaseUse', usable: 1,
      filter() { return discardedThisTurn().length > 0; },
      content: awardDiscarded,
      group: `${key(14207)}_dying`,
      subSkill: {
        dying: {
          trigger: { global: 'dying' },
          filter() { return discardedThisTurn().length > 0; },
          check() { return true; }, content: awardDiscarded,
        },
      },
      ai: { order: 7, result: { player: 1 } },
    },
    [key(14208)]: {
      // cha_spellextend: mode151/164, id14208, par3=14209 (ZhiXiRogue).
      // The generic DeriveSkills field still names older ordinary effects.
      shtDependencies: [key(14209)], derivation: [key(14209)],
      trigger: { global: 'useCard' }, forced: true,
      filter(event, player) {
        if (event.player === player || get.color(event.card) !== 'black') return false;
        const count = event.player.getHistory('useCard', use => get.color(use.card) === 'black').length;
        return [3, 6, 9].includes(count);
      },
      async content(event, trigger, player) {
        const target = trigger.player;
        const count = target.getHistory('useCard', use => get.color(use.card) === 'black').length;
        if (count === 3) await target.loseHp(1);
        else if (count === 6) {
          const hand = player.countCards('h');
          if (hand < 9) await player.draw(9 - hand);
          else if (hand > 9) await player.chooseToDiscard(hand - 9, true, 'h');
        } else if (count === 9) target.addTempSkill(key(14209), 'phaseAfter');
      },
    },
    [key(14209)]: {
      charlotte: true, forced: true, locked: true, mark: true, marktext: '息',
      intro: { content: '本回合不能使用牌；仍可打出牌。' },
      mod: {
        cardEnabled() { return false; },
        cardUsable() { return false; },
        cardSavable() { return false; },
        // Do not use cardEnabled2/cardRespondable: “不能使用” does not
        // prohibit playing Slash/Dodge in an actual chooseToRespond event.
      },
    },
  };
}
