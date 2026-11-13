import { nextCities, battlesForNode, eventsForNode, splitIds } from './catalog.js';
import { isExpeditionStartOnlyTactic } from './tactic-scope.js';
import { grantRunSkill, ownedRewardSkillIds, validateRunSkills } from './run-skills.js';
import { initializeTraitState, traitState as readTraitState, startRunTraits, changeTraits } from './character-trait-state.js';
import { isForeignModeTactic, FOREIGN_MODE_TACTIC_REASON } from './foreign-mode-tactics.js';
import { runMutationRows, mutationDisplay, fixedMutationIds, mutationPool, mutationReward } from './campaign-mutations.js';

export const CAMPAIGN_TACTIC_IDS = [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2089, 2090, 2146, 2091, 2145, 2092, 2187, 2107, 2112, 2113, 2114, 2136, 2137, 2139, 2140, 2141, 2213, 2214, 2215, 2216, 2217, 2218, 2252, 2253, 2219, 2220, 2221, 2225, 2023, 2024, 2142, 2138, 2293, 2230];
const clone = value => JSON.parse(JSON.stringify(value));
const integer = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
const kindTables = { tactic: 'tactics', skill: 'skills', card: 'cards', equipment: 'cards' };
const typeKinds = { 2: 'tactic', 3: 'skill', 4: 'card', 5: 'equipment' };
const fieldKinds = { tactic: 'tactics', skill: 'skills', card: 'cards', equipment: 'equips' };
const eliteVariantIndexes = new WeakMap();
const initialState = () => ({ version: 1, profile: { folios: 0, totalFolios: 0, spentFolios: 0, unlockedTree: [], unlockedRewards: [], loadout: [], highestGroup: 1, history: [], seed: (Date.now() >>> 0) || 1 }, run: null });

/** Pure, serializable expedition state. Random choices are committed before the UI displays them. */
export class Campaign {
  constructor(catalog, options = {}) {
    this.catalog = catalog;
    this.schoolEffectIds = new Set([
      ...(catalog.rules.school || []).flatMap(school => splitIds(school.effect)),
      ...catalog.tactics.filter(tactic => tactic.name.includes('套装')).map(tactic => tactic.id),
    ]);
    this.eliteBattleVariants = eliteVariantIndexes.get(catalog);
    if (!this.eliteBattleVariants) {
      this.eliteBattleVariants = new Map();
      for (const battle of catalog.battles.filter(battle => battle.elite)) {
        for (const nodeId of battle.cityIds) {
          const key = nodeId + ':' + (battle.raw?.name || battle.name);
          const previous = this.eliteBattleVariants.get(key);
          if (!previous || battle.id < previous.id) this.eliteBattleVariants.set(key, battle);
        }
      }
      eliteVariantIndexes.set(catalog, this.eliteBattleVariants);
    }
    this.storage = options;
    this.state = initialState();
    const saved = options.load?.();
    if (saved) this.state = this._validate(typeof saved === 'string' ? JSON.parse(saved) : clone(saved));
    initializeTraitState(this.state, this.catalog);
  }
  get run() { return this.state.run; }
  get profile() { return this.state.profile; }
  traitState(character, rank) { return readTraitState(this, character, rank); }
  setTraitLock(payload) { return this._change(() => changeTraits(this, 'setTraitLock', payload)); }
  refineTraits(payload) { return this._change(() => changeTraits(this, 'refineTraits', payload)); }
  acceptTraits(payload) { return this._change(() => changeTraits(this, 'acceptTraits', payload)); }
  discardTraitRoll(payload) { return this._change(() => changeTraits(this, 'discardTraitRoll', payload)); }
  useInitialTraits(payload) { return this._change(() => changeTraits(this, 'useInitialTraits', payload)); }
  useRefinedTraits(payload) { return this._change(() => changeTraits(this, 'useRefinedTraits', payload)); }
  difficultyAvailability(id) {
    const difficulty = this.catalog.indexes.difficulties.get(Number(id));
    if (!difficulty) return { unlocked: false, reason: '难度不存在' };
    if (difficulty.group > this.profile.highestGroup) return { unlocked: false, reason: '请先通关前一难度' };
    if (!difficulty.desperate) return { unlocked: true, reason: '' };
    const previous = difficulty.stage > 1 ? difficulty.id - 1 : difficulty.baseDifficulty;
    const required = difficulty.stage > 1 ? 1 : 10;
    const characters = new Set(this.profile.clearRecords?.[previous] || []);
    for (const result of this.profile.history) if (result.won && Number(result.difficulty) === previous) characters.add(result.character);
    const progress = characters.size;
    return { unlocked: progress >= required, progress, required,
      reason: progress >= required ? '' : difficulty.stage > 1 ? '通关绝境' + (difficulty.stage - 1) + '后解锁' : '使用10名不同武将通关本难度第5阶后解锁' };
  }
  currentEffects() { return runMutationRows(this.catalog, this.run).map(mutationDisplay); }
  _mutation(id) { return runMutationRows(this.catalog, this.run).find(row => Number(row.seed) === id); }
  _save() { this.storage.save?.(clone(this.state)); }
  _change(fn) {
    const before = clone(this.state);
    try { fn(); this._save(); return this.state; }
    catch (error) { this.state = before; throw error; }
  }
  _assertRun() { if (!this.run || this.run.settled) throw new Error('请先开始一段新的征程'); }
  _expect(kind) { this._assertRun(); if (this.run.pending?.kind !== kind) throw new Error('当前不处于' + kind + '阶段'); return this.run.pending; }
  _random() {
    const target = this.run || this.profile;
    let x = (target.seed >>> 0) || 1;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    target.seed = x >>> 0;
    return target.seed / 4294967296;
  }
  _sample(values, count = 1) {
    const pool = [...values], picked = [];
    while (pool.length && picked.length < count) picked.push(pool.splice(Math.floor(this._random() * pool.length), 1)[0]);
    return picked;
  }
  _weightedSample(values, count, weightFor) {
    const pool = [...values], picked = [];
    while (pool.length && picked.length < count) {
      const weights = pool.map(value => Math.max(0, Number(weightFor(value)) || 0));
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      if (!(total > 0)) break;
      let roll = this._random() * total, index = 0;
      while (index < pool.length - 1 && roll >= weights[index]) roll -= weights[index++];
      picked.push(pool.splice(index, 1)[0]);
    }
    return picked;
  }
  _sampleTactics(values, count = 1) {
    if (!this._has(2253)) return this._sample(values, count);
    const counts = new Map();
    for (const id of this.run.tactics) {
      if (id === 2253 || this.schoolEffectIds.has(id)) continue;
      const tactic = this.catalog.indexes.tactics.get(id);
      for (const school of splitIds(tactic?.raw?.school || tactic?.schoolId)) counts.set(school, (counts.get(school) || 0) + 1);
    }
    const highest = Math.max(0, ...counts.values());
    if (!highest) return this._sample(values, count);
    const preferred = new Set([...counts].filter(([, count]) => count === highest).map(([id]) => id));
    const bonus = Math.max(0, Number(this.catalog.indexes.tactics.get(2253)?.raw.pra1) || 0) / 100;
    // The server's school weighting is not shipped. The local rule uses the
    // most-represented owned schools (including ties), with pra1=100 adding 100%.
    return this._weightedSample(values, count, item => 1 + (splitIds(item.raw?.school || item.schoolId).some(id => preferred.has(id)) ? bonus : 0));
  }
  _has(id) { return !!this.run?.tactics.includes(id); }
  _tacticChance(id) {
    return this._has(id) && this._random() < (Number(this.catalog.indexes.tactics.get(id)?.raw.pra1) || 0) / 100;
  }
  _log(text) { this.run.log.push({ text, chapter: this.run.chapter, month: this.run.month }); if (this.run.log.length > 120) this.run.log.shift(); }
  _supported(kind, id) {
    if (kind === 'tactic' && isForeignModeTactic(id)) return false;
    if (kind === 'tactic' && CAMPAIGN_TACTIC_IDS.includes(Number(id))) return true;
    if (['copper', 'stat', 'ally'].includes(kind)) return kind !== 'ally' || this.catalog.indexes.enemyGroups.has(Number(id));
    return this.storage.isSupported ? !!this.storage.isSupported(kind, Number(id)) : true;
  }
  _itemKind(id) {
    id = Number(id);
    if (this.catalog.indexes.tactics.has(id)) return 'tactic';
    if (this.catalog.indexes.skills.has(id)) return 'skill';
    const card = this.catalog.indexes.cards.get(id);
    if (card) return card.equipment ? 'equipment' : 'card';
    if (id === 1000) return 'copper';
    if (id >= 1001 && id <= 1013) return 'stat';
    if (this.catalog.indexes.enemyGroups.has(id)) return 'ally';
    return null;
  }
  _choice(kind, itemId, quantity = 1) {
    const item = this.catalog.indexes[kindTables[kind]]?.get(Number(itemId));
    const other = this.catalog.indexes.others.get(Number(itemId));
    const ally = kind === 'ally' ? this.catalog.indexes.enemyGroups.get(Number(itemId))?.generals?.[0] : null;
    const supported = !!kind && this._supported(kind, itemId) && !(kind === 'stat' && [1010, 1012, 1013].includes(Number(itemId)));
    return {
      id: kind + ':' + itemId,
      kind,
      itemId: Number(itemId),
      name: item?.name || ally?.name || other?.rewardname || ('物品 ' + itemId),
      description: item?.description || other?.rewarddesc || (ally ? '队友加入本次征程' : ''),
      rarity: item?.rarity || other?.level || 1,
      price: item?.price || 0,
      quantity,
      supported,
      ...(supported ? {} : { disabledReason: kind === 'tactic' && isForeignModeTactic(itemId) ? FOREIGN_MODE_TACTIC_REASON : '此效果暂未完成无名杀适配' }),
    };
  }
  _unlocked(kind, id) {
    const matching = this.catalog.tree.filter(row => row.rewardId === id && row.rewardType !== '随机战法');
    return !matching.length || this.profile.unlockedRewards.includes(id) || matching.some(row => this.profile.unlockedTree.includes(row.id));
  }
  _pool(kind, rarities = [1, 2, 3, 4], options = {}) {
    const source = this.catalog[kindTables[kind]] || [];
    return source.filter(item => {
      if (!rarities.includes(item.rarity) || !this._supported(kind, item.id)) return false;
      if (kind === 'tactic' && (item.deprecated || !item.seasonIds.includes(5))) return false;
      if (kind === 'tactic' && this.schoolEffectIds.has(item.id)) return false;
      if (kind === 'equipment' && !item.equipment || kind === 'card' && item.equipment) return false;
      if (!options.ignoreUnlock && !this._unlocked(kind, item.id)) return false;
      if (kind === 'skill' && ownedRewardSkillIds(this.run).includes(item.id)) return false;
      if (options.equipmentType && item.cardSubType !== options.equipmentType) return false;
      return true;
    });
  }
  _groupPool(group) {
    if (!group) return [];
    const kind = typeKinds[Number(group.type)];
    if (!kind) return [];
    let equipmentType;
    if (Number(group.reward) >= 271 && Number(group.reward) <= 280) equipmentType = 1;
    if (Number(group.reward) >= 281 && Number(group.reward) <= 290) equipmentType = 2;
    if (Number(group.reward) >= 291 && Number(group.reward) <= 300) equipmentType = 5;
    return this._pool(kind, splitIds(group.allreward), { equipmentType })
      .filter(item => kind !== 'tactic' || !isExpeditionStartOnlyTactic(item.id));
  }
  _rewardGroup(id) {
    const group = this.catalog.indexes.rewardGroups.get(Number(id));
    const kind = typeKinds[Number(group?.type)];
    const baseCount = Math.max(1, integer(group?.pra1, 3));
    const extraChoice = baseCount === 3 && this._has({ skill: 2016, tactic: 2017, card: 2018 }[kind]);
    const pool = this._groupPool(group), count = baseCount + Number(extraChoice);
    const choices = (kind === 'tactic' ? this._sampleTactics(pool, count) : this._sample(pool, count)).map(item => this._choice(kind, item.id));
    if (group?.abandonmoney) choices.push({ id: 'copper:' + group.abandonmoney, kind: 'copper', itemId: 1000, quantity: Number(group.abandonmoney), name: group.abandonmoney + ' 铜币', description: '放弃本次技能选择，获得铜币', supported: true, price: 0 });
    const description = group?.rewarditem || '';
    return { kind: 'reward', groupId: Number(id), title: group?.rewarddesc || '选择战利品', description: extraChoice ? description.replace(/三([个张])/, '四$1') : description, choices };
  }
  _battleRewardGroup(id) {
    const group = this.catalog.indexes.rewardGroups.get(Number(id));
    if (!this._has(2216) || !['tactic', 'skill'].includes(typeKinds[Number(group?.type)])) return id;
    const rarities = splitIds(group.allreward);
    const upgraded = [...new Set(rarities.map(rarity => Math.min(4, rarity + 1)))];
    if (upgraded.join() === rarities.join()) return id;
    // The client supplies a 20% chance, but the server owns its roll. Locally,
    // shift the reward pool up one tier and commit that choice at settlement.
    const candidate = [...this.catalog.indexes.rewardGroups.values()].find(row =>
      Number(row.type) === Number(group.type) && Number(row.random) === Number(group.random) &&
      Number(row.pra1) === Number(group.pra1) && Number(row.pra2) === Number(group.pra2) &&
      splitIds(row.allreward).join() === upgraded.join() && this._groupPool(row).length);
    return candidate && this._tacticChance(2216) ? Number(candidate.reward) : id;
  }
  currentCity() { return this.run ? this.catalog.indexes.cities.get(this.run.cityId) : null; }
  availableCities() { return this.run ? nextCities(this.catalog, this.run.cityId, this.run.difficulty) : []; }
  _chapterRules() { return this.catalog.rules.ChapterCS.find(row => Number(row.chapter) === this.run.chapter) || {}; }
  chapterActionInfo() {
    if (!this.run) return null;
    const rules = this._chapterRules();
    const base = Math.max(0, integer(rules.chapterday, integer(rules.apptime, 4)));
    const bonus = [2024, 2142].reduce((sum, id) => sum + (this._has(id) ? integer(this.catalog.indexes.tactics.get(id)?.raw.pra1) : 0), 0);
    const total = base + bonus, used = integer(this.run.month);
    return { base, bonus, limit: total, used, remaining: Math.max(0, total - used), enforced: this.run.actionBudgetVersion === 1 };
  }
  nodes() {
    if (!this.run) return [];
    const monthNeed = integer(this._chapterRules().apptime, 4);
    return this.run.nodes.map(saved => {
      let node = saved;
      if (this._has(2015) && saved.kind === 'battle' && !saved.boss && !saved.done) {
        const battle = this.catalog.indexes.battles.get(saved.battleId);
        const elite = battle && !battle.elite && this.eliteBattleVariants.get(saved.id + ':' + (battle.raw?.name || battle.name));
        if (elite) node = { ...saved, battleId: elite.id, groupId: this.run.difficulty <= 5 && elite.newPlayerGroupId || elite.groupId, title: elite.name, elite: true };
      }
      const actions = this.chapterActionInfo();
      const waitingForBoss = node.boss && this.run.month < monthNeed;
      const exhausted = !node.boss && actions.enforced && actions.remaining === 0;
      return { ...node, status: node.done ? 'completed' : waitingForBoss || exhausted ? 'locked' : 'available', lockedReason: waitingForBoss ? '第 ' + (monthNeed + 1) + ' 月首领现身' : exhausted ? '本章行动已用尽，请挑战首领' : '' };
    });
  }
  _makeNodes() {
    const city = this.currentCity();
    const types = this._sample(['battle', 'battle', 'battle', 'battle', 'battle', 'event', 'camp'], 7);
    this.run.month = 0;
    // Legacy saves keep their current chapter's existing rules. New chapters
    // adopt the documented ChapterDay allowance without regenerating old maps.
    this.run.actionBudgetVersion = 1;
    this.run.nodeIndex = 0;
    this.run.nodes = city.nodes.map((node, index) => {
      const kind = node.boss ? 'battle' : types[index];
      const record = { id: node.id, name: node.name, title: node.name, kind, boss: node.boss, done: false, position: node.position };
      if (kind === 'battle') {
        const battles = battlesForNode(this.catalog, node.id, this.run.difficulty);
        const battle = this._sample(battles)[0];
        if (!battle) throw new Error(node.name + '缺少战斗配置');
        record.battleId = battle.id;
        record.groupId = battle.selectedGroupId;
        record.title = node.boss ? city.name + ' · 首领' : battle.name;
      } else if (kind === 'event') {
        const events = eventsForNode(this.catalog, node.id).filter(event => event.options.some(option => this._optionSupport(option).supported));
        const event = this._sample(events)[0];
        if (event) { record.eventId = event.id; record.title = event.name; }
        else { record.kind = 'camp'; record.title = '营地'; }
      } else record.title = kind === 'shop' ? '集市' : '营地';
      return record;
    });
    if (this.run.chapter === 3 && this._mutation(5062)) {
      const boss = this.run.nodes.find(node => node.boss);
      const candidates = this.catalog.cities.filter(other => other.order === 3 && other.id !== city.id)
        .flatMap(other => other.nodes.filter(node => node.boss).flatMap(node => battlesForNode(this.catalog, node.id, this.run.difficulty)))
        .filter(battle => battle.id !== boss.battleId);
      const second = this._sample(candidates)[0];
      if (!second) throw new Error('第二首领配置缺失');
      boss.secondBattle = { battleId: second.id, groupId: second.selectedGroupId, title: second.name };
    }
  }
  start({ character, hp = 4, maxHp = hp, difficulty = 1, rank = 1, loadout, seed } = {}) {
    return this._change(() => {
      if (this.run && !this.run.settled) throw new Error('请先继续或结束当前征程');
      if (!character || typeof character !== 'string') throw new Error('请选择武将');
      difficulty = integer(difficulty, 1);
      const config = this.catalog.indexes.difficulties.get(difficulty);
      const availability = this.difficultyAvailability(difficulty);
      if (!availability.unlocked) throw new Error(availability.reason);
      const chosen = loadout || this.profile.loadout;
      this._checkLoadout(chosen);
      rank = Math.max(1, Math.min(5, integer(rank, 1)));
      const privilege = this.catalog.rules.GeneralRankPriv.find(row => row.rank === rank - 1) || {};
      this.run && (this.state.run = null);
      const selectedTraits = startRunTraits(this, character, rank);
      const traits = { hp: 0, startingCards: 0, draw: 0, slashCount: 0, armor: 0, armorGain: 0, handLimit: 0, damage: 0, ...selectedTraits.bonuses };
      const baseMaxHp = Number(maxHp) + integer(privilege.addHp);
      const traitMaxHp = Math.max(1, baseMaxHp + traits.hp);
      traits.hp = traitMaxHp - baseMaxHp;
      const bonusHp = integer(privilege.addHp) + traits.hp;
      this.state.run = {
        id: Date.now().toString(36) + '-' + (++this.profile.seed).toString(36),
        seed: (integer(seed, Date.now() ^ this.profile.seed) >>> 0) || 1,
        character, difficulty, rank, hp: Math.max(1, Math.min(traitMaxHp, Number(hp) + bonusHp)), maxHp: traitMaxHp,
        traitIds: [...selectedTraits.ids], traitBonuses: traits,
        mutations: [], fixedMutations: fixedMutationIds(config), mutationVersion: 1,
        mutationChoicePending: !config.desperate && difficulty >= Number(this.catalog.rules.Common.seeddiff || 16),
        armyChoicePending: !!config.desperate,
        copper: 0, totalCopper: 0, cityId: 0, chapter: 1, month: 0, totalMonths: 0, accday: 0, nodeIndex: 0,
        skills: [], tactics: [], cards: [], equips: [], allies: [], skillSlots: integer(this.catalog.rules.Common.spellnum, 2), maxSkillSlots: integer(this.catalog.rules.Common.spellmax, 3),
        stats: { startingCards: integer(privilege.addFirstCard) + traits.startingCards, draw: integer(privilege.addcard) + traits.draw, slashCount: integer(privilege.addsha) + traits.slashCount, armor: integer(privilege.addShield) + traits.armor, armorGain: traits.armorGain, handLimit: traits.handLimit, damage: traits.damage },
        rebirthAvailable: !!privilege.exSkills, completed: [], clearedCities: [], victories: 0, nodes: [], shops: {}, log: [], pending: null, rewardQueue: [], source: null, attributes: {}, settled: false,
      };
      if (!Number.isFinite(this.run.maxHp) || !Number.isFinite(this.run.hp) || !(this.run.maxHp > 0) || !(this.run.hp > 0)) throw new Error('武将体力配置无效');
      this.run.hp = Math.min(this.run.hp, this.run.maxHp);
      this.run.cityId = this._sample(this.catalog.cities.filter(city => city.order === 1))[0].id;
      this._makeNodes();
      for (const id of chosen) this._grant(this._choice('tactic', id), undefined, true);
      this._log('从' + this.currentCity().name + '启程');
      this._advanceRewards();
    });
  }
  chooseCity(id) {
    return this._change(() => {
      this._expect('route');
      const city = this.availableCities().find(item => item.id === Number(id));
      if (!city) throw new Error('不能到达该城池');
      this.run.cityId = city.id;
      this.run.chapter = city.order;
      this.run.pending = null;
      this.run.source = null;
      this._makeNodes();
      this._log('行军至' + city.name);
    });
  }
  chooseMutation(id) {
    return this._change(() => {
      const pending = this._expect('mutation');
      const choice = pending.choices.find(choice => String(choice.id) === String(id));
      if (!choice || !mutationPool(this.catalog, this.run, this.storage.mutationAllowed).some(row => Number(row.seed) === choice.seedId)) throw new Error('此突变无法选择');
      this.run.mutations = [choice.seedId];
      this.run.mutationChoicePending = false;
      this.run.pending = null;
      this._log('难度突变：' + choice.name);
      this._advanceRewards();
    });
  }
  _offerArmy() {
    const difficulty = this.catalog.indexes.difficulties.get(this.run.difficulty);
    // Army generation is server-owned. Offline, one band of three EX stages
    // unlocks each rarity (rare/epic/legendary); candidates and retention commit once.
    const rarity = Math.min(4, 1 + Math.ceil(difficulty.stage / 3));
    const pool = ['tactic', 'skill', 'card', 'equipment'].flatMap(kind => this._pool(kind, [rarity])
      .filter(item => kind !== 'tactic' || !isExpeditionStartOnlyTactic(item.id) && !this.run.tactics.includes(item.id))
      .map(item => this._choice(kind, item.id)));
    const saved = this.profile.army;
    const retained = saved && this._choice(saved.kind, saved.itemId);
    const validRetained = retained?.supported
      && !(saved.kind === 'tactic' && (isExpeditionStartOnlyTactic(saved.itemId) || this.run.tactics.includes(saved.itemId)))
      && !(saved.kind === 'skill' && ownedRewardSkillIds(this.run).includes(saved.itemId));
    const choices = this._sample(pool.filter(item => !validRetained || item.id !== retained.id), 3);
    if (validRetained) choices.unshift({ ...retained, retained: true });
    choices.push({ id: 'skip', kind: 'skip', itemId: 0, name: '暂不携带', description: '', supported: true });
    this.run.pending = { kind: 'army', title: '选择军备', description: '携带一项军备开始征程，可保留上次选择的军备。', choices };
  }
  chooseArmy(id, replaceIndex) {
    return this._change(() => {
      const pending = this._expect('army');
      const choice = pending.choices.find(item => item.id === String(id));
      if (!choice || !choice.supported) throw new Error('此军备不可选择');
      if (choice.kind !== 'skip') {
        this._grant(choice, replaceIndex, true);
        this.profile.army = { kind: choice.kind, itemId: choice.itemId };
        this.run.army = { ...this.profile.army };
        this._log('携带军备：' + choice.name);
      }
      this.run.armyChoicePending = false;
      this.run.pending = null;
      this._advanceRewards();
    });
  }
  canSwitchBattle() {
    const run = this.run, pending = run?.pending, source = run?.source;
    if (!run || run.settled || pending?.kind !== 'battle' || pending.started || run.rewardQueue.length || !source) return false;
    if (Number(source.nodeId) !== Number(pending.nodeId) || Boolean(source.boss) !== Boolean(pending.boss)) return false;
    // Resolve the current node rather than its saved base: 战法 2015 can turn a
    // normal encounter into its elite variant. Event battles have paid/committed
    // their option already, and must never be mistaken for map previews.
    const node = this.nodes().find(node => Number(node.id) === Number(source.nodeId));
    return Boolean(node && !node.done && node.kind === 'battle'
      && Number(node.battleId) === Number(pending.battleId)
      && Number(node.groupId) === Number(pending.groupId)
      && Boolean(node.boss) === Boolean(pending.boss));
  }
  enterNode(id) {
    return this._change(() => {
      this._assertRun();
      const node = this.nodes().find(node => node.id === Number(id));
      if (this.run.pending && !(node?.kind === 'battle' && this.canSwitchBattle())) throw new Error('请先完成当前事件');
      if (!node || node.status !== 'available') throw new Error(node?.lockedReason || '该地点无法进入');
      this.run.source = { nodeId: node.id, boss: node.boss };
      if (node.kind === 'battle') this._beginBattle(node.battleId, node.groupId);
      else if (node.kind === 'event') this._beginEvent(node.eventId);
      else if (node.kind === 'shop') this._beginShop();
      else this._beginCamp();
    });
  }
  _beginBattle(id, groupId) {
    const battle = this.catalog.indexes.battles.get(Number(id));
    if (!battle) throw new Error('战斗配置缺失');
    this.run.pending = { kind: 'battle', battleId: battle.id, groupId: groupId || (this.run.difficulty <= 5 && battle.newPlayerGroupId || battle.groupId), title: battle.name, description: battle.description, nodeId: this.run.source?.nodeId, boss: !!this.run.source?.boss };
  }
  startBattle({ battleId, nodeId } = {}) {
    return this._change(() => {
      const pending = this._expect('battle');
      if (battleId != null && Number(battleId) !== Number(pending.battleId)
        || nodeId != null && Number(nodeId) !== Number(pending.nodeId)) throw new Error('战斗选择已改变，请重新打开关卡');
      // Clicking Challenge commits this encounter; resuming an interrupted
      // battle may challenge the same node again, but cannot change its source.
      pending.started = true;
    });
  }
  _costChoices(option) {
    const result = option.results?.[0];
    if (Number(result?.losttype) !== 2) return [];
    const [type, rarity] = splitIds(result.lostitem);
    const kind = typeKinds[type];
    return (this.run?.[fieldKinds[kind]] || []).filter(id => this.catalog.indexes[kindTables[kind]]?.get(id)?.rarity === rarity).map(id => this._choice(kind, id));
  }
  _optionSupport(option) {
    const results = option.results || [];
    if (!results.length) return { supported: false, disabledReason: '官方公开配置缺少此选项结果' };
    if (results.some(row => row.type === 9)) return { supported: false, disabledReason: '此选项需要在线点数小游戏，离线版暂未开放' };
    for (const result of results) {
      if (![1, 3, 7].includes(result.type)) return { supported: false, disabledReason: '此事件效果尚未适配' };
      if (result.type === 1 && result.getitem) {
        if (Number(result.gettype) === 2) {
          if (!this._groupPool(this.catalog.indexes.rewardGroups.get(Number(result.getitem))).length) return { supported: false, disabledReason: '该奖励池暂无已解锁且可运行的内容' };
        } else {
          const kind = Number(result.gettype) === 3 ? 'ally' : this._itemKind(Number(result.getitem));
          if (kind === 'tactic' && isExpeditionStartOnlyTactic(result.getitem)) return { supported: false, disabledReason: '该战法仅在征程开局生效' };
          if (!this._choice(kind, result.getitem).supported) return { supported: false, disabledReason: '此固定奖励暂未完成适配' };
        }
      }
    }
    return { supported: true };
  }
  _beginEvent(id) {
    const event = this.catalog.indexes.events.get(Number(id));
    if (!event) throw new Error('奇遇配置缺失');
    this.run.pending = { kind: 'event', eventId: event.id, title: event.name, description: event.description, choices: event.options.map(option => {
      const support = this._optionSupport(option);
      const result = option.results?.[0];
      const costChoices = this._costChoices(option);
      const copperCost = Number(result?.losttype) === 1 && Number(result?.lostitem) === 1000 ? Number(result.lostnum) || 0 : 0;
      let reason = support.disabledReason;
      if (copperCost > this.run.copper) reason = '需要 ' + copperCost + ' 铜币';
      if (Number(result?.losttype) === 2 && !costChoices.length) reason = '没有符合条件的可交换物品';
      if (Number(result?.gettype) === 3 && this.run.allies.length >= 2) reason = '队伍已满（最多两名队友）';
      return { ...option, id: option.index, name: option.text, description: option.effect?.label || '', supported: support.supported, disabled: !!reason, disabledReason: reason || '', copperCost, costChoices };
    }) };
    if (!this.run.pending.choices.some(choice => !choice.disabled)) this.run.pending.choices.push({ id: 0, index: 0, name: '离开此地', text: '离开此地', description: '当前没有可以执行的选项，继续征程。', supported: true, disabled: false });
  }
  chooseEvent(index, lossItemId) {
    return this._change(() => {
      const pending = this._expect('event');
      const option = pending.choices.find(choice => choice.index === Number(index));
      if (!option || option.disabled || !option.supported) throw new Error(option?.disabledReason || '无法选择该选项');
      if (option.index === 0) { this._log('离开' + pending.title); this.run.pending = null; this._completeNode(); return; }
      const support = this._optionSupport(option);
      if (!support.supported) throw new Error(support.disabledReason || '无法选择该选项');
      const result = this._sample(option.results)[0];
      if (Number(result.losttype) === 1) {
        const lossId = Number(result.lostitem), number = Number(result.lostnum) || 1;
        if (lossId === 1000) { if (this.run.copper < number) throw new Error('铜币不足'); this.run.copper -= number; }
        else this._removeItem(lossId, number);
      } else if (Number(result.losttype) === 2) {
        const costChoices = this._costChoices(option);
        const choice = costChoices.find(choice => choice.itemId === Number(lossItemId)) || (costChoices.length === 1 ? costChoices[0] : null);
        if (!choice) throw new Error('请选择要交换的物品');
        this._removeItem(choice.itemId, Number(result.lostnum) || 1);
        this._log('交换了' + choice.name);
      }
      const observed = option.observations?.find(row => row.seasonId === 5 && row.consistency === 1)?.dominant?.delta;
      if (observed) for (const [key, value] of Object.entries(observed)) this.run.attributes[key] = (this.run.attributes[key] || 0) + value;
      this._log(pending.title + '：' + option.text);
      this.run.pending = null;
      if (result.type === 3) this._beginCamp();
      else if (result.type === 7) this._beginBattle(Number(result.getitem) || option.effect?.battleId);
      else {
        if (Number(result.gettype) === 2) this.run.rewardQueue.push({ groupId: Number(result.getitem) });
        else if (result.getitem) {
          const kind = Number(result.gettype) === 3 ? 'ally' : this._itemKind(Number(result.getitem));
          this.run.rewardQueue.push({ choice: this._choice(kind, Number(result.getitem), Number(result.getnum) || 1) });
        }
        this._advanceRewards();
      }
    });
  }
  _removeItem(id, amount = 1) {
    const kind = this._itemKind(Number(id)), key = fieldKinds[kind];
    if (!key) throw new Error('此交换消耗尚未支持');
    for (let count = 0; count < amount; count++) {
      const index = this.run[key].indexOf(Number(id));
      if (index < 0) throw new Error('没有足够的交换物品');
      this.run[key].splice(index, 1);
    }
  }
  rewardOptions() {
    if (this.run?.pending?.kind !== 'reward') return [];
    // Hide expired starting-only offers in old saves and fixed reward queues.
    // Keep every other committed candidate unchanged; browsing never rerolls.
    const choices = clone(this.run.pending.choices)
      .filter(choice => choice.kind !== 'tactic' || !isExpeditionStartOnlyTactic(choice.itemId))
      .map(choice => choice.kind === 'tactic' && isForeignModeTactic(choice.itemId)
      ? { ...choice, supported: false, disabled: true, disabledReason: FOREIGN_MODE_TACTIC_REASON }
      : choice);
    if (!choices.some(choice => choice.supported && !choice.disabled)) {
      let id = 'skip';
      while (choices.some(choice => choice.id === id)) id += ':unavailable';
      choices.push({ id, kind: 'skip', itemId: 0, name: '跳过此奖励', description: '当前奖励没有可领取的内容，跳过后继续征程；不会替换或重抽奖励。', supported: true });
    }
    return choices;
  }
  _advanceRewards() {
    if (this._offerTacticRemoval()) return;
    while (this.run.rewardQueue.length) {
      const request = this.run.rewardQueue.shift();
      const pending = request.groupId ? this._rewardGroup(request.groupId) : { kind: 'reward', title: '获得奖励', choices: [request.choice] };
      if (!pending.choices.length) {
        // A visible skip keeps an unsupported reward from silently becoming a different item.
        pending.choices = [{ id: 'skip', kind: 'skip', itemId: 0, name: '跳过此奖励', description: '该奖励池暂无已适配内容；不会替换成其他物品。', supported: true }];
      }
      this.run.pending = pending;
      return;
    }
    if (this.run.armyChoicePending) { this._offerArmy(); return; }
    if (this.run.mutationChoicePending) {
      const choices = this._sample(mutationPool(this.catalog, this.run, this.storage.mutationAllowed), 3)
        .map(row => ({ ...mutationDisplay(row), id: String(row.seed) }));
      if (!choices.length) throw new Error('没有可用的突变配置');
      this.run.pending = { kind: 'mutation', title: '难度突变', choices };
      return;
    }
    this.run.pending = null;
    if (this.run.source) this._completeNode();
  }
  takeReward(id, replaceIndex) {
    return this._change(() => {
      this._expect('reward');
      const choice = this.rewardOptions().find(choice => choice.id === String(id));
      if (!choice || !choice.supported || choice.disabled) throw new Error(choice?.disabledReason || '无效奖励');
      if (choice.kind !== 'skip') this._grant(choice, replaceIndex);
      this._log(choice.kind === 'skip' ? choice.description : '获得' + choice.name);
      this._advanceRewards();
    });
  }
  _grant(choice, replaceIndex, starting = false) {
    const id = choice.itemId, amount = choice.quantity || 1;
    if (choice.kind === 'tactic' && isForeignModeTactic(id)) throw new Error(FOREIGN_MODE_TACTIC_REASON);
    if (!starting && choice.kind === 'tactic' && isExpeditionStartOnlyTactic(id)) throw new Error('该战法仅能在征程开局携带');
    if (!choice.supported) throw new Error(choice.disabledReason || '物品尚未适配');
    if (choice.kind === 'copper') { this.run.copper += amount; this.run.totalCopper += amount; return; }
    if (choice.kind === 'stat') { this._stat(id, amount); return; }
    if (choice.kind === 'ally') {
      if (this.run.allies.length >= 2) throw new Error('队伍已满（最多两名队友）');
      this.run.allies.push(id); return;
    }
    if (choice.kind === 'skill') {
      return grantRunSkill(this, id, replaceIndex);
    }
    if (choice.kind === 'equipment') {
      const item = this.catalog.indexes.cards.get(id);
      const index = this.run.equips.findIndex(old => this.catalog.indexes.cards.get(old)?.cardSubType === item.cardSubType);
      if (index >= 0) { this.run.equips.splice(index, 1); if (this._has(2092)) { this.run.copper += 200; this.run.totalCopper += 200; } }
      this.run.equips.push(id); return;
    }
    if (choice.kind === 'card') { for (let i = 0; i < amount; i++) this.run.cards.push(id); return; }
    if (choice.kind !== 'tactic') throw new Error('未知奖励类型');
    this.run.tactics.push(id);
    if (id === 2225) this.run.tacticRemovalCount = integer(this.run.tacticRemovalCount) + amount;
    if (id === 2023) this.run.skillSlots = Math.min(this.run.maxSkillSlots, this.run.skillSlots + 1);
    if (id === 2293) this.run.maxSkillSlots++;
    if (!starting) return;
    const startingMoney = { 2112: 200, 2139: 300, 2140: 500, 2141: 700 };
    if (startingMoney[id]) { this.run.copper += startingMoney[id]; this.run.totalCopper += startingMoney[id]; }
    if (id === 2138) this.run.rewardQueue.push({ groupId: 112 });
    if (id === 2113 || id === 2114) {
      const tactic = this.catalog.indexes.tactics.get(id);
      const choices = String(tactic?.raw.strpra || '').split(';').map(value => {
        const [itemId, weight] = value.split(',').map(Number);
        return { itemId, weight, item: this.catalog.indexes.cards.get(itemId) };
      }).filter(choice => choice.weight > 0 && choice.item?.equipment && this._supported('equipment', choice.itemId));
      // The local inventory has one slot per equipment type. Keep both starting
      // rewards usable by drawing without occupied slots instead of overwriting.
      for (let count = 0; count < integer(tactic?.raw.pra1, 1); count++) {
        const occupied = new Set(this.run.equips.map(itemId => this.catalog.indexes.cards.get(itemId)?.cardSubType));
        const picked = this._weightedSample(choices.filter(choice => !occupied.has(choice.item.cardSubType)), 1, choice => choice.weight)[0];
        if (!picked) break;
        this._grant(this._choice('equipment', picked.itemId));
      }
    }
    if ((id === 2219 || id === 2220) && this.run.allies.length < 2) {
      // Tactics.strpra is the weighted special-companion pool. The unrelated
      // 999xxx ordinary ally groups are not substitutes for these 997xxx rows.
      const choices = String(this.catalog.indexes.tactics.get(id)?.raw.strpra || '').split(';').map(value => {
        const [groupId, weight] = value.split(',').map(Number);
        return { groupId, weight };
      }).filter(choice => choice.weight > 0 && Number.isFinite(choice.weight) && this.catalog.indexes.enemyGroups.has(choice.groupId));
      const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
      if (total > 0) {
        let roll = this._random() * total;
        const ally = choices.find(choice => { if (roll < choice.weight) return true; roll -= choice.weight; return false; });
        if (ally) this.run.allies.push(ally.groupId);
      }
    }
  }
  _offerTacticRemoval(resumePending = null) {
    if (!(this.run.tacticRemovalCount > 0)) return false;
    this.run.tacticRemovalCount--;
    this.run.pending = {
      kind: 'removeTactic', title: '涤净', description: '可以移除一个已拥有的战法，也可以保留全部战法。',
      choices: this.run.tactics.map((id, index) => ({ ...this._choice('tactic', id), id: 'remove:' + index, index, supported: true })),
      resumePending: resumePending ? clone(resumePending) : null,
    };
    return true;
  }
  resolveTacticRemoval(index) {
    return this._change(() => {
      const pending = this._expect('removeTactic');
      if (index !== null) {
        const slot = Number(index);
        const choice = index !== undefined && index !== '' && Number.isInteger(slot) && pending.choices.find(choice => choice.index === slot);
        if (!choice || this.run.tactics[slot] !== choice.itemId) throw new Error('请选择当前拥有的战法');
        this.run.tactics.splice(slot, 1);
        if (choice.itemId === 2023) {
          const base = this.run.clearedCities.length ? Math.max(3, integer(this.catalog.rules.Common.spellnum, 2)) : integer(this.catalog.rules.Common.spellnum, 2);
          this.run.skillSlots = Math.max(Math.min(base, this.run.maxSkillSlots), this.run.skillSlots - 1);
        }
        if (choice.itemId === 2293) {
          this.run.maxSkillSlots = Math.max(integer(this.catalog.rules.Common.spellmax, 3), this.run.maxSkillSlots - 1);
          this.run.skillSlots = Math.min(this.run.skillSlots, this.run.maxSkillSlots);
        }
        // Existing learned skills are retained even if their slot allowance
        // decreases. Future acquisition must replace a skill instead of adding.
        this._log('涤净移除了' + choice.name);
      } else this._log('放弃移除战法');
      const resume = pending.resumePending;
      this.run.pending = resume ? clone(resume) : null;
      if (!this._offerTacticRemoval(this.run.pending) && !resume) this._advanceRewards();
    });
  }
  _stat(id, quantity) {
    const mapping = { 1002: 'armor', 1003: 'armorGain', 1004: 'startingCards', 1005: 'draw', 1006: 'handLimit', 1011: 'slashCount' };
    if (id === 1001) { this.run.maxHp += quantity; this.run.hp += quantity; }
    else if (id === 1009) this.run.hp = this.run.maxHp;
    else if (id === 1007) this.run.skillSlots = Math.min(this.run.maxSkillSlots, this.run.skillSlots + quantity);
    else if (id === 1008) this.run.mulligans = (this.run.mulligans || 0) + quantity;
    else if (mapping[id]) this.run.stats[mapping[id]] += quantity;
    else throw new Error('此属性奖励暂未适配');
  }
  _beginCamp() {
    const ids = [1, 2, 4, 5, 6, 9];
    this.run.pending = { kind: 'camp', title: '安营扎寨', description: '整顿军备，从以下项目中选择一项。', choices: this.catalog.rules.CampBonus.filter(row => ids.includes(row.ID)).map(row => ({ id: row.ID, name: row.desc, description: row.desc, rewardId: Number(row.rewardID), quantity: row.num || 1 })) };
  }
  camp(id) {
    return this._change(() => {
      const pending = this._expect('camp'), choice = pending.choices.find(row => row.id === Number(id));
      if (!choice) throw new Error('无效营地选项');
      this._stat(choice.rewardId, choice.quantity);
      this._log('营地：' + choice.name);
      this.run.pending = null;
      this._advanceRewards();
    });
  }
  _beginShop() {
    this.run.shops ||= {};
    const saved = this.run.shops[this.run.cityId];
    this.run.pending = saved ? clone(saved) : { kind: 'shop', title: '集市', cityId: this.run.cityId, products: [], purchases: 0, purchasesByKind: {}, refreshes: 0 };
    if (!saved) { this._stockShop(); this.run.shops[this.run.cityId] = clone(this.run.pending); }
    else this._syncShopStockBonus();
  }
  openShop() {
    return this._change(() => {
      this._assertRun();
      if (!this.canOpenShop()) throw new Error('请先完成当前事件');
      // A collapsed shop still holds its latest purchases and refreshes. Keep
      // that live visit instead of restoring an older cached inventory.
      if (this.run.pending?.kind === 'shop') return;
      if (this.run.pending?.kind === 'battle') {
        // A map encounter is only a preview until Challenge. Clear its source
        // together with the preview so leaving the market cannot settle it.
        this.run.pending = null;
        this.run.source = null;
      }
      this._beginShop();
    });
  }
  canOpenShop() {
    const run = this.run;
    return Boolean(run && !run.settled
      && (!run.pending || run.pending.kind === 'shop' || this.canSwitchBattle()));
  }
  _shopPool(kind, rarities) {
    return this._pool(kind, rarities).filter(item => kind !== 'tactic' || !isExpeditionStartOnlyTactic(item.id));
  }
  _shopStockBonus() {
    return [2136, 2137].reduce((count, id) => count + (this._has(id) ? integer(this.catalog.indexes.tactics.get(id)?.raw.pra1) : 0), 0) - integer(this._mutation(5057)?.pra2);
  }
  _shopPicks(kind, rarities, count, excludedIds = []) {
    const excluded = new Set(excludedIds), picked = [];
    const upgradeId = { tactic: 2213, skill: 2214, card: 2215, equipment: 2215 }[kind];
    while (picked.length < count) {
      const pool = this._shopPool(kind, rarities).filter(item => !excluded.has(item.id));
      let item = (kind === 'tactic' ? this._sampleTactics(pool) : this._sample(pool))[0];
      if (!item) break;
      if (item.rarity < 4 && this._has(upgradeId)) {
        const higher = this._shopPool(kind, [item.rarity + 1]).filter(candidate => !excluded.has(candidate.id));
        if (higher.length && this._tacticChance(upgradeId)) item = (kind === 'tactic' ? this._sampleTactics(higher) : this._sample(higher))[0];
      }
      picked.push(item);
      excluded.add(item.id);
    }
    return picked;
  }
  _syncShopStockBonus() {
    const shop = this.run.pending, bonus = this._shopStockBonus();
    const additional = bonus - integer(shop.stockBonus);
    if (additional <= 0) return;
    const rarities = this.run.chapter === 1 ? [1, 2, 3] : [1, 2, 3, 4];
    for (const kind of ['tactic', 'skill', 'card', 'equipment']) {
      const existing = shop.products.filter(item => item.kind === kind).map(item => item.itemId);
      const products = this._shopPicks(kind, rarities, additional, existing).map((picked, index) => ({
        ...this._choice(kind, picked.id), id: `shop:${shop.refreshes}:bonus:${bonus}:${kind}:${index}`, sold: false, basePrice: picked.price,
      }));
      shop.products.push(...products);
    }
    // Append only genuinely new slots. Existing and sold products are retained.
    shop.stockBonus = bonus;
  }
  _stockShop() {
    const shop = this.run.pending, kinds = ['tactic', 'skill', 'card', 'equipment'];
    const rarities = this.run.chapter === 1 ? [1, 2, 3] : [1, 2, 3, 4];
    const seasonId = Number(this.catalog.season.id);
    const rules = (this.catalog.rules.Shop || []).filter(rule => !rule.seasonID || splitIds(rule.seasonID).includes(seasonId));
    const rule = rules.find(row => Number(row.shopID) === Number(shop.cityId)) || rules[0];
    // Mcs/CQ display server stock per type; the supplied recording shows four equipment
    // cards under the equipment tab. Rebuild that stock from each eligible local pool.
    shop.stockBonus = this._shopStockBonus();
    const count = Math.max(0, integer(rule?.itemnum, 4) + shop.stockBonus);
    shop.products = kinds.flatMap(kind => {
      return this._shopPicks(kind, rarities, count).map((picked, index) => ({
        ...this._choice(kind, picked.id), id: `shop:${shop.refreshes}:${kind}:${index}`, sold: false, basePrice: picked.price,
      }));
    });
  }
  shopItems() {
    const shop = this.run?.pending;
    if (shop?.kind !== 'shop') return [];
    // CQ.getShopDiscount/getGoodsFinalMoney: discounts multiply and the final price rounds up.
    const discount = [2091, 2145].reduce((value, id) => this._has(id) ? value * (1 - (Number(this.catalog.indexes.tactics.get(id)?.raw.pra1) || 0) / 100) : value, 1);
    const shopRule = this.catalog.rules.Shop[0] || {};
    const priceFields = { tactic: 'nextmoneyup', skill: 'nextmoneyup2', equipment: 'nextmoneyup3', card: 'nextmoneyup4' };
    // Older saves can contain one-time starting tactics. Hide those entries at
    // the purchase boundary without changing saved stock or consuming RNG.
    return shop.products.filter(item => item.kind !== 'tactic' || !isExpeditionStartOnlyTactic(item.itemId) && !isForeignModeTactic(item.itemId)).map(item => {
      const purchases = shop.purchasesByKind?.[item.kind] || 0;
      const increase = this._has(2012) ? 0 : purchases * (integer(shopRule[priceFields[item.kind]], 100) + integer(this._mutation(5059)?.pra2));
      return { ...item, price: Math.ceil((item.basePrice + increase) * discount), disabled: item.sold };
    });
  }
  buy(id, replaceIndex) {
    return this._change(() => {
      const shop = this._expect('shop'), item = this.shopItems().find(item => item.id === String(id));
      if (!item || item.sold || !item.supported) throw new Error('商品不可购买');
      if (this.run.copper < item.price) throw new Error('铜币不足');
      this._grant(item, replaceIndex);
      this.run.copper -= item.price;
      shop.products.find(product => product.id === item.id).sold = true;
      shop.purchases++;
      shop.purchasesByKind ||= {};
      shop.purchasesByKind[item.kind] = (shop.purchasesByKind[item.kind] || 0) + 1;
      this._log('花费' + item.price + '铜币购买' + item.name);
      this._syncShopStockBonus();
      if (this._has(2252)) {
        const picked = this._shopPicks(item.kind, [1, 2, 3, 4], 1)[0];
        const index = shop.products.findIndex(product => product.id === item.id);
        if (picked) shop.products[index] = { ...this._choice(item.kind, picked.id), id: item.id + ':' + shop.purchases, sold: false, basePrice: picked.price };
      }
      this._offerTacticRemoval(shop);
    });
  }
  refreshShop() {
    return this._change(() => {
      const shop = this._expect('shop'), info = this.shopRefreshInfo();
      if (info.remaining <= 0) throw new Error('没有剩余集市刷新次数');
      if (this.run.copper < info.price) throw new Error('刷新需要' + info.price + '铜币');
      this.run.copper -= info.price;
      shop.refreshes++;
      this._stockShop();
    });
  }
  shopRefreshInfo() {
    const [baseCount = 0, price = 100] = splitIds(this.catalog.rules.Common.shoprefresh);
    // The original client displays 99 remaining while the resource set is active; the limit never decrements.
    if (this.schoolProgress().some(school => school.active && school.effectId === 2230)) return { remaining: 99, total: 99, price, infinite: true };
    // wBt.GetJiShiRefreshCnt adds both membership tiers to the base allowance.
    const total = [2187, 2107].reduce((count, id) => count + (this._has(id) ? integer(this.catalog.indexes.tactics.get(id)?.raw.pra2) : 0), baseCount);
    const used = this.run?.pending?.kind === 'shop' ? this.run.pending.refreshes : 0;
    return { remaining: Math.max(0, total - used), total, price };
  }
  schoolProgress() {
    const owned = (this.run?.tactics || []).map(id => this.catalog.indexes.tactics.get(id)).filter(Boolean);
    const fields = ['needputong', 'needxiyou', 'needshishi', 'needchuanshuo'];
    return (this.catalog.rules.school || []).map(school => {
      // FQ.SchoolArray can contain several schools; schoolId alone omits these shared tactics.
      const members = owned.filter(tactic => splitIds(tactic.raw?.school || tactic.schoolId).includes(Number(school.school)));
      const requirements = fields.map((field, index) => ({ rarity: index + 1, needed: integer(school[field]), owned: members.filter(tactic => tactic.rarity === index + 1).length }));
      return { id: Number(school.school), name: school.name, effectId: splitIds(school.effect)[0], active: requirements.some(row => row.needed > 0) && requirements.every(row => row.owned >= row.needed), requirements };
    });
  }
  leaveShop() {
    return this._change(() => {
      const shop = this._expect('shop');
      this.run.shops ||= {};
      this.run.shops[this.run.cityId] = clone(shop);
      this.run.pending = null;
      // Only legacy saves have a market as an expedition node. The original client opens its market directly from the city map.
      if (this.run.source) this._completeNode();
    });
  }
  finishBattle(result) {
    return this._change(() => {
      const pending = this._expect('battle');
      if (result?.battleId && Number(result.battleId) !== pending.battleId) throw new Error('战斗结果与当前关卡不一致');
      const won = result?.won ?? result?.win ?? result?.victory;
      if (typeof won !== 'boolean') throw new Error('战斗结果缺少胜负标记');
      if (Number.isFinite(result.maxHp) && result.maxHp > 0) this.run.maxHp = Math.max(1, result.maxHp - (Number(result.startupMaxHpBonus) || 0) - (Number(result.temporaryMaxHpDelta) || 0));
      if (Number.isFinite(result.hp)) this.run.hp = result.hp > 0 ? Math.max(1, Math.min(this.run.maxHp, result.hp - (Number(result.temporaryHpDelta) || 0))) : 0;
      if (result.rebirthUsed) this.run.rebirthAvailable = false;
      if (Array.isArray(result.allies)) this.run.allies = result.allies;
      if (!won) { this._end(false, '兵败'); return; }
      if (this.run.difficulty <= 5) this.run.hp = this.run.maxHp;
      this.run.victories++;
      const battle = this.catalog.indexes.battles.get(pending.battleId);
      let copper = Number(battle.reward.copper) || 0;
      if (this._has(2089)) copper *= 1.2;
      if (this._has(2218)) copper *= this._random() * 3;
      else if (this._has(2217)) copper *= 0.5 + this._random() * 1.5;
      copper = Math.floor(copper);
      this.run.copper += copper;
      this.run.totalCopper += copper;
      const interest = this._has(2146) ? 0.1 : this._has(2090) ? 0.05 : 0;
      const earned = Math.floor(this.run.copper * interest);
      this.run.copper += earned;
      this.run.totalCopper += earned;
      this._log('战胜' + battle.name + '，获得' + copper + '铜币');
      const rewardGroups = battle.reward.groups.map(group => group.id);
      if (battle.elite && !pending.boss && this._has(2013)) rewardGroups.push(202);
      if (pending.boss && this._has(2014)) rewardGroups.push(213);
      for (const groupId of rewardGroups) this.run.rewardQueue.push({ groupId: this._battleRewardGroup(groupId) });
      for (const id of splitIds(battle.raw?.rewarditem)) this.run.rewardQueue.push({ choice: this._choice(this._itemKind(id), id) });
      this.run.pending = null;
      this._advanceRewards();
    });
  }
  _completeNode() {
    const source = this.run.source;
    if (!source) { this.run.pending = null; return; }
    const node = this.run.nodes.find(node => node.id === source.nodeId);
    if (!node || node.done) throw new Error('地点已结算');
    if (source.boss && this.run.chapter === 3 && node.secondBattle && !node.firstBossCleared) {
      // Two boss encounters, not two bosses in one arena. The second encounter
      // was drawn when the chapter opened, so previews/reloads cannot reroll it.
      node.firstBossCleared = true;
      Object.assign(node, node.secondBattle);
      this.run.source = null;
      this.run.pending = null;
      this.run.month++;
      this.run.totalMonths++;
      this.run.accday = this.run.totalMonths;
      this._log('第一名首领已击败，继续挑战' + node.title);
      return;
    }
    node.done = true;
    this.run.completed.push(node.id);
    this.run.source = null;
    this.run.month++;
    this.run.totalMonths++;
    this.run.accday = this.run.totalMonths;
    this.run.nodeIndex++;
    this.run.pending = null;
    if (source.boss) {
      this.run.clearedCities.push(this.run.cityId);
      if (this.run.chapter === 1) this.run.skillSlots = Math.max(this.run.skillSlots, Math.min(3, this.run.maxSkillSlots));
      if (this.run.chapter === 3) this._end(true, '征程胜利');
      else this.run.pending = { kind: 'route', title: '选择行军路线', choices: this.availableCities().map(city => ({ id: city.id, name: city.name, description: city.description, effect: city.effect })) };
    }
  }
  _end(won, reason) {
    if (this.run.settled) return;
    this.run.settled = true;
    const difficulty = this.catalog.indexes.difficulties.get(this.run.difficulty);
    const fullReward = integer(this.catalog.rules.DifficultySelection?.find(row => row.difID === (difficulty.baseDifficulty || this.run.difficulty))?.reward2, 10);
    // DifficultySelection.reward2 is exposed as TalentPoint in the original client.
    // The server's failure-progress percentage is unavailable; cap the documented local partial award below a win.
    const folios = won ? fullReward : Math.max(0, Math.min(fullReward - 1, this.run.clearedCities.length * 3 + Math.floor(this.run.victories / 2)));
    this.profile.folios += folios;
    this.profile.totalFolios += folios;
    const bonus = won ? mutationReward(this.catalog, this.run) : { items: [], scoreBonusPercent: 0 };
    if (won) {
      this.profile.highestGroup = Math.max(this.profile.highestGroup, Math.min(5, difficulty.group + 1));
      this.profile.clearRecords ||= {};
      this.profile.clearRecords[this.run.difficulty] = [...new Set([...(this.profile.clearRecords[this.run.difficulty] || []), this.run.character])];
      this.profile.mutationRewards ||= {};
      for (const item of bonus.items) this.profile.mutationRewards[item.id] = (this.profile.mutationRewards[item.id] || 0) + item.quantity;
    }
    const result = { id: this.run.id, won, reason, character: this.run.character, difficulty: this.run.difficulty, chapter: this.run.chapter, cityId: this.run.cityId, victories: this.run.victories, folios, copper: this.run.copper, mutationRewards: bonus, completedAt: new Date().toISOString() };
    this.profile.history.unshift(result);
    this.profile.history = this.profile.history.slice(0, 30);
    this.run.pending = { kind: 'ending', title: reason, ...result, description: '本地征程已结算。图册保留，可用于解锁山河册。' };
  }
  abandon() { return this._change(() => { this._assertRun(); this._end(false, '撤军'); }); }
  next() {
    return this._change(() => {
      if (this.run?.pending?.kind === 'ending') this.state.run = null;
      else if (!this.run?.pending) return;
      else throw new Error('请先完成当前选择');
    });
  }
  unlockTree(id) {
    return this._change(() => this._unlockTreeNode(id));
  }
  enableDeveloperMode() {
    return this._change(() => {
      const rewards = new Set(this.profile.unlockedRewards);
      for (const node of this.catalog.tree) {
        if (node.rewardType !== '随机战法' && this._supported(this._itemKind(node.rewardId), node.rewardId)) rewards.add(node.rewardId);
      }
      // Include the complete usable season pool, not just one random prize per
      // random tree node. Unlocking never grants anything to the current run.
      for (const item of this.catalog.tactics) {
        if (item.seasonIds.includes(5) && !item.deprecated && !this.schoolEffectIds.has(item.id)
          && this._supported('tactic', item.id)) rewards.add(item.id);
      }
      this.profile.developerMode = true;
      this.profile.unlockedTree = [...new Set([...this.profile.unlockedTree, ...this.catalog.tree.map(node => node.id)])];
      this.profile.unlockedRewards = [...rewards];
    });
  }
  treeUnlockPlan(id) {
    const target = this.catalog.indexes.tree.get(Number(id));
    if (!target) return { nodes: [], cost: 0, available: false, reason: '节点不存在' };
    const owned = new Set(this.profile.unlockedTree), visited = new Set(), visiting = new Set(), nodes = [];
    let reason = '';
    const visit = node => {
      if (!node) { reason = '前置节点配置缺失'; return; }
      if (owned.has(node.id) || visited.has(node.id)) return;
      if (visiting.has(node.id)) { reason = '前置路线存在循环'; return; }
      visiting.add(node.id);
      for (const parent of [...node.parents, ...node.conditions]) visit(this.catalog.indexes.tree.get(Number(parent)));
      visiting.delete(node.id); visited.add(node.id); nodes.push(node);
    };
    visit(target);
    const cost = nodes.reduce((sum, node) => sum + Number(node.cost || 0), 0);
    if (!reason && this.run && !this.run.settled) reason = '请在征程结束后解锁山河册';
    if (!reason && !nodes.length) reason = '已经解锁';
    if (!reason && nodes.some(node => node.rewardType !== '随机战法' && !this._supported(this._itemKind(node.rewardId), node.rewardId))) reason = '路线中有尚未适配的奖励';
    if (!reason && this.profile.folios < cost) reason = '图册不足';
    return { nodes, cost, available: !reason, reason };
  }
  unlockTreePath(id) {
    return this._change(() => {
      const plan = this.treeUnlockPlan(id);
      if (!plan.available) throw new Error(plan.reason);
      // The full path is one persistence transaction; failure rolls back both
      // paid costs and random rewards instead of leaving a half-unlocked path.
      for (const node of plan.nodes) this._unlockTreeNode(node.id);
    });
  }
  _unlockTreeNode(id) {
      if (this.run && !this.run.settled) throw new Error('请在征程结束后解锁山河册');
      const node = this.catalog.indexes.tree.get(Number(id));
      if (!node || this.profile.unlockedTree.includes(node.id)) throw new Error('节点不存在或已经解锁');
      if (node.parents.some(id => !this.profile.unlockedTree.includes(id)) || node.conditions.some(id => !this.profile.unlockedTree.includes(id))) throw new Error('请先解锁前置节点');
      if (this.profile.folios < node.cost) throw new Error('图册不足');
      const kind = this._itemKind(node.rewardId);
      if (!this._supported(kind, node.rewardId) && node.rewardType !== '随机战法') throw new Error('此奖励暂未适配，保留图册以免浪费');
      let rewardId = node.rewardId;
      if (node.rewardType === '随机战法') {
        const options = this.catalog.tactics.filter(item => item.rarity === node.rarity && item.seasonIds.includes(5) && !item.deprecated && !this.schoolEffectIds.has(item.id) && this._supported('tactic', item.id) && !this.profile.unlockedRewards.includes(item.id));
        const picked = this._sample(options)[0];
        if (!picked) throw new Error('此品质没有可解锁的新战法');
        rewardId = picked.id;
      }
      this.profile.folios -= node.cost;
      this.profile.spentFolios += node.cost;
      this.profile.unlockedTree.push(node.id);
      if (!this.profile.unlockedRewards.includes(rewardId)) this.profile.unlockedRewards.push(rewardId);
  }
  _checkLoadout(ids) {
    const slots = this.loadoutSlots().filter(slot => slot.unlocked).map(slot => slot.maxRarity).sort((a, b) => b - a);
    if (!Array.isArray(ids) || ids.length > slots.length || new Set(ids).size !== ids.length) throw new Error('已开放' + slots.length + '个初始战法槽，战法不能重复');
    const rarities = [];
    for (const rawId of ids) {
      const id = Number(rawId), item = this.catalog.indexes.tactics.get(id);
      if (!item || !this.profile.unlockedRewards.includes(id) || !this._supported('tactic', id)) throw new Error('只能装配山河册中已解锁且可用的战法');
      rarities.push(item.rarity);
    }
    rarities.sort((a, b) => b - a);
    if (rarities.some((rarity, index) => rarity > slots[index])) throw new Error('没有可容纳该品质的已开放战法槽');
  }
  loadoutSlots() {
    return this.catalog.rules.saijilevel.map(slot => ({ id: slot.level, maxRarity: slot.addFirstCard, requiredSpent: slot.point, unlocked: this.profile.developerMode === true || this.profile.spentFolios >= slot.point }));
  }
  setLoadout(ids) { return this._change(() => { if (this.run && !this.run.settled) throw new Error('征程中不可更换初始战法'); const values = ids.map(Number); this._checkLoadout(values); this.profile.loadout = values; }); }
  exportSave() { return JSON.stringify(this.state, null, 2); }
  importSave(value) {
    return this._change(() => {
      if (typeof value === 'string' && value.length > 4 * 1024 * 1024) throw new Error('存档文件过大');
      this.state = this._validate(typeof value === 'string' ? JSON.parse(value) : clone(value));
    });
  }
  _validate(state) {
    if (!state || state.version !== 1 || !state.profile || !Array.isArray(state.profile.unlockedTree) || !Array.isArray(state.profile.loadout) || !Array.isArray(state.profile.history)) throw new Error('不是有效的山河图存档');
    if (state.profile.developerMode !== undefined && typeof state.profile.developerMode !== 'boolean') throw new Error('开发者模式记录无效');
    if (!Number.isFinite(state.profile.folios) || state.profile.folios < 0 || !Number.isInteger(state.profile.highestGroup) || state.profile.highestGroup < 1 || state.profile.highestGroup > 5) throw new Error('存档数值无效');
    state.profile.unlockedRewards ||= state.profile.unlockedTree.map(id => this.catalog.indexes.tree.get(id)?.rewardId).filter(Boolean);
    state.profile.totalFolios ??= state.profile.folios;
    state.profile.spentFolios ??= state.profile.unlockedTree.reduce((sum, id) => sum + (this.catalog.indexes.tree.get(id)?.cost || 0), 0);
    state.profile.seed ||= 1;
    state.profile.clearRecords ||= {};
    for (const result of state.profile.history) if (result.won && typeof result.character === 'string') {
      const previous = state.profile.clearRecords[result.difficulty] || [];
      state.profile.clearRecords[result.difficulty] = [...new Set([...previous, result.character])];
    }
    for (const [id, characters] of Object.entries(state.profile.clearRecords)) if (!this.catalog.indexes.difficulties.has(Number(id)) || !Array.isArray(characters) || characters.some(id => typeof id !== 'string')) throw new Error('通关记录无效');
    const run = state.run;
    if (run) {
      if (!this.catalog.indexes.cities.has(run.cityId) || !this.catalog.indexes.difficulties.has(run.difficulty) || !(run.maxHp > 0) || !Number.isFinite(run.hp) || run.hp < 0 || run.hp > run.maxHp || !Number.isFinite(run.copper) || run.copper < 0) throw new Error('征程状态损坏');
      for (const key of ['skills', 'tactics', 'cards', 'equips', 'allies', 'nodes', 'completed', 'clearedCities', 'rewardQueue', 'log']) if (!Array.isArray(run[key])) throw new Error('征程字段缺失：' + key);
      run.totalMonths ??= run.completed.length;
      run.accday ??= run.totalMonths;
      run.shops ||= {};
      if (run.pending && !['battle', 'event', 'reward', 'shop', 'camp', 'route', 'ending', 'removeTactic', 'mutation', 'army'].includes(run.pending.kind)) throw new Error('存档阶段无效');
      run.mutations ||= [];
      run.fixedMutations ||= fixedMutationIds(this.catalog.indexes.difficulties.get(run.difficulty));
      const mutationIds = new Set((this.catalog.rules.seed || []).map(row => Number(row.seed)));
      for (const values of [run.mutations, run.fixedMutations]) if (!Array.isArray(values) || values.some(id => !mutationIds.has(id))) throw new Error('突变记录无效');
      if (run.pending?.kind === 'mutation' && (!run.mutationChoicePending || !Array.isArray(run.pending.choices) || !run.pending.choices.length || run.pending.choices.some(choice => !mutationIds.has(choice.seedId) || choice.seedId >= 5057))) throw new Error('突变选择记录无效');
      if (run.pending?.kind === 'army' && (!run.armyChoicePending || !Array.isArray(run.pending.choices) || run.pending.choices.some(choice => !['tactic', 'skill', 'card', 'equipment', 'skip'].includes(choice.kind)))) throw new Error('军备选择记录无效');
      if (run.pending?.kind === 'shop' && !run.pending.purchasesByKind) {
        run.pending.purchasesByKind = {};
        for (const item of run.pending.products || []) if (item.sold) run.pending.purchasesByKind[item.kind] = (run.pending.purchasesByKind[item.kind] || 0) + 1;
      }
      validateRunSkills(this, run);
      if (run.pending?.kind === 'removeTactic') {
        const pending = run.pending;
        if (!Array.isArray(pending.choices) || pending.choices.some(choice => !Number.isInteger(choice.index) || run.tactics[choice.index] !== choice.itemId) || pending.resumePending && pending.resumePending.kind !== 'shop') throw new Error('移除战法记录无效');
      }
    }
    initializeTraitState(state, this.catalog);
    return state;
  }
}
