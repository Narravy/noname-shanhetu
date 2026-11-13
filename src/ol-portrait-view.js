import { plain } from './adapters.js';

// Standalone version of 十周年UI's onlineUI player skeleton. The source
// player-element.js creates primary-avatar, camp-wrap and hp-wrap in this order;
// player-group.js deliberately renders the OL camp as text, not ols_*.png.
const campNames = { wei: '魏', shu: '蜀', wu: '吴', qun: '群', jin: '晋', shen: '神', shen2: '神', ye: '野', key: '键', western: '西', devil: '魔', daqin: '秦' };
const identityNames = { gameme: '主将', friend: '队友', enemy: '敌军', boss: '首领' };
const frameNames = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const suitSymbols = { heart: '♥', diamond: '♦', spade: '♠', club: '♣' };
const suitNames = { heart: '红桃', diamond: '方块', spade: '黑桃', club: '梅花' };

function el(tag, className, text, parent) {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = plain(text);
  parent?.appendChild(node);
  return node;
}

function number(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) || parsed < 0 ? null : parsed;
}

function displayNumber(value) { return value === Infinity ? '∞' : String(value); }

function equipmentBars(player, equips) {
  if (!Array.isArray(equips) || !equips.length) return;
  const container = el('div', 'sht-ol-equipped-items', null, player);
  container.setAttribute('aria-label', '当前装备');
  // Like the engine's normal equipment area, each subtype has its own row.
  // If a starting loadout repeats a subtype, the last equipped card remains.
  const slots = new Map();
  for (const item of equips) {
    if (!item || typeof item !== 'object') continue;
    const slot = Number(String(item.subtype ?? '').replace(/^equip/, ''));
    if (Number.isInteger(slot) && slot >= 1 && slot <= 5) slots.set(slot, item);
  }
  for (const [slot, item] of [...slots].sort(([a], [b]) => a - b)) {
    const suit = suitSymbols[item.suit] ? item.suit : ['none', 'heart', 'diamond', 'spade', 'club'][Number(item.suit)] || 'none';
    const rank = ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[item.number] || (item.number == null ? '' : String(item.number));
    const name = plain(item.name || '装备');
    const range = slot === 1 ? number(item.weaponrange ?? item.weaponRange ?? item.range) : null;
    const row = el('div', 'sht-ol-equipment', null, container);
    row.dataset.equipSlot = String(slot);
    row.dataset.suit = suit;
    row.style.top = `${(slot - 1) * 16}px`;
    row.title = `${suitNames[suit] || ''}${rank} ${name}${range > 0 ? ` · 攻击范围${displayNumber(range)}` : ''}${item.description ? `\n${plain(item.description)}` : ''}`.trim();
    row.setAttribute('aria-label', row.title);
    // This is the source card > name2 > suit/number + name structure.
    const label = el('div', 'sht-ol-equipment-label', null, row);
    el('span', 'sht-ol-equipment-suit', `${suitSymbols[suit] || ''}${rank}`, label);
    el('span', 'sht-ol-equipment-name', name, label);
    if (range > 0) el('span', 'sht-ol-equipment-range', displayNumber(range), label);
    // These are readable equipment labels, not map or encounter controls.
    row.addEventListener('pointerdown', event => event.stopPropagation());
    row.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
    row.addEventListener('dblclick', event => { event.preventDefault(); event.stopPropagation(); });
  }
}

/** Render an independent, scaled OL card without instantiating an engine player. */
export function renderOLPortrait(view, parent, hero = {}, className = '') {
  const wrapper = el('div', `sht-portrait-card sht-ol-portrait ${className}`.trim(), null, parent);
  const name = plain(hero.name || hero.id || '武将');
  const group = String(hero.group || '');
  const hp = number(hero.hp), maxHp = number(hero.maxHp ?? hero.hp), armor = number(hero.armor) || 0;
  const requestedFrame = frameNames[hero.frameLevel] || Number(hero.frameLevel) || 5;
  // The installed source has OL2–5 only; its default is OL5. No invented OL1.
  const frameLevel = [2, 3, 4, 5].includes(requestedFrame) ? requestedFrame : 5;
  wrapper.dataset.characterId = hero.id || '';
  wrapper.dataset.group = group;
  wrapper.dataset.frameLevel = String(frameLevel);
  wrapper.setAttribute('aria-label', `${name}${hp != null && maxHp != null ? `，体力${displayNumber(hp)}/${displayNumber(maxHp)}` : ''}${armor ? `，护甲${displayNumber(armor)}` : ''}`);

  const player = el('div', 'sht-ol-player', null, wrapper);
  const avatar = el('div', 'sht-ol-primary-avatar', null, player);
  const portraitURL = Object.prototype.hasOwnProperty.call(hero, 'portraitURL') ? hero.portraitURL : view.portrait?.(hero.id);
  if (portraitURL) {
    const portrait = view.image(avatar, portraitURL, '', 'sht-ol-avatar-art');
    portrait.draggable = false;
    portrait.addEventListener('error', () => { portrait.hidden = true; }, { once: true });
  }
  const camp = el('div', 'sht-ol-camp-wrap', null, player);
  camp.dataset.camp = group;
  el('div', 'sht-ol-camp-back', null, camp);
  el('div', 'sht-ol-camp-border', null, camp);
  el('div', 'sht-ol-camp-name', campNames[group] || group.slice(0, 1), camp);
  el('div', 'sht-ol-avatar-name', name, camp);
  equipmentBars(player, hero.equips);

  if (hp != null && maxHp != null) {
    const hpWrap = el('div', 'sht-ol-hp-wrap', null, player);
    const health = el('div', 'sht-ol-hp', null, hpWrap);
    health.dataset.condition = hp > Math.round(maxHp / 2) || hp === maxHp ? 'high' : hp > Math.floor(maxHp / 3) ? 'mid' : 'low';
    health.setAttribute('aria-hidden', 'true');
    // player/state.js switches to hp / maxHp for >5 health, or >3 with armor.
    const compact = maxHp > 5 || armor > 0 && maxHp > 3 || maxHp === 0;
    if (compact) {
      health.classList.add('sht-ol-hp-text');
      // Keep the fraction together, as in the source text + <br> block. The
      // source's column-reverse layout moves the pip, not the fraction's digits.
      const fraction = el('div', 'sht-ol-hp-fraction', null, health);
      for (const text of [displayNumber(hp), '/', displayNumber(maxHp)]) el('span', 'sht-ol-hp-number', text, fraction);
      el('i', `sht-ol-hp-pip${hp === 0 ? ' sht-ol-hp-lost' : ''}`, null, health);
    } else {
      for (let i = 0; i < maxHp; i++) el('i', `sht-ol-hp-pip${i >= hp ? ' sht-ol-hp-lost' : ''}`, null, health);
    }
    if (armor) el('div', 'sht-ol-armor', displayNumber(armor), hpWrap);
  }
  if (identityNames[hero.identity]) {
    const identity = el('div', 'sht-ol-identity', null, player);
    identity.style.backgroundImage = `url("${view.asset(`ol-ui/image/styles/online/identity2_${hero.identity}.png`)}")`;
    identity.setAttribute('aria-label', identityNames[hero.identity]);
  }
  return wrapper;
}
