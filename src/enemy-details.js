// Read only the finalized encounter stats: the battle uses these same values
// after difficulty, chapter, time and enemy-count growth have been applied.
// Skill/equipment/terrain triggers can change them later during the actual game.
export function attachEnemyDetails(actor, { difficulty, enemyFirst = false, firstActorLabel } = {}) {
  const value = (name, fallback = 0) => Number.isFinite(actor[name]) ? actor[name] : fallback;
  const gain = value('armorGain');
  const armorLimit = value('maxArmor');
  const fixedCards = actor.cards?.length || 0;
  const draw = Math.max(0, value('initialDraw', fixedCards ? 0 : 4));
  actor.difficultyName = difficulty?.name || `难度 ${actor.difficultyId || 1}`;
  actor.bonusDetails = [
    { label:'摸牌阶段摸牌数', value:String(Math.max(0, value('draw', 2))) },
    { label:'出牌阶段出杀次数', value:String(value('slashCount', 1)) },
    { label:'护甲回复', value:gain > 0 ? `每轮回复${gain}点${armorLimit > 0 ? `，最大回复至${armorLimit}点` : ''}` : '不自动回复' },
    { label:'初始手牌', value:`${draw}张${fixedCards ? `随机牌，另有${fixedCards}张预置牌` : ''}` },
    { label:'初始护甲', value:String(Math.max(0, value('armor'))) },
  ];
  if (value('damageBonus')) actor.bonusDetails.push({ label:'造成伤害', value:`${value('damageBonus') > 0 ? '+' : ''}${value('damageBonus')}` });
  if (value('killDraw') > 0) actor.bonusDetails.push({ label:'击杀后摸牌', value:`${value('killDraw')}张` });
  actor.bonusDetails.push({ label:'先手角色', value:firstActorLabel || (enemyFirst ? '敌方' : '玩家') });
  return actor;
}
