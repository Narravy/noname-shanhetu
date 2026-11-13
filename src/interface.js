import { plain } from './adapters.js';
import { renderSceneHeader, renderOverworld, renderSelection, renderChapterMap } from './scene-view.js';
import { renderTree, closeTreeOverlay } from './tree-view.js';
import { renderEncounter } from './encounter-view.js';
import { renderMutation } from './mutation-view.js';
import { cardArt, cardThumb, equipmentDetails } from './card-view.js';
import { tacticIcon } from './tactic-view.js';
import { copperIcon, copperAmount } from './currency-view.js';
import { renderOLPortrait } from './ol-portrait-view.js';
import { LocalCampaignService } from './local-service.js';
import { choose, confirm as confirmDialog, inspectItem } from './interaction-view.js';
import { addMotion, beginMotions, finishMotions, disposeMotions } from './motion-view.js';
import { isForeignModeTactic } from './foreign-mode-tactics.js';
import { renderCharacterTraits } from './character-trait-view.js';

const kinds = { battle: '战役', event: '奇遇', camp: '营地', shop: '集市', reward: '收获', route: '行军', ending: '征程结算', removeTactic: '涤净', mutation: '难度突变', army: '选择军备' };
const quality = ['未定', '普通', '稀有', '史诗', '传说', '神话'];
const typeIcons = { skill: 'skill', tactic: 'tactics', card: 'card', equipment: 'weapon', 技能: 'skill', 战法: 'tactics', 卡牌: 'card', 装备: 'weapon' };

function el(tag, className, text, parent) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = plain(text);
  parent?.appendChild(element);
  return element;
}

export class CampaignUI {
  constructor({ campaign, catalog, adapters, baseURL, portrait, onBattle, onExit, previewBattle, localService }) {
    Object.assign(this, { campaign, catalog, adapters, baseURL, portrait, onBattle, onExit, previewBattle });
    this.service = localService || new LocalCampaignService(campaign);
    this.tab = 'campaign'; this.query = ''; this.page = 0; this.glossaryKind = 'tactic';
    this.selectedHero = adapters.characterList.find(x => x.id === 'caocao') || adapters.characterList[0];
    this.difficulty = 1; this.rank = 1;
  }

  mount() {
    if (this.root) this.destroy();
    this.root = el('div', 'sht-root', null, document.body);
    this.root.setAttribute('role', 'application');
    this.root.setAttribute('aria-label', '山河图·诸侯伐董');
    this.root.addEventListener('contextmenu', event => event.stopPropagation());
    this.root.addEventListener('click', event => event.stopPropagation());
    this.root.addEventListener('keydown', event => event.stopPropagation());
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.fitStage());
    this.resizeObserver.observe(this.root);
    this.render();
    return this;
  }

  destroy() { disposeMotions(this, {releaseAssets:true}); this.closeTransientDialogs(); this.resizeObserver?.disconnect(); clearTimeout(this.toastTimer); this.root?.remove(); this.root = null; this.pendingImages?.clear(); delete this.developerGesture; }

  motion(host, anchor, name, options) { return addMotion(this, host, anchor, name, options); }
  adventurePortrait(event) {
    const art = this.catalog.adventureArt?.byShowrole?.[String(event?.raw?.showrole || '')];
    return art ? this.baseURL + art.path : null;
  }

  closeTransientDialogs() { for (const close of this.transientDialogs || []) close(null); }
  choose(input, options) { return choose(this, input, options); }
  confirm(message, options) { return confirmDialog(this, message, options); }
  inspectItem(kind, id) { return inspectItem(this, kind, id); }
  closeTreeOverlay() { return closeTreeOverlay(this); }
  dispatch(command, payload) {
    const before = this.campaign.run ? { id:this.campaign.run.id, month:this.campaign.run.month, chapter:this.campaign.run.chapter } : null;
    const selected = command === 'takeReward' ? this.campaign.run?.pending?.choices?.find(item => item.id === payload?.id) : null;
    const response = this.service.request(command, payload);
    const run = this.campaign.run;
    if (run && before?.id === run.id && before.chapter === run.chapter && run.month > before.month) {
      this.sceneEffects ??= new Set(); this.sceneEffects.add('month');
      const threshold = Number(this.catalog.rules.ChapterCS.find(row => Number(row.chapter) === Number(run.chapter))?.apptime ?? 4);
      if (before.month < threshold && run.month >= threshold) this.sceneEffects.add('boss');
    }
    if (selected?.kind === 'tactic') { this.sceneEffects ??= new Set(); this.sceneEffects.add('tactic:' + selected.itemId); }
    if (command === 'startRun' || command === 'chooseCity') this.screen = 'map';
    if (command === 'next' && !this.campaign.run) this.screen = 'home';
    const notice = { buy: '购买成功', refreshShop: '刷新成功', camp: '整备完成', unlockTree: '解锁成功', unlockTreePath: '解锁成功', setLoadout: '初始战法已保存' }[command];
    if (notice) this.pendingToast = notice;
    if (selected) this.pendingToast = selected.kind === 'skip' ? '已放弃本次奖励' : `获得${selected.kind === 'card' ? '手牌' : ''}【${selected.name}】`;
    return response;
  }

  fitStage() {
    if (!this.root) return;
    const scale = Math.min(this.root.clientWidth / 1280, this.root.clientHeight / 580);
    this.root.style.setProperty('--sht-stage-scale', String(scale || 1));
  }

  openSheet(className, label) {
    const dialog = el('dialog', `sht-sheet ${className}`, null, this.root);
    dialog.setAttribute('aria-label', label);
    return dialog;
  }

  cardArt(id) { return cardArt(this, id); }
  cardThumb(parent, id, className) { return cardThumb(this, parent, id, className); }
  equipmentDetails(value) { return equipmentDetails(this, value); }
  tacticIcon(parent, id, className) { return tacticIcon(this, parent, id, className); }

  button(parent, text, action, options = {}) {
    const button = el('button', `sht-button ${options.primary ? 'sht-primary' : ''} ${options.className || ''}`, text, parent);
    button.type = 'button'; button.disabled = Boolean(options.disabled);
    button.dataset.focusKey = options.focusKey || text;
    if (options.title) button.title = options.title;
    button.onclick = async event => {
      event.stopPropagation();
      this.restoreFocusKey = button.dataset.focusKey;
      button.disabled = true;
      try { await action(); if (this.root) this.render(); }
      catch (error) { this.toast(error.message || String(error)); button.disabled = Boolean(options.disabled); }
    };
    return button;
  }

  toast(message) {
    clearTimeout(this.toastTimer);
    this.root?.querySelector('.sht-toast')?.remove();
    const node = el('div', 'sht-toast', message, [...this.root?.querySelectorAll('dialog[open]') || []].at(-1) || this.root);
    node.setAttribute('role', 'alert'); this.toastTimer = setTimeout(() => node.remove(), 5500);
  }

  image(parent, src, alt, className = '') {
    const img = el('img', className, null, parent);
    img.alt = alt; img.loading = 'lazy';
    img.onerror = () => { img.style.display = 'none'; };
    const assign = url => {
      if (typeof url === 'string' && url) img.src = url;
      else img.style.display = 'none';
    };
    if (src && typeof src.then === 'function') {
      // Database portraits resolve asynchronously. A page switch must not load
      // the old portrait into a discarded image or revive a destroyed view.
      const pending = this.pendingImages ||= new Set();
      const task = Promise.resolve(src).then(url => {
        if (this.root?.contains(img)) assign(url);
      }, () => {
        if (this.root?.contains(img)) img.style.display = 'none';
      }).finally(() => pending.delete(task));
      pending.add(task);
    } else assign(src);
    return img;
  }

  get imageReady() { return Promise.all(this.pendingImages || []); }

  asset(path) { return `${this.baseURL}assets/${path}`; }

  portraitCard(parent, hero, className = '') {
    return renderOLPortrait(this, parent, hero, className);
  }

  itemIcon(parent, kind, className = '') {
    if (kind === 'copper' || kind === '铜币') return copperIcon(this, parent, `sht-item-icon ${className}`, '');
    return this.image(parent, this.asset(`ui/rogueadventureselect/select_${typeIcons[kind] || 'stat'}_icon.png`), '', `sht-item-icon ${className}`);
  }

  render() {
    if (!this.root) return;
    this.pendingImages?.clear();
    beginMotions(this);
    this.closeTransientDialogs();
    const run = this.campaign.run;
    const scrollTop = this.root.dataset.tab === this.tab ? this.root.querySelector('.sht-scroll-page')?.scrollTop || 0 : 0;
    const focusKey = this.restoreFocusKey;
    this.restoreFocusKey = null;
    this.root.replaceChildren();
    this.root.dataset.tab = this.tab;
    const pendingKey = run?.pending ? [run.id, run.pending.kind, run.pending.nodeId, run.pending.battleId, run.pending.eventId, run.pending.title].join(':') : '';
    if (pendingKey !== this.pendingKey) {
      this.encounterCollapsed = false;
      // cYi.updateRogueData -> wBt.ShowChapterChange: BigSelectCity returns to
      // the world map before the player commits the next chapter.
      if (run?.pending?.kind === 'route') this.screen = 'world';
    }
    this.pendingKey = pendingKey;
    const mapVisible = Boolean(run && this.screen !== 'world');
    this.root.dataset.screen = run ? (mapVisible ? 'map' : 'world') : this.screen || 'home';
    this.fitStage();
    const stage = el('div', 'sht-stage', null, this.root);
    const body = el('main', 'sht-body', null, stage);
    if (this.tab === 'campaign') {
      if (mapVisible) renderChapterMap(this, body);
      else if (run) renderOverworld(this, body);
      else if (this.screen === 'select') renderSelection(this, body);
      else renderOverworld(this, body);
    } else if (this.tab === 'tree') renderTree(this, body);
    else if (this.tab === 'traits') renderCharacterTraits(this, body);
    else {
      const page = el('div', 'sht-scroll-page', null, body);
      if (this.tab === 'glossary') this.glossary(page);
      else if (this.tab === 'help') this.help(page);
      else this.saves(page);
      page.scrollTop = scrollTop;
    }
    renderSceneHeader(this, stage);
    if (mapVisible && run?.pending && this.tab === 'campaign' && !this.encounterCollapsed && !this.inventoryOpen) this.encounterDialog();
    if (mapVisible && this.tab === 'campaign' && !this.root.querySelector('dialog[open]')) {
      for (const effect of this.sceneEffects || []) {
        if (effect === 'boss') this.motion(stage,stage,'FX_SHT_SLCX',{ action:'play', loop:false });
        else if (effect === 'month') {
          const anchor=this.root.querySelector('.sht-month-fill');
          if (anchor) this.motion(stage,anchor,'OL_SHT_jindutiao',{ action:'play',x:1,loop:false });
        } else if (effect.startsWith('tactic:')) {
          const id=effect.slice(7), anchor=this.root.querySelector(`[data-focus-key="tactic:${id}"]`);
          if (anchor) this.motion(stage,anchor,'FX_sht_zhanfa',{ action:'loop',loop:false });
        }
      }
      this.sceneEffects?.clear();
    }
    finishMotions(this);
    if (focusKey && !this.root.querySelector('dialog[open]')) {
      const target = [...this.root.querySelectorAll('button:not(:disabled)')].find(button => button.dataset.focusKey === focusKey)
        || this.root.querySelector('.sht-encounter-resume button');
      target?.focus({ preventScroll: true });
    }
    if (this.pendingToast) { const message = this.pendingToast; this.pendingToast = null; this.toast(message); }
  }

  encounterDialog() {
    const pending = this.campaign.run.pending;
    const dialog = this.openSheet(`sht-encounter-dialog sht-encounter-${pending.kind}`, kinds[pending.kind] || '征程遭遇');
    const content = el('section', 'sht-ol-encounter', null, dialog);
    if (pending.kind === 'mutation') renderMutation(this, content, pending);
    else if (!renderEncounter(this, content, pending)) {
      content.className = `sht-panel sht-action sht-action-${pending.kind} sht-fallback-encounter`;
      this.pendingView(content);
    }
    // The shop has its own back button, which settles its existing visit state.
    if (pending.kind !== 'shop') this.button(dialog, '↶ 查看地图', () => { this.encounterCollapsed = true; }, { className: 'sht-encounter-back' });
    dialog.addEventListener('cancel', event => {
      event.preventDefault(); this.encounterCollapsed = true; this.render();
      this.root?.querySelector('.sht-encounter-resume button')?.focus();
    });
    dialog.showModal();
  }

  pendingView(parent) {
    const run = this.campaign.run, p = run.pending;
    if (!p) {
      el('div', 'sht-eyebrow', '整军待发', parent);
      el('h2', '', '请选择据点', parent);
      el('p', '', '探索据点推进月份；首领现身后可挑战守关战役，再选择下一条行军路线。', parent);
      el('p', 'sht-small sht-muted', '每次操作会自动保存。战斗中关闭游戏后，可返回同一场战斗。', parent);
      return;
    }
    el('div', 'sht-eyebrow', kinds[p.kind] || '征程', parent);
    if (p.kind === 'event') {
      const event = this.catalog.events.find(x => Number(x.id) === Number(p.eventId));
      el('h2', '', event?.name || p.title || '奇遇', parent);
      el('p', 'sht-story', event?.description || p.description || '', parent);
      const choices = p.choices || event?.options || [];
      choices.forEach((choice, index) => {
        const block = el('div', 'sht-choice', null, parent);
        let lossItem;
        if (choice.costChoices?.length) {
          const select = el('select', 'sht-input sht-wide', null, block);
          el('option', '', '请选择要交出的物品', select).value = '';
          for (const item of choice.costChoices) {
            const option = el('option', '', item.name || `物品 ${item.itemId ?? item.id}`, select);
            option.value = item.itemId ?? item.id;
          }
          select.onchange = () => { lossItem = select.value ? Number(select.value) : undefined; };
        }
        this.button(block, choice.text || choice.name || `选择 ${index + 1}`, () => this.dispatch('chooseEvent', { index: choice.index ?? index, lossItemId: lossItem }), { disabled: choice.disabled, className: 'sht-wide', title: choice.disabledReason || choice.reason });
        el('p', 'sht-small sht-muted', choice.disabledReason || choice.reason || choice.effect?.label || choice.description || '', block);
      });
    } else if (p.kind === 'route') {
      el('h2', '', '下一步，向何处进军？', parent);
      for (const city of this.campaign.availableCities()) {
        const route = el('article', 'sht-route-card', null, parent);
        this.image(route, this.asset(`season5/map/map5_${city.id}.png`), '', 'sht-route-preview');
        this.button(route, city.name || city.cityName, () => this.dispatch('chooseCity', { id: city.id }), { primary: true, className: 'sht-wide' });
        el('p', 'sht-small', city.description || '', route);
        el('p', 'sht-small sht-muted', city.effect || '无额外地形效果', route);
      }
    } else if (p.kind === 'ending') {
      el('h2', '', p.won || run.won ? '山河已定' : '征程暂歇', parent);
      el('p', 'sht-story', p.description || p.text || '此行所获已经记入山河册。整备战法，来日再征。', parent);
      if (p.folios) el('p', '', `获得 ${p.folios} 图册`, parent);
      this.button(parent, '返回出征界面', () => this.dispatch('next'), { primary: true, className: 'sht-wide' });
    } else {
      el('h2', '', p.title || '继续征程', parent);
      el('p', '', p.description || '', parent);
      this.button(parent, '继续', () => this.dispatch('next'), { primary: true });
    }
  }

  glossary(body) {
    const page = el('section', 'sht-page', null, body);
    el('h1', '', '征程图鉴', page);
    const controls = el('div', 'sht-section-head', null, page);
    for (const [id, name] of [['tactic', '战法'], ['skill', '技能'], ['card', '卡牌']]) this.button(controls, name, () => { this.glossaryKind = id; this.glossaryQuery = ''; }, { className: id === this.glossaryKind ? 'active' : '' });
    const input = el('input', 'sht-input', null, controls); input.placeholder = '搜索名称或效果'; input.value = this.glossaryQuery || ''; input.setAttribute('aria-label', '搜索图鉴');
    const list = el('div', 'sht-glossary', null, page);
    const render = () => {
      list.replaceChildren();
      const data = this.catalog[{ tactic: 'tactics', skill: 'skills', card: 'cards' }[this.glossaryKind]];
      const matches = data.filter(x => (this.glossaryKind !== 'tactic' || !isForeignModeTactic(x.id)) && `${x.name} ${x.description}`.includes(this.glossaryQuery || ''));
      el('div', 'sht-glossary-count sht-muted', `共 ${matches.length} 项；已适配条目会出现在征程奖励中。`, list);
      for (const source of matches) {
        const item = this.adapters.resolve(this.glossaryKind, source.id);
        const card = el('article', `sht-panel sht-catalog-item q${source.rarity || 1}`, null, list);
        if (this.glossaryKind === 'tactic') this.tacticIcon(card, source.id, 'sht-catalog-tactic-art');
        else this.itemIcon(card, this.glossaryKind);
        const price = el('small', 'sht-muted', `${quality[source.rarity] || ''} · `, card);
        copperAmount(this, price, source.price || 0);
        el('h3', '', source.name, card); el('p', 'sht-small', source.description, card);
        if (!item?.supported) el('small', 'sht-adaptation', '待适配 · 暂不进入可获得奖励池', card);
        else if (item.exact === false) {
          const details = el('details', 'sht-small', null, card);
          el('summary', '', '本地引擎效果', details); el('p', '', item.description, details);
        } else el('small', 'sht-supported', '已适配', card);
      }
    };
    input.oninput = () => { this.glossaryQuery = input.value; render(); }; render();
  }

  help(body) {
    const page = el('section', 'sht-page sht-prose', null, body);
    el('h1', '', '征程说明', page);
    el('h2', '', '离线扩展', page);
    el('p', '', '本扩展使用诸侯伐董的官方地图与配置，在无名杀引擎中运行战斗。征程、图册和山河册均保存在本机；不消耗官方推演图，也不连接官方账号。', page);
    el('p', '', '原版在线擂台、扮演其他玩家的首领、充值与账号奖励不在离线扩展中运行。部分技能和战法采用无名杀现有实现，差异可在图鉴展开查看；尚无实现的条目不会伪装成可用奖励。', page);
    el('h2', '', '三章征程', page);
    el('p', '', '广成关或虎牢关起步，在八处据点间自由探索。首领依章节进度在第5、7、8个月现身，击败后沿原版路线选择下一城。不同路线会抵达洛阳、河内或酸枣；中途失败则结算本次征程。普通难度战后回复体力，更高难度保留剩余体力。地形效果从困难难度开始生效。', page);
    el('h2', '', '养成与保存', page);
    el('p', '', '额外技能初始两槽，第一章后开放第三槽。初始手牌和装备在每场战斗重新发放。地图中的每次选择自动保存，出阵前也会保存；战斗完成后使用“返回山河图”进入下一步。', page);
    const details = el('details', '', null, page);
    el('summary', '', '展开原版赛季说明（含在线功能）', details);
    el('p', 'sht-story', this.catalog.season.description, details);
    if (this.catalog.notes) { el('h2', '', '配置说明', page); el('p', '', Array.isArray(this.catalog.notes) ? this.catalog.notes.join('\n') : this.catalog.notes, page); }
  }

  saves(body) {
    const page = el('section', 'sht-page sht-prose', null, body);
    el('h1', '', '征程存档', page);
    el('p', '', '自动保存当前征程及山河册进度。导出文件可用于备份，或迁移到另一套无名杀。', page);
    this.button(page, '导出存档', () => {
      const data = this.campaign.exportSave();
      const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = el('a', '', null, page);
      link.href = url; link.download = '山河图-诸侯伐董-存档.json'; link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, { primary: true });
    const input = el('input', 'sht-file', null, page); input.type = 'file'; input.accept = '.json,application/json'; input.setAttribute('aria-label', '导入山河图存档');
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error('存档文件过大');
        if (!await this.confirm('导入将替换当前山河图存档，建议先导出备份。继续？', { title: '导入存档' })) return;
        this.dispatch('importSave', { value: await file.text() }); this.screen = this.campaign.run ? 'map' : 'home'; this.render(); this.toast('存档导入成功');
      } catch (error) { this.toast(error.message); }
    };
    el('h2', '', '历次征程', page);
    const history = this.campaign.profile.history || [];
    if (!history.length) el('p', 'sht-muted', '尚无已结算征程。', page);
    for (const record of history.slice(0, 20)) {
      const row = el('div', 'sht-history', null, page);
      const name = this.adapters.characterList.find(x => x.id === record.character)?.name || record.character || '武将';
      el('strong', '', `${name} · ${record.won ? '通关' : '结束'}`, row);
      el('span', '', `难度 ${record.difficulty || 1} · 图册 ${record.folios || 0}`, row);
    }
  }
}
