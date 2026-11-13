import { plain } from './adapters.js';

const laneNames = ['攻击', '防御', '爆发', '反击', '成长'];
const quality = ['', '普通', '稀有', '史诗', '传说'];
const laneHeight = 84;
const headerHeight = 32;
const graphHeight = headerHeight + laneHeight * 5;

function el(tag, className, text, parent) {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = plain(text);
  parent?.appendChild(node);
  return node;
}

function numeral(number) {
  const digits = '零一二三四五六七八九';
  if (number < 10) return digits[number];
  if (number < 100) return `${number >= 20 ? digits[Math.floor(number / 10)] : ''}十${number % 10 ? digits[number % 10] : ''}`;
  return String(number);
}

function itemKind(node) {
  return ({ '战法': 'tactic', '随机战法': 'tactic', '技能': 'skill', '装备': 'card', '卡牌': 'card' })[node.rewardType] || 'tactic';
}

function point(node, columnWidth = 132) {
  return { x: (Number(node.layer) - .5) * columnWidth, y: headerHeight + (Number(node.lane) - .5) * laneHeight };
}

function art(view, parent, kind, rarity, label, className = '', tacticId) {
  const circle = el('span', `sht-tree-ol-art ${className}`, null, parent);
  circle.style.backgroundImage = `url("${view.asset(`ui/roguecommon/rogue_zhanfa_bg_${Math.max(1, Math.min(4, rarity || 1))}.png`)}")`;
  if (className.includes('sht-tree-ol-random')) view.image(circle, view.asset('ui/rogueSeacon/talent_random_ZhanFa.png'), '', 'sht-tree-ol-random-icon');
  else if (kind === 'tactic' && tacticId != null) view.tacticIcon(circle, tacticId, 'sht-tree-ol-tactic-picture');
  else view.itemIcon(circle, kind, 'sht-tree-ol-type-icon');
  if (label) el('span', 'sht-tree-ol-art-label', label, circle);
  return circle;
}

function activeRun(view) { return Boolean(view.campaign.run && !view.campaign.run.settled); }
function mutate(view, type, payload) {
  if (view.dispatch) return view.dispatch(type, payload);
  return type === 'setLoadout' ? view.campaign.setLoadout(payload.ids) : view.campaign[type](payload.id);
}
function statusOf(view, node) {
  const { campaign, catalog, adapters } = view, profile = campaign.profile;
  const owned = profile.unlockedTree.includes(node.id);
  const missing = [...new Set([...(node.parents || []), ...(node.conditions || [])])].filter(id => !profile.unlockedTree.includes(id));
  const random = node.rewardType === '随机战法';
  const supported = random || adapters.isSupported(itemKind(node), node.rewardId);
  const available = !random || catalog.tactics.some(item => item.rarity === node.rarity && item.seasonIds.includes(5)
    && !item.deprecated && !campaign.schoolEffectIds.has(item.id) && adapters.isSupported('tactic', item.id) && !profile.unlockedRewards.includes(item.id));
  const reason = owned ? '已解锁' : activeRun(view) ? '当前征程结束后可解锁。'
    : !supported ? '此奖励尚未适配，暂不可解锁。' : !available ? '此品质没有可解锁的新战法。'
      : missing.length ? '需先解锁前置节点。' : profile.folios < node.cost ? '图册不足，还需 ' + (node.cost - profile.folios) + ' 图册。' : '';
  return { owned, missing, supported, reason, state: owned ? 3 : missing.length ? 1 : 2 };
}
function schoolIds(item) { return String(item?.raw?.school || item?.schoolId || '').split(/[;,]/).filter(Boolean).map(Number); }
function schoolLinks(view, parent, item) {
  const schools = (view.catalog.rules.school || []).filter(school => schoolIds(item).includes(Number(school.school)));
  if (!schools.length) return;
  const group = el('div', 'sht-tree-ol-schools', null, parent);
  for (const school of schools) view.button(group, school.name + ' ›', () => { view.treeSchoolId = Number(school.school); },
    { className: 'sht-tree-ol-school-link', focusKey: 'tree-school:' + school.school });
}
function openPicker(view, index, assigned, candidateId) {
  view.treePickerOpen = true;
  view.treeSlotIndex = index;
  view.treeCandidateId = candidateId || assigned.get(index)?.id || null;
  view.treePickerScrollTop = 0;
  view.restoreFocusKey = 'tree-detail-close';
}
/** Close only the current layer, preserving the underlying graph and scroll. */
export function closeTreeOverlay(view) {
  if (view.treeSchoolId != null) { view.treeSchoolId = null; return true; }
  if (view.treePickerOpen) { view.treePickerOpen = false; view.treeCandidateId = null; return true; }
  if (view.treeSelectedId != null) { view.treeSelectedId = null; return true; }
  return false;
}
function panelHead(view, parent, title, close, label = '返回山河册') {
  const heading = el('div', 'sht-tree-ol-detail-head', null, parent);
  el('h2', '', title, heading);
  view.button(heading, '×', close, { className: 'sht-tree-ol-close', title: label, focusKey: 'tree-detail-close' });
}
function selectNode(view, id, reveal = false) {
  view.treeSelectedId = id; view.treePickerOpen = false; view.treeSchoolId = null;
  if (reveal) view.treeRevealId = id;
}
function branchLinks(view, parent, ids, title) {
  const nodes = ids.map(id => view.catalog.indexes.tree.get(id)).filter(Boolean);
  if (!nodes.length) return;
  const group = el('section', 'sht-tree-ol-branch', null, parent);
  el('h3', '', title, group);
  for (const node of nodes) view.button(group, node.name + (view.campaign.profile.unlockedTree.includes(node.id) ? ' · 已解锁' : ' · ' + node.cost + '图册'),
    () => selectNode(view, node.id, true), { className: 'sht-tree-ol-branch-link', focusKey: 'tree-branch:' + node.id });
}
async function confirmUnlock(view, node, path = false) {
  const plan = path ? view.campaign.treeUnlockPlan(node.id) : null;
  if (plan && !plan.available) throw new Error(plan.reason || '暂不可解锁');
  const nodes = plan?.nodes || [node], cost = plan?.cost ?? node.cost;
  const message = '消耗 ' + cost + ' 图册解锁「' + node.name + '」。'
    + (nodes.length > 1 ? '\n将同时解锁：' + nodes.map(item => item.name).join('、') + '。' : '')
    + '\n现有图册：' + view.campaign.profile.folios + '。';
  if (!await view.confirm({ title: '解锁山河册', message, confirmText: '确认解锁', cancelText: '返回' })) return;
  const before = new Set(view.campaign.profile.unlockedRewards);
  await mutate(view, path ? 'unlockTreePath' : 'unlockTree', { id: node.id });
  const rewards = view.campaign.profile.unlockedRewards.filter(id => !before.has(id));
  view.pendingToast = rewards.length ? '已解锁：' + rewards.map(id => view.catalog.indexes.tactics.get(id)?.name
    || view.catalog.indexes.skills.get(id)?.name || view.catalog.indexes.cards.get(id)?.name || '奖励').join('、') : '解锁成功';
}
function selectedPanel(view, parent, node, slots, assigned) {
  const status = statusOf(view, node), { campaign, catalog } = view;
  const detail = el('section', 'sht-tree-ol-detail', null, parent);
  detail.setAttribute('aria-label', node.name + '详情');
  panelHead(view, detail, node.name, () => { view.treeSelectedId = null; });
  const content = el('div', 'sht-tree-ol-detail-content', null, detail);
  el('small', '', node.rewardType + ' · ' + quality[node.rarity] + ' · 第' + numeral(node.layer) + '层', content);
  el('p', '', node.description, content);
  if (node.rewardType === '战法') schoolLinks(view, content, catalog.indexes.tactics.get(node.rewardId));
  branchLinks(view, content, [...new Set([...(node.parents || []), ...(node.conditions || [])])], '前置分支');
  branchLinks(view, content, catalog.tree.filter(child => [...(child.parents || []), ...(child.conditions || [])].includes(node.id)).map(child => child.id), '后续分支');
  if (status.reason && !status.owned) el('p', 'sht-tree-ol-warning', status.reason, content);
  const actions = el('div', 'sht-tree-ol-detail-actions', null, detail);
  view.button(actions, status.owned ? '已解锁' : node.cost + ' 图册解锁', () => confirmUnlock(view, node), {
    primary: true, disabled: Boolean(status.reason), title: status.reason,
    className: 'sht-tree-ol-detail-action', focusKey: 'tree-unlock:' + node.id,
  });
  if (!status.owned && status.missing.length && campaign.treeUnlockPlan) {
    const plan = campaign.treeUnlockPlan(node.id);
    view.button(actions, '解锁前置及此节点（' + plan.cost + ' 图册）', () => confirmUnlock(view, node, true), {
      disabled: !plan.available, title: plan.reason, className: 'sht-tree-ol-detail-action', focusKey: 'tree-unlock-path:' + node.id,
    });
    if (!plan.available && plan.reason) el('small', 'sht-tree-ol-warning', plan.reason, actions);
  }
  if (status.owned && node.rewardType === '战法') {
    const installed = slots.findIndex((slot, index) => assigned.get(index)?.id === node.rewardId);
    const candidates = slots.filter(slot => slot.unlocked && slot.maxRarity >= node.rarity);
    view.button(actions, installed >= 0 ? '查看已装配槽位' : '装配战法', async () => {
      let index = installed;
      if (index < 0) {
        const id = await view.choose({ title: '选择初始战法槽', description: '选择要装配或替换的槽位。', choices: slots.map((slot, i) => ({
          id: i, name: '第' + slot.id + '槽 · ' + quality[slot.maxRarity] + '及以下', description: assigned.get(i)?.name || '空槽',
          disabled: !slot.unlocked || slot.maxRarity < node.rarity,
          disabledReason: !slot.unlocked ? '累计消耗 ' + slot.requiredSpent + ' 图册开放' : slot.maxRarity < node.rarity ? '此槽无法容纳该品质' : '',
        })), confirmText: '选择此槽', cancelText: '返回详情' });
        if (id == null) return;
        index = Number(id);
      }
      openPicker(view, index, assigned, node.rewardId);
    }, { disabled: activeRun(view) || !status.supported || !candidates.length,
      title: activeRun(view) ? '征程结束后可装配' : !candidates.length ? '没有可容纳该品质的已开放槽位' : '',
      className: 'sht-tree-ol-detail-action', focusKey: 'tree-equip:' + node.id });
  }
}
function candidateReason(view, item, slot, current) {
  if (activeRun(view)) return '征程中不可更换初始战法';
  if (!slot.unlocked) return '累计消耗 ' + slot.requiredSpent + ' 图册开放';
  if (!item.supported) return '此战法尚未适配';
  if (item.rarity > slot.maxRarity) return '此槽最高可装配' + quality[slot.maxRarity] + '战法';
  if (current?.id === item.id) return '此槽已装配';
  if (view.campaign.profile.loadout.includes(item.id)) return '已装配在其他槽位';
  return '';
}
function loadoutPicker(view, parent, slots, assigned) {
  const index = slots[view.treeSlotIndex] ? view.treeSlotIndex : 0;
  const slot = slots[index], current = assigned.get(index);
  if (!slot) return;
  const detail = el('section', 'sht-tree-ol-detail sht-tree-ol-picker', null, parent);
  detail.setAttribute('aria-label', '装配已解锁战法');
  panelHead(view, detail, '更换初始战法 · 第' + slot.id + '槽', () => { view.treePickerOpen = false; }, view.treeSelectedId ? '返回节点详情' : '返回山河册');
  el('p', 'sht-tree-ol-picker-tip', slot.unlocked ? '可装配' + quality[slot.maxRarity] + '及以下战法；选择战法后确认。'
    : '累计消耗 ' + slot.requiredSpent + ' 图册开放；当前已消耗 ' + view.campaign.profile.spentFolios + ' 图册。', detail);
  const tabs = el('div', 'sht-tree-ol-picker-slots', null, detail);
  slots.forEach((candidate, i) => view.button(tabs, '第' + candidate.id + '槽' + (candidate.unlocked ? '' : ' · 锁定'),
    () => openPicker(view, i, assigned), { className: 'sht-tree-ol-slot-tab ' + (i === index ? 'active' : ''),
      title: '最高' + quality[candidate.maxRarity] + '；累计消耗 ' + candidate.requiredSpent + ' 图册开放', focusKey: 'tree-picker-slot:' + i }));
  const layout = el('div', 'sht-tree-ol-picker-layout', null, detail);
  const list = el('div', 'sht-tree-ol-picker-list', null, layout);
  list.setAttribute('aria-label', '已解锁战法列表'); list.tabIndex = 0;
  const equipped = view.campaign.profile.loadout;
  const items = view.campaign.profile.unlockedRewards.map(id => view.adapters.resolve('tactic', id)).filter(Boolean)
    .sort((a, b) => Number(equipped.includes(b.id)) - Number(equipped.includes(a.id)) || b.rarity - a.rarity || a.id - b.id);
  const selected = items.find(item => item.id === view.treeCandidateId) || items.find(item => item.id === current?.id)
    || items.find(item => !candidateReason(view, item, slot, current)) || items[0];
  if (selected) view.treeCandidateId = selected.id;
  if (!items.length) el('p', 'sht-tree-ol-empty-text', '在山河册中解锁战法后，即可在此装配。', list);
  for (const item of items) {
    const reason = candidateReason(view, item, slot, current);
    const button = view.button(list, '', () => { view.treeCandidateId = item.id; }, {
      className: 'sht-tree-ol-picker-row ' + (selected?.id === item.id ? 'active ' : '') + (reason ? 'sht-tree-ol-picker-unavailable' : ''),
      title: item.name + '\n' + (reason || item.description), focusKey: 'tree-picker:' + item.id,
    });
    button.setAttribute('aria-pressed', String(selected?.id === item.id));
    button.setAttribute('aria-label', item.name + (reason ? '，' + reason : '，点击预览'));
    art(view, button, 'tactic', item.rarity, item.name, '', item.id);
    if (equipped.includes(item.id)) el('span', 'sht-tree-ol-equipped-tag', '已装配', button);
  }
  list.scrollTop = view.treePickerScrollTop || 0;
  list.addEventListener('scroll', () => { view.treePickerScrollTop = list.scrollTop; });
  const preview = el('div', 'sht-tree-ol-picker-preview', null, layout);
  if (selected) {
    art(view, preview, 'tactic', selected.rarity, '', '', selected.id);
    el('h3', '', selected.name, preview); el('small', '', quality[selected.rarity] + '战法', preview);
    const desc = el('div', 'sht-tree-ol-picker-description', null, preview);
    el('p', '', selected.description, desc);
    schoolLinks(view, desc, view.catalog.indexes.tactics.get(selected.id));
    const reason = candidateReason(view, selected, slot, current);
    if (reason) el('p', 'sht-tree-ol-warning', reason, desc);
    view.button(preview, current?.id === selected.id ? '已装配' : current ? '确认替换' : '确认装配', async () => {
      await mutate(view, 'setLoadout', { ids: [...view.campaign.profile.loadout.filter(id => id !== current?.id), selected.id] });
      view.treeSlotAssignments[index] = selected.id; view.treePickerOpen = false;
      view.restoreFocusKey = view.treeSelectedId ? 'tree-equip:' + view.treeSelectedId : 'tree-slot:' + index;
      view.pendingToast = '已装配「' + selected.name + '」';
    }, { primary: true, disabled: Boolean(reason), title: reason, className: 'sht-tree-ol-detail-action', focusKey: 'tree-picker-confirm' });
  }
  if (current) view.button(preview, '卸下当前战法', async () => {
    if (!await view.confirm({ title: '卸下战法', message: '从第' + slot.id + '槽卸下「' + current.name + '」？', confirmText: '确认卸下', cancelText: '保留' })) return;
    await mutate(view, 'setLoadout', { ids: view.campaign.profile.loadout.filter(id => id !== current.id) });
    delete view.treeSlotAssignments[index]; view.treeCandidateId = null;
    view.pendingToast = '已卸下「' + current.name + '」';
  }, { disabled: activeRun(view), title: activeRun(view) ? '征程结束后可卸下' : '',
    className: 'sht-tree-ol-detail-action', focusKey: 'tree-picker-remove' });
}
function schoolPanel(view, parent) {
  const school = (view.catalog.rules.school || []).find(item => Number(item.school) === view.treeSchoolId);
  if (!school) { view.treeSchoolId = null; return; }
  const detail = el('section', 'sht-tree-ol-detail sht-tree-ol-school', null, parent);
  detail.setAttribute('aria-label', school.name + '套装详情');
  panelHead(view, detail, school.name + ' · 套装', () => { view.treeSchoolId = null; }, '返回战法详情');
  const progress = view.campaign.schoolProgress().find(item => item.id === Number(school.school));
  const effects = String(school.effect).split(/[;,]/).map(Number).map(id => view.catalog.indexes.tactics.get(id)?.description).filter(Boolean);
  el('p', 'sht-tree-ol-school-effect', effects.join('\n'), detail);
  if (progress) el('p', 'sht-tree-ol-school-progress', (activeRun(view) && progress.active ? '本次征程已激活' : '本次征程未激活') + ' · '
    + progress.requirements.filter(row => row.needed > 0).map(row => quality[row.rarity] + ' ' + (activeRun(view) ? row.owned : 0) + '/' + row.needed).join('，'), detail);
  const list = el('div', 'sht-tree-ol-school-list', null, detail);
  list.tabIndex = 0; list.setAttribute('aria-label', '套装战法成员，可上下滚动');
  const owned = new Set(activeRun(view) ? view.campaign.run.tactics : []);
  const members = view.catalog.tactics.filter(item => item.seasonIds.includes(5) && !item.deprecated
    && !view.campaign.schoolEffectIds.has(item.id) && schoolIds(item).includes(Number(school.school)))
    .sort((a, b) => b.rarity - a.rarity || a.id - b.id);
  for (const item of members) {
    const row = el('article', 'sht-tree-ol-school-member ' + (owned.has(item.id) ? 'sht-tree-ol-school-owned' : ''), null, list);
    art(view, row, 'tactic', item.rarity, '', '', item.id);
    const text = el('div', 'sht-tree-ol-school-member-text', null, row);
    el('h3', '', item.name, text); el('small', '', quality[item.rarity] + ' · ' + (owned.has(item.id) ? '本次征程已获得' : '本次征程未获得'), text);
    el('p', '', item.description, text);
  }
}

/** The OL reference is a horizontal, five-lane graph; preserve the real data's
 * layer/lane and dependency edges rather than turning nodes into stacked cards. */
export function renderTree(view, body) {
  const { campaign, catalog } = view;
  const tree = catalog.tree || [];
  const profile = campaign.profile;
  const unlocked = new Set(profile.unlockedTree || []);
  const activeRun = Boolean(campaign.run && !campaign.run.settled);
  const page = el('section', 'sht-tree-ol', null, body);
  page.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !view.root?.querySelector('dialog[open]') && closeTreeOverlay(view)) {
      event.preventDefault(); event.stopPropagation(); view.render();
    }
  });
  const rail = el('aside', 'sht-tree-ol-rail', null, page);
  el('div', 'sht-tree-ol-scheme', '初始战法 · 当前方案', rail);
  const slots = campaign.loadoutSlots();
  const equipped = (profile.loadout || []).map(id => view.adapters.resolve('tactic', id)).filter(Boolean);
  // Saves contain an equipped set. Preserve view-only preferred positions when
  // possible, while always finding a complete matching after a save import.
  const assigned = new Map();
  const sorted = [...equipped].sort((a, b) => b.rarity - a.rarity || a.id - b.id);
  const place = itemIndex => {
    if (itemIndex >= sorted.length) return true;
    const item = sorted[itemIndex];
    const candidates = slots.map((slot, index) => ({ ...slot, index }))
      .filter(slot => slot.unlocked && !assigned.has(slot.index) && slot.maxRarity >= item.rarity)
      .sort((a, b) => Number(view.treeSlotAssignments?.[b.index] === item.id) - Number(view.treeSlotAssignments?.[a.index] === item.id)
        || a.maxRarity - b.maxRarity || a.index - b.index);
    for (const slot of candidates) {
      assigned.set(slot.index, item);
      if (place(itemIndex + 1)) return true;
      assigned.delete(slot.index);
    }
    return false;
  };
  place(0);
  view.treeSlotAssignments = Object.fromEntries([...assigned].map(([index, item]) => [index, item.id]));
  const loadout = el('div', 'sht-tree-ol-loadout', null, rail);
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    const item = assigned.get(index);
    const button = view.button(loadout, '', () => {
      openPicker(view, index, assigned); view.treeSelectedId = null;
    }, {
      className: `sht-tree-ol-slot ${slot.unlocked ? '' : 'sht-tree-ol-slot-locked'}`,
      focusKey: `tree-slot:${index}`,
      title: item ? `${item.name}：${item.description}\n点击更换或卸下` : slot.unlocked ? `装配战法，最高${quality[slot.maxRarity] || '传说'}` : `累计消耗 ${slot.requiredSpent || 0} 图册开放`,
    });
    button.style.gridColumn = String(index % 2 + 1); button.style.gridRow = String(index + 1);
    button.setAttribute('aria-label', item ? `更换或卸下${item.name}` : slot.unlocked ? `装配初始战法，第${index + 1}槽` : `未开放，第${index + 1}槽`);
    if (item) art(view, button, 'tactic', item.rarity, item.name, '', item.id);
    else {
      const frame = el('span', 'sht-tree-ol-empty', null, button);
      frame.style.backgroundImage = 'url("' + view.asset('ui/roguecommon/rogue_zhanfa_bg_' + slot.maxRarity + '.png') + '")';
      view.image(frame, view.asset(slot.unlocked ? 'ui/rogueSeacon/roguelikeui_rogueSeacon_add.png' : 'ui/rogueSeacon/roguelikeui_rogueSeacon_lock.png'), '', 'sht-tree-ol-empty-icon');
      el('span', '', slot.unlocked ? quality[slot.maxRarity] + '及以下' : '消耗' + slot.requiredSpent + '图册开放', button);
    }
  }
  el('small', 'sht-tree-ol-loadout-note', `已装配 ${equipped.length} / ${slots.filter(slot => slot.unlocked).length} 槽`, rail);
  view.button(rail, '装配初始战法', () => { openPicker(view, slots.findIndex(slot => slot.unlocked), assigned); view.treeSelectedId = null; }, { className: 'sht-tree-ol-manage', focusKey: 'tree-manage' });
  el('small', 'sht-tree-ol-spent', `累计消耗 ${profile.spentFolios || 0} 图册`, rail);

  const chart = el('section', 'sht-tree-ol-chart', null, page);
  const toolbar = el('div', 'sht-tree-ol-toolbar', null, chart);
  el('span', '', activeRun ? '征程中可浏览，结束后可解锁' : '点击节点查看效果与解锁条件', toolbar);
  const navigation = el('span', 'sht-tree-ol-navigation', null, toolbar);
  const scrollBy = direction => {
    const limit = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    view.treeScrollLeft = Math.max(0, Math.min(limit, viewport.scrollLeft + direction * columnWidth * 5));
    viewport.scrollLeft = view.treeScrollLeft;
  };
  const previous = el('button', 'sht-tree-ol-scroll-button', '‹', navigation); previous.type = 'button'; previous.setAttribute('aria-label', '向左查看山河册'); previous.onclick = () => scrollBy(-1);
  const next = el('button', 'sht-tree-ol-scroll-button', '›', navigation); next.type = 'button'; next.setAttribute('aria-label', '向右查看山河册'); next.onclick = () => scrollBy(1);
  const diagram = el('div', 'sht-tree-ol-diagram', null, chart);
  const labels = el('div', 'sht-tree-ol-lane-labels', null, diagram);
  for (const name of laneNames) el('div', '', name, labels);
  const viewport = el('div', 'sht-tree-ol-viewport', null, diagram);
  viewport.tabIndex = 0; viewport.setAttribute('aria-label', '山河册关系图，可左右滚动');
  const targets = el('div', 'sht-tree-ol-targets', null, diagram);
  const columnWidth = Math.max(94, (viewport.clientWidth || 792) / 6);
  const maxLayer = Math.max(1, ...tree.map(node => Number(node.layer) || 1));
  const graphWidth = maxLayer * columnWidth;
  const canvas = el('div', 'sht-tree-ol-canvas', null, viewport);
  canvas.style.width = `${graphWidth}px`; canvas.style.height = `${graphHeight}px`;
  for (let lane = 0; lane < 5; lane++) {
    const band = el('div', 'sht-tree-ol-band', null, canvas);
    band.style.top = `${headerHeight + lane * laneHeight}px`;
  }
  for (let layer = 1; layer <= maxLayer; layer++) {
    const label = el('span', 'sht-tree-ol-layer', numeral(layer), canvas);
    label.style.left = `${(layer - .5) * columnWidth}px`;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('sht-tree-ol-edges'); svg.setAttribute('width', String(graphWidth)); svg.setAttribute('height', String(graphHeight)); svg.setAttribute('aria-hidden', 'true'); canvas.appendChild(svg);
  const index = new Map(tree.map(node => [node.id, node]));
  for (const node of tree) {
    const end = point(node, columnWidth);
    for (const parentId of node.parents || []) {
      const parent = index.get(parentId); if (!parent) continue;
      const start = point(parent, columnWidth), turn = end.x - columnWidth / 2;
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', `M ${start.x} ${start.y} H ${turn} V ${end.y} H ${end.x}`);
      path.setAttribute('class', unlocked.has(parent.id) && unlocked.has(node.id) ? 'sht-tree-ol-edge-open' : ''); svg.appendChild(path);
    }
    const kind = itemKind(node), owned = unlocked.has(node.id), status = statusOf(view, node);
    const button = view.button(canvas, '', () => selectNode(view, node.id), {
      className: `sht-tree-ol-node sht-tree-ol-node-${kind} ${owned ? 'sht-tree-ol-node-open' : ''} ${view.treeSelectedId === node.id ? 'sht-tree-ol-node-chosen' : ''}`,
      title: `${node.name}：${node.description}${owned ? '（已解锁）' : `（${node.cost}图册）`}`,
      focusKey: `tree-node:${node.id}`,
    });
    button.dataset.treeId = String(node.id); button.dataset.state = String(status.state);
    button.style.left = `${end.x}px`; button.style.top = `${end.y}px`;
    button.setAttribute('aria-label', `${node.name}，${owned ? '已解锁' : `${node.cost}图册解锁`}，点击查看详情`);
    button.setAttribute('aria-pressed', String(view.treeSelectedId === node.id));
    if (kind === 'skill') el('span', 'sht-tree-ol-skill-name', node.name, button);
    else if (kind === 'card' && view.cardThumb) view.cardThumb(button, node.rewardId, 'sht-tree-ol-card');
    else art(view, button, node.rewardType === '随机战法' ? 'stat' : kind, node.rarity, node.name, node.rewardType === '随机战法' ? 'sht-tree-ol-random' : '', node.rewardId);
    if (status.state === 2) {
      const cost = el('span', 'sht-tree-ol-node-cost ' + (profile.folios < node.cost ? 'sht-tree-ol-cost-short' : ''), String(node.cost), button);
      cost.title = node.cost + ' 图册';
    }
  }
  const updateTargets = () => {
    const visibleLayer = Math.ceil((viewport.scrollLeft + viewport.clientWidth) / columnWidth);
    targets.replaceChildren();
    for (let lane = 1; lane <= 5; lane++) {
      const row = el('div', 'sht-tree-ol-target-row', null, targets);
      const candidates = tree.filter(node => node.lane === lane && itemKind(node) === 'tactic').sort((a, b) => a.layer - b.layer);
      const target = candidates.find(node => node.layer > visibleLayer && node.rarity >= 3 && !unlocked.has(node.id)) || candidates.at(-1);
      if (!target) continue;
      const button = view.button(row, '', () => selectNode(view, target.id, true), {
        className: 'sht-tree-ol-target', title: '定位' + laneNames[lane - 1] + '分支：' + target.name, focusKey: 'tree-target:' + lane,
      });
      art(view, button, 'tactic', target.rarity, target.rewardType === '随机战法' ? '随机战法' : target.name, target.rewardType === '随机战法' ? 'sht-tree-ol-random' : '', target.rewardId);
    }
    previous.disabled = viewport.scrollLeft <= 0;
    next.disabled = viewport.scrollLeft >= Math.max(0, viewport.scrollWidth - viewport.clientWidth) - 1;
  };
  if (index.has(view.treeRevealId)) {
    view.treeScrollLeft = Math.max(0, point(index.get(view.treeRevealId), columnWidth).x - viewport.clientWidth / 2);
    view.treeRevealId = null;
  }
  viewport.scrollLeft = view.treeScrollLeft || 0;
  viewport.addEventListener('scroll', () => { view.treeScrollLeft = viewport.scrollLeft; updateTargets(); });
  viewport.addEventListener('wheel', event => {
    if (!event.ctrlKey && Math.abs(event.deltaY) > Math.abs(event.deltaX) && viewport.scrollWidth > viewport.clientWidth) {
      event.preventDefault(); viewport.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
    }
  }, { passive: false });
  viewport.addEventListener('keydown', event => {
    if (event.target === viewport && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); scrollBy(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  // Laya's treePanel allows dragging. Native touch scroll remains available.
  let drag = null, suppressClick = false;
  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button === 0) drag = { x: event.clientX, scroll: viewport.scrollLeft, moved: false };
  });
  viewport.addEventListener('pointermove', event => {
    if (!drag) return;
    const scale = viewport.getBoundingClientRect().width / viewport.offsetWidth || 1;
    const delta = (event.clientX - drag.x) / scale;
    if (!drag.moved && Math.abs(delta) > 6) { drag.moved = true; viewport.setPointerCapture(event.pointerId); }
    if (drag.moved) { viewport.scrollLeft = drag.scroll - delta; event.preventDefault(); }
  });
  const endDrag = event => {
    if (!drag) return;
    suppressClick = drag.moved;
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    drag = null;
    setTimeout(() => { suppressClick = false; }, 0);
  };
  viewport.addEventListener('pointerup', endDrag); viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('pointerleave', () => { if (drag && !drag.moved) drag = null; });
  viewport.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  updateTargets();
  if (view.treeSchoolId != null) schoolPanel(view, page);
  else if (view.treePickerOpen) loadoutPicker(view, page, slots, assigned);
  else if (index.has(view.treeSelectedId)) selectedPanel(view, page, index.get(view.treeSelectedId), slots, assigned);
}
