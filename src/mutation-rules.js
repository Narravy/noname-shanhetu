import { createShanhetuDeck } from './deck.js';
import { isExpeditionStartOnlyTactic } from './tactic-scope.js';
import { isForeignModeTactic } from './foreign-mode-tactics.js';
import { ownedRewardSkillIds } from './run-skills.js';

const ids = value => String(value ?? '').split(/[;,]/).map(Number).filter(Number.isFinite).filter(Boolean);
const unique = values => [...new Set(values)];
const allActors = spec => [spec.player, ...(spec.allies || []), ...(spec.enemies || [])];
const spellSkill = id => `sht_mutation_spell_${id}`;
const knownSpells = new Set([50,76,255,375,418,426,615,628,765,833,3121,3286,3432,14255]);
const sceneSkills = {13162:'damage_plus',13163:'opening_equipment',13165:'no_chain',13166:'no_nature',13167:'judge_thunder',13168:'shan_sha',13169:'tao_jiu',13205:'damage_minus',13207:'skip_discard',13208:'skip_judge',13209:'card_limit_10',13210:'card_limit_15',13212:'damage_cap',13305:'hand_change',13306:'equip_change',13388:'red_trick_sha',14256:'distance_one'};
// Explicit original-general matches, checked against their native skill sets.
// OL's display name alone loses the distinction between 刘备/神刘备, etc.
const originalCharacters = {30:['xiaoqiao'],457:['ol_xiaoqiao'],381:['liyan'],139:['sp_jiangwei'],220:['shen_liubei'],118:['zhugeke'],604:['ol_gaoshun'],513:['huojun'],593:['ol_sb_guanyu']};
// These native variants retain the conflicting operation in the original spell.
// Do not infer aliases by stripping character or DIY skill prefixes.
const conflictingNativeSkills = {
  37:['longdan','ollongdan','sblongdan','jdlongdan'],
  76:['hongyan','xinhongyan','rehongyan','olhongyan','ylyghongyan','jdsbhongyan'],
  926:['olhongyan'],255:['kunfen','yuzuru_kunfen'],765:['fulin'],822:['drlt_qianjie'],
  833:['nzry_jieying'],940:['ollongdan'],3121:['qiongshou'],3305:['aocai'],
  3479:['olsbweilin'],21086:['starweilin'],
};

function hash(text) { let n=2166136261; for(const char of String(text)){n^=char.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0; }
function seeded(seed) { let n=seed||1;return () => {n^=n<<13;n^=n>>>17;n^=n<<5;return (n>>>0)/4294967296;}; }
const pick = (values, random) => values[Math.floor(random()*values.length)];
const sourceSpell = (catalog,id) => catalog.indexes?.spells?.get(Number(id)) || catalog.spells?.find(row=>row.id===Number(id));
const mutationIds = run => unique([...(run.mutations || []),...(run.fixedMutations || [])].map(value=>Number(value?.id ?? value?.seed ?? value)).filter(Boolean));
function tacticReplacement(row,{catalog,adapters,run},active) {
  const all=(run.tactics||[]).map(id=>adapters.resolve('tactic',id)).filter(Boolean);
  const highest=Math.max(0,...all.map(item=>item.rarity||1));
  const owned=all.filter(item=>(item.rarity||1)===highest&&item.nativeId&&(!active||active.includes(item.nativeId))&&!ids(row.huchizhanfa).includes(item.id));
  const pool=catalog.tactics.filter(item=>item.seasonIds?.includes(5)&&!item.deprecated&&!item.name.includes('套装')&&!isExpeditionStartOnlyTactic(item.id)&&!isForeignModeTactic(item.id))
    .map(item=>adapters.resolve('tactic',item.id)).filter(item=>item?.nativeId&&item.supported&&item.rarity===highest&&!ids(row.huchizhanfa).includes(item.id)&&!(run.tactics||[]).includes(item.id));
  return {owned,pool};
}

/** Candidate exclusions come from the original seed table, not difficulty guesses. */
export function mutationAllowed(row,{catalog,adapters,character,run={}}={}) {
  if(!row || !Number.isInteger(Number(row.seed)))return false;
  if(ids(row.huchizhanfa).some(id=>(run.tactics||[]).includes(id)))return false;
  const hero=typeof character==='object'?character:adapters?.characterList?.find(item=>item.id===character);
  const generalId=Number(hero?.generalId);
  if(generalId && ids(row.huchiwujiang).includes(generalId))return false;
  const acquired=ownedRewardSkillIds(run).map(id=>adapters?.resolve('skill',id)?.nativeId).filter(Boolean);
  const innate=(hero?.skills||[]).filter(id=>!Object.hasOwn(run.innateReplacements||{},id));
  const owned=new Set([...innate,...acquired]);
  if(Number(row.seed)===5026 && !owned.size)return false;
  if(Number(row.seed)===5031 && (!owned.size || !catalog.skills.some(source=>{const resolved=adapters.resolve('skill',source.id);return resolved?.nativeId&&resolved.exact&&!owned.has(resolved.nativeId);})))return false;
  if(Number(row.seed)===5030){const replacement=tacticReplacement(row,{catalog,adapters,run});if(!replacement.owned.length||!replacement.pool.length)return false;}
  for(const id of ids(row.huchijineng)) {
    const source=sourceSpell(catalog,id),resolved=adapters?.resolveSkill(source);
    if(resolved?.nativeId && owned.has(resolved.nativeId))return false;
    if(source&&(conflictingNativeSkills[id]||[]).some(nativeId=>owned.has(nativeId)&&adapters.skillName?.(nativeId)===source.name))return false;
  }
  // Character conflicts are also checked by exact native IDs when the current
  // catalog has that original character; never strip DIY/general prefixes.
  for(const id of ids(row.huchiwujiang)) {
    if(originalCharacters[id]?.includes(hero?.id))return false;
  }
  if(Number(row.type)===2)return (ids(row.strpra).length?ids(row.strpra):[Number(row.pra1)]).every(id=>knownSpells.has(id)||adapters?.resolveSkill(sourceSpell(catalog,id))?.exact);
  if(Number(row.type)===3)return Boolean(sceneSkills[Number(row.pra1)]);
  if(Number(row.type)===6 && Number(row.seed)!==5065)return [...ids(row.strpra),...ids(row.strpra1)].every(id=>Boolean(adapters?.cardSpec(id,true)));
  return [1,4,5,6,7].includes(Number(row.type));
}

/** Public rewards are chest items and record-score percentages, not folios. */
export function mutationRewards(selected,catalog) {
  const selectedIds=Array.isArray(selected)?selected:mutationIds(selected||{});
  const rows=unique(selectedIds.map(value=>Number(value?.id??value))).map(id=>catalog.rules.seed.find(row=>Number(row.seed)===id)).filter(Boolean);
  let chests=0,scorePercent=0;
  for(const row of rows){const item=String(row.item||'').split(',').map(Number);if(item[0]===14000401)chests+=item[1]||0;scorePercent+=Number(String(row.desc1||'').match(/战绩分\+(\d+)%/)?.[1]||0);}
  return {chests,scorePercent};
}

/** Pure with respect to the saved run: repeated previews never advance RNG. */
export function applyMutationsToSpec(spec,{catalog,adapters,run}) {
  if(spec.mutationApplied)return spec;
  spec.mutationApplied=true;
  const actors=allActors(spec), hero=adapters.characterList?.find(item=>item.id===run.character);
  const key=`${run.id}:${run.cityId}:${run.source?.nodeId ?? ''}:${spec.battleId}`;
  const random=seeded(Number(run.battleMutations?.[key]?.seed)||hash(key));
  const rows=mutationIds(run).map(id=>catalog.rules.seed.find(row=>Number(row.seed)===id)).filter(Boolean);
  spec.mutations=rows.map(row=>({id:Number(row.seed),name:row.name,description:row.desc,reward:row.desc1||''}));
  spec.mutationChoices=[];
  spec.deck=(spec.deck||createShanhetuDeck()).map(card=>card.slice());
  const affected = row => actors.filter((actor,index)=>Number(row.goal)===1||Number(row.goal)===2&&index===0||Number(row.goal)===3&&index>=(1+(spec.allies?.length||0))||Number(row.goal)===4&&spec.enemies.includes(actor)&&Boolean(spec.player.boss||actor.boss||spec.boss));
  function addSkill(actor,id,source) {
    if(source){
      if(actor.skillDetails?.some(item=>Number(item.id)===Number(source.id)))return;
      const existing=adapters.resolveSkill(source);
      const installed=[...(actor.skills||[]),...(actor===spec.player?(hero?.skills||[]).filter(skill=>!(actor.removedSkills||[]).includes(skill)):[])];
      if(existing?.exact&&installed.includes(existing.nativeId))return;
    }
    actor.skills=unique([...(actor.skills||[]),id]);
    if(source){actor.skillDetails ||= [];if(!actor.skillDetails.some(item=>item.nativeId===id))actor.skillDetails.push({id:source.id,nativeId:id,name:source.name,description:source.description,supported:true,exact:true});}
  }
  for(const row of rows) {
    const targets=affected(row),type=Number(row.type),amount=(Number(row.pra2)===1?-1:1)*(Number(row.pra3)||0);
    if(type===1)for(const actor of targets){
      const field={1:'hp',2:'armor',3:'armorGain',4:'initialDraw',5:'draw',6:'handLimit',7:'slashCount'}[row.pra1];if(!field)continue;
      if(field==='hp'){
        const oldHp=actor.hp,oldMax=actor.maxHp;actor.maxHp=Math.max(1,oldMax+amount);actor.hp=Math.max(1,Math.min(actor.maxHp,oldHp+amount));
        if(!spec.enemies.includes(actor)){actor.temporaryHpDelta=(actor.temporaryHpDelta||0)+actor.hp-oldHp;actor.temporaryMaxHpDelta=(actor.temporaryMaxHpDelta||0)+actor.maxHp-oldMax;}
      }else{const fallback={initialDraw:4,draw:2,slashCount:1}[field]||0;actor[field]=(actor[field]??fallback)+amount;if(field!=='handLimit')actor[field]=Math.max(0,actor[field]);}
    }
    if(type===2)for(const actor of targets)for(const id of ids(row.strpra).length?ids(row.strpra):[Number(row.pra1)]){
      const source=sourceSpell(catalog,id);const resolved=knownSpells.has(id)?spellSkill(id):adapters.resolveSkill(source)?.nativeId;
      if(resolved)addSkill(actor,resolved,source);
    }
    if(type===3)for(const actor of targets)addSkill(actor,'sht_mutation_'+sceneSkills[Number(row.pra1)]);
    if(type===4){
      if(Number(row.pra1)===1)for(const actor of targets)addSkill(actor,'sht_mutation_tao_sha_shan');
      if(Number(row.pra1)===6)spec.firstActorIndex=Math.floor(random()*actors.length);
      if(Number(row.pra1)===7){spec.firstActorRule='highestHp';spec.firstActorIndex=actors.reduce((best,actor,index)=>actor.hp>actors[best].hp?index:best,0);}
      if([2,5].includes(Number(row.pra1))){
        // Character traits are a separate progression system, not removable
        // character/reward skills in the mutation's random replacement pool.
        const actor=spec.player,owned=unique([...(hero?.skills||[]).filter(id=>!(actor.removedSkills||[]).includes(id)),...(actor.skills||[])]).filter(id=>!id.startsWith('sht_mutation_')&&!id.startsWith('sht_trait_'));
        const removed=pick(owned,random);
        if(removed){actor.removedSkills=unique([...(actor.removedSkills||[]),removed]);actor.skills=(actor.skills||[]).filter(id=>id!==removed);actor.skillDetails=(actor.skillDetails||[]).filter(item=>item.nativeId!==removed);
          const change={seedId:row.seed,removed};
          if(Number(row.pra1)===5){const pool=catalog.skills.map(source=>({source,resolved:adapters.resolve('skill',source.id)})).filter(item=>item.resolved?.nativeId&&item.resolved.exact&&!owned.includes(item.resolved.nativeId));const choice=pick(pool,random);if(choice){addSkill(actor,choice.resolved.nativeId,choice.source);change.added=choice.resolved.nativeId;}}
          spec.mutationChoices.push(change);
        }
      }
      if(Number(row.pra1)===4){
        const actor=spec.player,{owned,pool}=tacticReplacement(row,{catalog,adapters,run},actor.tactics||[]),removed=pick(owned,random);
        if(removed){const added=pick(pool,random);if(added){actor.tactics=actor.tactics.filter(id=>id!==removed.nativeId).concat(added.nativeId);spec.mutationChoices.push({seedId:row.seed,removed:removed.nativeId,added:added.nativeId});}}
      }
    }
    if(type===6){
      // Local base deck intentionally replaces 借刀杀人 with two 决斗.
      if(Number(row.seed)===5065){const tricks=new Set(['guohe','shunshou','juedou','wuxie','huogong','tiesuo','nanman','wanjian','wuzhong','taoyuan','wugu','lebu','bingliang','shandian']);spec.deck.push(...spec.deck.filter(card=>tricks.has(card[2])).map(card=>card.slice()));continue;}
      const removed=ids(row.strpra),added=ids(row.strpra1);
      for(const id of removed){const card=adapters.cardSpec(id,true);if(!card)throw new Error(`突变牌堆缺少卡牌 ${id}`);let index=spec.deck.findIndex(tuple=>tuple[0]===card.suit&&tuple[1]===card.number&&tuple[2]===card.name&&(tuple[3]||'')===(card.nature||''));if(index<0)index=spec.deck.findIndex(tuple=>tuple[2]===card.name&&(tuple[3]||'')===(card.nature||''));if(index>=0)spec.deck.splice(index,1);else if(added.length)throw new Error(`突变牌堆中没有可替换的${card.name}`);}
      for(const id of added){const card=adapters.cardSpec(id,true);if(!card)throw new Error(`突变牌堆缺少卡牌 ${id}`);const tuple=[card.suit,card.number,card.name==='jiedao'?'juedou':card.name];if(card.nature)tuple.push(card.nature);spec.deck.push(tuple);}
    }
  }
  const equipment=unique([...(catalog.cards||[]).filter(card=>card.equipment).map(card=>adapters.cardSpec(card.id)?.name),
    ...(catalog.enemyReferences?.cards||[]).filter(card=>Number(card.type)===3).map(card=>adapters.cardSpec(card.id,true)?.name)].filter(Boolean));
  for(let index=0;index<actors.length;index++){actors[index].mutationSeed=hash(key+':'+index);actors[index].mutationDeck=spec.deck;actors[index].mutationEquipmentPool=equipment;}
  return spec;
}
