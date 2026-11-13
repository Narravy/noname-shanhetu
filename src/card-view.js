import { plain } from './adapters.js';
import { resolveWikiCardArt } from './wiki-card-art.js';

// Same-site artwork used by every campaign card surface; physical corners are
// drawn separately. Exact plans and hashes live in assets/wiki-cards/manifest.json.
const suitNames = { heart: '红桃', diamond: '方块', spade: '黑桃', club: '梅花' };
const suitSymbols = { heart: '♥', diamond: '♦', spade: '♠', club: '♣' };
const equipmentIndexes = new WeakMap();

/** Display data for campaign IDs and the actual native cards in a battle spec. */
export function equipmentDetails(view, value) {
  let source, spec, rangeDescription;
  if (typeof value === 'object' && value && typeof value.name === 'string' && value.id == null && value.itemId == null) {
    spec = value;
    let entries = equipmentIndexes.get(view);
    if (!entries) {
      entries = new Map();
      for (const [list, reference] of [[view.catalog.cards || [], false], [(view.catalog.enemyReferences || view.catalog.references)?.cards || [], true]]) {
        for (const card of list) {
          const native = view.adapters.cardSpec?.(card.id, reference);
          if (!native) continue;
          if (!entries.has(native.name)) entries.set(native.name, []);
          entries.get(native.name).push({ source: card, spec: native });
        }
      }
      equipmentIndexes.set(view, entries);
    }
    const matches = entries.get(spec.name) || [];
    source = (matches.find(item => item.spec.suit === spec.suit && item.spec.number === spec.number) || matches[0])?.source || {};
  } else {
    const id = typeof value === 'object' && value ? value.itemId ?? value.id : value;
    source = view.adapters.resolve('card', id) || {};
    spec = view.adapters.cardSpec?.(id) || {};
    rangeDescription = view.catalog.indexes?.cards?.get(Number(id))?.description;
  }
  const description = plain(source.description || value?.description || '');
  const range = plain(rangeDescription || description).match(/攻击范围[：:]\s*(\d+)/)?.[1];
  // OL classifies treasures as 9; noname's fifth equipment slot is equip5.
  const subtype = source.cardSubType ?? source.subType ?? value?.subtype;
  return {
    name: plain(source.name || value?.displayName || spec.name || '装备'),
    suit: spec.suit || ['none', 'heart', 'diamond', 'spade', 'club'][source.suit ?? source.color],
    number: spec.number ?? source.number,
    subtype: Number(subtype) === 9 ? 5 : subtype,
    description, range: range ? Number(range) : undefined,
  };
}

function info(view, id) {
  const key = typeof id === 'object' && id ? id.itemId ?? id.id : id;
  const source = view.adapters.resolve('card', key) || view.catalog.indexes?.cards?.get(Number(key)) || {};
  const spec = view.adapters.cardSpec?.(key) || {};
  const native = spec.name || source.nativeId;
  const nature = Array.isArray(spec.nature) ? spec.nature[0] : spec.nature;
  const artwork = resolveWikiCardArt({ name:native, displayName:source.name, nature, cardId:source.cardId });
  const suit = spec.suit || ['none', 'heart', 'diamond', 'spade', 'club'][source.suit];
  const number = source.number ?? spec.number;
  return { key, source, artwork, suit, number, name: plain(source.name || artwork.name || '卡牌') };
}

export function cardArt(view, id) {
  return view.baseURL + info(view, id).artwork.asset;
}

export function cardThumb(view, parent, id, className = '') {
  const data = info(view, id);
  const card = document.createElement('div');
  card.className = `sht-playing-card ${className}`.trim();
  card.dataset.cardId = String(data.key);
  card.dataset.suit = data.suit || '';
  card.setAttribute('role', 'img');
  const point = ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[data.number] || (data.number == null ? '' : String(data.number));
  card.setAttribute('aria-label', `${data.name} ${suitNames[data.suit] || ''}${point}`.trim());
  card.title = `${data.name}${data.source.description ? '：' + plain(data.source.description) : ''}`;
  const picture = document.createElement('img');
  picture.className = 'sht-playing-art';
  picture.alt = '';
  picture.src = view.baseURL + data.artwork.asset;
  card.appendChild(picture);
  if (point || suitSymbols[data.suit]) {
    const corner = document.createElement('span');
    corner.className = 'sht-playing-corner';
    const numeral = document.createElement('span'); numeral.textContent = point; corner.appendChild(numeral);
    const symbol = document.createElement('span'); symbol.textContent = suitSymbols[data.suit] || ''; corner.appendChild(symbol);
    card.appendChild(corner);
  }
  if (!data.artwork.available) {
    const name = document.createElement('span');
    name.className = 'sht-playing-name'; name.textContent = data.name; card.appendChild(name);
  }
  parent?.appendChild(card);
  return card;
}
