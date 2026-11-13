import { enemyArtByKey } from './enemy-art-manifest.js';

/**
 * Portraits already bundled from the official OL season resource endpoint.
 * Keep this list explicit: stripping prefixes would give a god/reworked/custom
 * character the art of a different version. Unknown IDs retain their own art.
 * Source IDs and checksums: assets/season5/manifest.json.
 */
const characterPortraits = Object.freeze({
  liubei: 1,
  zhangfei: 3,
  huatuo: 22,
  dongzhuo: 45,
  yuanshu: 100,
  huaxiong: 171,
  caocao: 205,
  guanyu: 300,
  lvbu: 319,
  xizhicai: 375,
  qinmi: 393,
  lijue: 418,
  zhangji: 419,
  fanchou: 423,
  guosi: 424,
  yuanshao: 450,
  sunjian: 458,
});

const bundledGeneralIds = new Set(Object.values(characterPortraits));

export function originalPortraitByGeneralId(baseURL, generalId) {
  const id = Number(generalId);
  const configured = enemyArtByKey[`${id}:0`];
  if (configured) return `${baseURL}assets/season5/${configured[0]}`;
  return bundledGeneralIds.has(id) ? `${baseURL}assets/season5/portraits/${id}.png` : null;
}

export function originalPortrait(baseURL, characterId) {
  if (!Object.hasOwn(characterPortraits, characterId)) return null;
  return `${baseURL}assets/season5/portraits/${characterPortraits[characterId]}.png`;
}

function enemyArtKey(general) {
  const id = Number(general?.generalId ?? general?.GeneralID ?? general?.raw?.generalID);
  const skin = Number(general?.skinId ?? general?.Generalskin ?? general?.raw?.generalskin) || 0;
  return { id, skin, key: `${id}:${skin}` };
}

/** NPCs reuse general IDs, so a configured skin must never be discarded. */
export function originalEnemyPortrait(baseURL, general) {
  const { id, skin, key } = enemyArtKey(general);
  const art = enemyArtByKey[key];
  if (art) return `${baseURL}assets/season5/${art[0]}`;
  return skin ? null : originalPortraitByGeneralId(baseURL, id);
}

/** Original compact head; missing originals reuse this same configured seat art. */
export function originalEnemyAvatar(baseURL, general) {
  const { id, skin, key } = enemyArtKey(general);
  const art = enemyArtByKey[key];
  if (art) return `${baseURL}assets/season5/${art[1]}`;
  return skin ? null : originalPortraitByGeneralId(baseURL, id);
}
