/** Remaining reward effects, transcribed from official cha_spell descriptions
 * and the decoded client's RLi / Yhi / c9i / G7t / Y5t interaction classes.
 * RLi proves Ji Wu's derived IDs: 886, 704, 409, 117; similarly named newer
 * native versions are deliberately not substituted for these definitions.
 */
export function createRemainingRewardSkills({ lib, game, get, _status }) {
  const key = id => `sht_skill_${id}`;
  const alive = player => player && (!player.isIn || player.isIn());
  const discardable = (card, player, id) => lib.filter.cardDiscardable(card, player, key(id));
  const storage = (player, name) => player.getStorage(name);
  const skills = {};

  // The current native olqiangxi deals damage to its owner (3186); 886 loses HP.
  skills[key(886)] = {
    enable: 'phaseUse', usable: 2, position: 'he', selectCard: [0, 1],
    filterCard: card => get.subtype(card) === 'equip1',
    filterTarget: (card, player, target) => target !== player && !storage(player, key(886) + '_used').includes(target),
    async content(event, trigger, player) {
      player.addTempSkill(key(886) + '_used', 'phaseAfter');
      player.markAuto(key(886) + '_used', [event.target]);
      if (!event.cards?.length) await player.loseHp();
      if (alive(event.target)) await event.target.damage(1, player, 'nocard');
    },
    check: card => 8 - get.value(card),
    ai: { order: 8, result: { target: (player, target) => get.damageEffect(target, player, player) } },
    subSkill: { used: { charlotte: true, onremove: true } },
  };

  skills[key(704)] = {
    shtDependencies: ['fengyin'], trigger: { player: 'useCardToPlayered' }, logTarget: 'target',
    filter: event => event.card?.name === 'sha',
    check: (event, player) => get.attitude(player, event.target) <= 0,
    async content(event, trigger, player) {
      const target = trigger.target;
      // Disable unlocked skills before judgment, as stated by TieJiPo.
      target.addTempSkill('fengyin', 'phaseAfter');
      const judgment = await player.judge(() => 0).forResult();
      const suit = judgment.suit || get.suit(judgment.card);
      const choice = await target.chooseToDiscard('he', '铁骑：弃置一张' + get.translation(suit) + '牌，否则不能抵消此【杀】',
        card => get.suit(card, target) === suit)
        .set('ai', card => target.countCards('h', 'shan') ? 8 - get.value(card) : 0).forResult();
      if (!choice.bool) trigger.getParent().directHit.add(target);
    },
  };

  skills[key(409)] = {
    trigger: { player: ['loseAfter', 'phaseDiscardEnd'], global: ['equipAfter', 'addJudgeAfter', 'gainAfter', 'loseAsyncAfter', 'addToExpansionAfter'] },
    filter(event, player) {
      if (!game.hasPlayer(target => target !== player && target.countDiscardableCards(player, 'he') > 0)) return false;
      if (event.name === 'phaseDiscard') {
        const discarded = new Set(player.getHistory('lose', loss => loss.type === 'discard' && loss.getParent('phaseDiscard') === event)
          .flatMap(loss => loss.cards2 || []));
        return discarded.size >= 2;
      }
      return (event.getl(player)?.es?.length || 0) > 0;
    },
    async cost(event, trigger, player) {
      event.result = await player.chooseTarget('旋风：弃置一名其他角色的一张牌',
        (card, owner, target) => target !== owner && target.countDiscardableCards(owner, 'he') > 0)
        .set('ai', target => -get.attitude(player, target)).forResult();
    },
    async content(event, trigger, player) {
      await player.discardPlayerCard(event.targets[0], 'he', true);
      if (!alive(player) || !game.hasPlayer(target => target !== player && target.countDiscardableCards(player, 'he') > 0)) return;
      const second = await player.chooseTarget('旋风：可以再弃置一名其他角色的一张牌',
        (card, owner, target) => target !== owner && target.countDiscardableCards(owner, 'he') > 0)
        .set('ai', target => -get.attitude(player, target)).forResult();
      if (second.bool && second.targets?.length) await player.discardPlayerCard(second.targets[0], 'he', true);
    },
  };

  const jiwuOptions = [
    { id: 886, name: key(886), aliases: [key(886)] },
    { id: 704, name: key(704), aliases: [key(704), 'retieji'] },
    { id: 409, name: key(409), aliases: [key(409), 'xuanfeng'] },
    { id: 117, name: 'wansha', aliases: ['wansha'] },
  ];
  const availableJiwu = player => jiwuOptions.filter(option => !option.aliases.some(name => player.hasSkill(name)));
  skills[key(355)] = {
    shtDependencies: jiwuOptions.map(option => option.name), derivation: jiwuOptions.map(option => option.name),
    enable: 'phaseUse', position: 'he', filterCard: true,
    filter: (event, player) => availableJiwu(player).length > 0 && player.getCards('he').some(card => discardable(card, player, 355)),
    check: card => 7 - get.value(card),
    async content(event, trigger, player) {
      const available = availableJiwu(player).map(option => option.name);
      if (!available.length) return;
      const selected = available.length === 1 ? available[0] : (await player.chooseControl(available)
        .set('prompt', '极武：获得一个技能直到本回合结束').set('ai', () => 0).forResult()).control;
      if (available.includes(selected)) player.addTempSkill(selected, 'phaseAfter');
    },
    ai: { order: 12, result: { player: 1 } },
  };

  skills[key(3562)] = {
    trigger: { target: 'useCardToTargeted' },
    filter: event => event.card?.name === 'sha',
    check: (event, player) => !player.countCards('h', 'shan') || player.hp > 2,
    async content(event, trigger, player) {
      const use = trigger.getParent();
      use.directHit.add(player);
      player.when({ global: 'useCardAfter' }).filter(event => event === use).step(async (event, completed, owner) => {
        if (!alive(owner)) return;
        // Read the latest ordinary trick at settlement time. Do not replay a
        // delayed trick, the opponent's trick, or physical material cards.
        const previous = owner.getAllHistory('useCard', history => get.type(history.card, false) === 'trick').at(-1);
        if (previous) {
          const virtual = { name: previous.card.name, isCard: true };
          if (previous.card.nature) virtual.nature = previous.card.nature;
          if (owner.hasUseTarget(virtual)) {
            const result = await owner.chooseUseTarget(virtual, '效竭：视为使用上一张普通锦囊，或取消并摸一张牌').forResult();
            if (result.bool) return;
          }
        }
        await owner.draw();
      });
    },
  };

  skills[key(3598)] = {
    trigger: { player: 'useCardAfter' }, zhuanhuanji: true, mark: true, marktext: '☯',
    intro: { content: value => value ? '阴：使用的杀结算后，可弃置一张杀并对其他角色造成1点伤害。' : '阳：使用的杀结算后，可获得牌堆中两张杀，本回合不能使用这些牌。' },
    filter(event, player) {
      if (event.card?.name !== 'sha') return false;
      if (!player.storage[key(3598)]) return true;
      return player.getCards('he').some(card => get.name(card, player) === 'sha' && discardable(card, player, 3598)) &&
        game.hasPlayer(target => target !== player);
    },
    async cost(event, trigger, player) {
      if (!player.storage[key(3598)]) {
        event.result = await player.chooseBool('枪吟：从牌堆获得两张杀，本回合不能使用这些牌？').set('ai', () => true).forResult();
      } else {
        event.result = await player.chooseCardTarget({
          prompt: '枪吟：弃置一张杀，对一名其他角色造成1点伤害', position: 'he',
          filterCard: card => get.name(card, player) === 'sha' && discardable(card, player, 3598),
          filterTarget: (card, owner, target) => target !== owner,
          ai1: card => 7 - get.value(card), ai2: target => get.damageEffect(target, player, player),
        }).forResult();
      }
    },
    async content(event, trigger, player) {
      const yin = !!player.storage[key(3598)];
      player.changeZhuanhuanji(key(3598));
      if (yin) {
        await player.discard(event.cards);
        if (alive(event.targets[0])) await event.targets[0].damage(1, player, 'nocard');
      } else {
        const cards = [];
        for (let i = 0; i < 2; i++) {
          const card = get.cardPile2(card => get.name(card, false) === 'sha' && !cards.includes(card));
          if (card) cards.push(card);
        }
        if (!cards.length) return;
        // Store card identities before gain triggers, so they cannot be used
        // by an immediate gain reaction. Responses are still allowed.
        player.addTempSkill(key(3598) + '_ban', 'phaseAfter');
        player.markAuto(key(3598) + '_ban', cards);
        await player.gain(cards, 'gain2');
      }
    },
    subSkill: {
      ban: {
        charlotte: true, onremove: true,
        mod: {
          cardEnabled(card, player) {
            const blocked = storage(player, key(3598) + '_ban');
            if ([card, ...(card.cards || [])].some(material => blocked.includes(material))) return false;
          },
        },
      },
    },
  };

  const gainedFromOthers = (event, player) => {
    const gained = event.getg(player) || [];
    return game.filterPlayer(target => target !== player).flatMap(source => {
      const loss = event.getl(source);
      return gained.filter(card => loss?.cards2?.includes(card)).map(card => ({ source, card, suit: get.suit(card, player) }));
    });
  };
  const zhaliCost = (card, player, entry) => card !== entry.card && get.suit(card, player) === entry.suit && discardable(card, player, 14220);
  skills[key(14220)] = {
    trigger: { player: 'gainAfter', global: 'loseAsyncAfter' }, getIndex: gainedFromOthers,
    filter: (event, player, name, entry) => !!entry && alive(entry.source) && player.getCards('h').some(card => zhaliCost(card, player, entry)),
    logTarget: (event, player, name, entry) => entry.source,
    async cost(event, trigger, player) {
      const entry = event.indexedData;
      event.result = await player.chooseCard('h', '诈戾：弃置另一张同花色手牌，对' + get.translation(entry.source) + '造成1点伤害',
        card => zhaliCost(card, player, entry))
        .set('ai', card => get.damageEffect(entry.source, player, player) > 0 ? 8 - get.value(card) : 0).forResult();
    },
    async content(event, trigger, player) {
      const source = event.indexedData.source;
      await player.discard(event.cards);
      if (alive(source)) await source.damage(1, player, 'nocard');
    },
  };

  const zexingKey = key(3854) + '_used';
  const zexingTarget = (player, target) => target !== player && alive(target) && !storage(player, zexingKey).includes(target);
  const zexingCards = (player, target, suit) => target.getCards('he').filter(card => get.suit(card, target) !== suit && lib.filter.canBeGained(card, player, target, key(3854)));
  skills[key(3854)] = {
    enable: 'phaseUse', usable: 1, position: 'he', filterCard: true, discard: false, lose: false, delay: false,
    filter: (event, player) => player.countCards('he') > 0 && game.hasPlayer(target => zexingTarget(player, target)),
    filterTarget: (card, player, target) => zexingTarget(player, target),
    async content(event, trigger, player) {
      const shown = event.cards[0], suit = get.suit(shown, player);
      await player.showCards([shown], '择行');
      let target = event.target;
      while (alive(player) && alive(target)) {
        player.addTempSkill(zexingKey, 'phaseAfter');
        player.markAuto(zexingKey, [target]);
        // Y5t.hadDiffColorCard explicitly requires >=2 hand cards and >=2
        // eligible hand/equipment cards before enabling the transfer choice.
        const transferable = target.countCards('h') >= 2 && zexingCards(player, target, suit).length >= 2;
        const choice = transferable ? (await target.chooseControl('交出两张牌', '失去1点体力')
          .set('prompt', '择行：令其获得两张异花色牌并获得展示牌，或失去1点体力')
          .set('ai', () => target.hp <= 2 ? 0 : 1).forResult()).control : '失去1点体力';
        if (choice === '交出两张牌') {
          await player.gainPlayerCard(target, 'he', 2, true, 'visible')
            .set('filterButton', button => zexingCards(player, target, suit).includes(button.link));
          if (alive(target) && player.getCards('he').includes(shown)) await player.give(shown, target);
          break;
        }
        await target.loseHp();
        if (!alive(player) || !player.getCards('he').includes(shown) || !game.hasPlayer(other => zexingTarget(player, other))) break;
        const next = await player.chooseTarget('择行：可以重新选择一名本回合未选择过的角色',
          (card, owner, other) => zexingTarget(owner, other))
          .set('ai', other => -get.attitude(player, other)).forResult();
        if (!next.bool || !next.targets?.length) break;
        target = next.targets[0];
      }
    },
    check: card => 6 - get.value(card),
    ai: { order: 7, result: { target: (player, target) => -1 } },
    subSkill: { used: { charlotte: true, onremove: true } },
  };

  return skills;
}
