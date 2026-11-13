import { plain } from './adapters.js';

const qualities = ['', '稀有', '史诗', '传说', '限定'];
const camps = { wei: '魏', shu: '蜀', wu: '吴', qun: '群', jin: '晋', shen: '神', key: '键' };

function el(tag, cls, text, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = plain(text);
  parent?.appendChild(node);
  return node;
}

function heroForView(view) {
  const id = view.traitCharacter || view.campaign.run?.character || view.selectedHero?.id || view.adapters.characterList[0]?.id;
  return view.adapters.characterList.find(hero => hero.id === id) || { id, name: id || '武将', group: '', skills: [] };
}

function stateForView(view, hero = heroForView(view)) {
  return view.campaign.traitState(hero.id, view.campaign.run?.character === hero.id ? view.campaign.run.rank : undefined);
}

function command(view, action, hero, payload = {}) {
  return view.dispatch(action, { character: hero.id, ...payload });
}

export function openCharacterTraits(view, character) {
  if (view.tab !== 'traits') view.traitReturn = { tab: view.tab, screen: view.screen };
  view.traitCharacter = character || view.campaign.run?.character || view.selectedHero?.id || view.adapters.characterList[0]?.id;
  view.traitPage = 'home'; view.traitPickerOpen = false; view.menuOpen = false;
  view.inventoryOpen = false; view.tab = 'traits';
}

export function backCharacterTraits(view) {
  if (view.tab !== 'traits') return false;
  if (view.traitPickerOpen) { view.traitPickerOpen = false; return true; }
  if (view.traitPage === 'refine') { view.traitPage = 'home'; return true; }
  view.tab = view.traitReturn?.tab || 'campaign';
  if (view.traitReturn?.screen != null) view.screen = view.traitReturn.screen;
  delete view.traitReturn;
  return true;
}

export function showCharacterTraitHelp(view) {
  return view.inspectItem({ kind: 'rule', name: '武将特质', description: [
    '武将2至5阶依次开放四个特质槽，5阶可进行洗练。每名武将单独保存特质方案。',
    '每次洗练基础消耗1个将魂；最多锁定三条特质，每锁定一条稀有、史诗或传说特质，额外消耗1个将魂；每锁定一条限定特质，额外消耗7个将魂。锁定词条会在原位置保留。',
    '洗练后可确认替换，也可保留当前特质；未确认的新结果会保存。每名武将最多同时拥有两条限定特质。初始特质始终保留，可切换使用。',
    '特质品质与抽取规则采用本地配置。',
    '特质效果自动生效；五阶的重生单独保留，不随洗练改变。已开始的战斗结束后才能更改特质。',
  ].join('\n\n') });
}

export function renderTraitCurrency(view, parent) {
  const state = stateForView(view);
  const resource = el('span', 'sht-resource sht-trait-currency', null, parent);
  resource.setAttribute('aria-label', `将魂 ${state.balance}`);
  view.image(resource, view.asset('character-traits/soul.png'), '', 'sht-resource-icon sht-trait-soul');
  el('span', '', String(state.balance), resource);
  return resource;
}

function row(view, parent, trait, index, { rank = 5, canLock = false, lockIndices = [], canChange = true, hero, lockedResult = false } = {}) {
  const unlocked = rank >= index + 2;
  const quality = Math.max(1, Math.min(4, Number(trait?.quality) || 1));
  const container = el('div', `sht-trait-line sht-trait-quality-${quality}${unlocked ? '' : ' sht-trait-slot-closed'}${lockedResult ? ' sht-trait-result-locked' : ''}`, null, parent);
  container.dataset.slot = String(index); container.dataset.traitId = String(trait?.id || '');
  const title = el('span', 'sht-trait-quality', unlocked ? qualities[quality] : `${index + 2}阶解锁`, container);
  if (!unlocked) title.classList.add('sht-trait-locked-label');
  const description = el('p', 'sht-trait-description', unlocked ? trait?.description || '暂无特质' : trait?.description || '提升武将等阶后开启', container);
  description.title = plain(trait?.description || '');
  if (canLock) {
    const locked = lockIndices.includes(index);
    const button = view.button(container, '', () => command(view, 'setTraitLock', hero, { index }), { className: 'sht-trait-lock', focusKey: `trait:lock:${hero.id}:${index}`, title: locked ? '解锁此特质' : lockIndices.length >= 3 ? '最多锁定3条特质' : '锁定此特质', disabled: !unlocked || !canChange || !locked && lockIndices.length >= 3 });
    button.setAttribute('aria-label', `${locked ? '解锁' : '锁定'}第${index + 1}条特质`);
    button.setAttribute('aria-pressed', String(locked));
    button.dataset.locked = String(locked);
    view.image(button, view.asset(`character-traits/${locked ? 'traitrefined_sel_lock' : 'traitrefined_dis_lock'}.png`), '', '');
  }
  if (lockedResult) el('span', 'sht-trait-kept', '已锁定', container);
  return container;
}

function fullPortrait(view, scene, hero, state) {
  const panel = el('section', 'sht-trait-general', null, scene);
  panel.dataset.group = hero.group || '';
  panel.setAttribute('aria-label', `${hero.name}，${state.rank}阶`);
  view.image(panel, view.portrait(hero.id), '', 'sht-trait-general-art');
  const sidebar = el('div', 'sht-trait-general-sidebar', null, panel);
  el('strong', 'sht-trait-general-camp', camps[hero.group] || String(hero.group || '').slice(0, 1), sidebar);
  const name = plain(hero.name || hero.id);
  const prefix = /^(界|谋|神)/.exec(name)?.[0];
  if (prefix && name.length > 1) el('span', 'sht-trait-general-prefix', prefix, sidebar);
  el('span', 'sht-trait-general-name', prefix && name.length > 1 ? name.slice(1) : name, sidebar);
  const health = el('div', 'sht-trait-general-health', null, sidebar);
  const hp = Math.max(0, Number(hero.maxHp ?? hero.hp) || 0);
  if (hp <= 5 && Number.isInteger(hp)) {
    for (let n = 0; n < hp; n++) el('i', '', null, health);
  } else if (hp) { el('i', '', null, health); el('span', '', String(hp), health); }
  const rank = el('div', 'sht-trait-general-rank', null, panel);
  rank.setAttribute('aria-label', `${state.rank}阶`);
  for (let n = 0; n < 5; n++) view.image(rank, view.asset(`character-traits/paiwei_star_new_${n < state.rank ? 2 : 1}.png`), '', '');
  view.image(panel, view.asset('character-traits/generaldetailbtn_tequan.png'), '特权', 'sht-trait-privilege');
}

function modeActions(view, parent, hero, state) {
  const modes = el('div', 'sht-trait-mode-actions', null, parent);
  el('span', 'sht-trait-mode-label', state.mode === 'refined' ? '使用中：洗练特质' : '使用中：初始特质', modes);
  if (state.mode === 'refined') view.button(modes, '使用初始特质', () => command(view, 'useInitialTraits', hero), { className: 'sht-trait-mode-button', disabled: state.canChange === false });
  else if (state.refined?.length) view.button(modes, '使用洗练特质', () => command(view, 'useRefinedTraits', hero), { className: 'sht-trait-mode-button', disabled: state.canChange === false });
  return modes;
}

function renderHome(view, scene, hero, state) {
  fullPortrait(view, scene, hero, state);
  const list = el('div', 'sht-trait-home-list', null, scene);
  list.setAttribute('aria-label', '当前武将特质');
  for (let i = 0; i < 4; i++) row(view, list, state.slots[i] || state.initial?.[i], i, { rank: state.rank });
  const change = view.button(scene, '', () => { view.traitPickerOpen = true; view.traitPickerQuery = ''; view.traitPickerPage = 0; }, { className: 'sht-trait-change-general', title: '更换浏览武将', focusKey: 'trait:change-general' });
  change.setAttribute('aria-label', '更换浏览武将');
  view.image(change, view.asset('character-traits/traitrefined_genghuan_gerenal.png'), '', '');
  modeActions(view, scene, hero, state);
  view.button(scene, '去洗练', () => { view.traitPage = 'refine'; }, { className: 'sht-trait-primary sht-trait-go-refine', disabled: Number(state.rank) < 5, focusKey: 'trait:go-refine' });
  if (Number(state.rank) < 5) el('p', 'sht-trait-home-hint', '武将达到5阶后可洗练', scene);
  else if (state.candidate?.length) el('p', 'sht-trait-home-hint', '有尚未替换的洗练结果', scene);
}

function renderRefine(view, scene, hero, state) {
  const current = el('section', 'sht-trait-current', null, scene);
  el('h2', '', '当前特质', current);
  for (let i = 0; i < 4; i++) row(view, current, state.slots[i], i, { rank: state.rank, canLock: true, lockIndices: state.lockIndices || [], canChange: state.canChange !== false, hero });
  const portrait = view.portraitCard(scene, hero, 'sht-trait-refine-portrait');
  portrait.setAttribute('aria-label', hero.name);
  const next = el('section', 'sht-trait-result', null, scene);
  next.setAttribute('aria-live', 'polite');
  el('h2', '', '洗练结果', next);
  if (state.candidate?.length) {
    for (let i = 0; i < 4; i++) row(view, next, state.candidate[i], i, { rank: 5, lockedResult: state.candidateLockIndices?.includes(i) });
    view.button(scene, '确认替换', () => { command(view, 'acceptTraits', hero); view.pendingToast = '已替换特质'; }, { className: 'sht-trait-accept', disabled: state.canChange === false, focusKey: 'trait:accept' });
    view.button(scene, '保留当前', () => { command(view, 'discardTraitRoll', hero); view.pendingToast = '已保留当前特质'; }, { className: 'sht-trait-discard', disabled: state.canChange === false, focusKey: 'trait:discard' });
  } else {
    el('p', 'sht-trait-result-empty', '洗练后可在此查看新特质\n确认替换前，当前特质保持不变', next);
  }
  const canRefine = state.canRefine && Number(state.balance) >= Number(state.cost);
  view.button(scene, '洗练1次', () => command(view, 'refineTraits', hero), { className: 'sht-trait-primary sht-trait-roll', disabled: !canRefine, focusKey: 'trait:refine' });
  const cost = el('div', 'sht-trait-cost', null, scene);
  el('span', '', '每次消耗：', cost);
  view.image(cost, view.asset('character-traits/soul.png'), '', 'sht-trait-soul');
  el('span', '', String(state.cost), cost);
  const hint = state.refineReason || state.reason || (Number(state.balance) < Number(state.cost) ? '将魂不足' : `已锁定${state.lockIndices?.length || 0}条，最多锁定3条特质`);
  el('p', 'sht-trait-lock-hint', hint, scene);
  modeActions(view, scene, hero, state);
}

function renderPicker(view, scene) {
  const overlay = el('div', 'sht-trait-picker', null, scene);
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', '更换浏览武将');
  const panel = el('section', 'sht-trait-picker-panel', null, overlay);
  const header = el('header', 'sht-trait-picker-head', null, panel);
  el('h2', '', '更换武将', header);
  const search = el('input', 'sht-input', null, header);
  search.type = 'search'; search.placeholder = '搜索武将'; search.setAttribute('aria-label', '搜索武将'); search.value = view.traitPickerQuery || '';
  view.button(header, '返回', () => { view.traitPickerOpen = false; }, { focusKey: 'trait:close-picker' });
  const list = el('div', 'sht-trait-picker-list', null, panel);
  const footer = el('footer', 'sht-trait-picker-foot', null, panel);
  const draw = () => {
    list.replaceChildren(); footer.replaceChildren();
    const query = String(view.traitPickerQuery || '').trim().toLocaleLowerCase();
    const heroes = view.adapters.characterList.filter(item => !query || `${item.id} ${item.name}`.toLocaleLowerCase().includes(query));
    const pages = Math.max(1, Math.ceil(heroes.length / 24));
    view.traitPickerPage = Math.max(0, Math.min(pages - 1, view.traitPickerPage || 0));
    for (const hero of heroes.slice(view.traitPickerPage * 24, (view.traitPickerPage + 1) * 24)) {
      const button = view.button(list, '', () => { view.traitCharacter = hero.id; view.traitPickerOpen = false; view.traitPage = 'home'; }, { className: `sht-trait-picker-hero${hero.id === view.traitCharacter ? ' sht-trait-picker-selected' : ''}`, focusKey: `trait:hero:${hero.id}`, title: hero.name });
      button.setAttribute('aria-label', hero.name);
      view.image(button, view.portrait(hero.id), '', ''); el('span', '', hero.name, button);
    }
    if (!heroes.length) el('p', 'sht-trait-picker-empty', '没有找到对应武将', list);
    view.button(footer, '上一页', () => { view.traitPickerPage--; }, { disabled: view.traitPickerPage === 0 });
    el('span', '', `${view.traitPickerPage + 1} / ${pages}`, footer);
    view.button(footer, '下一页', () => { view.traitPickerPage++; }, { disabled: view.traitPickerPage >= pages - 1 });
    el('small', '', '这里只切换特质页面，不更换当前征程武将', footer);
  };
  search.oninput = () => { view.traitPickerQuery = search.value; view.traitPickerPage = 0; draw(); };
  draw();
  overlay.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const elements = [...overlay.querySelectorAll('input,button:not(:disabled)')];
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  search.focus({ preventScroll: true });
}

export function renderCharacterTraits(view, body) {
  const hero = heroForView(view);
  const state = stateForView(view, hero);
  const scene = el('section', 'sht-character-traits', null, body);
  scene.tabIndex = -1;
  scene.dataset.page = view.traitPage === 'refine' ? 'refine' : 'home';
  scene.dataset.character = hero.id || '';
  scene.setAttribute('aria-label', scene.dataset.page === 'refine' ? '武将特质洗练' : '武将特质');
  if (scene.dataset.page === 'refine') renderRefine(view, scene, hero, state);
  else renderHome(view, scene, hero, state);
  if (view.traitPickerOpen) renderPicker(view, scene);
  else scene.focus({ preventScroll: true });
  scene.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); backCharacterTraits(view); view.render(); }
  });
  return scene;
}
