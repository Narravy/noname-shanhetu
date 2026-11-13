import { plain } from './adapters.js';
import { originalEnemyPortrait } from './portraits.js';
import { bindEnemyInspector } from './enemy-inspect-view.js';
import { growEnemy } from './enemy-growth.js';
import { attachEnemyDetails } from './enemy-details.js';
import { copperIcon, copperAmount } from './currency-view.js';
import { rewardPreviewIcon } from './reward-preview-view.js';
import { getInnateSkillSlots, innateSkillsForView, ownedRewardSkillIds } from './run-skills.js';

const kindNames = { tactic: '战法', skill: '技能', card: '卡牌', equipment: '装备', copper: '道具', stat: '道具', ally: '同伴', skip: '略过' };
const pendingTokens = new WeakMap();
let nextPendingToken = 0;

function el(tag, className, text, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = plain(text);
  parent?.appendChild(node);
  return node;
}

function resolvedChoice(view, choice) {
  const resolved = view.adapters.resolve(choice.kind || 'tactic', choice.itemId ?? choice.rewardId ?? choice.id);
  return { ...resolved, ...choice, name: choice.name || resolved?.name || '奖励', description: choice.description || resolved?.description || '', rarity: choice.rarity || resolved?.rarity || 1 };
}

async function confirmReplacement(view, choice, { purchase = false } = {}) {
  const run = view.campaign.run;
  const pending = run.pending;
  if (choice.kind === 'skill' && run.skills.length >= (run.skillSlots || 2)) {
    if (purchase && !await view.confirm({ title: '购买技能', message: `花费 ${choice.price} 铜币购买【${choice.name}】后，需要替换一个技能。`, confirmText: '选择替换', cancelText: '取消' })) return null;
    const options = run.skills.map((id, index) => {
      const skill = view.adapters.resolve('skill', id);
      return { id: String(index), name: skill?.name || `技能 ${id}`, description: skill?.description || '', kind: 'skill', itemId: id };
    });
    const hero = view.adapters.characterList.find(item => item.id === run.character);
    for (const slot of getInnateSkillSlots(view.campaign, hero?.skills || []).filter(slot => slot.replaceable)) {
      const item = slot.rewardId ? view.adapters.resolve('skill', slot.rewardId) : { name: view.adapters.skillName(slot.nativeId), description: view.adapters.skillDescription(slot.nativeId) };
      options.push({ id: slot.id, name: item?.name || slot.nativeId, description: item?.description || '', kind: 'skill', itemId: slot.rewardId });
    }
    const answer = await view.choose({ title: '替换技能', description: `获得【${choice.name}】\n${choice.description || ''}\n请选择要替换的技能；取消后保留当前选择。`, choices: options, confirmText: '替换', cancelText: '取消' });
    if (answer === null || view.campaign.run !== run || run.pending !== pending) return null;
    if (String(answer).startsWith('innate:') && options.some(option => option.id === answer)) return answer;
    const index = Number(answer);
    if (!Number.isInteger(index) || index < 0 || index >= run.skills.length) throw new Error('请选择要替换的技能');
    return index;
  }
  if (choice.kind === 'equipment') {
    const item = view.adapters.resolve('card', choice.itemId ?? choice.rewardId);
    const previous = run.equips.map(id => view.adapters.resolve('card', id)).find(equip => equip?.cardSubType === item?.cardSubType);
    if (previous) {
      const accepted = await view.confirm({ title: purchase ? '购买装备' : '替换装备', message: `${purchase ? `花费 ${choice.price} 铜币，` : ''}获得【${choice.name}】，替换当前的【${previous.name}】？`, confirmText: purchase ? '购买并替换' : '替换', cancelText: '取消' });
      if (!accepted || view.campaign.run !== run || run.pending !== pending) return null;
    }
  }
  return undefined;
}

function choiceState(view, pending, choices) {
  if (!pendingTokens.has(pending)) pendingTokens.set(pending, ++nextPendingToken);
  const key = `${view.campaign.run.id}:${pendingTokens.get(pending)}:${choices.map(x => x.id).join('|')}`;
  if (view.olChoiceState?.key !== key) view.olChoiceState = { key, id: choices.length === 1 && !choices[0].disabled && choices[0].supported !== false ? String(choices[0].id) : null };
  return view.olChoiceState;
}

function cardLabel(choice) {
  if (choice.kind === 'equipment') return ({ 1: '武器', 2: '防具', 3: '坐骑', 4: '坐骑', 5: '宝物', 9: '宝物' })[choice.cardSubType] || '装备';
  return kindNames[choice.kind] || '道具';
}

function cardContent(view, parent, choice, { shop = false, forget = false } = {}) {
  parent.dataset.rewardKind = choice.kind;
  parent.dataset.rewardQuality = String(Math.max(1, Math.min(4, choice.rarity || 1)));
  if (forget) parent.dataset.forgetCopper = 'true';
  const head = el('div', 'sht-ol-item-type', null, parent);
  const type = ({ copper: 0, stat: 1, tactic: 2, skill: 3, card: 4, equipment: 5 })[choice.kind] ?? 1;
  view.image(head, view.asset(`ui/rogueawardselect/rogue_award_type_icon_${type}.png`), '', 'sht-ol-award-type-icon');
  el('span', '', `${choice.retained ? '上次军备 · ' : ''}${cardLabel(choice)}`, head);
  const content = el('div', 'sht-ol-item-content', null, parent);
  const cardId = choice.itemId ?? choice.rewardId;
  const physicalCard = ['card', 'equipment'].includes(choice.kind) && view.cardThumb;
  const art = ['card', 'equipment'].includes(choice.kind) ? view.cardArt?.(cardId) : null;
  if (physicalCard || art) {
    if (physicalCard) view.cardThumb(content, cardId, 'sht-ol-card-art');
    else view.image(content, art, choice.name, 'sht-ol-card-art');
    content.title = choice.description;
    if (choice.description) el('p', 'sht-ol-item-description sht-ol-physical-description', choice.description, content);
  } else if (choice.kind === 'copper') {
    const badge = el('div', 'sht-ol-item-emblem sht-ol-copper', null, content);
    copperIcon(view, badge, 'sht-ol-emblem-icon', '');
    el('strong', 'sht-ol-item-name', `${forget ? '' : '铜币'}+${choice.quantity ?? choice.amount ?? 0}`, content);
  } else {
    if (choice.kind !== 'skill') {
      const badge = el('div', `sht-ol-item-emblem sht-ol-emblem-${Math.min(4, choice.rarity)}`, null, content);
      if (choice.kind === 'tactic') view.tacticIcon(badge, choice.itemId ?? choice.rewardId ?? choice.id);
      else view.itemIcon(badge, choice.kind);
    }
    el('strong', choice.kind === 'skill' ? 'sht-ol-skill-name' : 'sht-ol-item-name', choice.name, content);
    if (choice.currentLabel) el('small', 'sht-ol-current-stat', choice.currentLabel, content);
    if (choice.description && choice.description !== choice.name) el('p', 'sht-ol-item-description', choice.description, content);
  }
  if (choice.disabledReason) el('small', 'sht-ol-choice-reason', choice.disabledReason, content);
  if (shop && choice.sold) el('span', 'sht-ol-sold', '', parent).setAttribute('aria-label', '已售出');
}

function selectionCards(view, parent, pending, choices, title, onConfirm, subtitle) {
  parent.classList.add('sht-ol-choice-scene');
  const titleNode = el('h2', 'sht-ol-floating-title', title, parent);
  titleNode.id = 'sht-ol-choice-heading';
  if (subtitle) el('p', 'sht-ol-choice-subtitle', subtitle, parent);
  const options = choices.map(choice => resolvedChoice(view, choice));
  const state = choiceState(view, pending, options);
  const row = el('div', 'sht-ol-choice-row', null, parent);
  row.setAttribute('role', 'group'); row.setAttribute('aria-labelledby', titleNode.id);
  row.style.setProperty('--sht-choice-count', String(options.length));
  let focusAssigned = false;
  for (const choice of options) {
    const disabled = Boolean(choice.disabled || choice.supported === false);
    const button = view.button(row, '', () => { state.id = state.id === String(choice.id) ? null : String(choice.id); }, {
      disabled, focusKey: `ol-choice:${choice.id}`,
      className: `sht-ol-choice-card sht-ol-quality-${Math.min(4, choice.rarity)} ${state.id === String(choice.id) ? 'sht-ol-chosen' : ''} ${choice.kind === 'copper' && options.length > 1 ? 'sht-ol-copper-alternative' : ''}`,
      title: choice.disabledReason || choice.description,
    });
    if (!disabled && !focusAssigned && (state.id === null || state.id === String(choice.id))) {
      button.autofocus = true;
      focusAssigned = true;
    }
    button.setAttribute('aria-label', choice.name);
    button.setAttribute('aria-pressed', String(state.id === String(choice.id)));
    const forget = choice.kind === 'copper' && options.length > 1;
    cardContent(view, button, choice, { forget });
    if (state.id === String(choice.id)) {
      // lYi positions the animation at (156,218), over a (7,4,300,424) card.
      const scale = 230 / 300;
      view.motion(parent, button, 'OL_SHT_jianglikuang', { action: forget ? 'play2' : 'play', scale, offsetX: -scale, offsetY: forget ? 0 : 2 * scale });
    }
  }
  if (!options.length) el('p', 'sht-ol-empty', '当前没有可选择的奖励。', row);
  const selected = options.find(choice => String(choice.id) === state.id);
  if (state.id !== null) requestAnimationFrame(() => {
    if (!row.isConnected) return;
    const chosen = row.querySelector('.sht-ol-chosen');
    if (!chosen) return;
    const item = chosen.getBoundingClientRect(), viewport = row.getBoundingClientRect();
    const scale = item.width / chosen.offsetWidth || 1;
    if (item.right > viewport.right) row.scrollLeft += (item.right - viewport.right) / scale + 8;
    else if (item.left < viewport.left) row.scrollLeft -= (viewport.left - item.left) / scale + 8;
  });
  const footer = el('div', 'sht-ol-choice-footer', null, parent);
  view.button(footer, '选择', () => {
    if (!selected || selected.disabled || selected.supported === false) throw new Error('请先选择一项奖励');
    return onConfirm(selected);
  }, { disabled: !selected || selected.disabled || selected.supported === false, primary: true, className: 'sht-ol-confirm', focusKey: 'ol-choice:confirm' });
}

function reward(view, parent, pending) {
  const choices = view.campaign.rewardOptions();
  const skills = choices.some(choice => choice.kind === 'skill');
  selectionCards(view, parent, pending, choices, skills ? '选择技能' : '奖励选择', async choice => {
    const replaceIndex = await confirmReplacement(view, choice);
    if (replaceIndex === null) return;
    if (view.campaign.run?.pending !== pending) return;
    return view.dispatch('takeReward', { id: choice.id, replaceIndex });
  });
}

function army(view, parent, pending) {
  const choices = pending.choices || [];
  selectionCards(view, parent, pending, choices, pending.title || '选择军备', async choice => {
    const replaceIndex = choice.kind === 'skip' ? undefined : await confirmReplacement(view, choice);
    if (replaceIndex === null) return;
    if (view.campaign.run?.pending !== pending) return;
    return view.dispatch('chooseArmy', { id: choice.id, replaceIndex });
  }, pending.description || '选择一项军备，带入本次征程');
}

function removeTactic(view, parent, pending) {
  const choices = (pending.choices || []).map(choice => ({ ...choice, kind: 'tactic', supported: true }));
  choices.push({ id: 'skip', kind: 'skip', name: '保留全部战法', description: '不移除任何战法，继续征程。', supported: true, rarity: 1 });
  selectionCards(view, parent, pending, choices, '涤净', choice => {
    if (view.campaign.run?.pending !== pending) return;
    return view.dispatch('resolveTacticRemoval', { index: choice.id === 'skip' ? null : choice.index });
  }, '可以移除一个已有战法，也可以保留全部战法');
}

function camp(view, parent, pending) {
  const run = view.campaign.run;
  const current = { 1001: run.maxHp, 1002: run.stats?.armor || 0, 1003: run.stats?.armorGain || 0, 1004: 4 + (run.stats?.startingCards || 0), 1005: 2 + (run.stats?.draw || 0), 1006: run.stats?.handLimit || 0, 1008: run.mulligans || 0, 1009: `${run.hp}/${run.maxHp}` };
  const choices = (pending.choices || []).map(choice => ({
    ...choice, kind: 'stat', rarity: 2, supported: true,
    currentLabel: current[choice.rewardId] !== undefined ? `当前为：${current[choice.rewardId]}` : '',
  }));
  selectionCards(view, parent, pending, choices, '营地', choice => view.dispatch('camp', { id: choice.id }), '可以任选一项奖励获得');
}

function fighter(view, parent, enemy, original) {
  const native = view.adapters.characterByName?.(original?.name || enemy.name || enemy.title);
  const name = enemy.title || enemy.name || original?.name || '敌军';
  const portrait = enemy.portrait || originalEnemyPortrait(view.baseURL, original || enemy)
    || (native ? view.portrait(native.id) : enemy.character && !enemy.character.startsWith('shanhetu_npc_') ? view.portrait(enemy.character) : null);
  const unit = el('div', 'sht-ol-fighter-wrap', null, parent);
  const hp = Number(enemy.hp ?? enemy.stats?.hp ?? 4);
  const maxHp = Number(enemy.maxHp ?? enemy.stats?.maxHp ?? hp);
  const armor = Number(enemy.armor ?? enemy.stats?.armor ?? 0);
  const equips = (enemy.equips || []).map(value => view.equipmentDetails(value));
  const hero = { id: enemy.character || native?.id, name, group: enemy.group || native?.group || 'qun', portraitURL: portrait, hp, maxHp, armor, equips };
  const card = view.portraitCard(unit, hero, 'sht-ol-enemy-portrait');
  bindEnemyInspector(view, card, hero, enemy);
  return unit;
}

function battle(view, parent, pending) {
  const source = view.catalog.battles.find(item => Number(item.id) === Number(pending.battleId));
  const group = view.catalog.enemyGroups.find(item => Number(item.id) === Number(pending.groupId || source?.groupId));
  const preview = view.previewBattle?.();
  const boss = pending.boss || source?.elite;
  parent.classList.add('sht-ol-battle-scene');
  if (boss) parent.classList.add('sht-ol-battle-boss');
  const information = el('section', 'sht-ol-battle-info', null, parent);
  el('h2', '', source?.name || pending.title || '战役', information);
  if (pending.boss) view.image(information, view.asset('ui/roguefight/figjh_boss_icon.png'), '首领', 'sht-ol-battle-badge');
  else if (source?.elite) view.image(information, view.asset('ui/roguefight/figjh_elite_icon.png'), '精英', 'sht-ol-battle-badge');
  const story = el('div', 'sht-ol-battle-story', null, information);
  el('p', '', source?.description || pending.description || '', story);
  el('h3', 'sht-ol-battle-reward-title', '过关奖励', information);
  const rewards = el('div', 'sht-ol-battle-rewards', null, information);
  const money = el('div', 'sht-ol-battle-prize', null, rewards);
  const moneyIcon = rewardPreviewIcon(view, money, 'copper');
  el('strong', '', String(source?.reward?.copper || 0), moneyIcon);
  el('small', '', '铜币', money);
  for (const reward of source?.reward?.groups || []) {
    const groupId = Number(typeof reward === 'object' ? reward.id ?? reward.groupId : reward);
    const rewardGroup = view.catalog.indexes?.rewardGroups?.get(groupId);
    const rewardName = rewardGroup?.rewarddesc || reward?.name || '战利品';
    const block = el('div', 'sht-ol-battle-prize', null, rewards);
    const kind = ({ 0: 'copper', 2: 'tactic', 3: 'skill', 4: 'card', 5: 'equipment' })[rewardGroup?.type]
      || (rewardName.includes('技能') ? 'skill' : rewardName.includes('卡牌') ? 'card' : rewardName.includes('铜币') ? 'copper' : 'tactic');
    rewardPreviewIcon(view, block, kind, rewardGroup);
    el('small', '', rewardName, block);
  }
  const opposing = el('section', 'sht-ol-battle-opposing', null, parent);
  const enemies = el('div', 'sht-ol-enemy-line', null, opposing);
  (preview?.enemies || group?.generals || []).forEach((enemy, index) => fighter(view, enemies, enemy, group?.generals[index]));
  const challenge = view.button(opposing, '挑战', () => view.onBattle(pending), { primary: true, className: 'sht-ol-confirm', focusKey: 'ol-battle:challenge' });
  challenge.autofocus = true;
}

function shop(view, parent, pending) {
  const run = view.campaign.run;
  parent.classList.add('sht-ol-shop-scene');
  view.motion(parent, parent, 'OL_SHT_jishi_BJ', { action:'play', background:true });
  view.image(parent, view.asset('backgrounds/rogue_jishi_renwu.png'), '', 'sht-ol-merchant');
  const head = el('div', 'sht-ol-shop-head', null, parent);
  el('h2', '', '集市', head);
  const balance = el('div', 'sht-ol-shop-balance', null, head);
  copperIcon(view, balance, 'sht-ol-prize-icon');
  el('span', '', String(run.copper || 0), balance);
  view.button(head, '返回地图', () => view.dispatch('leaveShop', {}), { className: 'sht-ol-shop-return', focusKey: 'ol-shop:return' });
  const allProducts = view.campaign.shopItems();
  const categories = [['tactic', '战法'], ['skill', '技能'], ['equipment', '装备'], ['card', '卡牌']].filter(([kind]) => allProducts.some(product => product.kind === kind));
  if (view.olShopPending !== pending || !categories.some(([kind]) => kind === view.olShopCategory)) {
    view.olShopPending = pending;
    view.olShopCategory = categories[0]?.[0] || null;
  }
  const nav = el('nav', 'sht-ol-shop-tabs', null, parent);
  nav.setAttribute('aria-label', '集市商品分类');
  for (const [id, name] of categories) {
    const button = view.button(nav, name, () => { view.olShopCategory = id; }, { className: view.olShopCategory === id ? 'sht-ol-tab-selected' : '', focusKey: `ol-shop-category:${id}` });
    button.setAttribute('aria-pressed', String(view.olShopCategory === id));
  }
  const owner = el('div', 'sht-ol-shop-owner', null, parent);
  el('strong', '', '老板娘', owner);
  let ownerText = '战法无获得上限，请随意购买';
  if (view.olShopCategory === 'skill') {
    const hero = view.adapters.characterList.find(item => item.id === run.character);
    const innate = innateSkillsForView(view, hero).map(skill => skill.name).filter(Boolean);
    const extra = run.skills.map(id => view.adapters.resolve('skill', id)?.name || String(id));
    ownerText = `已有技能：${[...innate, ...extra].join('、') || '无'}\n空技能槽：${Math.max(0, run.skillSlots - run.skills.length)}`;
  } else if (view.olShopCategory === 'equipment') {
    const equipped = run.equips.map(id => view.adapters.resolve('card', id)).filter(Boolean);
    ownerText = [[1, '武器'], [2, '防具'], [9, '宝物']].map(([type, label]) => `当前${label}：${equipped.find(item => item.cardSubType === type || type === 9 && item.cardSubType === 5)?.name || '无'}`).join('\n');
  } else if (view.olShopCategory === 'card') ownerText = '卡牌无获得上限，请随意购买';
  el('p', '', ownerText, owner);
  const stock = el('div', 'sht-ol-shop-stock', null, parent);
  const products = allProducts.filter(item => item.kind === view.olShopCategory).sort((a, b) => Number(a.sold) - Number(b.sold));
  if (products.length > 4) stock.classList.add('sht-ol-shop-stock-expanded');
  for (const product of products) {
    const choice = resolvedChoice(view, product);
    const column = el('article', 'sht-ol-shop-product', null, stock);
    const card = el('div', `sht-ol-shop-card sht-ol-quality-${Math.min(4, choice.rarity)}`, null, column);
    cardContent(view, card, choice, { shop: true });
    if (view.inspectItem) {
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `查看${choice.name}`);
      const inspect = event => { event.stopPropagation(); return view.inspectItem(choice); };
      card.onclick = inspect;
      card.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(event); } };
    }
    const disabled = product.sold || product.disabled || product.supported === false || product.price > run.copper;
    const disabledReason = product.sold ? '已售出' : product.disabledReason || (product.price > run.copper ? '铜币不足' : '');
    const buy = view.button(column, '', async () => {
      const replaceIndex = await confirmReplacement(view, choice, { purchase: true });
      if (replaceIndex === null) return;
      if (view.campaign.run?.pending !== pending) return;
      return view.dispatch('buy', { id: product.id, replaceIndex });
    }, { disabled, className: 'sht-ol-shop-price sht-ol-confirm', focusKey: `ol-buy:${product.id}`, title: disabledReason || choice.description });
    if (!product.sold) copperIcon(view, buy, 'sht-ol-price-coin', '');
    el('span', '', product.sold ? '已售出' : String(product.price ?? 0), buy);
    buy.setAttribute('aria-label', product.sold ? `${choice.name}，已售出` : `购买${choice.name}，${product.price ?? 0}铜币`);
    if (disabledReason && !product.sold) el('small', 'sht-ol-shop-disabled', disabledReason, column);
  }
  if (!products.length) el('p', 'sht-ol-shop-empty', '本批商品暂无此类，可查看其他分类或刷新。', stock);
  const bottom = el('div', 'sht-ol-shop-footer', null, parent);
  const refresh = view.campaign.shopRefreshInfo?.() || { remaining: 1 - pending.refreshes, price: 100 };
  const refreshReason = refresh.remaining <= 0 ? '本次集市刷新次数已用完' : run.copper < refresh.price ? `铜币不足，刷新需要 ${refresh.price} 铜币` : '';
  const refreshButton = view.button(bottom, '', () => view.dispatch('refreshShop', {}), { disabled: Boolean(refreshReason), className: 'sht-ol-shop-refresh', focusKey: 'ol-shop:refresh', title: refreshReason });
  view.image(refreshButton, view.asset('ui/roguejishi/jishi_refresh_btn.png'), '', 'sht-ol-refresh-icon');
  const refreshText = el('span', 'sht-ol-refresh-text', null, refreshButton);
  el('span', '', `刷新剩余：${refresh.infinite ? '无限' : refresh.remaining}`, refreshText);
  const refreshCost = el('span', 'sht-ol-refresh-cost', '消耗 ', refreshText);
  copperAmount(view, refreshCost, refresh.price);
  refreshButton.setAttribute('aria-label', `刷新集市，剩余${refresh.infinite ? '无限' : refresh.remaining}次，消耗${refresh.price}铜币`);
  const priceField = ({ tactic: 'nextmoneyup', skill: 'nextmoneyup2', equipment: 'nextmoneyup3', card: 'nextmoneyup4' })[view.olShopCategory];
  const priceStep = run.tactics.includes(2012) ? 0 : Number(view.catalog.rules.Shop?.[0]?.[priceField]) || 0;
  const priceHint = el('small', '', refreshReason || (priceStep ? `每购买一次${kindNames[view.olShopCategory]}，同类商品额外消耗 ` : '每件商品限购一次'), bottom);
  if (!refreshReason && priceStep) copperAmount(view, priceHint, `+${priceStep}`);
}

function rewardKind(view, id) {
  if (view.catalog.indexes.tactics.has(Number(id))) return 'tactic';
  if (view.catalog.indexes.skills.has(Number(id))) return 'skill';
  const card = view.catalog.indexes.cards.get(Number(id));
  if (card) return card.equipment ? 'equipment' : 'card';
  if (Number(id) === 1000) return 'copper';
  return 'stat';
}

function eventOptionPicture(view, parent, choice) {
  const result = choice.results?.[0];
  if (!result) return;
  if (Number(result.type) === 7) {
    view.image(parent, view.asset('ui/roguecommon/rogue_event3.png'), '战斗', 'sht-ol-event-fight');
    return;
  }
  const id = Number(result.getitem);
  if (Number(result.gettype) === 3) {
    const general = view.catalog.indexes.enemyGroups.get(id)?.generals?.[0];
    if (general) {
      const run = view.campaign.run;
      const difficulty = view.catalog.indexes.difficulties.get(Number(run.difficulty)) || {};
      const grown = growEnemy(general, run, difficulty, view.catalog.rules, { friend: true, chapter: run.chapter });
      const actor = attachEnemyDetails({
        ...view.adapters.enemySpec(grown, {}, [], run.difficulty),
        difficultyId: run.difficulty,
        difficultyGroup: difficulty.group || Math.ceil(run.difficulty / 5),
      }, { difficulty });
      fighter(view, parent, actor, general);
    }
  } else if (Number(result.gettype) === 2) {
    const group = view.catalog.indexes.rewardGroups.get(id);
    const kind = ({ 0: 'copper', 2: 'tactic', 3: 'skill', 4: 'card', 5: 'equipment' })[group?.type] || 'stat';
    rewardPreviewIcon(view, parent, kind, group, 'sht-ol-event-item-icon');
    el('span', '', group?.rewarddesc || choice.description || '奖励', parent);
  } else if (id) {
    const kind = rewardKind(view, id), item = view.adapters.resolve(kind, id) || view.catalog.indexes.others.get(id);
    if (kind === 'card' || kind === 'equipment') view.cardThumb(parent, id, 'sht-ol-event-card');
    else if (kind === 'tactic') view.tacticIcon(parent, id, 'sht-ol-event-tactic');
    else view.itemIcon(parent, kind, 'sht-ol-event-item-icon');
    el('span', '', item?.name || item?.rewardname || choice.description || '奖励', parent);
  } else view.itemIcon(parent, 'stat', 'sht-ol-event-item-icon');
}

async function chooseEvent(view, pending, choice, index) {
  let lossItemId;
  if (choice.costChoices?.length) {
    const options = choice.costChoices.map(item => resolvedChoice(view, item));
    const amount = Number(choice.results?.[0]?.lostnum) || 1;
    const selected = await view.choose({
      title: '选择交换物品',
      description: `${choice.text || choice.name}\n请选择交出的物品${amount > 1 ? `（数量 ${amount}）` : ''}。${options.some(item => item.kind === 'tactic') ? '交出战法可能改变套装效果。' : ''}`,
      choices: options.map(item => ({ ...item, id: String(item.itemId), name: item.name, description: item.description })),
      confirmText: '交出并继续', cancelText: '取消',
    });
    if (selected === null || view.campaign.run?.pending !== pending) return;
    lossItemId = Number(selected);
    if (!options.some(item => item.itemId === lossItemId)) throw new Error('请选择要交出的物品');
  }
  if (view.campaign.run?.pending !== pending) return;
  return view.dispatch('chooseEvent', { index: choice.index ?? index, lossItemId });
}

function adventure(view, parent, pending) {
  const source = view.catalog.indexes.events.get(Number(pending.eventId));
  parent.classList.add('sht-ol-adventure-scene');
  const portrait = view.adventurePortrait?.(source);
  parent.dataset.hasActor = String(Boolean(portrait));
  if (portrait) view.image(parent, portrait, '', 'sht-ol-event-actor');
  const heading = el('h2', 'sht-ol-event-heading', source?.name || pending.title || '奇遇', parent);
  const story = el('div', 'sht-ol-event-story', null, parent);
  el('p', '', source?.description || pending.description || '', story);
  const row = el('div', 'sht-ol-event-options', null, parent);
  row.setAttribute('aria-labelledby', heading.id = 'sht-ol-event-heading');
  for (const [index, choice] of (pending.choices || []).entries()) {
    const option = el('article', 'sht-ol-event-option', null, row);
    const disabled = choice.disabled || choice.supported === false;
    if (disabled) option.classList.add('sht-ol-option-disabled');
    el('h3', '', choice.text || choice.name || `选择 ${index + 1}`, option);
    const picture = el('div', 'sht-ol-event-picture', null, option);
    eventOptionPicture(view, picture, choice);
    el('p', 'sht-ol-event-description', choice.effect?.label || choice.description || '', option);
    const result = choice.results?.[0];
    let cost = '免费';
    if (choice.copperCost) cost = `${choice.copperCost} 铜币`;
    else if (choice.costChoices?.length) cost = '交换物品';
    else if (Number(result?.losttype) === 1 && result?.lostitem) {
      const item = view.adapters.resolve(rewardKind(view, result.lostitem), result.lostitem);
      cost = `交出${item?.name || '物品'} ×${Number(result.lostnum) || 1}`;
    }
    const costNode = el('div', `sht-ol-event-cost ${cost === '免费' ? 'sht-ol-event-free' : ''}`, choice.copperCost ? null : cost, option);
    if (choice.copperCost) copperAmount(view, costNode, choice.copperCost);
    view.button(option, '选择', () => chooseEvent(view, pending, choice, index), { disabled, className: 'sht-ol-confirm', focusKey: `ol-event:${choice.index ?? index}`, title: choice.disabledReason || '' });
    if (disabled) el('small', 'sht-ol-event-reason', choice.disabledReason || choice.reason || '当前无法选择', option);
  }
  if (!(pending.choices?.length)) el('p', 'sht-ol-empty', '当前没有可执行的选项。', row);
  const help = view.catalog.indexes.texts.get(Number(source?.raw?.helptext));
  if (help) el('p', 'sht-ol-event-help', help, parent);
}

function route(view, parent, pending) {
  parent.classList.add('sht-ol-route-scene');
  el('h2', 'sht-ol-route-heading', pending.title || '选择行军路线', parent);
  const cities = view.campaign.availableCities();
  const state = choiceState(view, pending, cities);
  const row = el('div', 'sht-ol-route-options', null, parent);
  for (const city of cities) {
    const selected = state.id === String(city.id);
    const card = view.button(row, '', () => { state.id = String(city.id); }, { className: `sht-ol-route-card ${selected ? 'sht-ol-chosen' : ''}`, focusKey: `ol-route:${city.id}` });
    card.setAttribute('aria-pressed', String(selected));
    card.setAttribute('aria-label', city.cityName || city.name);
    // Chapter.PicIDBigUrl in the original client; this is the city sprite, not a map crop.
    if (city.raw?.picID) view.image(card, view.asset(`season5/city/C_${city.raw.picID}_1_b.png`), '', 'sht-ol-route-city');
    el('strong', 'sht-ol-route-name', city.cityName || city.name, card);
    if (city.description) el('p', 'sht-ol-route-description', city.description, card);
    el('p', 'sht-ol-route-effect', city.effect || '无额外地形效果', card);
  }
  if (!cities.length) el('p', 'sht-ol-empty', '当前没有可选择的行军路线。', row);
  const footer = el('div', 'sht-ol-route-footer', null, parent);
  view.button(footer, '进入', () => {
    if (!cities.some(city => String(city.id) === state.id)) throw new Error('请选择行军路线');
    return view.dispatch('chooseCity', { id: Number(state.id) });
  }, { disabled: !state.id, className: 'sht-ol-confirm', focusKey: 'ol-route:enter' });
}

function ending(view, parent, pending) {
  const run = view.campaign.run;
  parent.classList.add('sht-ol-ending-scene');
  view.motion(parent, parent, 'OL_SHT_FX_huoxing', { action:'play', background:true });
  parent.dataset.won = String(Boolean(pending.won));
  el('h2', 'sht-ol-ending-heading', pending.won ? '征程胜利' : pending.reason || '征程结束', parent);
  const difficulty = view.catalog.indexes.difficulties.get(Number(run.difficulty));
  el('p', 'sht-ol-ending-difficulty', difficulty?.name || difficulty?.smallName || '', parent);
  const general = view.adapters.characterList.find(item => item.id === run.character);
  const portrait = el('div', 'sht-ol-ending-general', null, parent);
  view.portraitCard(portrait, { ...general, id: run.character, name: general?.name || run.character, hp: run.hp, maxHp: run.maxHp, armor: run.stats?.armor || 0, equips: run.equips.map(id => view.equipmentDetails(id)) }, 'sht-ol-result-portrait');
  const summary = el('div', 'sht-ol-ending-summary', null, parent);
  const values = [['所在章节', `第 ${run.chapter} 章`], ['击败敌军', `${pending.victories ?? run.victories ?? 0} 场`], ['获得图册', `+${pending.folios ?? 0}`], ['持有铜币', String(pending.copper ?? run.copper ?? 0)]];
  for (const [name, value] of values) {
    const stat = el('div', 'sht-ol-result-stat', null, summary);
    el('span', '', name, stat);
    const amount = el('strong', '', name === '持有铜币' ? null : value, stat);
    if (name === '持有铜币') copperAmount(view, amount, value);
  }
  const items = el('div', 'sht-ol-ending-items', null, parent);
  const mutationRewards = pending.mutationRewards;
  if (mutationRewards?.items?.length || mutationRewards?.scoreBonusPercent) {
    const group = el('section', 'sht-ol-result-items sht-mutation-results', null, items);
    el('h3', '', '突变奖励', group);
    const values = el('div', 'sht-mutation-result-values', null, group);
    for (const item of mutationRewards.items || []) el('p', '', `${Number(item.id) === 14000401 ? '通关宝箱' : item.name || '通关奖励'} × ${item.quantity}`, values);
    if (mutationRewards.scoreBonusPercent) el('p', '', `战绩分加成 +${mutationRewards.scoreBonusPercent}%`, values);
    el('small', '', '已记入本地征程记录', values);
  }
  for (const [kind, ids, title] of [['skill', ownedRewardSkillIds(run), '技能'], ['tactic', run.tactics, '战法']]) {
    const group = el('section', 'sht-ol-result-items', null, items);
    el('h3', '', title, group);
    const list = el('div', 'sht-ol-result-list', null, group);
    for (const id of ids) {
      const item = view.adapters.resolve(kind, id);
      const button = view.button(list, '', () => view.inspectItem(kind, id), { className: `sht-ol-result-item sht-ol-result-${kind}`, title: item?.description || '', focusKey: `ol-result:${kind}:${id}` });
      if (kind === 'tactic') view.tacticIcon(button, id);
      el('span', '', item?.name || String(id), button);
    }
    if (!ids.length) el('span', 'sht-ol-result-empty', '无', list);
  }
  const footer = el('div', 'sht-ol-ending-footer', null, parent);
  el('p', '', `图册已记入山河册${pending.won ? '。' : '，可整备后再次出征。'}`, footer);
  view.button(footer, '返回出征界面', () => view.dispatch('next', {}), { className: 'sht-ol-confirm', focusKey: 'ol-result:return' });
}

/** Original encounter compositions with local, cancellable campaign actions. */
export function renderEncounter(view, parent, pending = view.campaign.run?.pending) {
  const renderer = { battle, reward, army, removeTactic, shop, camp, event: adventure, route, ending }[pending?.kind];
  if (!renderer) return false;
  parent.classList.add('sht-ol-encounter');
  parent.dataset.encounterKind = pending.kind;
  renderer(view, parent, pending);
  return true;
}
