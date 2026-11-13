import { plain } from './adapters.js';

function el(tag, cls, text, parent) {
  const node = document.createElement(tag); node.className = cls;
  if (text != null) node.textContent = plain(text);
  parent?.appendChild(node); return node;
}

function effectArt(view, parent, effect) {
  const quality = Math.max(1, Math.min(4, Number(effect.level || 1)));
  const emblem = el('span', `sht-mutation-emblem sht-mutation-quality-${quality}`, null, parent);
  // The card always retains its original quality emblem if an optional picture
  // is absent from an older offline package.
  const filename = String(effect.picture || '').split('/').pop();
  if (/^(?:seed_\d+|genericseed)\.png$/.test(filename)) view.image(emblem, view.asset(`mutations/${filename}`), '', 'sht-mutation-icon');
  return emblem;
}

export function renderMutation(view, parent, pending) {
  parent.classList.add('sht-mutation-scene');
  parent.dataset.sourceWindow = 'RogueDiffSeedSelectWindow';
  el('h2', 'sht-mutation-title', pending.title || '难度突变', parent);
  el('p', 'sht-mutation-subtitle', '选择一种突变，持续整个征程', parent);
  const key = `${view.campaign.run.id}:${pending.choices.map(item => item.id).join(',')}`;
  if (view.mutationDraftKey !== key) { view.mutationDraftKey = key; view.mutationDraft = null; }
  const choices = el('div', 'sht-mutation-choices', null, parent);
  choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', '突变');
  for (const item of pending.choices) {
    const selected = String(view.mutationDraft) === String(item.id), quality = Math.max(1, Math.min(4, Number(item.level || 1)));
    const card = view.button(choices, '', () => { view.mutationDraft = String(item.id); }, { className: `sht-mutation-card sht-mutation-quality-${quality} ${selected ? 'sht-mutation-selected' : ''}`, focusKey: `mutation:${item.id}` });
    card.dataset.mutationId = item.id; card.setAttribute('aria-pressed', String(selected)); card.setAttribute('aria-label', item.name);
    el('strong', 'sht-mutation-name', item.name, card);
    el('span', 'sht-mutation-reward', item.rewardDescription || '', card);
    effectArt(view, card, item);
    el('span', 'sht-mutation-description', item.description, card);
  }
  view.button(parent, '确定', () => view.dispatch('chooseMutation', { id: view.mutationDraft }), { primary: true, className: 'sht-ol-confirm sht-mutation-confirm', disabled: !pending.choices.some(item => String(item.id) === String(view.mutationDraft)) });
}

export function inspectCurrentEffects(view) {
  if (!view.root) return Promise.resolve();
  const effects = view.campaign.currentEffects?.() || [];
  const desperate = Number(view.campaign.run?.difficulty) >= 100;
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const dialog = view.openSheet('sht-prompt-dialog sht-effects-dialog', desperate ? '绝境效果' : '征程突变');
    const panel = el('section', 'sht-prompt-panel', null, dialog);
    el('h2', 'sht-prompt-title', desperate ? '绝境效果' : '征程突变', panel);
    const list = el('div', 'sht-effects-list', null, panel);
    for (const effect of effects) {
      const row = el('section', 'sht-effects-item', null, list);
      effectArt(view, row, effect);
      const body = el('div', 'sht-effects-description', null, row);
      el('h3', '', effect.name, body); el('p', '', effect.description, body);
      if (effect.rewardDescription) el('small', '', effect.rewardDescription, body);
    }
    if (!effects.length) el('p', '', '本次征程暂无突变效果', list);
    let settled = false;
    const finish = () => {
      if (settled) return; settled = true;
      view.transientDialogs?.delete(finish); dialog.close(); dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); resolve();
    };
    view.transientDialogs ??= new Set(); view.transientDialogs.add(finish);
    const close = el('button', 'sht-button sht-primary sht-prompt-confirm', '关闭', panel);
    close.type = 'button'; close.onclick = finish;
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
    dialog.addEventListener('close', finish);
    dialog.showModal(); close.focus({ preventScroll: true });
  });
}
