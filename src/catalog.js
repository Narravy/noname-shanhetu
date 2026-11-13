// Rebuild the public OL configuration with ../tools/build-catalog.cjs (run it with --help for inputs).
import { baseDifficultyId } from './desperate.js';
export const SEASON_ID = 5;
export const splitIds = value => String(value ?? '').split(/[;,]/).filter(Boolean).map(Number);

const terrain = {
  13273: { id: 13273, name: '高山', description: '回合结束时，流失1点体力' },
  13274: { id: 13274, name: '密林', description: '出牌阶段最多使用10张牌' },
  13275: { id: 13275, name: '平原', description: '出杀限制次数+1' },
  13276: { id: 13276, name: '河流', description: '手牌上限至多为8' },
  13277: { id: 13277, name: '城池', description: '与其他角色距离-1' },
  13278: { id: 13278, name: '战场', description: '摸牌阶段摸牌+2' },
};

export function getTerrain(id) { return terrain[Number(id)] || null; }

export function createCatalog(tables) {
  const manifest = tables.manifest;
  const season = manifest.seasons.find(item => item.id === SEASON_ID);
  if (!season) throw new Error('诸侯伐董赛季配置缺失');
  const catalog = {
    ...tables,
    manifest,
    season,
    cities: season.chapters,
    difficulties: manifest.difficulties.filter(item => item.seasonIds.includes(SEASON_ID)),
    desperateDifficulties: (tables.desperate?.difficulties || tables.desperateDifficulties || []).filter(item => item.seasonIds.includes(SEASON_ID)),
    tree: tables['tactic-tree'] || tables.tree || [],
    enemyGroups: tables['enemy-groups'] || tables.enemyGroups || [],
    enemyReferences: tables['enemy-references'] || tables.enemyReferences || {},
    characterTraits: tables['character-traits'] || tables.characterTraits || null,
    notes: manifest.notes || [],
    indexes: {},
  };
  for (const key of ['cities', 'difficulties', 'battles', 'events', 'tactics', 'skills', 'cards', 'tree', 'enemyGroups', 'tasks', 'endings', 'spells']) {
    catalog.indexes[key] = new Map((catalog[key] || []).map(item => [item.id, item]));
  }
  for (const item of catalog.desperateDifficulties) catalog.indexes.difficulties.set(item.id, item);
  catalog.indexes.nodes = new Map(catalog.cities.flatMap(city => city.nodes.map(node => [node.id, { ...node, chapterId: city.id, chapter: city.order }])));
  catalog.indexes.rewardGroups = new Map((catalog.rules?.RewardGroup || []).map(item => [Number(item.reward), item]));
  catalog.indexes.others = new Map((catalog.rules?.Other || []).map(item => [Number(item.reward), item]));
  catalog.indexes.texts = new Map((catalog.rules?.Text || []).map(item => [Number(item.ID), item.text]));
  catalog.indexes.rawGenerals = new Map();
  for (const item of catalog.rules?.General || []) {
    const id = Number(item.generalgroup);
    if (!catalog.indexes.rawGenerals.has(id)) catalog.indexes.rawGenerals.set(id, []);
    catalog.indexes.rawGenerals.get(id).push(item);
  }
  catalog.nextCities = (id, difficulty) => nextCities(catalog, id, difficulty);
  catalog.battlesForNode = (id, difficulty) => battlesForNode(catalog, id, difficulty);
  catalog.eventsForNode = id => eventsForNode(catalog, id);
  catalog.getTerrain = getTerrain;
  return catalog;
}

export async function loadCatalog(baseURL = new URL('../', import.meta.url).href) {
  const base = String(baseURL).replace(/\/?$/, '/');
  const names = ['manifest', 'battles', 'events', 'tactics', 'skills', 'cards', 'tactic-tree', 'enemy-groups', 'enemy-references', 'tasks', 'endings', 'spells', 'rules', 'adventure-art', 'desperate', 'character-traits'];
  const pairs = await Promise.all(names.map(async name => {
    const response = await fetch(base + 'data/' + name + '.json');
    if (!response.ok) throw new Error('读取山河图配置失败：' + name + '（' + response.status + '）');
    return [name, await response.json()];
  }));
  const tables = Object.fromEntries(pairs);
  tables.adventureArt = tables['adventure-art'];
  return createCatalog(tables);
}

export function nextCities(catalog, cityId, difficulty = 1) {
  const city = catalog.indexes.cities.get(Number(cityId));
  if (!city) return [];
  const baseDifficulty = baseDifficultyId(difficulty);
  return (city.nextCityIds || []).map(id => catalog.indexes.cities.get(id)).filter(city => city && city.openDifficulty <= baseDifficulty);
}

export function battlesForNode(catalog, nodeId, difficulty = 1) {
  const baseDifficulty = baseDifficultyId(difficulty);
  const source = catalog.battles.filter(item => item.cityIds.includes(Number(nodeId)));
  // 1xxxx/2xxxx rows are balancing variants of the same encounter, not extra lottery entries.
  const unique = new Map();
  for (const battle of source) {
    const key = battle.raw?.name || battle.name;
    const previous = unique.get(key);
    if (!previous || battle.id < previous.id) unique.set(key, battle);
  }
  return [...unique.values()].map(battle => ({
    ...battle,
    selectedGroupId: baseDifficulty <= 5 && battle.newPlayerGroupId ? battle.newPlayerGroupId : battle.groupId,
  }));
}

export function eventsForNode(catalog, nodeId) {
  return catalog.events.filter(item => item.cityIds.includes(Number(nodeId)));
}
