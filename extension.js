import { lib, game, get, ui, _status } from 'noname';
import { loadCatalog } from './src/catalog.js';
import { Campaign } from './src/campaign.js';
import { createAdapters } from './src/adapters.js';
import { CampaignUI } from './src/interface.js';
import { createBattleMode, getNativeTacticsCatalog } from './src/battle.js';
import { growEnemy } from './src/enemy-growth.js';
import { installExtraTactics } from './src/extra-tactics.js';
import { installExtraCards } from './src/extra-cards.js';
import { originalPortrait, originalEnemyPortrait } from './src/portraits.js';
import { createCharacterPortraitResolver } from './src/character-portrait.js';
import { LocalCampaignService } from './src/local-service.js';
import { installEnemySkills } from './src/enemy-skills.js';
import { installExtraSkills } from './src/skill-install.js';
import { ownedRewardSkillIds } from './src/run-skills.js';
import { attachEnemyDetails } from './src/enemy-details.js';
import { applyMutationsToSpec, mutationAllowed } from './src/mutation-rules.js';
import { installMutationCards } from './src/mutation-cards.js';
import { createCharacterTraitSkills, characterTraitSkillIds } from './src/character-trait-effects.js';

export const type = 'extension';
const baseURL = new URL('./', import.meta.url).href;
const characterPortrait = createCharacterPortraitResolver({ lib, get, game });
let service;

function installStyle() {
  if (document.getElementById('shanhetu-style')) return;
  const link = document.createElement('link');
  link.id = 'shanhetu-style'; link.rel = 'stylesheet'; link.href = baseURL + 'style.css';
  document.head.appendChild(link);
}

async function getService() {
  if (service) return service;
  const catalog = await loadCatalog(baseURL);
  installExtraTactics(catalog.tactics);
  installExtraCards(catalog);
  installMutationCards({ lib, game });
  const traitSkills = createCharacterTraitSkills({ lib, game, get, ui, _status }, catalog.characterTraits?.traits || []);
  Object.assign(lib.skill, traitSkills.skill);
  Object.assign(lib.translate, traitSkills.translate);
  const extraSkills = installExtraSkills(catalog, {lib,game,get,ui,_status});
  const enemySkills = installEnemySkills(catalog, {lib,game,get,ui,_status});
  const adapters = createAdapters(lib, get, getNativeTacticsCatalog(), catalog);
  const key = lib.configprefix + 'extension_shanhetu_save_v1';
  const campaign = new Campaign(catalog, {
    load() { const data = localStorage.getItem(key); return data ? JSON.parse(data) : null; },
    save(state) { localStorage.setItem(key, JSON.stringify(state)); },
    isSupported: adapters.isSupported,
    characterSkills: id => adapters.characterList.find(hero => hero.id === id)?.skills || [],
    mutationAllowed: (row, run) => mutationAllowed(row, { catalog, adapters, character: run.character, run }),
  });
  service = { catalog, adapters, campaign, key, enemySkills, extraSkills, localService: new LocalCampaignService(campaign) };
  return service;
}

function originalPlayerPortrait(id) {
  return characterPortrait.hasCustomPortrait(id) ? null : originalPortrait(baseURL, id);
}

function portrait(id) { return originalPlayerPortrait(id) || characterPortrait(id); }

function makeBattleSpec(context) {
  const { campaign, catalog, adapters } = context;
  const run = campaign.run, pending = run?.pending;
  if (pending?.kind !== 'battle') throw new Error('当前没有待进行的战斗');
  const battle = catalog.indexes.battles.get(Number(pending.battleId));
  const group = catalog.indexes.enemyGroups.get(Number(pending.groupId || battle?.groupId));
  if (!group?.generals?.length) throw new Error('关卡敌军配置缺失，请保留存档并检查扩展文件');
  const difficulty = catalog.indexes.difficulties.get(Number(run.difficulty));
  const stats = run.stats || {};
  const warnings = [];
  const activeSchools = campaign.schoolProgress?.().filter(x => x.active) || [];
  const playerTactics = [...new Set([...run.tactics, ...activeSchools.map(x => x.effectId)])];
  const player = {
    character: run.character, hp: run.hp, maxHp: run.maxHp,
    portrait: originalPlayerPortrait(run.character),
    skills: [...ownedRewardSkillIds(run).map(id => adapters.resolve('skill', id)?.nativeId).filter(Boolean), ...characterTraitSkillIds(run.traitIds || [], catalog.characterTraits?.traits || [])],
    traitIds: [...run.traitIds || []],
    removedSkills: Object.keys(run.innateReplacements || {}), rank: run.rank,
    tactics: playerTactics.map(id => adapters.resolve('tactic', id)?.nativeId).filter(Boolean),
    cards: run.cards.map(id => adapters.cardSpec(id)).filter(Boolean),
    equips: run.equips.map(id => adapters.cardSpec(id)).filter(Boolean),
    initialDraw: 4 + Number(stats.startingCards || 0), draw: 2 + Number(stats.draw || 0),
    slashCount: 1 + Number(stats.slashCount || 0), armor: Number(stats.armor || 0),
    armorGain: Number(stats.armorGain || 0), handLimit: Number(stats.handLimit || 0),
    damageBonus: Number(stats.damage || 0), rebirthAvailable: run.rebirthAvailable,
    copper: Number(run.copper || 0), boss: Boolean(pending.boss),
    skillSlots: Number(run.skillSlots || 0), extraSkillCount: run.skills.length,
  };
  for (const school of activeSchools) {
    if (!adapters.resolve('tactic', school.effectId)?.supported) warnings.push(`${school.name}套装效果尚未适配，流派进度已记录`);
  }
  const addPortrait = (actor, original) => {
    const source = originalEnemyPortrait(baseURL, original);
    if (source) actor.portrait = source;
    return actor;
  };
  const enemies = group.generals.map(general => {
    const grown = growEnemy(general, run, difficulty, catalog.rules, { enemyCount: group.generals.length, boss: pending.boss, elite: battle.elite, chapter: run.chapter });
    return addPortrait({ ...adapters.enemySpec(grown, {}, warnings, run.difficulty), difficultyId:run.difficulty, difficultyGroup:difficulty?.group || Math.ceil(run.difficulty/5) }, general);
  });
  const allies = [];
  for (const stored of run.allies || []) {
    const id = Number(stored.groupId ?? stored.id ?? stored);
    const source = catalog.indexes.enemyGroups.get(id);
    for (const general of source?.generals || []) {
      const grown = growEnemy(general, run, difficulty, catalog.rules, { friend: true, chapter: run.chapter });
      const actor = addPortrait({ ...adapters.enemySpec(grown, {}, warnings, run.difficulty), difficultyId:run.difficulty, difficultyGroup:difficulty?.group || Math.ceil(run.difficulty/5) }, general);
      actor.campaignAllyId = id;
      if (Number.isFinite(stored.hp) && stored.hp > 0) actor.hp = Math.min(stored.hp, actor.maxHp);
      allies.push(actor);
    }
  }
  const node = catalog.indexes.nodes.get(Number(pending.nodeId || run.source?.nodeId));
  const terrainThreshold = Number(catalog.rules.Common.scenespellneeddiff || 11);
  const terrain = (difficulty?.baseDifficulty || run.difficulty) >= terrainThreshold ? catalog.getTerrain(node?.sceneSpellId) : null;
  const spec = { id: `${run.id}:${pending.battleId}`, battleId: pending.battleId, title: battle.name, player, enemies, allies, terrain, warnings };
  applyMutationsToSpec(spec, { catalog, adapters, run });
  const firstActorLabel = spec.firstActorRule === 'highestHp' ? '体力最高者（玩家优先）'
    : spec.firstActorIndex > 0 && spec.firstActorIndex <= allies.length ? '队友' : null;
  for (const actor of spec.enemies) attachEnemyDetails(actor, { difficulty, firstActorLabel, enemyFirst: spec.firstActorIndex >= 1 + allies.length });
  context.lastSpec = spec;
  return spec;
}

async function openCampaign() {
  installStyle();
  let context;
  try { context = await getService(); }
  catch (error) {
    const panel = document.createElement('div'); panel.className = 'sht-root';
    panel.style.padding = '50px';
    const title = document.createElement('h1'); title.textContent = '山河图暂时无法载入';
    const message = document.createElement('p'); message.textContent = error.message;
    const button = document.createElement('button'); button.className = 'sht-button'; button.textContent = '返回其他模式';
    button.onclick = () => { game.saveConfig('mode', 'identity'); localStorage.removeItem(lib.configprefix + 'directstart'); game.reload(); };
    panel.append(title, message, button); document.body.appendChild(panel); throw error;
  }
  return new Promise(resolve => {
    context.view = new CampaignUI({
      ...context, baseURL, portrait,
      previewBattle() { return makeBattleSpec(context); },
      onBattle(pending) {
        const current = context.campaign.run.pending;
        if (current?.kind !== 'battle' || pending?.battleId !== current.battleId
          || pending?.nodeId !== current.nodeId || pending?.groupId !== current.groupId) throw new Error('战斗选择已改变，请重新打开关卡');
        const spec = makeBattleSpec(context);
        context.localService.request('startBattle', { battleId: pending.battleId, nodeId: pending.nodeId });
        context.view.destroy();
        resolve(spec);
      },
      onExit() {
        game.saveConfig('mode', 'identity');
        localStorage.removeItem(lib.configprefix + 'directstart');
        game.reload();
      },
    }).mount();
  });
}

async function finishBattle(outcome) {
  const context = await getService();
  const result = { ...outcome, battleId: context.lastSpec?.battleId };
  result.allies = (outcome.allies || []).map((ally, index) => ({
    ...ally, groupId: context.lastSpec?.allies[index]?.campaignAllyId,
  })).filter(ally => ally.hp > 0 && ally.groupId);
  context.localService.request('finishBattle', result);
}

export default function () {
  return {
    name: '山河图', editable: false,
    precontent() {
      const mode = createBattleMode({ openCampaign, finishBattle });
      mode.splash = 'ext:山河图/assets/season5/portraits/45.png';
      game.addMode('shanhetu', mode, { translate: '山河图', extension: '山河图', config: {} });
    },
    content() {},
    config: {
      introduction: { name: '<b>山河图 · 诸侯伐董</b><br>启用后在模式选择界面进入。<br>征程与山河册自动保存，可在模式内导出备份。', clear: true, nopointer: true },
    },
    package: {
      intro: '独立的山河图·诸侯伐董单人闯关模式。启用并重启后选择“山河图”。',
      author: '本地扩展', version: '1.2.0',
      character: { character: {}, translate: {} }, card: { card: {}, translate: {}, list: [] }, skill: { skill: {}, translate: {} },
    },
  };
}
