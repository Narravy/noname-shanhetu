import { characterTraitBonuses } from './character-trait-effects.js';

const INITIAL = [
  { id: 1, quality: 1, description: '体力上限+1', weight: 1 },
  { id: 2, quality: 2, description: '初始手牌+1，出杀次数+1', weight: 1 },
  { id: 3, quality: 1, description: '摸牌阶段摸牌+1', weight: 1 },
];
const SLOTS = [{ rank: 1, traitId: 1 }, { rank: 2, traitId: 2 }, { rank: 3, traitId: 3 }, { rank: 4, traitId: 1 }];
const BONUS_FIELDS = ['hp', 'startingCards', 'draw', 'slashCount', 'armor', 'armorGain', 'handLimit', 'damage'];
const badKeys = new Set(['__proto__', 'prototype', 'constructor']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const rankNumber = value => Number.isInteger(value) && value >= 1 && value <= 5;
const displayRank = value => rankNumber(Number(value)) ? Number(value) : 1;

function characterId(value) {
  if (typeof value !== 'string' || !value || value.length > 200 || badKeys.has(value)) throw new Error('武将特质标识无效');
  return value;
}

function configuration(catalog) {
  const source = catalog.characterTraits || {};
  const map = new Map(INITIAL.map(row => [row.id, row]));
  for (const row of source.traits || []) map.set(Number(row.id), row);
  return { rows: [...map.values()], map, slots: source.slots?.length === 4 ? source.slots : SLOTS,
    pool: (source.traits || []).filter(row => row.refinable !== false && Number(row.weight ?? 1) > 0) };
}

function defaultIds(config, rank) {
  return config.slots.filter(slot => Number(slot.rank) < rank).map(slot => Number(slot.traitId));
}

function profileState(state) { return state.profile.characterTraits; }

function recordFor(state, character) {
  const heroes = profileState(state)?.heroes;
  return heroes && own(heroes, character) ? heroes[character] : null;
}

function newRecord(rank = 1) { return { rank, mode: 'initial', refined: null, pending: null, lockIndices: [] }; }

function ensureRecord(campaign, character) {
  characterId(character);
  const traits = profileState(campaign.state);
  if (!traits) throw new Error('武将特质尚未初始化');
  if (!own(traits.heroes, character)) traits.heroes[character] = newRecord();
  return traits.heroes[character];
}

function effectiveRank(campaign, character, record, hint) {
  const run = campaign.state.run;
  if (run?.character === character && !run.settled) return displayRank(run.rank);
  return displayRank(record?.rank ?? hint);
}

function activeIds(config, record, rank) {
  return rank >= 5 && record?.mode === 'refined' && record.refined ? [...record.refined] : defaultIds(config, rank);
}

function startedBattle(campaign, character) {
  const run = campaign.state.run;
  return Boolean(run && !run.settled && run.character === character && run.pending?.kind === 'battle' && run.pending.started);
}

function assertMutable(campaign, character) {
  if (startedBattle(campaign, character)) throw new Error('当前战斗已开始，请在战斗结束后更改特质');
}

function assertRefinable(campaign, character, record) {
  assertMutable(campaign, character);
  if (!record || record.rank < 5 || effectiveRank(campaign, character, record) < 5) throw new Error('请先使用该武将以5阶出征，再进行特质洗练');
}

function refinementCost(config, ids, locks) {
  return 1 + locks.reduce((cost, index) => cost + (Number(config.map.get(ids[index])?.quality) === 4 ? 7 : 1), 0);
}

function validateIds(value, config, count, label) {
  if (!Array.isArray(value) || value.length !== count || value.some(id => !Number.isSafeInteger(id) || !config.map.has(id))) throw new Error(label + '无效');
  if (value.filter(id => Number(config.map.get(id).quality) === 4).length > 2) throw new Error('每名武将最多拥有两条限定特质');
}

function validateLocks(value, label) {
  if (!Array.isArray(value) || value.length > 3 || new Set(value).size !== value.length || value.some(index => !Number.isInteger(index) || index < 0 || index > 3)) throw new Error(label + '无效');
}

function rejectDangerousKeys(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (badKeys.has(key)) throw new Error('武将特质存档包含无效字段');
    rejectDangerousKeys(child);
  }
}

export function validateTraitState(state, catalog) {
  const traits = profileState(state);
  rejectDangerousKeys(traits);
  if (!object(traits) || !Number.isSafeInteger(traits.materials) || traits.materials < 0 || !Number.isInteger(traits.seed) || traits.seed <= 0 || traits.seed > 0xffffffff || !object(traits.heroes)) throw new Error('武将特质存档无效');
  const config = configuration(catalog);
  for (const [character, record] of Object.entries(traits.heroes)) {
    characterId(character);
    if (!object(record) || !rankNumber(record.rank) || !['initial', 'refined'].includes(record.mode)) throw new Error('武将特质方案无效');
    validateLocks(record.lockIndices, '锁定记录');
    if (record.refined !== null) validateIds(record.refined, config, 4, '洗练特质');
    if (record.mode === 'refined' && (!record.refined || record.rank < 5)) throw new Error('洗练特质等阶无效');
    if (record.rank < 5 && (record.refined || record.pending || record.lockIndices.length)) throw new Error('未解锁武将的洗练记录无效');
    if (record.pending !== null) {
      if (!object(record.pending)) throw new Error('待替换特质无效');
      validateIds(record.pending.ids, config, 4, '待替换特质');
      validateLocks(record.pending.lockIndices, '洗练锁定记录');
      if (!Number.isInteger(record.pending.cost) || record.pending.cost !== refinementCost(config, record.pending.ids, record.pending.lockIndices)) throw new Error('洗练消耗记录无效');
    }
  }
  const run = state.run;
  if (run) {
    characterId(run.character);
    if (!rankNumber(run.rank)) throw new Error('征程武将等阶无效');
    validateIds(run.traitIds, config, run.rank - 1, '征程特质');
    const expected = characterTraitBonuses(run.traitIds, config.rows);
    if (!object(run.traitBonuses) || BONUS_FIELDS.some(key => !Number.isFinite(run.traitBonuses[key]))) throw new Error('征程特质加成无效');
    // hp stores the applied delta after the minimum maximum-health clamp.
    // Permanent health changes during a battle need not match the raw bonus.
    if (BONUS_FIELDS.some(key => key !== 'hp' && run.traitBonuses[key] !== expected[key])) throw new Error('征程特质加成不匹配');
  }
  return state;
}

/** Migrate only missing trait fields; never add the existing rank bonuses twice. */
export function initializeTraitState(state, catalog) {
  if (!object(state.profile)) throw new Error('征程档案无效');
  if (state.profile.characterTraits === undefined) {
    state.profile.characterTraits = { materials: 999999, seed: ((Number(state.profile.seed) >>> 0) ^ 0x6d2b79f5) >>> 0 || 1, heroes: {} };
  }
  const traits = profileState(state);
  if (!object(traits) || !object(traits.heroes)) throw new Error('武将特质存档无效');
  const run = state.run;
  if (run) {
    characterId(run.character);
    const rank = displayRank(run.rank);
    if (!own(traits.heroes, run.character)) traits.heroes[run.character] = newRecord(rank);
    else if (object(traits.heroes[run.character]) && rankNumber(traits.heroes[run.character].rank)) traits.heroes[run.character].rank = Math.max(traits.heroes[run.character].rank, rank);
    const config = configuration(catalog);
    if (run.traitIds === undefined) run.traitIds = defaultIds(config, rank);
    if (run.traitBonuses === undefined) run.traitBonuses = characterTraitBonuses(run.traitIds, config.rows);
  }
  return validateTraitState(state, catalog);
}

/** Read-only view model. A rank hint never grants the right to refine. */
export function traitState(campaign, character, rankHint) {
  characterId(character);
  const config = configuration(campaign.catalog);
  const record = recordFor(campaign.state, character);
  const rank = effectiveRank(campaign, character, record, rankHint);
  const ids = activeIds(config, record, rank);
  const locks = rank >= 5 ? [...record?.lockIndices || []] : [];
  const convert = values => values?.map(id => ({ ...config.map.get(id) })) || null;
  const allInitial = config.slots.map(slot => Number(slot.traitId));
  const canChange = !startedBattle(campaign, character);
  const eligible = Boolean(record && record.rank >= 5 && rank >= 5);
  const balance = profileState(campaign.state)?.materials ?? 999999;
  const cost = refinementCost(config, ids, locks);
  const refineReason = !canChange ? '当前战斗结束后可更改特质' : !eligible ? '请先使用该武将以5阶出征' : balance < cost ? '将魂不足' : '';
  return { character, rank, balance, slots: convert(ids), initial: convert(allInitial), refined: convert(record?.refined),
    candidate: convert(record?.pending?.ids), candidateLockIndices: [...record?.pending?.lockIndices || []],
    lockIndices: locks, cost, mode: rank >= 5 && record?.mode === 'refined' ? 'refined' : 'initial',
    canRefine: canChange && eligible && config.pool.length > 0, canChange, refineReason };
}

/** Called inside Campaign.start's transaction, before constructing the new run. */
export function startRunTraits(campaign, character, rank) {
  if (!rankNumber(rank)) throw new Error('武将等阶无效');
  const record = ensureRecord(campaign, character);
  record.rank = Math.max(record.rank, rank);
  const config = configuration(campaign.catalog);
  const ids = activeIds(config, record, rank);
  return { ids, bonuses: characterTraitBonuses(ids, config.rows) };
}

function random(traits) {
  let value = traits.seed >>> 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  traits.seed = value >>> 0 || 1;
  return traits.seed / 4294967296;
}

function sample(traits, pool) {
  const total = pool.reduce((sum, row) => sum + Number(row.weight ?? 1), 0);
  if (!pool.length || !Number.isFinite(total) || total <= 0) throw new Error('可洗练特质配置不足');
  let cursor = random(traits) * total;
  for (const row of pool) {
    cursor -= Number(row.weight ?? 1);
    if (cursor < 0) return Number(row.id);
  }
  return Number(pool.at(-1).id);
}

function updateRun(campaign, character, config, record) {
  const run = campaign.state.run;
  if (!run || run.settled || run.character !== character) return;
  const ids = activeIds(config, record, displayRank(run.rank));
  const before = run.traitBonuses || characterTraitBonuses(defaultIds(config, run.rank), config.rows);
  const after = characterTraitBonuses(ids, config.rows);
  const baseMaxHp = run.maxHp - before.hp;
  const nextMaxHp = Math.max(1, baseMaxHp + after.hp);
  after.hp = nextMaxHp - baseMaxHp;
  run.maxHp = nextMaxHp; run.hp = Math.min(run.hp, nextMaxHp);
  for (const key of BONUS_FIELDS) if (key !== 'hp') run.stats[key] = Number(run.stats[key] || 0) + after[key] - before[key];
  run.traitIds = ids; run.traitBonuses = after;
}

/** Caller wraps this mutation in Campaign._change for atomic save/rollback. */
export function changeTraits(campaign, action, payload = {}) {
  const character = characterId(payload.character);
  const config = configuration(campaign.catalog);
  const record = recordFor(campaign.state, character);
  assertMutable(campaign, character);
  if (['setTraitLock', 'refineTraits', 'acceptTraits', 'useRefinedTraits'].includes(action)) assertRefinable(campaign, character, record);
  if (!record) throw new Error('该武将尚未建立特质记录');
  const traits = profileState(campaign.state);
  if (action === 'setTraitLock') {
    const index = payload.index;
    if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('特质位置无效');
    const position = record.lockIndices.indexOf(index);
    if (position >= 0) record.lockIndices.splice(position, 1);
    else {
      if (record.lockIndices.length >= 3) throw new Error('最多锁定3条特质');
      record.lockIndices.push(index); record.lockIndices.sort((a, b) => a - b);
    }
  } else if (action === 'refineTraits') {
    const ids = activeIds(config, record, effectiveRank(campaign, character, record));
    const locks = [...record.lockIndices];
    const cost = refinementCost(config, ids, locks);
    if (traits.materials < cost) throw new Error('将魂不足');
    const next = new Array(4);
    for (const index of locks) next[index] = ids[index];
    let limited = locks.filter(index => Number(config.map.get(ids[index])?.quality) === 4).length;
    for (let index = 0; index < 4; index++) {
      if (locks.includes(index)) continue;
      const pool = config.pool.filter(row => limited < 2 || Number(row.quality) !== 4);
      next[index] = sample(traits, pool);
      if (Number(config.map.get(next[index])?.quality) === 4) limited++;
    }
    validateIds(next, config, 4, '洗练结果');
    traits.materials -= cost;
    record.pending = { ids: next, lockIndices: locks, cost };
  } else if (action === 'acceptTraits') {
    if (!record.pending) throw new Error('没有待替换的洗练结果');
    record.refined = [...record.pending.ids]; record.mode = 'refined'; record.pending = null;
    updateRun(campaign, character, config, record);
  } else if (action === 'discardTraitRoll') {
    record.pending = null;
  } else if (action === 'useInitialTraits' || action === 'useRefinedTraits') {
    if (action === 'useRefinedTraits' && !record.refined) throw new Error('尚未保存洗练特质');
    record.mode = action === 'useInitialTraits' ? 'initial' : 'refined';
    record.lockIndices = [];
    updateRun(campaign, character, config, record);
  } else throw new Error('未知的武将特质操作');
  return traitState(campaign, character);
}
