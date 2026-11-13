import { createEnemyPassiveSkills } from './enemy-passive-skills.js';
import { createEnemyReactiveSkills } from './enemy-reactive-skills.js';
import { createEnemyCombatSkills } from './enemy-combat-skills.js';

/** Original spell IDs are kept separate from every playable general's skills. */
export function installEnemySkills(catalog, dependencies) {
  const {lib,game}=dependencies;
  const sources=new Map([...(catalog.enemyReferences?.skills || []),...(catalog.spells || [])].map(item=>[Number(item.id),item]));
  const definitions={...createEnemyPassiveSkills(dependencies),...createEnemyReactiveSkills(dependencies),...createEnemyCombatSkills(dependencies)};
  const installed=[],skipped=[];
  for(const [id,definition] of Object.entries(definitions)) {
    const sourceId=Number(/^sht_enemy_(\d+)/.exec(id)?.[1]), source=sources.get(sourceId);
    if(!definition || !source) continue;
    const missing=(definition.shtDependencies || []).filter(key=>!lib.skill[key]&&!definitions[key]);
    if(missing.length) { skipped.push({id,sourceId,missing}); continue; }
    if(!lib.skill[id]) {
      lib.skill[id]={...definition,shtOriginalSpellId:sourceId,shtEnemyOnly:true};
      lib.translate[id]=source.name;
      lib.translate[id+'_info']=definition.shtApproximate
        ? [definition.shtImplementedDescription || source.description?.split('###')[0] || '',...(definition.shtUnsupportedEffects || []).map(text=>'尚未接入：'+text)].join('<br>')
        : source.description?.split('###')[0] || '';
      if(!lib.translate[id+'_bg'])lib.translate[id+'_bg']=source.name?.slice(0,1) || '技';
    }
    installed.push({id,sourceId,name:source.name});
  }
  // Install all definitions first so inherited/derived groups resolve together.
  for(const {id} of installed)game.finishSkill?.(id);
  return {installed,skipped};
}
