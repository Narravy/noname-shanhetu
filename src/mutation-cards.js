// The only extra card kind required by seed 5046. Keep the installed engine's
// implementation when available; otherwise use its card/yingbian.js definition.
// Registration does not add cards to another mode's pile.
export function installMutationCards({ lib, game }) {
  if (lib.card.dongzhuxianji) return;
  lib.card.dongzhuxianji = {
    audio: true, fullskin: true, type: 'trick', enable: true,
    selectTarget: -1, toself: true, modTarget: true,
    filterTarget(card, player, target) { return target === player; },
    async content(event) {
      await event.target.chooseToGuanxing(2);
      await event.target.draw(2);
    },
    ai: { basic: { order: 7.2, useful: 4.5, value: 9.2 }, result: { target: 2.5 }, tag: { draw: 2 } },
  };
  lib.translate.dongzhuxianji = '洞烛先机';
  lib.translate.dongzhuxianji_info = '出牌阶段，对包含你在内的一名角色使用。目标角色卜算2，然后摸两张牌。';
  game.finishCard('dongzhuxianji');
}
