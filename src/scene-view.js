import { plain } from './adapters.js';
import { originalEnemyAvatar } from './portraits.js';
import { copperIcon, copperAmount } from './currency-view.js';
import { innateSkillsForView } from './run-skills.js';
import { difficultyForView, renderDifficulty } from './desperate-view.js';
import { inspectCurrentEffects } from './mutation-view.js';
import { bindDeveloperEntry } from './developer-entry.js';
export { renderDifficulty } from './desperate-view.js';

const kindNames = { battle: '战役', event: '奇遇', camp: '营地', shop: '集市', reward: '奖励', route: '行军', ending: '结算', removeTactic: '涤净', mutation: '选择突变', army: '选择军备' };
// OL's generated scene classes use a 1650 × 750 content area. Backgrounds
// additionally cover 1750 × 750; retain that aspect ratio in our 1280 × 580 stage.
const SOURCE_SCALE = 580 / 750;
function el(tag, cls, text, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = plain(text);
  parent?.appendChild(node); return node;
}
function iconButton(view, parent, label, asset, action, cls = '') {
  const button = view.button(parent, '', action, { className: `sht-scene-icon ${cls}`, title: label, focusKey: `scene:${label}` });
  button.setAttribute('aria-label', label);
  view.image(button, view.asset(asset), '', '');
  return button;
}
function currentDifficulty(view) {
  return difficultyForView(view, view.campaign.run?.difficulty || view.difficulty);
}
function dispatch(view, command, payload = {}) {
  if (view.dispatch) return view.dispatch(command, payload);
  if (command === 'startRun') { view.campaign.start(payload); view.screen = 'map'; }
  else if (command === 'enterNode') view.campaign.enterNode(payload.nodeId);
  else if (command === 'openShop') view.campaign.openShop();
  else if (command === 'chooseCity') { view.campaign.chooseCity(payload.cityId); view.screen = 'map'; }
}
function inspect(view, kind, value) {
  if (view.inspectItem) return typeof kind === 'object' ? view.inspectItem(kind) : view.inspectItem(kind, value);
  view.inventoryOpen = true;
}
function showMap(view) {
  view.screen = 'map'; view.tab = 'campaign'; view.menuOpen = false;
  view.encounterCollapsed = false;
}
function startSelection(view) {
  const selected = view.selectedHero;
  if (!selected) throw new Error('请选择一名武将');
  return dispatch(view, 'startRun', { character: selected.id, hp: selected.hp, maxHp: selected.maxHp,
    difficulty: view.difficulty, rank: view.rank, loadout: view.campaign.profile.loadout || [] });
}
function inspectGeneral(view, id, extra = {}) {
  const hero = view.adapters.characterList.find(item => item.id === id) || { id, name: id, skills: [] };
  const run = view.campaign.run?.character === id ? view.campaign.run : null;
  const description = [
    `体力 ${extra.hp ?? run?.hp ?? hero.hp ?? '—'} / ${extra.maxHp ?? run?.maxHp ?? hero.maxHp ?? hero.hp ?? '—'}`,
    run ? `等阶 ${run.rank} · 护甲 ${run.stats?.armor || 0}` : '',
    ...innateSkillsForView(view, hero).map(skill => `${skill.name}：${skill.description}`),
  ].filter(Boolean).join('\n\n');
  return inspect(view, { kind: 'general', name: hero.name, description, character: id });
}
function makePortraitInspectable(view, portrait, id, extra) {
  portrait.setAttribute('role', 'button'); portrait.tabIndex = 0;
  portrait.setAttribute('aria-label', '查看武将详情');
  const open = async () => {
    try { await inspectGeneral(view, id, extra); if (view.root) view.render(); }
    catch (error) { view.toast(error.message || String(error)); }
  };
  portrait.addEventListener('click', event => { event.stopPropagation(); void open(); });
  portrait.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); void open(); }
  });
}
function back(view) {
  if (view.menuOpen) { view.menuOpen = false; return; }
  if (view.tab === 'tree' && view.closeTreeOverlay?.()) return;
  if (view.tab !== 'campaign') { view.tab = 'campaign'; return; }
  if (view.screen === 'select' && !view.campaign.run) { view.screen = 'home'; return; }
  if (view.campaign.run && view.screen !== 'world') {
    // cYi.backScene returns to the big map without ending the current run.
    view.screen = 'world'; view.inventoryOpen = false; return;
  }
  return view.onExit?.();
}

export function renderSceneHeader(view, stage) {
  const run = view.campaign.run;
  const onMap = run && view.screen !== 'world';
  const header = el('header', 'sht-header sht-scene-header', null, stage);
  if (view.screen === 'select' && !run && view.tab === 'campaign') header.classList.add('sht-scene-header-select');
  const title = view.tab === 'campaign' ? (onMap ? currentDifficulty(view)?.name : view.screen === 'select' ? '点将出征' : '诸侯伐董') : ({ tree: '山河册', glossary: '征程图鉴', help: '玩法说明', save: '征程存档' })[view.tab];
  const heading = el('div', 'sht-scene-heading', null, header);
  const titleNode = el('span', '', title || '山河图', heading);
  if (view.tab === 'tree') bindDeveloperEntry(view, titleNode);
  else delete view.developerGesture;
  view.button(heading, '?', () => { view.tab = 'help'; }, { className: 'sht-scene-help', title: '玩法说明' });
  if (onMap && view.tab === 'campaign') {
    const city = view.campaign.currentCity();
    const rule = view.catalog.rules.ChapterCS.find(x => Number(x.chapter) === Number(run.chapter)) || {};
    const limit = Number(rule.apptime ?? 4);
    const month = Number(run.month || 0);
    const calendarMonth = Number(rule.month || 1) - 1 + month;
    const summary = el('div', 'sht-scene-progress', null, header);
    el('span', 'sht-scene-chapter', `第${['一', '二', '三'][(run.chapter || 1) - 1] || run.chapter}章 · ${city?.name || ''}`, summary);
    el('span', 'sht-scene-year', `公元${Number(rule.year || 190) + Math.floor(calendarMonth / 12)}年`, summary);
    const track = el('div', 'sht-month-track', null, summary);
    track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', '首领现身进度');
    track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', String(limit)); track.setAttribute('aria-valuenow', String(Math.min(month, limit)));
    el('span', 'sht-month-fill', null, track).style.width = `${Math.min(100, month / Math.max(1, limit) * 100)}%`;
    el('span', 'sht-month-number', `${calendarMonth % 12 + 1}月`, track);
    view.image(summary, view.asset(`ui/roguesmallmap/${month >= limit ? 'smallmap_boss_icon.png' : 'smallmap_boss_icon_dis.png'}`), '', 'sht-scene-boss');
    const actions = view.campaign.chapterActionInfo?.();
    const goal = month >= limit ? '击败首领通关章节' : `${(Number(rule.month || 1) - 1 + limit) % 12 + 1}月首领现身`;
    const label = actions?.enforced ? `${goal}\n可探索${actions.remaining}次` : goal;
    const goalNode = el('small', 'sht-scene-goal' + (actions?.enforced ? ' sht-scene-goal-actions' : ''), label, summary);
    if (actions?.enforced) goalNode.title = `本章已探索${actions.used}次 / ${actions.limit}次${actions.bonus ? `（日行千里额外${actions.bonus}次）` : ''}`;
  }
  const resources = el('div', 'sht-resources', null, header);
  if (run || view.tab === 'tree') {
    const currency = el('span', 'sht-resource', null, resources);
    if (view.tab === 'tree') view.image(currency, view.asset('ui/rogueSeacon/roguelikeui_rogueSeacon_point.png'), '图册', 'sht-resource-icon');
    else copperIcon(view, currency, 'sht-resource-icon');
    el('span', '', view.tab === 'tree' ? String(view.campaign.profile.folios || 0) : String(run.copper || 0), currency);
  }
  view.button(resources, '☰', () => { view.menuOpen = !view.menuOpen; }, { className: 'sht-scene-menu-button', title: '征程菜单' });
  view.button(resources, '↶', () => back(view), { className: 'sht-scene-back', title: '返回' });
  if (view.menuOpen) {
    const menu = el('nav', 'sht-scene-menu', null, stage); menu.setAttribute('aria-label', '征程菜单');
    for (const [id, name] of [['campaign', '征程'], ['tree', '山河册'], ['glossary', '图鉴'], ['help', '玩法'], ['save', '存档']]) {
      view.button(menu, name, () => { view.tab = id; view.menuOpen = false; }, { className: view.tab === id ? 'active' : '' });
    }
    if (run && !run.settled) view.button(menu, '结束本次征程', async () => {
      if (await view.confirm('本次获得的武将成长将清除，山河册保留。', { title: '结束本次征程', confirmText: '结束征程' })) {
        if (view.dispatch) view.dispatch('abandon'); else view.campaign.abandon();
        view.menuOpen = false;
      }
    });
    view.button(menu, '返回无名杀', () => view.onExit?.());
  }
}

export function renderOverworld(view, body) {
  const run = view.campaign.run;
  const choosingRoute = run?.pending?.kind === 'route';
  const available = new Set(choosingRoute ? view.campaign.availableCities().map(city => Number(city.id)) : []);
  const cleared = new Set((run?.clearedCities || []).map(Number));
  const scene = el('section', 'sht-overworld', null, body);
  scene.dataset.sourceScene = 'RogueLikeBigMapScene';
  const chapter = Number(run?.chapter || 1);
  el('div', 'sht-world-chapter', `第${['一', '二', '三'][chapter - 1] || chapter}章 · ${run ? view.campaign.currentCity()?.name || '诸侯伐董' : '联军集结'}`, scene);
  view.image(scene, view.asset('season5/bigmap/zhfd_bigmap.png'), '', 'sht-world-terrain');
  view.motion(scene, scene, 'rouge_beijing', { action:'animation', background:true });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('sht-world-routes'); svg.setAttribute('viewBox', '0 0 1280 580'); svg.setAttribute('aria-hidden', 'true'); scene.appendChild(svg);
  // ZYi.updateSeason: center + PlaceX/PlaceY + 50. Big-map Y points down.
  const position = city => ({ x: 640 + (Number(city.position?.[0] || 0) + 50) * SOURCE_SCALE, y: 290 + (Number(city.position?.[1] || 0) + 50) * SOURCE_SCALE });
  for (const city of view.catalog.cities) {
    const a = position(city);
    for (const next of city.nextCityIds || []) {
      const target = view.catalog.indexes.cities.get(next); if (!target) continue;
      const b = position(target), line = document.createElementNS(svg.namespaceURI, 'line');
      for (const [key, value] of Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })) line.setAttribute(key, value);
      if (cleared.has(Number(city.id)) || Number(run?.cityId) === Number(city.id) && available.has(Number(next))) line.classList.add('sht-world-route-open');
      svg.appendChild(line);
    }
  }
  for (const city of view.catalog.cities) {
    const current = Number(run?.cityId) === Number(city.id);
    const canEnter = available.has(Number(city.id));
    const locked = Number(city.openDifficulty || 1) > Number(currentDifficulty(view)?.baseDifficulty || run?.difficulty || view.difficulty);
    const point = position(city);
    const marker = view.button(scene, '', async () => {
      if (canEnter) {
        const description = [city.description, city.effect].filter(value => value && value !== '-').join('\n');
        const confirmed = await view.confirm(description || `选择${city.name}作为下一段行军路线。`, { title: `前往${city.name}`, confirmText: '前往此地' });
        if (confirmed) return dispatch(view, 'chooseCity', { cityId: city.id });
      } else if (current && !choosingRoute) showMap(view);
      else view.toast(locked ? '提高征程难度后可前往此地' : choosingRoute ? '请选择亮起的行军路线' : run ? '沿当前行军路线推进后可到达此地' : '选择武将后开始征程');
    }, { className: `sht-world-city ${current ? 'sht-world-current' : ''} ${canEnter ? 'sht-world-available' : ''} ${cleared.has(Number(city.id)) ? 'sht-world-cleared' : ''} ${locked ? 'sht-world-locked' : ''}`, title: city.name, focusKey: `city:${city.id}` });
    marker.style.left = `${point.x}px`; marker.style.top = `${point.y}px`;
    marker.dataset.cityId = city.id;
    marker.setAttribute('aria-label', `${city.name}${current ? '，当前城池' : canEnter ? '，可前往' : cleared.has(Number(city.id)) ? '，已通过' : locked ? '，尚未开放' : ''}`);
    if (canEnter) view.motion(scene, marker, 'FX_shanhetu_dituxuanze', { action:'play', y:0, offsetY:-16 });
    // tj.PicIDUrl uses _1, whereas _0 is the alternate city illustration.
    view.image(marker, view.asset(`season5/city/C_${city.pictureId}_1.png`), '', '');
    el('span', '', city.name, marker);
    if (current) {
      const pin = el('i', 'sht-world-location', null, marker);
      view.image(pin, view.portrait(run.character), '', '');
    }
  }
  const start = el('div', 'sht-world-start', null, scene);
  view.button(start, `‹ 难度 · ${currentDifficulty(view)?.name || '普通1'} ›`, () => { view.draftDifficulty = run?.difficulty || view.difficulty; view.difficultyOpen = true; }, { className: 'sht-difficulty-trigger', title: run && !run.settled ? '查看当前征程难度' : '选择征程难度' });
  const joinButton = view.button(start, choosingRoute ? '选择路线' : run ? '继续征程' : '开始征程', () => {
    if (choosingRoute) { showMap(view); return; }
    if (run) showMap(view); else view.screen = 'select';
  }, { primary: true, className: 'sht-world-start-button' });
  view.motion(scene, joinButton, 'OL_SHT_anniu', { action:'play' });
  if (choosingRoute) el('p', 'sht-world-route-hint', '点击亮起的城池，查看并确认下一段路线', start);
  const shortcuts = el('div', 'sht-world-shortcuts', null, scene);
  iconButton(view, shortcuts, '查看武将', 'ui/roguelikebigmap/bigmap_pool_btn.png', () => {
    if (run) return inspectGeneral(view, run.character);
    view.screen = 'select';
  });
  iconButton(view, shortcuts, '山河册', 'ui/roguelikebigmap/bigmap_rogue_btn.png', () => { view.tab = 'tree'; });
  if (view.difficultyOpen) renderDifficulty(view);
}

export function renderSelection(view, body) {
  const scene = el('section', 'sht-selection', null, body);
  scene.dataset.sourceWindow = 'RogueSelectGeneralWindow';
  const top = el('div', 'sht-selection-top', null, scene);
  view.button(top, `‹ 难度 · ${currentDifficulty(view)?.name || '普通1'} ›`, () => { view.draftDifficulty = view.difficulty; view.difficultyOpen = true; }, { className: 'sht-difficulty-trigger' });
  view.button(top, '山河图 · 初始战法', () => { view.tab = 'tree'; }, { className: 'sht-selection-loadout' });
  const loadout = view.campaign.profile.loadout || [];
  for (const id of loadout) {
    const tactic = view.adapters.resolve('tactic', id);
    const icon = view.button(top, '', () => inspect(view, 'tactic', id), { className: 'sht-tactic-orb', title: `${tactic?.name || id}：${tactic?.description || ''}`, focusKey: `loadout:${id}` });
    icon.setAttribute('aria-label', `查看战法：${tactic?.name || id}`);
    icon.dataset.rarity = Math.min(4, tactic?.rarity || 1); view.tacticIcon(icon, id);
  }
  const hero = view.selectedHero;
  const privilege = view.catalog.rules.GeneralRankPriv.find(item => Number(item.rank) === Number(view.rank) - 1) || {};
  const hp = Number(hero?.hp || 0) + Number(privilege.addHp || 0);
  const maxHp = Number(hero?.maxHp || hero?.hp || 0) + Number(privilege.addHp || 0);
  const skills = el('section', 'sht-selection-skills', null, scene);
  if (hero) {
    for (const id of hero.skills || []) {
      el('strong', 'sht-skill-name', view.adapters.skillName(id), skills);
      el('p', '', view.adapters.skillDescription(id), skills);
    }
    const portrait = view.portraitCard(scene, { ...hero, hp, maxHp, armor: Number(privilege.addShield || 0) }, 'sht-selection-portrait');
    makePortraitInspectable(view, portrait, hero.id, { hp, maxHp });
  }
  const settings = el('section', 'sht-selection-settings', null, scene);
  el('h2', '', hero?.name || '请选择武将', settings);
  const label = el('label', '', '等阶 ', settings);
  const rank = el('select', 'sht-input', null, label); rank.setAttribute('aria-label', '武将等阶');
  for (let i = 1; i <= 5; i++) { const option = el('option', '', `${i}阶`, rank); option.value = i; }
  rank.value = view.rank; rank.onchange = () => { view.rank = Number(rank.value); view.render(); };
  el('p', 'sht-small', `体力 ${hp} / ${maxHp}`, settings);
  const bonuses = [['addShield', '初始护甲'], ['addFirstCard', '起始手牌'], ['addcard', '摸牌数'], ['addsha', '出杀次数']]
    .filter(([key]) => Number(privilege[key]) > 0).map(([key, name]) => `${name} +${privilege[key]}`);
  if (privilege.exSkills) bonuses.push('本次征程可重生一次');
  el('p', 'sht-small sht-selection-privileges', bonuses.join(' · ') || '无额外等阶加成', settings);
  view.button(settings, '确认出征', () => startSelection(view), { primary: true, className: 'sht-start-button', disabled: !hero });
  el('small', 'sht-selection-confirm-hint', '再次点击已选武将也可确认出征', settings);
  const roster = el('section', 'sht-selection-roster', null, scene);
  const controls = el('div', 'sht-selection-controls', null, roster);
  const search = el('input', 'sht-input', null, controls); search.value = view.query; search.placeholder = '搜索武将'; search.setAttribute('aria-label', '搜索武将');
  const pager = el('div', 'sht-pager', null, controls);
  const row = el('div', 'sht-candidate-row', null, roster);
  const draw = () => {
    row.replaceChildren(); pager.replaceChildren();
    const query = view.query.toLowerCase();
    const heroes = view.adapters.characterList.filter(x => `${x.name} ${x.id}`.toLowerCase().includes(query));
    const count = Math.max(1, Math.ceil(heroes.length / 6)); view.page = Math.max(0, Math.min(view.page, count - 1));
    view.button(pager, '‹', () => { view.page--; }, { disabled: view.page === 0, title: '上一页' });
    el('span', '', `${view.page + 1} / ${count}`, pager);
    view.button(pager, '›', () => { view.page++; }, { disabled: view.page >= count - 1, title: '下一页' });
    for (const item of heroes.slice(view.page * 6, view.page * 6 + 6)) {
      const selected = hero?.id === item.id;
      // $cs.onClickGeneralCard selects on the first click and submits an
      // already-selected general on the next click. Retain a visible confirm too.
      const button = view.button(row, '', () => {
        if (view.selectedHero?.id === item.id) return startSelection(view);
        view.selectedHero = item;
      }, { className: `sht-hero sht-candidate ${selected ? 'sht-selected' : ''}`, focusKey: `hero:${item.id}` });
      button.setAttribute('aria-label', `选择${item.name}`); button.setAttribute('aria-pressed', String(selected));
      view.image(button, view.portrait(item.id), '', ''); el('span', '', item.name, button);
    }
    if (!heroes.length) el('p', '', '没有找到武将', row);
  };
  search.oninput = () => { view.query = search.value; view.page = 0; draw(); }; draw();
  if (view.difficultyOpen) renderDifficulty(view);
}

export function renderChapterMap(view, body) {
  const run = view.campaign.run, city = view.campaign.currentCity();
  const scene = el('section', 'sht-chapter-scene', null, body);
  scene.dataset.sourceScene = 'RogueSmallMapScene';
  const map = el('div', 'sht-map', null, scene);
  map.style.backgroundImage = `url("${view.asset(`season5/map/${city.mapImage || `map5_${city.id}.png`}`)}")`;
  const nodes = view.campaign.nodes();
  const switchingBattle = Boolean(view.campaign.canSwitchBattle?.());
  const lastNode = Number(run.source?.nodeId || [...(run.completed || [])].reverse().find(id => nodes.some(node => Number(node.id) === Number(id))));
  for (const [i, node] of nodes.entries()) {
    const source = city.nodes.find(x => Number(x.id) === Number(node.id));
    const coords = source?.position || [0, 0];
    const done = ['completed', 'done', 'cleared'].includes(node.status), locked = node.status === 'locked' || node.disabled;
    const chosen = lastNode === Number(node.id);
    const resume = Boolean(run.pending && run.pending.kind !== 'route' && Number(run.source?.nodeId) === Number(node.id));
    const previewBoss = Boolean(node.boss && locked && (!run.pending || switchingBattle));
    const button = view.button(map, '', () => {
      if (resume) { view.encounterCollapsed = false; return; }
      if (previewBoss) {
        const battle = view.catalog.indexes.battles.get(Number(node.battleId));
        const enemies = view.catalog.indexes.enemyGroups.get(Number(node.groupId))?.generals || [];
        return inspect(view, { kind: 'battle', name: node.title, description: [node.lockedReason, battle?.description, enemies.length ? `敌军：${enemies.map(enemy => enemy.name).join('、')}` : ''].filter(Boolean).join('\n\n') });
      }
      return dispatch(view, 'enterNode', { nodeId: node.id });
    }, {
      disabled: !resume && (done || locked && !previewBoss || Boolean(run.pending) && !(switchingBattle && node.kind === 'battle')), focusKey: `node:${node.id}`, title: resume ? `继续${kindNames[run.pending.kind] || '当前事件'}` : node.lockedReason || `${node.title} · ${kindNames[node.kind] || '探索'}`,
      className: `sht-map-node ${done ? 'cleared' : ''} ${locked ? 'locked' : ''} ${node.boss ? 'boss' : ''} ${chosen ? 'sht-current-node' : ''}`,
    });
    button.dataset.nodeId = node.id;
    button.dataset.kind = node.kind;
    button.setAttribute('aria-label', `${source?.name || node.name}，${node.title}，${resume ? '继续当前事件' : done ? '已完成' : previewBoss ? '首领尚未现身，可查看详情' : locked ? '未开放' : '可探索'}`);
    button.style.left = `${50 + Number(coords[0]) / 17.5}%`; button.style.top = `${50 - Number(coords[1]) / 7.5}%`;
    const art = el('span', 'sht-node-art', null, button);
    if (source?.picture) {
      const sprite = view.image(art, view.asset(`season5/city/${source.picture}.png`), '', 'sht-node-sprite');
      const nativeSize = () => {
        sprite.style.width = `${sprite.naturalWidth * SOURCE_SCALE}px`;
        sprite.style.height = `${sprite.naturalHeight * SOURCE_SCALE}px`;
      };
      sprite.addEventListener('load', nativeSize, { once: true });
      if (sprite.complete && sprite.naturalWidth) nativeSize();
    }
    if (!done) {
      const name = node.boss ? (locked ? 'roguesmallmap/smallmap_boss_icon_dis.png' : 'roguesmallmap/smallmap_boss_icon.png') : `roguecommon/rogue_event${({ battle: '3', event: '2', camp: '1', shop: '4' })[node.kind] || '2'}.png`;
      const fallback = view.image(art, view.asset(`ui/${name}`), '', 'sht-node-marker');
      if (!locked && ['battle','event','camp'].includes(node.kind)) {
        const elite = view.catalog.indexes.battles.get(Number(node.battleId))?.elite;
        const action = node.boss ? 'play3' : node.kind === 'event' ? 'play4' : node.kind === 'camp' ? 'play5' : elite ? 'play2' : 'play';
        view.motion(map, art, 'OL_RouG_guanqia_rukou', { action, x:110/220, y:94/200, fallback });
      }
    }
    el('strong', 'sht-node-label', source?.name || node.name || `据点${i + 1}`, button);
    if (chosen) {
      view.motion(map, art, 'OL_fx_map_tishi', { action:'play2', x:110/220, y:97/200 });
      const pin = el('span', 'sht-location-pin', null, art);
      view.image(pin, view.portrait(run.character), '', '');
    }
  }
  const shop = iconButton(view, scene, '进入集市', 'ui/roguesmallmap/smallmap_shop_btn.png', () => {
    dispatch(view, 'openShop');
    view.encounterCollapsed = false;
  }, 'sht-map-shop');
  shop.disabled = !view.campaign.canOpenShop();
  iconButton(view, scene, '征程状态', 'ui/roguelikebigmap/bigmap_lv_btn.png', () => { view.inventoryOpen = true; }, 'sht-map-status');
  const effects = view.campaign.currentEffects?.() || [];
  if (effects.length) {
    const label = Number(run.difficulty) >= 100 ? '绝境效果' : '征程突变';
    const button = view.button(scene, label, () => inspectCurrentEffects(view), { className: 'sht-map-effects', focusKey: 'scene:effects', title: effects.map(item => item.name).join('、') });
    view.image(button, view.asset(`ui/roguecommon/seed_bg_${Math.max(1, Math.min(4, Number(effects[0].level || 1)))}.png`), '', '');
  }
  renderHud(view, scene);
  renderEarnedCards(view, scene);
  if (run.pending) {
    const resume = el('div', 'sht-encounter-resume', null, scene);
    view.button(resume, `继续${kindNames[run.pending.kind] || '处理'}`, () => { view.encounterCollapsed = false; }, { primary: true });
  }
  if (view.inventoryOpen) renderInventorySheet(view);
}

function renderHud(view, scene) {
  const run = view.campaign.run, hero = view.adapters.characterList.find(x => x.id === run.character) || { id: run.character, name: run.character, skills: [] };
  const hud = el('aside', 'sht-player-hud', null, scene); hud.setAttribute('aria-label', '武将与战法');
  const tactics = el('div', 'sht-hud-tactics', null, hud);
  const owned = run.tactics || [];
  for (let i = 0; i < Math.max(9, owned.length); i++) {
    const id = owned[i], item = id == null ? null : view.adapters.resolve('tactic', id);
    const orb = view.button(tactics, '', () => inspect(view, 'tactic', id), { className: `sht-tactic-orb ${item ? 'sht-orb-filled' : ''}`, disabled: !item, title: item ? `${item.name}：${item.description}` : '战法槽', focusKey: `tactic:${id ?? i}` });
    orb.setAttribute('aria-label', item ? `查看战法：${item.name}` : '空战法槽');
    if (item) { orb.dataset.rarity = Math.min(4, item.rarity || 1); view.tacticIcon(orb, id); el('small', '', item.name.replace(/[·\s]/g, '').slice(0, 3), orb); }
  }
  const skills = el('div', 'sht-hud-skills', null, hud);
  const compact = Math.max(run.skillSlots || 0, run.maxSkillSlots || 0, run.skills?.length || 0) <= 3 && hero.skills.length <= 2;
  if (compact) skills.classList.add('sht-hud-skills-compact');
  for (let i = 0; i < Math.max(3, run.skillSlots || 0, run.maxSkillSlots || 0, run.skills?.length || 0); i++) {
    const id = run.skills?.[i], item = id == null ? null : view.adapters.resolve('skill', id);
    const button = view.button(skills, item?.name || (i >= (run.skillSlots || 2) ? '未解锁' : '技能槽'), () => inspect(view, 'skill', id), { className: 'sht-hud-skill', disabled: !item, title: item?.description, focusKey: `skill:${id ?? i}` });
    button.dataset.slot = i;
  }
  for (const [index, item] of innateSkillsForView(view, hero).entries()) {
    const button = view.button(skills, item.name, () => inspect(view, item), { className: 'sht-hud-skill sht-native-skill', title: item.description, focusKey: `native-skill:${item.nativeSlot || item.nativeId}` });
    button.dataset.native = index;
  }
  if (run.rebirthAvailable) view.button(skills, '重生⁺', () => inspect(view, { kind: 'skill', name: '重生', description: '本次征程可重生一次；战败后可保留征程继续挑战。' }), { className: 'sht-hud-skill sht-native-skill sht-hud-rebirth', title: '本次征程可重生一次' });
  const portrait = view.portraitCard(hud, { ...hero, hp: run.hp, maxHp: run.maxHp, armor: run.stats?.armor || 0, equips: (run.equips || []).map(value => view.equipmentDetails(value)) }, 'sht-hud-portrait');
  makePortraitInspectable(view, portrait, run.character);
  if (run.allies?.length) {
    const ally = el('div', 'sht-hud-allies', null, hud);
    for (const item of run.allies) {
      const group = view.catalog.indexes.enemyGroups.get(Number(item.groupId ?? item.id ?? item));
      const general = group?.generals?.[0];
      const native = view.adapters.characterList.find(hero => hero.id === item.character) || (general && view.adapters.characterByName?.(general.name));
      const name = native?.name || item.name || general?.name || '同行队友';
      const button = view.button(ally, '', () => native ? inspectGeneral(view, native.id, item) : inspect(view, { kind: 'general', name, description: general?.description || '与你同行的队友。' }), { title: name, className: 'sht-ally-card' });
      const avatar = general && originalEnemyAvatar(view.baseURL, general);
      if (avatar || native) view.image(button, avatar || view.portrait(native.id), '', '');
      el('span', '', name, button);
    }
  }
}

export function renderEarnedCards(view, scene) {
  const run = view.campaign.run;
  if (!run.cards?.length) return;
  const strip = el('section', 'sht-earned-cards', null, scene); strip.setAttribute('aria-label', '本次征程获得的手牌');
  for (const card of run.cards) {
      const id = card.id ?? card, resolved = view.adapters.resolve('card', id);
      const button = view.button(strip, '', () => inspect(view, 'card', id), { className: 'sht-earned-card', title: `手牌 · ${resolved?.name || id}\n${resolved?.description || ''}`, focusKey: `hand:${id}` });
      button.setAttribute('aria-label', `手牌：${resolved?.name || id}`);
      view.cardThumb(button, id, 'sht-earned-card-face');
  }
}

function renderInventorySheet(view) {
  const dialog = view.openSheet('sht-inventory-dialog', '征程状态');
  const heading = el('div', 'sht-section-head', null, dialog);
  el('h2', '', '征程状态', heading);
  view.button(heading, '返回地图', () => { view.inventoryOpen = false; });
  const run = view.campaign.run;
  const hero = view.adapters.characterList.find(item => item.id === run.character);
  el('h3', '', `${hero?.name || run.character} · ${run.rank}阶`, dialog);
  const summary = el('p', 'sht-status-summary', `体力 ${run.hp} / ${run.maxHp} · 护甲 ${run.stats?.armor || 0} · `, dialog);
  copperAmount(view, summary, run.copper || 0);
  for (const skill of innateSkillsForView(view, hero)) {
    const row = view.button(dialog, '', () => inspect(view, skill), { className: 'sht-status-row' });
    el('strong', '', skill.name, row); el('p', '', skill.description, row);
  }
  for (const [field, kind, name] of [['skills', 'skill', '额外技能'], ['tactics', 'tactic', '战法'], ['equips', 'card', '初始装备'], ['cards', 'card', '初始手牌']]) {
    el('h3', '', name, dialog);
    for (const value of run[field] || []) {
      const item = view.adapters.resolve(kind, value.id ?? value);
      const row = view.button(dialog, '', () => inspect(view, kind, value.id ?? value), { className: 'sht-status-row' });
      el('strong', '', item?.name || String(value.id ?? value), row); el('p', '', item?.description || '', row);
    }
    if (!run[field]?.length) el('p', 'sht-muted', '暂无', dialog);
  }
  const journal = el('details', 'sht-journal', null, dialog); el('summary', '', '行军札记', journal);
  for (const entry of (run.log || []).slice(-8).reverse()) el('div', '', entry.text || entry.message || entry, journal);
  dialog.addEventListener('cancel', event => { event.preventDefault(); view.inventoryOpen = false; view.render(); }); dialog.showModal();
}
