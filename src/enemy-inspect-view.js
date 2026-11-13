import { plain } from './adapters.js';
import { baseDifficultyId } from './desperate.js';

const openInspectors = new WeakMap();
let nextInspectorId = 0;

function el(tag, className, text, parent) {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = plain(text);
  parent?.appendChild(node);
  return node;
}

function skillDetails(view, enemy) {
  if (Array.isArray(enemy.skillDetails)) return enemy.skillDetails;
  const difficulty = baseDifficultyId(view.campaign.run?.difficulty);
  const allowed = new Set(['基础', ...(difficulty >= 6 ? ['中等'] : []), ...(difficulty >= 11 ? ['困难'] : []), ...(difficulty >= 16 ? ['噩梦'] : []), ...(difficulty >= 21 ? ['炼狱'] : [])]);
  return (enemy.skills || []).filter(skill => typeof skill !== 'object' || enemy.growth || allowed.has(skill.difficulty || '基础')).map(skill => {
    if (typeof skill === 'object') {
      const source = view.catalog.indexes?.spells?.get(Number(skill.id));
      return { ...skill, name: skill.name || source?.name || String(skill.id), description: skill.description || source?.description || '' };
    }
    return { name: view.adapters.skillName(skill), description: view.adapters.skillDescription(skill) };
  });
}

function effectDetails(parent, item, kind) {
  const block = el('section', 'sht-enemy-inspect-effect', null, parent);
  block.dataset.effectKind = kind;
  el('h3', 'sht-enemy-inspect-effect-name', item.name || '技能', block);
  const description = plain(item.description || item.sourceDescription || '').split(/\r?\n/)
    .filter(line => !/^\s*尚未接入[：:]/.test(line)).join('\n').trim();
  el('p', 'sht-enemy-inspect-description', description || '暂无技能说明', block);
}

/** Open the original-style enemy tip without submitting or rerendering its encounter. */
export function toggleEnemyInspector(view, anchor, hero, enemy) {
  const previous = openInspectors.get(view);
  if (previous?.anchor === anchor) { previous.close(); return; }
  previous?.close(false);
  if (!view.root?.contains(anchor)) return;
  const host = anchor.closest('dialog[open]') || view.root;
  const layer = el('div', 'sht-enemy-inspect-layer', null, host);
  const panel = el('section', 'sht-enemy-inspect-panel', null, layer);
  const id = `sht-enemy-inspect-${++nextInspectorId}`;
  panel.id = id;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', `${hero.name || '敌军'}的技能与加成${enemy.difficultyName ? '，' + enemy.difficultyName : ''}`);
  anchor.setAttribute('aria-expanded', 'true');
  anchor.setAttribute('aria-controls', id);
  const overview = el('aside', 'sht-enemy-inspect-overview', null, panel);
  view.portraitCard(overview, hero, 'sht-enemy-inspect-portrait');
  if (enemy.difficultyName) el('p', 'sht-enemy-inspect-difficulty', `当前难度：${enemy.difficultyName}`, overview);
  const list = el('div', 'sht-enemy-inspect-list', null, panel);
  list.tabIndex = 0;
  list.setAttribute('role', 'region');
  list.setAttribute('aria-label', '技能和其他加成，可上下滚动');
  const skills = skillDetails(view, enemy);
  for (const skill of skills) effectDetails(list, skill, 'skill');
  if (!skills.length) el('p', 'sht-enemy-inspect-empty', '无技能', list);
  if (enemy.tacticDetails?.length) {
    el('h2', 'sht-enemy-inspect-section-name', '战法', list);
    for (const tactic of enemy.tacticDetails) effectDetails(list, tactic, 'tactic');
  }
  const bonuses = el('section', 'sht-enemy-inspect-bonuses', null, list);
  el('h3', 'sht-enemy-inspect-effect-name', '其他加成', bonuses);
  for (const bonus of enemy.bonusDetails || []) el('p', 'sht-enemy-inspect-bonus', `${bonus.label}：${bonus.value}`, bonuses);
  if (!enemy.bonusDetails?.length) el('p', 'sht-enemy-inspect-bonus', '暂无加成信息', bonuses);
  const closeButton = el('button', 'sht-enemy-inspect-close', '×', panel);
  closeButton.type = 'button'; closeButton.setAttribute('aria-label', '关闭武将详情');
  const up = el('button', 'sht-enemy-inspect-scroll sht-enemy-inspect-up', '', panel);
  const down = el('button', 'sht-enemy-inspect-scroll sht-enemy-inspect-down', '', panel);
  for (const [button, label] of [[up, '向上查看技能'], [down, '向下查看技能和加成']]) {
    button.type = 'button'; button.setAttribute('aria-label', label);
  }
  let closed = false;
  function updateArrows() {
    if (closed) return;
    up.hidden = list.scrollTop < 2;
    down.hidden = list.scrollTop + list.clientHeight >= list.scrollHeight - 2;
  }
  function position() {
    if (closed || !host.isConnected || !anchor.isConnected) return;
    const hostRect = host.getBoundingClientRect(), anchorRect = anchor.getBoundingClientRect();
    const scale = hostRect.width / host.offsetWidth || 1;
    const width = Math.min(531, host.clientWidth - 48), height = Math.min(390, host.clientHeight - 48);
    panel.style.width = `${width}px`; panel.style.height = `${height}px`;
    const anchorLeft = (anchorRect.left - hostRect.left) / scale;
    const anchorRight = (anchorRect.right - hostRect.left) / scale;
    let left = anchorLeft - width - 16;
    if (left < 24 && anchorRight + width + 16 <= host.clientWidth - 24) left = anchorRight + 16;
    left = Math.max(24, Math.min(host.clientWidth - width - 24, left));
    const top = Math.max(24, Math.min(host.clientHeight - height - 24, (anchorRect.top + anchorRect.height / 2 - hostRect.top) / scale - height / 2));
    panel.style.left = `${left}px`; panel.style.top = `${top}px`;
    updateArrows();
  }
  function close(restoreFocus = true) {
    if (closed) return;
    closed = true;
    observer.disconnect();
    window.removeEventListener('resize', position);
    host.removeEventListener('cancel', cancel, true);
    view.transientDialogs?.delete(close);
    if (openInspectors.get(view)?.close === close) openInspectors.delete(view);
    layer.remove();
    anchor.setAttribute('aria-expanded', 'false'); anchor.removeAttribute('aria-controls');
    if (restoreFocus !== false && anchor.isConnected && view.root?.contains(anchor)) anchor.focus({ preventScroll: true });
  }
  function cancel(event) { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  const observer = new ResizeObserver(position);
  observer.observe(host); observer.observe(list);
  window.addEventListener('resize', position);
  host.addEventListener('cancel', cancel, true);
  view.transientDialogs ||= new Set(); view.transientDialogs.add(close);
  openInspectors.set(view, { anchor, close });
  layer.addEventListener('pointerdown', event => event.stopPropagation());
  layer.addEventListener('click', event => { event.stopPropagation(); if (event.target === layer) close(); });
  layer.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'Tab') {
      const targets = [...panel.querySelectorAll('button,[tabindex="0"],summary')].filter(node => !node.disabled && node.getClientRects().length);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  closeButton.addEventListener('click', () => close());
  list.addEventListener('scroll', updateArrows, { passive: true });
  list.addEventListener('toggle', updateArrows, true);
  up.addEventListener('click', () => { list.scrollTop = Math.max(0, list.scrollTop - list.clientHeight * .75); updateArrows(); });
  down.addEventListener('click', () => { list.scrollTop += list.clientHeight * .75; updateArrows(); });
  position(); list.focus({ preventScroll: true });
  requestAnimationFrame(updateArrows);
}

/** Portraits remain readable by keyboard and touch, including inside encounters. */
export function bindEnemyInspector(view, card, hero, enemy) {
  card.classList.add('sht-enemy-inspect-target');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-haspopup', 'dialog');
  card.setAttribute('aria-expanded', 'false');
  card.setAttribute('aria-label', `查看${hero.name || '敌军'}的技能与加成`);
  const open = event => { event.preventDefault(); event.stopPropagation(); toggleEnemyInspector(view, card, hero, enemy); };
  card.addEventListener('pointerdown', event => event.stopPropagation());
  card.addEventListener('click', open, true);
  card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') open(event); });
}
