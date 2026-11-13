import { resolveWikiCardArt } from './wiki-card-art.js';

const installations = new WeakMap();

/** Install after other card skins and before prepareArena creates the pile.
 * dispose() restores every wrapped method while leaving the finished battle's
 * existing card classes and stylesheet intact. Fresh cards in other modes never
 * acquire that class. No lib.card definitions or global card-skin settings change.
 */
export function installBattleCardArt({ lib, game, get, ui }, baseURL) {
  installations.get(lib)?.dispose();
  const doc = globalThis.document;
  if (!doc.getElementById('shanhetu-wiki-card-style')) {
    const link = doc.createElement('link');
    link.id = 'shanhetu-wiki-card-style'; link.rel = 'stylesheet';
    link.href = baseURL + 'battle-card-art.css';
    doc.head.appendChild(link);
  }
  const inMode = () => { try { return get.mode() === 'shanhetu'; } catch { return lib.config?.mode === 'shanhetu'; } };
  const restorers = [];
  let disposed = false;
  // 十周年UI writes a face image inline, which otherwise wins over the native
  // infohidden theme rules. Read both configured backs from a clean, temporary
  // node instead of guessing a theme path or exposing that previous face.
  const backs = { normal:'var(--cardback-url, none)', flipped:'var(--cardback-url, none)' };
  if (typeof globalThis.getComputedStyle === 'function' && (ui?.arena || doc.body)) {
    const probe = doc.createElement('div');
    probe.className = 'card infohidden';
    probe.style.cssText = 'position:fixed;left:-10000px;top:-10000px;visibility:hidden;pointer-events:none;transition:none!important;animation:none!important';
    probe.appendChild(doc.createElement('div'));
    (ui?.arena || doc.body).appendChild(probe);
    try {
      const normal = globalThis.getComputedStyle(probe).backgroundImage;
      if (normal && normal !== 'none') backs.normal = normal;
      probe.classList.add('infoflip');
      const flipped = globalThis.getComputedStyle(probe).backgroundImage;
      if (flipped && flipped !== 'none') backs.flipped = flipped;
    } finally { probe.remove(); }
  }

  function clear(card) {
    if (!card?.classList?.contains('sht-wiki-card')) return;
    card.classList.remove('sht-wiki-card');
    card.style.removeProperty('--sht-wiki-card-art');
    card.style.removeProperty('--sht-wiki-card-back');
    card.style.removeProperty('--sht-wiki-card-back-flipped');
    delete card.dataset.shtWikiCardId;
    card.querySelector(':scope > .sht-wiki-fallback-name')?.remove();
  }
  function apply(card) {
    if (!card?.classList?.contains('card')) return card;
    if (disposed || !inMode()) { clear(card); return card; }
    const displayName = lib.translate?.[card.name] || get.translation?.(card.name) || card.name;
    const art = resolveWikiCardArt({ name:card.name, displayName, nature:card.nature });
    card.classList.add('sht-wiki-card');
    card.dataset.shtWikiCardId = String(art.id ?? 'unavailable');
    card.style.setProperty('--sht-wiki-card-art', `url(${JSON.stringify(baseURL + art.asset)})`);
    card.style.setProperty('--sht-wiki-card-back', backs.normal);
    card.style.setProperty('--sht-wiki-card-back-flipped', backs.flipped);
    let label = card.querySelector(':scope > .sht-wiki-fallback-name');
    if (art.available) label?.remove();
    else {
      if (!label) { label = doc.createElement('div'); label.className = 'sht-wiki-fallback-name'; card.appendChild(label); }
      label.textContent = art.name;
    }
    return card;
  }
  function wrap(target, key, resultCard = false, argumentCard = false) {
    if (!target || typeof target[key] !== 'function') return;
    const own = Object.getOwnPropertyDescriptor(target, key), original = target[key];
    const wrapped = function(...args) {
      const result = original.apply(this, args);
      apply(argumentCard ? args[0] : resultCard ? result : this);
      return result;
    };
    target[key] = wrapped;
    restorers.push(() => {
      if (target[key] !== wrapped) return;
      if (own) Object.defineProperty(target, key, own);
      else delete target[key];
    });
  }
  const prototype = lib.element?.Card?.prototype;
  wrap(prototype, '$init');
  wrap(prototype, 'copy', true);
  wrap(prototype, 'addNature');
  wrap(prototype, 'removeNature');
  // Skills also call game.setNature directly on real and virtual cards. apply
  // ignores non-DOM virtual cards, leaving their gameplay data untouched.
  wrap(game, 'setNature', false, true);
  for (const card of doc.querySelectorAll('.card')) apply(card);
  const api = {
    apply,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const restore of restorers.reverse()) restore();
      if (installations.get(lib) === api) installations.delete(lib);
    },
  };
  installations.set(lib, api);
  return api;
}
