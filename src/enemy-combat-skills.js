/**
 * Dedicated OL Rogue combat variants. IDs and effects come from cha_spell.json.
 * Event/zone handling follows noname's repojun, retieji, wushuang, new_liyu,
 * guixin, xinshensu, olshuangxiong, spolzhouxuan, olsbshenli and reluoyi.
 * Ordinary general skills are never mutated.
 */
export function createEnemyCombatSkills({ lib, game, get, _status, ui }) {
  const key = id => 'sht_enemy_' + id;
  const hostile = (player, target) => get.attitude(player, target) <= 0;
  const random = list => list.randomGet ? list.randomGet() : list[Math.floor(Math.random() * list.length)];
  const alive = player => player?.isIn?.();
  const skills = {};

  // 破军: all hand cards are inaccessible until the current turn ends.
  skills[key(14112)] = {
    trigger: { player: 'useCardToPlayered' }, logTarget: 'target',
    filter: event => event.card.name === 'sha' && event.target.countCards('h') > 0,
    check: (event, player) => hostile(player, event.target),
    async content(event, trigger) {
      const target = trigger.target, tag = key(14112) + '_return';
      target.addSkill(tag);
      const next = target.addToExpansion(target.getCards('h'), target, 'giveAuto');
      next.gaintag.add(tag);
      await next;
    },
    group: key(14112) + '_damage',
    subSkill: {
      damage: {
        trigger: { source: 'damageBegin1' }, forced: true, locked: false,
        filter: (event, player) => event.card?.name === 'sha' && player.countCards('h') >= event.player.countCards('h') && player.countCards('e') >= event.player.countCards('e'),
        async content(event, trigger) { trigger.num++; },
      },
      return: {
        trigger: { global: 'phaseEnd' }, forced: true, popup: false, charlotte: true,
        filter: (event, player) => player.getExpansions(key(14112) + '_return').length > 0,
        async content(event, trigger, player) {
          const tag = key(14112) + '_return', cards = player.getExpansions(tag);
          if (cards.length) await player.gain(cards, 'draw');
          player.removeSkill(tag);
        },
        intro: { markcount: 'expansion', content: '共有$张暂时移出的手牌' },
      },
    },
  };

  // 雄乱: repeatable once per play phase; only one enabled equipment slot is lost.
  skills[key(14116)] = {
    enable: 'phaseUse', usable: 1,
    filter: (event, player) => !player.isDisabledJudge() || player.hasEnabledSlot(),
    filterTarget: (card, player, target) => target !== player,
    async content(event, trigger, player) {
      const slots = [];
      for (let i = 1; i <= 5; i++) if (player.countEnabledSlot(i) > 0) slots.push(i);
      if (slots.length) await player.disableEquip(random(slots));
      if (!player.isDisabledJudge()) await player.disableJudge();
      player.addTempSkill(key(14116) + '_effect');
      player.markAuto(key(14116) + '_effect', [event.target]);
      event.target.addTempSkill(key(14116) + '_ban');
    },
    ai: { order: 12, result: { target: -2 } },
    subSkill: {
      effect: {
        charlotte: true, onremove: true,
        mod: {
          targetInRange(card, player, target) { if (player.getStorage(key(14116) + '_effect').includes(target)) return true; },
          cardUsableTarget(card, player, target) { if (player.getStorage(key(14116) + '_effect').includes(target)) return true; },
        },
        intro: { content: '本回合对$使用牌无距离和次数限制' },
      },
      ban: { charlotte: true, mark: true, mod: { cardEnabled2(card) { if (get.position(card) === 'h') return false; } }, intro: { content: '本回合不能使用或打出手牌' } },
    },
  };

  skills[key(14122)] = {
    shtDependencies: ['fengyin'],
    trigger: { player: 'useCardToPlayered' }, logTarget: 'target',
    filter: event => event.card.name === 'sha', check: (event, player) => hostile(player, event.target),
    async content(event, trigger, player) {
      const target = trigger.target;
      target.addTempSkill('fengyin');
      const judgment = await player.judge(() => 0).forResult();
      const color = judgment.color || get.color(judgment.card);
      const cards = target.getCards('he', card => get.color(card, target) === color);
      let discarded = false;
      if (cards.length && cards.every(card => lib.filter.cardDiscardable(card, target, key(14122)))) {
        const result = await target.chooseToDiscard(cards.length, 'he', '铁骑：弃置全部' + get.translation(color) + '牌，否则不能抵消此【杀】', card => get.color(card, target) === color)
          .set('ai', card => target.countCards('h', 'shan') ? 8 - get.value(card) : 0).forResult();
        discarded = !!result.bool;
      }
      if (!discarded) trigger.getParent().directHit.add(target);
    },
  };

  const slashCount = player => Math.max(1, Math.min(5, player.getAllHistory('useCard', event => event.card?.name === 'sha').length));
  skills[key(14127)] = {
    forced: true, locked: true, group: [key(14127) + '_sha', key(14127) + '_duel'],
    subSkill: {
      sha: {
        trigger: { player: 'useCardToPlayered' }, forced: true,
        filter: event => event.card.name === 'sha' && !event.getParent().directHit.includes(event.target),
        async content(event, trigger, player) {
          const args = trigger.getParent().customArgs, id = trigger.target.playerid;
          args[id] ||= {};
          args[id].shanRequired = (typeof args[id].shanRequired === 'number' ? args[id].shanRequired : 1) + slashCount(player) - 1;
        },
      },
      duel: {
        trigger: { player: 'useCardToPlayered', target: 'useCardToTargeted' }, forced: true,
        filter: event => event.card.name === 'juedou',
        async content(event, trigger, player) {
          const opponent = player === trigger.player ? trigger.target : trigger.player;
          const args = trigger.getParent().customArgs, id = trigger.target.playerid;
          args[id] ||= {}; args[id].shaReq ||= {};
          args[id].shaReq[opponent.playerid] = (args[id].shaReq[opponent.playerid] || 1) + slashCount(player) - 1;
        },
      },
    },
  };

  skills[key(14128)] = {
    trigger: { source: 'damageSource' }, direct: true,
    filter: (event, player) => event.card?.name === 'sha' && event.player !== player && alive(event.player) && !event._notrigger?.includes(event.player) && event.player.countGainableCards(player, 'hej') > 0,
    async content(event, trigger, player) {
      const target = trigger.player, names = { h: '手牌区', e: '装备区', j: '判定区' };
      const zones = ['h', 'e', 'j'].filter(zone => target.countGainableCards(player, zone) > 0);
      const choice = await player.chooseControl(...zones.map(zone => names[zone]), 'cancel2').set('prompt', '利驭：获得其一个区域内的所有牌').set('ai', () => hostile(player, target) ? 0 : zones.indexOf('j') >= 0 ? zones.indexOf('j') : zones.length).forResult();
      const zone = zones.find(zone => names[zone] === choice.control);
      if (!zone) return;
      const cards = target.getCards(zone).filter(card => lib.filter.canBeGained(card, player, target, key(14128)));
      if (!cards.length) return;
      player.logSkill(key(14128), target);
      await player.gain(cards, target, 'giveAuto', 'bySelf');
      const obtainedCards = cards.filter(card => get.owner(card) === player);
      const obtained = obtainedCards.length;
      if (!obtained) return;
      if (!obtainedCards.some(card => get.type(card) === 'equip')) { if (alive(target)) await target.draw(); return; }
      if (!alive(target) || !game.hasPlayer(other => other !== player && other !== target && player.canUse({ name: 'juedou' }, other))) return;
      const result = await target.chooseTarget(true, '利驭：令其对另一名角色使用伤害为' + obtained + '的【决斗】', (card, chooser, other) => other !== chooser && other !== player && player.canUse({ name: 'juedou' }, other))
        .set('ai', other => get.effect(other, { name: 'juedou' }, player, target)).forResult();
      if (result.targets?.length) {
        const next = player.useCard({ name: 'juedou', isCard: true }, result.targets[0], 'noai');
        next.baseDamage = obtained;
        await next;
      }
    },
  };

  skills[key(14138)] = {
    trigger: { player: 'damageEnd' }, getIndex: event => event.num,
    filter: (event, player) => event.num > 0 && game.hasPlayer(other => other !== player && other.countGainableCards(player, 'hej') > 0),
    check: () => true,
    async content(event, trigger, player) {
      const targets = game.filterPlayer(other => other !== player);
      if (targets.sortBySeat) targets.sortBySeat();
      for (const target of targets) {
        const zones = ['h', 'e', 'j'].filter(zone => target.countGainableCards(player, zone) > 0);
        if (!zones.length) continue;
        const cards = target.getCards(random(zones)).filter(card => lib.filter.canBeGained(card, player, target, key(14138)));
        if (cards.length) await player.gain(cards, target, 'giveAuto', 'bySelf');
      }
      await player.turnOver();
    },
  };

  skills[key(14144)] = {
    group: [key(14144) + '_judge', key(14144) + '_use', key(14144) + '_discard'],
    subSkill: {},
  };
  for (const [suffix, phase, description] of [
    ['judge', 'phaseJudgeBefore', '跳过判定阶段和摸牌阶段'],
    ['use', 'phaseUseBefore', '跳过出牌阶段'],
    ['discard', 'phaseDiscardBefore', '跳过弃牌阶段并翻面'],
  ]) {
    skills[key(14144)].subSkill[suffix] = {
      trigger: { player: phase },
      async cost(event, trigger, player) {
        event.result = await player.chooseTarget('神速：' + description + '，视为使用无距离限制的【杀】', (card, source, target) => target !== source && source.canUse({ name: 'sha' }, target, false))
          .set('ai', target => get.effect(target, { name: 'sha' }, player, player)).forResult();
      },
      async content(event, trigger, player) {
        trigger.cancel();
        if (suffix === 'judge') player.skip('phaseDraw');
        if (suffix === 'discard') await player.turnOver();
        const next = player.useCard({ name: 'sha', isCard: true }, event.targets[0], false);
        // cancel() records the current phase immediately; skip() queues phaseDraw
        // and records it later. Both phases have already been paid for this use.
        const skipped = player.getHistory('skipped').length;
        next.baseDamage = 1 + skipped + (suffix === 'judge' ? 1 : 0);
        await next;
      },
    };
  }

  skills[key(14169)] = {
    trigger: { player: 'phaseDrawEnd' }, filter: (event, player) => player.countCards('he') > 0,
    async cost(event, trigger, player) {
      event.result = await player.chooseToDiscard('he', '双雄：弃置一张牌，本回合将不同颜色的牌当【决斗】', 'chooseonly').set('ai', card => 6 - get.value(card)).forResult();
    },
    async content(event, trigger, player) {
      const color = get.color(event.cards[0], player);
      await player.modedDiscard(event.cards);
      player.markAuto(key(14169) + '_effect', [color]);
      player.addTempSkill(key(14169) + '_effect');
    },
    group: key(14169) + '_return',
    subSkill: {
      effect: {
        enable: 'chooseToUse', viewAs: { name: 'juedou' }, position: 'hes', onremove: true, charlotte: true,
        filterCard: (card, player) => player.getStorage(key(14169) + '_effect').some(color => get.color(card, player) !== color),
        viewAsFilter: player => player.hasCard(card => player.getStorage(key(14169) + '_effect').some(color => get.color(card, player) !== color), 'hes'),
        prompt: '将与双雄弃牌颜色不同的一张牌当【决斗】使用',
        check: card => 6 - get.value(card), ai: { order: 7 },
        group: key(14169) + '_damage',
      },
      damage: {
        trigger: { player: 'useCard1' }, forced: true, popup: false, charlotte: true,
        filter: event => event.card.name === 'juedou' && event.skill === key(14169) + '_effect',
        async content(event, trigger, player) {
          trigger.baseDamage = Math.max(1, player.getRoundHistory('useCard', row => row.skill === key(14169) + '_effect').length);
        },
      },
      return: {
        trigger: { player: 'phaseJieshuBegin' }, forced: true, locked: false,
        filter: (event, player) => player.getHistory('damage').some(row => row.cards?.some(card => get.position(card, true) === 'd')),
        async content(event, trigger, player) {
          const cards = [...new Set(player.getHistory('damage').flatMap(row => row.cards || []))].filter(card => get.position(card, true) === 'd');
          if (cards.length) await player.gain(cards, 'gain2');
        },
      },
    },
  };

  skills[key(14183)] = {
    trigger: { player: ['phaseDiscardBegin', 'useCard'] },
    filter: (event, player) => event.name === 'phaseDiscard' ? player.countCards('h') > 0 : player.getExpansions(key(14183)).length > 0,
    async cost(event, trigger, player) {
      if (trigger.name !== 'phaseDiscard') { event.result = { bool: true }; return; }
      event.result = await player.chooseCard('h', '周旋：将任意张手牌暗置为“旋”', [1, player.countCards('h')])
        .set('allowChooseAll', true).set('ai', card => ui.selected.cards.length < player.needsToDiscard() ? 100 - get.value(card) : 6 - get.value(card)).forResult();
    },
    async content(event, trigger, player) {
      if (trigger.name === 'phaseDiscard') {
        const next = player.addToExpansion(event.cards, player, 'giveAuto');
        next.gaintag.add(key(14183));
        await next;
      } else {
        await player.loseToDiscardpile(random(player.getExpansions(key(14183))));
        await player.draw();
        if (!player.isMaxHandcard(true)) {
          const count = player.getExpansions(key(14183)).length;
          if (count) await player.draw(count);
        }
      }
    },
    marktext: '旋',
    intro: { markcount: 'expansion', mark(dialog, storage, player) { const cards = player.getExpansions(key(14183)); if (player.isUnderControl(true)) dialog.addAuto(cards); else return '共有' + cards.length + '张“旋”'; } },
    onremove(player) { const cards = player.getExpansions(key(14183)); if (cards.length) player.loseToDiscardpile(cards); },
  };

  skills[key(14189)] = {
    trigger: { player: 'useCardToPlayered' },
    filter: event => event.card.name === 'sha' && event.isFirstTarget && !event.getParent().shtShenli,
    check(event, player) { return game.filterPlayer(target => target !== player && player.canUse(event.card, target, false)).reduce((sum, target) => sum + get.effect(target, event.card, player, player), 0) >= 0; },
    async content(event, trigger, player) {
      const use = trigger.getParent(); use.shtShenli = true;
      const extra = game.filterPlayer(target => target !== player && !use.targets.includes(target) && player.canUse(trigger.card, target, false));
      use.targets.push(...extra);
    },
    group: key(14189) + '_after',
    subSkill: {
      after: {
        trigger: { player: 'useCardAfter' }, forced: true, popup: false,
        filter: event => !!event.shtShenli,
        async content(event, trigger, player) {
          const sum = player.getHistory('sourceDamage', row => row.getParent('useCard') === trigger).reduce((value, row) => value + row.num, 0);
          if (sum > 0) await player.draw(Math.min(5, sum));
          if (sum <= player.hp) return;
          const targets = trigger.targets.filter(target => alive(target) && player.canUse(trigger.card, target, false));
          if (targets.length && (!trigger.cards?.length || trigger.cards.every(card => !get.owner(card)))) await player.useCard(trigger.card, trigger.cards || [], targets, false);
        },
      },
    },
  };

  skills[key(14191)] = {
    trigger: { player: 'phaseDrawBegin1' }, direct: true,
    filter: (event, player) => !event.numFixed && player.hp > 0,
    async content(event, trigger, player) {
      const show = await player.chooseBool('裸衣：亮出牌堆顶' + player.hp + '张牌？').set('ai', () => true).forResult();
      if (!show.bool) return;
      player.logSkill(key(14191));
      const x = player.hp, cards = get.cards(x);
      await game.cardsGotoOrdering(cards);
      await player.showCards(cards, '裸衣');
      const usable = cards.filter(card => get.type(card) === 'basic' || card.name === 'juedou' || get.subtype(card) === 'equip1');
      const take = await player.chooseBool('裸衣：跳过摸牌阶段，获得其中基本牌、武器和【决斗】，杀/决斗伤害+' + x + '？').set('ai', () => usable.length >= 2 || player.countCards('h', 'sha') > 0).forResult();
      if (take.bool) {
        trigger.cancel();
        player.storage[key(14191) + '_damage'] = x;
        player.addTempSkill(key(14191) + '_damage', { player: 'phaseBefore' });
        if (usable.length) await player.gain(usable, 'gain2');
      }
    },
    subSkill: {
      damage: {
        trigger: { source: 'damageBegin1' }, forced: true, charlotte: true, onremove: true,
        filter: event => ['sha', 'juedou'].includes(event.card?.name) && event.notLink(),
        async content(event, trigger, player) { trigger.num += Number(player.storage[key(14191) + '_damage']) || 0; },
      },
    },
  };
  return skills;
}
