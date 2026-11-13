import { plain } from './adapters.js';

function el(tag, cls, text, parent) {
  const node = document.createElement(tag); node.className = cls;
  if (text != null) node.textContent = plain(text);
  parent?.appendChild(node); return node;
}

export function difficultyForView(view, id) {
  return view.catalog.indexes.difficulties.get(Number(id))
    || view.catalog.difficulties.find(item => Number(item.id) === Number(id));
}

export function renderDifficulty(view) {
  const dialog = view.openSheet('sht-difficulty-dialog', '选择征程难度');
  dialog.dataset.sourceWindow = 'RogueDiffcultyNewSelectWindow';
  const current = difficultyForView(view, view.draftDifficulty || view.difficulty) || view.catalog.difficulties[0];
  const group = Number(current.group), desperate = Number(current.id) >= 100;
  const inRun = Boolean(view.campaign.run && !view.campaign.run.settled);
  const available = view.campaign.difficultyAvailability?.(current.id) || { unlocked: group <= Number(view.campaign.profile.highestGroup || 1), reason: '通关上一档难度后解锁' };
  const panel = el('section', 'sht-difficulty-window sht-difficulty-expanded', null, dialog);
  panel.dataset.difficultyId = current.id;
  panel.style.setProperty('--difficulty-art', `url("${view.asset(desperate ? 'desperate/bg_ex.png' : `backgrounds/rogue_dungeon_lv${group}.png`)}")`);
  const tabs = el('nav', 'sht-difficulty-tabs', null, panel); tabs.setAttribute('aria-label', '大难度');
  for (const [i, name] of ['普通', '中等', '困难', '噩梦', '炼狱'].entries()) {
    const first = view.catalog.difficulties.find(item => Number(item.group) === i + 1);
    if (!first) continue;
    const unlocked = view.campaign.difficultyAvailability?.(first.id)?.unlocked ?? i + 1 <= Number(view.campaign.profile.highestGroup || 1);
    const tab = view.button(tabs, name, () => { view.draftDifficulty = first.id; }, { className: group === i + 1 ? 'active' : '', title: name, focusKey: `difficulty-group:${i + 1}` });
    tab.setAttribute('aria-pressed', String(group === i + 1));
    if (!unlocked) view.image(tab, view.asset('ui/roguediffcultynewselect/newselect_suo_kao_bei.png'), '未解锁', 'sht-difficulty-lock');
  }
  const content = el('div', 'sht-difficulty-content', null, panel);
  const exLevels = (view.catalog.desperateDifficulties || []).filter(item => Number(item.group) === group);
  if (exLevels.length) {
    const modes = el('nav', 'sht-difficulty-modes', null, content); modes.setAttribute('aria-label', '难度类别');
    for (const [isEX, name] of [[false, '常规'], [true, '绝境']]) {
      const button = view.button(modes, name, () => {
        view.draftDifficulty = (isEX ? exLevels : view.catalog.difficulties.filter(item => Number(item.group) === group))[0].id;
      }, { className: desperate === isEX ? 'active' : '', focusKey: `difficulty-mode:${name}` });
      button.setAttribute('aria-pressed', String(desperate === isEX));
    }
  }
  el('h2', '', `难度 · ${current.name}`, content);
  const levels = el('div', 'sht-difficulty-levels', null, content);
  levels.setAttribute('aria-label', desperate ? '绝境层数' : '难度档位');
  for (const item of desperate ? exLevels : view.catalog.difficulties.filter(item => Number(item.group) === group)) {
    const selected = Number(current.id) === Number(item.id);
    const unlocked = view.campaign.difficultyAvailability?.(item.id)?.unlocked ?? available.unlocked;
    const button = view.button(levels, '', () => { view.draftDifficulty = item.id; }, { className: `${selected ? 'active' : ''} ${unlocked ? '' : 'sht-level-locked'}`, title: item.name, focusKey: `difficulty:${item.id}` });
    const prefix = group === 4 ? selected ? 'emng' : 'emeng' : ['putong', 'zhongdeng', 'kunnan', '', 'lianyu'][group - 1];
    view.image(button, view.asset(`ui/roguediffcultynewselect/${prefix}_icon_${selected ? 'sel' : 'nrm'}.png`), '', 'sht-difficulty-level-icon');
    el('span', '', String(desperate ? item.stage : (Number(item.id) - 1) % 5 + 1), button);
    button.setAttribute('aria-label', `${item.name}${unlocked ? '' : '，未解锁'}`); button.setAttribute('aria-pressed', String(selected));
    if (selected) view.motion(dialog, button, 'rouge_jindu', { action: 'animation', opacity: .8 });
  }
  const description = el('div', 'sht-difficulty-description', null, content);
  el('p', '', current.description || current.effects?.join('\n') || (group === 1 ? '普通难度每场战斗结束后恢复体力。' : '敌军将随征程月份逐步增强。'), description);
  if (!desperate && group >= 4) el('p', 'sht-difficulty-mutation-note', '出征时选择一种突变，持续整个征程。', description);
  const progress = !available.unlocked && available.required != null ? `（${Number(available.progress || 0)} / ${available.required}）` : '';
  const note = inRun ? '征程进行中，当前难度不可更改' : !available.unlocked ? `${available.reason || '尚未解锁'}${progress}` : desperate ? Number(current.stage) >= 9 ? '当前为此难度最高层绝境' : '通关本层后解锁下一层绝境' : '选择难度后点击确定；通关可解锁更高难度';
  el('p', 'sht-difficulty-note', note, panel);
  view.button(panel, '确定', () => { view.difficulty = Number(current.id); view.difficultyOpen = false; }, { primary: true, className: 'sht-difficulty-confirm', disabled: inRun || !available.unlocked });
  view.button(dialog, '↶', () => { view.difficultyOpen = false; }, { className: 'sht-sheet-back', title: '取消' });
  dialog.addEventListener('cancel', event => { event.preventDefault(); view.difficultyOpen = false; view.render(); });
  dialog.showModal();
}
