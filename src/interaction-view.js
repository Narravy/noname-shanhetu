import { plain } from './adapters.js';

function el(tag, cls, text, parent) {
  const node = document.createElement(tag); node.className = cls;
  if (text != null) node.textContent = plain(text);
  parent?.appendChild(node); return node;
}

// Like the original nested selection/replacement windows: selecting is only a
// draft. Closing, Escape and Cancel never send a command or mutate the campaign.
export function choose(view, input = {}, options = {}) {
  const config = Array.isArray(input) ? { ...options, choices: input } : input;
  if (!view.root) return Promise.resolve(null);
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const dialog = view.openSheet('sht-prompt-dialog', config.title || '请选择');
    const panel = el('section', 'sht-prompt-panel', null, dialog);
    el('h2', 'sht-prompt-title', config.title || '请选择', panel);
    if (config.description) el('p', 'sht-prompt-description', config.description, panel);
    let selection = null, settled = false;
    const finish = value => {
      if (settled) return; settled = true;
      view.transientDialogs?.delete(finish);
      dialog.close(); dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      resolve(value);
    };
    view.transientDialogs ??= new Set(); view.transientDialogs.add(finish);
    const list = el('div', 'sht-prompt-choices', null, panel);
    list.setAttribute('role', 'group'); list.setAttribute('aria-label', config.title || '选项');
    const buttons = [];
    const footer = el('div', 'sht-prompt-footer', null, panel);
    const cancel = el('button', 'sht-button sht-prompt-cancel', config.cancelText || '取消', footer);
    cancel.type = 'button'; cancel.onclick = () => finish(null);
    const confirm = el('button', 'sht-button sht-primary sht-prompt-confirm', config.confirmText || '确定', footer);
    confirm.type = 'button'; confirm.disabled = !config.immediate;
    confirm.onclick = () => finish(config.immediate ? true : selection);
    for (const option of config.choices || []) {
      const button = el('button', 'sht-button sht-prompt-option', null, list);
      button.type = 'button'; button.dataset.choiceId = String(option.id);
      button.disabled = Boolean(option.disabled || option.supported === false);
      button.setAttribute('aria-pressed', 'false');
      if (option.kind === 'tactic' && option.itemId != null) view.tacticIcon(button, option.itemId, 'sht-prompt-icon');
      el('strong', '', option.name || option.label || String(option.id), button);
      if (option.description) el('span', 'sht-prompt-option-description', option.description, button);
      if (button.disabled && option.disabledReason) el('small', '', option.disabledReason, button);
      button.onclick = () => {
        selection = option.id; confirm.disabled = false;
        for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
      };
      buttons.push(button);
    }
    if (!buttons.length) list.remove();
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(null); }
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); finish(null); });
    dialog.addEventListener('close', () => finish(null));
    dialog.showModal();
    // Focus a harmless action. Keyboard Enter must not confirm a destructive
    // operation just because it opened from an already pressed button.
    (buttons.find(button => !button.disabled) || cancel).focus({ preventScroll: true });
  });
}

export async function confirm(view, message, options = {}) {
  const config = typeof message === 'object' ? message : { ...options, message };
  return (await choose(view, { ...config, title: config.title || '确认', description: config.message || config.description, immediate: true, choices: [] })) === true;
}

export function inspectItem(view, kind, id) {
  const item = typeof kind === 'object' ? kind : { ...view.adapters.resolve(kind, id), kind, itemId: id };
  if (!view.root || !item) return Promise.resolve();
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const dialog = view.openSheet('sht-prompt-dialog sht-item-dialog', item.name || '物品详情');
    const panel = el('section', 'sht-prompt-panel', null, dialog);
    let settled = false;
    const finish = () => {
      if (settled) return; settled = true;
      view.transientDialogs?.delete(finish); dialog.close(); dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); resolve();
    };
    view.transientDialogs ??= new Set(); view.transientDialogs.add(finish);
    el('h2', 'sht-prompt-title', item.name || '物品详情', panel);
    const body = el('div', 'sht-item-details', null, panel);
    const itemId = item.itemId ?? item.id;
    if (item.kind === 'tactic' && itemId != null) view.tacticIcon(body, itemId, 'sht-item-large-icon');
    else if (['card', 'equipment'].includes(item.kind) && itemId != null) view.cardThumb(body, itemId, 'sht-item-large-card');
    el('p', 'sht-item-description', item.description || '暂无说明', body);
    if (item.rarity) el('small', 'sht-item-quality', ['','普通','稀有','史诗','传说','神话'][item.rarity] || '', panel);
    const close = el('button', 'sht-button sht-primary sht-prompt-confirm', '关闭', panel);
    close.type = 'button'; close.onclick = finish;
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(); }
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); finish(); });
    dialog.addEventListener('close', finish);
    dialog.showModal(); close.focus({ preventScroll: true });
  });
}
