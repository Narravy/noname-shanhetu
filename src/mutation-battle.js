/** Runtime effects of hd_roguelike.seed. Campaign-only types 5/7 live in Campaign. */
export function createMutationSkills({lib,game,get,ui,_status}) {
  const skill={},translate={};
  const random=player=>{let n=player._shtMutationRng??player._shanhetuSpec?.mutationSeed??1;n^=n<<13;n^=n>>>17;n^=n<<5;player._shtMutationRng=n>>>0;return (n>>>0)/4294967296;};
  const pick=(player,list)=>list[Math.floor(random(player)*list.length)];
  const add=(key,name,description,definition)=>{const id='sht_mutation_'+key;skill[id]=definition;translate[id]=name;translate[id+'_info']=description;return id;};
  const forced=(trigger,content,extra={})=>({charlotte:true,forced:true,popup:false,trigger,content,...extra});
  const opening=(key,content)=>forced({global:'gameStart'},async(event,trigger,player)=>{
    const starts=player._shtMutationStarts ||= new Set();if(starts.has(key))return;starts.add(key);await content(player);
  });
  const equipmentPool=(player,subtype)=>(player._shanhetuSpec?.mutationEquipmentPool||[]).filter(name=>lib.card[name]?.type==='equip'&&!lib.card[name].destroy&&(!subtype||lib.card[name].subtype===subtype)&&(!player.canEquip||player.canEquip(name,true)));
  const rawName=card=>get.name(card,false);
  const isTao=card=>rawName(card)==='tao';
  const phaseOf=(event,name)=>event.getParent?.(name,true,true);
  const phaseCardCount=player=>{const phase=phaseOf(_status.event,'phaseUse');return player.getHistory('useCard',event=>phaseOf(event,'phaseUse')===phase).length;};
  const cardLimit=limit=>({charlotte:true,mod:{cardEnabled(card,player){if(player.isPhaseUsing()&&phaseCardCount(player)>=limit)return false;}}});

  add('damage_plus','刀刀暴击','所有人造成伤害+1',forced({source:'damageBegin1'},async(event,trigger)=>{trigger.num++;}));
  add('damage_minus','缓攻之触','所有人造成伤害-1（最低为1）',forced({source:'damageBegin3'},async(event,trigger)=>{trigger.num=Math.max(1,trigger.num-1);},{filter:event=>event.num>0,priority:-100}));
  add('damage_cap','伤止之刻','所有人单次最多受到3点伤害',forced({player:'damageBegin4'},async(event,trigger)=>{trigger.num=Math.min(3,trigger.num);},{priority:-100}));
  add('opening_equipment','被甲载兵','开局随机使用一张装备牌',opening('equipment',async player=>{
    const name=pick(player,equipmentPool(player));if(name)await player.chooseUseTarget(game.createCard(name,'spade',1),true);
  }));
  add('no_chain','东风不便','所有人战斗中不可被横置',forced({player:'linkBefore'},async(event,trigger)=>trigger.cancel(),{priority:100,filter:(event,player)=>!player.isLinked(),ai:{noLink:true}}));
  add('no_nature','属性无惧','所有人防止受到属性伤害',forced({player:'damageBegin4'},async(event,trigger)=>trigger.cancel(),{priority:100,filter:event=>Boolean(event.nature),ai:{nofire:true,nothunder:true}}));
  add('judge_thunder','雷电交加','结束阶段，所有判定区里有牌的敌方角色受到2点雷电伤害。',forced({player:'phaseJieshuBegin'},async(event,trigger,player)=>{
    for(const target of game.players.filter(target=>target.side!==player.side&&target.countCards('j')>0))if(target.isIn())await target.damage(2,'thunder',player);
  }));
  const convert=(from,to)=>({charlotte:true,mod:{cardname(card){if(rawName(card)===from)return to;},cardnature(card){if(rawName(card)===from)return false;}}});
  add('shan_sha','杀气腾腾','所有人的闪视为杀',convert('shan','sha'));
  add('tao_jiu','以桃置酒','所有人的桃视为酒',convert('tao','jiu'));
  add('red_trick_sha','魔气入体','所有人红色锦囊牌均视为杀',{charlotte:true,mod:{
    cardname(card,player){if(get.color(card,player)==='red'&&['trick','delay'].includes(lib.card[rawName(card)]?.type))return 'sha';},
    cardnature(card,player){if(get.color(card,player)==='red'&&['trick','delay'].includes(lib.card[rawName(card)]?.type))return false;},
  }});
  add('tao_sha_shan','鏖战到底','桃只能当成杀或闪使用或打出',{
    charlotte:true,enable:['chooseToUse','chooseToRespond'],
    filter(event,player){return player.countCards('hs',isTao)>0&&['sha','shan'].some(name=>!event.filterCard||event.filterCard({name,isCard:true},player,event));},
    hiddenCard(player,name){return ['sha','shan'].includes(name)&&player.countCards('hs',isTao)>0;},
    mod:{cardEnabled(card){if(card.name==='tao')return false;},cardSavable(card){if(card.name==='tao')return false;}},
    chooseButton:{
      dialog(){return ui.create.dialog('鏖战到底',[['杀','闪'].map(name=>['基本','',name==='杀'?'sha':'shan']),'vcard']);},
      filter(button,player){const event=_status.event.getParent();return !event.filterCard||event.filterCard({name:button.link[2],isCard:true},player,event);},
      check(){return 1;},
      backup(links){return {filterCard:isTao,position:'hs',selectCard:1,viewAs:{name:links[0][2]},check:card=>6-get.value(card)};},
      prompt(links){return `将一张桃当作${get.translation(links[0][2])}使用或打出`;},
    },ai:{respondSha:true,respondShan:true,order:3},
  });
  add('skip_discard','失而复得','所有人跳过弃牌阶段',forced({player:'phaseDiscardBefore'},async(event,trigger)=>trigger.cancel()));
  add('skip_judge','天命所归','所有人跳过判定阶段',forced({player:'phaseJudgeBefore'},async(event,trigger)=>trigger.cancel()));
  add('card_limit_10','利锁名缰','出牌阶段最多使用10张牌',cardLimit(10));
  add('card_limit_15','利锁名缰','出牌阶段最多使用15张牌',cardLimit(15));
  add('distance_one','短兵相接','所有人之间距离均视为1',{charlotte:true,mod:{
    // get.distance adds equipment after global mods and clamps ordinary distance
    // to >=1; use its existing -Infinity convention, then fix attack distance.
    globalFrom(){return -Infinity;},globalTo(){return -Infinity;},attackFrom(){return 1;},attackTo(){return 1;},
  }});
  add('hand_change','手牌变化','回合结束时，你的所有手牌随机变化',forced({player:'phaseEnd'},async(event,trigger,player)=>{
    const pool=player._shanhetuSpec?.mutationDeck||lib.card.list||[];
    if(!pool.length)return;
    for(const card of player.getCards('h')){const tuple=pick(player,pool);game.broadcastAll((card,tuple)=>card.init(tuple),card,tuple.slice());}
    player.update();
  }));
  add('equip_change','装备变化','准备阶段，你的装备随机变化',forced({player:'phaseZhunbeiBegin'},async(event,trigger,player)=>{
    for(const previous of player.getCards('e').slice()){
      const pool=equipmentPool(player,get.subtype(previous));const name=pick(player,pool);if(!name)continue;
      // Equip through the engine so old equipment onLose/new equipment onEquip
      // and granted skills are updated. The old card is removed, not duplicated.
      const card=game.createCard(name,get.suit(previous,false),get.number(previous,false));
      await player.lose(previous,ui.special);previous.remove();await player.equip(card);
    }
  }));

  add('spell_418','绝情','锁定技，你即将造成的伤害视为失去体力。',forced({source:'damageBefore'},async(event,trigger)=>{trigger.cancel();await trigger.player.loseHp(trigger.num);},{charlotte:false,ai:{jueqing:true}}));
  add('spell_76','红颜','锁定技，你的黑桃牌视为红桃牌。',{mod:{suit(card,suit){if(suit==='spade')return 'heart';}}});
  add('spell_628','醉酒','锁定技，你使用的杀额外造成1点伤害。',forced({source:'damageBegin1'},async(event,trigger)=>{trigger.num++;},{charlotte:false,filter:event=>event.card?.name==='sha'}));
  add('spell_255','困奋','锁定技，结束阶段，你失去1点体力，然后摸两张牌。',forced({player:'phaseJieshuBegin'},async(event,trigger,player)=>{await player.loseHp(1);await player.draw(2);},{charlotte:false}));
  add('spell_375','骄恣','锁定技，若你的手牌数为全场唯一最多，你造成或受到的伤害值+1。',forced({source:'damageBegin1',player:'damageBegin3'},async(event,trigger)=>{trigger.num++;},{charlotte:false,filter:(event,player)=>game.players.every(target=>target===player||target.countCards('h')<player.countCards('h'))}));
  add('spell_615','判官','锁定技，你不能成为延时锦囊牌的目标。',{mod:{targetEnabled(card){if(lib.card[rawName(card)]?.type==='delay')return false;}}});
  add('spell_3286','积财','锁定技，当一名角色回复体力后，你摸一张牌。',forced({global:'recoverAfter'},async(event,trigger,player)=>{await player.draw(1);},{charlotte:false}));
  add('spell_426','当先','锁定技，回合开始时，你执行一个额外的出牌阶段。',forced({player:'phaseBegin'},async(event,trigger)=>{trigger.phaseList.splice(trigger.num,0,`phaseUse|${event.name}`);},{charlotte:false}));
  add('spell_3121','穷守','锁定技，游戏开始时，你废除所有装备栏并摸四张牌。你的手牌上限+4。',{
    ...opening('qiongshou',async player=>{const slots=[];for(let i=1;i<=6;i++)for(let count=0;count<player.countEnabledSlot(i);count++)slots.push(i);if(slots.length)await player.disableEquip(slots);await player.draw(4);}),
    charlotte:false,mod:{maxHandcard(player,count){return count+4;}},
  });
  add('spell_50','裸衣','摸牌阶段，你可以少摸一张牌，然后本回合使用杀或决斗造成的伤害+1。',{
    trigger:{player:'phaseDrawBegin2'},filter:event=>!event.numFixed&&event.num>0,
    check:(event,player)=>player.countCards('h',card=>['sha','juedou'].includes(get.name(card)))>0,
    async content(event,trigger,player){trigger.num--;player.addTempSkill('sht_mutation_luoyi_damage','phaseAfter');},
  });
  add('luoyi_damage','裸衣','本回合杀或决斗伤害+1',forced({source:'damageBegin1'},async(event,trigger)=>{trigger.num++;},{filter:event=>['sha','juedou'].includes(event.card?.name)&&!event.notLink?.()}));
  // notLink() is true for ordinary damage; a linked propagation must not receive
  // a second 裸衣 bonus after the original damage was already increased.
  skill.sht_mutation_luoyi_damage.filter=event=>['sha','juedou'].includes(event.card?.name)&&(typeof event.notLink!=='function'||event.notLink());
  add('spell_765','腹鳞','锁定技，弃牌阶段，本回合获得的牌不计入手牌上限。',{
    trigger:{player:['gainBegin','phaseBefore','phaseAfter']},forced:true,popup:false,
    filter:(event,player)=>event.name!=='gain'||_status.currentPhase===player,
    async content(event,trigger,player){if(trigger.name==='gain')trigger.gaintag.add('sht_mutation_fulin');else player.removeGaintag('sht_mutation_fulin');},
    mod:{ignoredHandcard(card,player){if(_status.currentPhase===player&&card.hasGaintag('sht_mutation_fulin'))return true;},cardDiscardable(card,player,name){if(name==='phaseDiscard'&&card.hasGaintag('sht_mutation_fulin'))return false;}},
    onremove:player=>player.removeGaintag('sht_mutation_fulin'),
  });
  add('spell_833','结营','锁定技，你始终处于连环状态。所有连环角色手牌上限+2。结束阶段令一名其他角色进入连环状态。',{
    global:'sht_mutation_jieying_hand',trigger:{global:'gameStart',player:['linkBefore','phaseJieshuBegin']},forced:true,
    filter:(event,player)=>event.name==='link'?player.isLinked():event.name==='phaseJieshu'?game.hasPlayer(target=>target!==player&&!target.isLinked()):!player.isLinked(),
    async content(event,trigger,player){
      if(trigger.name==='link'){trigger.cancel();return;}
      if(trigger.name!=='phaseJieshu'){await player.link(true);return;}
      const result=await player.chooseTarget('结营：令一名其他角色进入连环状态',true,(card,player,target)=>target!==player&&!target.isLinked()).set('ai',target=>-get.attitude(player,target)).forResult();
      if(result.bool)await result.targets[0].link(true);
    },
  });
  add('jieying_hand','结营','连环角色手牌上限+2',{mod:{maxHandcard(player,count){if(player.isLinked()&&game.hasPlayer(target=>target.hasSkill('sht_mutation_spell_833')))return count+2;}}});
  add('spell_3432','蘸金','锁定技，若装备区没有武器牌，你视为装备着贯石斧。',{
    trigger:{player:['shaMiss','eventNeutralized']},direct:true,
    filter:(event,player)=>!player.getEquips('equip1').length&&event.type==='card'&&event.card?.name==='sha'&&event.target?.isIn()&&player.countCards('he')>=2,
    async content(event,trigger,player){
      const result=await player.chooseToDiscard('蘸金：弃置两张牌，令此杀仍然造成伤害',2,'he').set('ai',card=>get.attitude(player,trigger.target)<0?6-get.value(card):-1).forResult();
      if(result.bool){if(event.triggername==='shaMiss'){trigger.untrigger();await trigger.trigger('shaHit');trigger._result.bool=false;trigger._result.result=null;}else trigger.unneutralize();}
    },mod:{attackFrom(from,to,distance){if(!from.getEquips('equip1').length)return distance-2;}},
  });
  add('spell_14255','觉醒','锁定技，体力首次低于一半时，若不为你的回合，立刻结束当前回合。',{
    trigger:{player:'changeHp'},forced:true,priority:100,
    filter:(event,player)=>!player._shtMutationAwakened&&player.hp<player.maxHp/2,
    async content(event,trigger,player){
      player._shtMutationAwakened=true;if(_status.currentPhase===player)return;
      const phase=phaseOf(trigger,'phase');if(!phase)return;
      const use=phaseOf(trigger,'phaseUse');if(use){use.skipped=true;use.finish();use.untrigger(true);}
      const card=phaseOf(trigger,'useCard');if(card)card.all_excluded=true;
      phase.finish();phase.untrigger(true);game.log(player,'发动觉醒，结束当前回合');
    },
  });
  return {skill,translate};
}
