/** OL configuration identifiers are resolved against the installed noname engine. */
import { CAMPAIGN_TACTIC_IDS } from './campaign.js';
import { isForeignModeTactic, FOREIGN_MODE_TACTIC_REASON } from './foreign-mode-tactics.js';
import { baseDifficultyId } from './desperate.js';
export function plain(value = '') {
  return String(value).replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
}

export function normalized(value = '') {
  return plain(value).replace(/III\b/g, '3').replace(/II\b/g, '2').replace(/I\b/g, '1').replace(/[Ⅰ壹一]/g, '1').replace(/[Ⅱ贰二]/g, '2').replace(/[Ⅲ叁三]/g, '3')
    .replace(/远击之技/g, '远击技').replace(/重击之技/g, '重击技').replace(/狂雷爆炎/g, '狂雷爆焰')
    .replace(/[·.\s【】〖〗「」：:，,。;；、（）()]/g, '').toLowerCase();
}

function similarity(a, b) {
  a = normalized(a); b = normalized(b);
  if (a === b) return 1;
  const grams = text => new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_, i) => text.slice(i, i + 2)));
  const left = grams(a), right = grams(b);
  let hits = 0;
  left.forEach(x => { if (right.has(x)) hits++; });
  return 2 * hits / Math.max(1, left.size + right.size);
}

export function createAdapters(lib, get, nativeTactics, catalog) {
  const byId = list => new Map((list || []).map(x => [Number(x.id), x]));
  const entries = {
    tactic: byId(catalog.tactics), skill: byId(catalog.skills), card: byId(catalog.cards),
  };
  const references = catalog.enemyReferences || catalog.references || {};
  const spellRefs = byId([...(references.skills || []), ...(catalog.spells || [])]);
  const cardRefs = byId(references.cards || []);
  const translations = lib.translate || {};
  const skillNames = new Map();
  for (const id of Object.keys(lib.skill || {})) {
    if (!translations[id] || !translations[id + '_info'] || id.startsWith('zf_') || /^sht_(enemy|skill|tactic)_/.test(id)) continue;
    const name = normalized(translations[id]);
    if (!skillNames.has(name)) skillNames.set(name, []);
    skillNames.get(name).push(id);
  }
  const cardNames = new Map();
  for (const id of Object.keys(lib.card || {})) {
    if (translations[id]) cardNames.set(normalized(translations[id]), id);
  }
  const cache = new Map();
  const kindOf = kind => ({ 战法: 'tactic', 技能: 'skill', 卡牌: 'card', 装备: 'card', equipment: 'card' }[kind] || kind);
  const campaignTactics = new Set(CAMPAIGN_TACTIC_IDS);

  function resolveSkill(source) {
    if (!source) return null;
    const sourceId = Number(source.spellId ?? source.id);
    const nativeId = `sht_skill_${sourceId}`;
    const definition = lib.skill?.[nativeId];
    if (Number.isInteger(sourceId) && sourceId > 0 && definition) {
      const exact = !definition.shtApproximate;
      return {
        nativeId, description: plain(exact ? source.description?.split('###')[0] : definition.shtImplementedDescription || source.description),
        exact, similarity: exact ? 1 : undefined, sourceId, resolution: 'official-spell-id',
        unsupportedEffects: (definition.shtUnsupportedEffects || []).filter(value => typeof value === 'string' && value),
      };
    }
    const candidates = skillNames.get(normalized(source.name)) || [];
    const ranked = candidates.map(id => ({ id, score: similarity(source.description, translations[id + '_info']) }))
      .sort((a, b) => b.score - a.score || a.id.length - b.id.length);
    if (!ranked.length) return null;
    return { nativeId: ranked[0].id, description: plain(translations[ranked[0].id + '_info']), exact: ranked[0].score === 1, similarity: ranked[0].score };
  }

  // Enemy mode variants share their display names with ordinary general skills.
  // Resolve their official spell IDs before considering name-based compatibility.
  // This deliberately does not change reward skills or the player's base general.
  function resolveEnemySkill(source) {
    if (!source) return null;
    const sourceId = Number(source.id);
    const nativeId = `sht_enemy_${sourceId}`;
    const definition = lib.skill?.[nativeId];
    if (Number.isInteger(sourceId) && sourceId > 0 && definition) {
      const exact = !definition.shtApproximate;
      const unsupportedEffects = (definition.shtUnsupportedEffects || []).filter(value => typeof value === 'string' && value);
      return {
        nativeId, description: plain(exact ? source.description : definition.shtImplementedDescription || source.description),
        exact, similarity: exact ? 1 : undefined, sourceId, resolution: 'official-spell-id', unsupportedEffects,
      };
    }
    return resolveSkill(source);
  }

  function resolve(kind, id) {
    kind = kindOf(kind);
    const key = `${kind}:${id}`;
    if (cache.has(key)) return cache.get(key);
    const source = entries[kind]?.get(Number(id));
    if (source && kind === 'tactic' && isForeignModeTactic(id)) {
      const excluded = { ...source, kind, supported: false, applicable: false, reason: FOREIGN_MODE_TACTIC_REASON };
      cache.set(key, excluded);
      return excluded;
    }
    let result = null;
    if (source && kind === 'skill') result = resolveSkill(source);
    if (source && kind === 'tactic') {
      const match = nativeTactics.find(x => x.id === `sht_tactic_${source.id}`) || nativeTactics.filter(x => normalized(x.name) === normalized(source.name))
        .sort((a, b) => similarity(source.description, b.description) - similarity(source.description, a.description))[0];
      if (match) result = { nativeId: match.id, description: plain(match.description), exact: normalized(match.description) === normalized(source.description) };
      if (campaignTactics.has(Number(id))) result = { campaign: true, description: source.description, exact: true };
    }
    if (source && kind === 'card') {
      const aliases = { 火杀: 'sha', 雷杀: 'sha', 冰杀: 'sha', 诸葛连弩: 'zhuge', 八卦盾: 'bagua' };
      const nativeId = lib.card[`sht_card_${source.cardId}`] ? `sht_card_${source.cardId}` : cardNames.get(normalized(source.name)) || aliases[source.name];
      if (nativeId && lib.card[nativeId]) result = { nativeId, nature: ({ 火杀: 'fire', 雷杀: 'thunder', 冰杀: 'ice' })[source.name], description: plain(translations[nativeId + '_info']), exact: normalized(source.description) === normalized(translations[nativeId + '_info']) };
    }
    const resolved = result ? { ...source, kind, ...result, supported: true } : source ? { ...source, kind, supported: false, reason: '当前引擎尚无对应实现' } : null;
    cache.set(key, resolved);
    return resolved;
  }

  const characterList = Object.entries(lib.character || {}).filter(([id, value]) => {
    if (!value || id.startsWith('shanhetu_') || value.isBoss || value.isHiddenBoss || value.isUnseen) return false;
    return !(value[4] || []).includes('boss') && Boolean(translations[id]);
  }).map(([id, value]) => {
    const hp = Number(value.hp ?? String(value[2] || 4).split('/')[0]) || 4;
    const maxHp = Number(value.maxHp ?? String(value[2] || 4).split('/').at(-1)) || hp;
    return { id, name: plain(translations[id]), hp, maxHp, group: value.group || value[1], skills: value.skills || value[3] || [], sex: value.sex || value[0] || 'male' };
  });

  function characterByName(name) {
    const cleaned = normalized(name).replace(/^(界|谋|sp|ol|乐|boss)/, '');
    return characterList.find(x => normalized(x.name) === normalized(name)) || characterList.find(x => normalized(x.name).replace(/^(界|谋|sp|ol|乐)/, '') === cleaned);
  }

  function cardSpec(id, reference = false) {
    let item = reference ? null : resolve('card', id);
    if (!item) {
      const source = cardRefs.get(Number(id));
      if (source) {
        const nature = ({ '火杀': 'fire', '雷杀': 'thunder', '冰杀': 'ice' })[source.name];
        const nativeId = lib.card[`sht_card_${source.id}`] ? `sht_card_${source.id}` : nature ? 'sha' : cardNames.get(normalized(source.name));
        if (nativeId && lib.card[nativeId]) item = { ...source, nativeId, nature, supported: true, suit: source.color };
      }
    }
    if (!item?.supported) return null;
    return { name: item.nativeId, nature: item.nature, suit: ['none', 'heart', 'diamond', 'spade', 'club'][item.suit] || 'spade', number: item.number || 1 };
  }

  function enemySpec(general, difficulty = {}, warnings = [], difficultyId = 1) {
    difficultyId = baseDifficultyId(difficultyId);
    const stats = general.stats || {};
    const native = characterByName(general.name);
    const skills = [];
    const skillDetails = new Map();
    const difficultyLabels = new Set(['基础', ...(difficultyId >= 11 ? ['困难'] : []), ...(difficultyId >= 16 ? ['噩梦'] : []), ...(difficultyId >= 21 ? ['炼狱'] : [])]);
    for (const ref of (general.skills || []).filter(x => general.growth || difficultyLabels.has(x.difficulty || '基础'))) {
      const source = spellRefs.get(Number(ref.id));
      const skill = resolveEnemySkill(source);
      const detailKey = skill?.nativeId || `unresolved:${ref.id}`;
      if (!skillDetails.has(detailKey)) skillDetails.set(detailKey, {
        id: Number(ref.id), nativeId: skill?.nativeId || null,
        name: plain(source?.name || translations[skill?.nativeId] || `技能 ${ref.id}`),
        description: plain(skill?.description || source?.description || '暂无技能说明'),
        sourceDescription: plain(source?.description || ''),
        supported: Boolean(skill?.nativeId), exact: Boolean(skill?.exact),
        unsupportedEffects: skill?.unsupportedEffects || [],
      });
      if (skill) {
        skills.push(skill.nativeId);
        if (!skill.exact) warnings.push(`${general.name}的${source.name}采用本地效果：${skill.description}${skill.unsupportedEffects?.length ? '；尚未实现：' + skill.unsupportedEffects.join('；') : ''}`);
      }
      else warnings.push(`${general.name}：${source?.name || '技能 ' + ref.id}尚未适配`);
    }
    const tacticDetails = (general.tactics || []).filter(x => general.growth || difficultyLabels.has(x.difficulty || '基础')).map(x => resolve('tactic', x.id ?? x)).filter(Boolean);
    const tactics = tacticDetails.filter(x => x.nativeId).map(x => x.nativeId);
    const hp = Math.max(1, Number(stats.hp || 4) + Number(difficulty.hp || 0));
    const maxHp = Math.max(hp, Number(stats.maxHp || stats.hp || 4) + Number(difficulty.hp || 0));
    const fixedCards = (general.cards || []).filter(x => general.growth || difficultyLabels.has(x.difficulty || '基础'));
    for (const card of fixedCards) {
      const id = card.id ?? card;
      if (!cardSpec(id, true)) warnings.push(`${general.name}的预置${card.equipment ? '装备' : '卡牌'}「${cardRefs.get(Number(id))?.name || id}」尚未适配`);
    }
    return {
      character: native?.id || `shanhetu_npc_${general.generalId}`, title: general.name,
      generalId: general.generalId, skinId: general.skinId,
      hp, maxHp, skills: [...new Set(skills)], replaceSkills: true, tactics,
      skillDetails: [...skillDetails.values()],
      tacticDetails: tacticDetails.map(item => ({ id:item.id, nativeId:item.nativeId, name:plain(item.name), description:plain(item.description), supported:Boolean(item.nativeId), exact:Boolean(item.exact) })),
      group: native?.group || 'qun', sex: native?.sex || 'male',
      armor: Number(stats.armor || 0) + Number(difficulty.armor || 0),
      armorGain: Number(stats.armorGain || 0) + Number(difficulty.getarmor || 0),
      draw: Number(stats.draw ?? 2) + Number(difficulty.draw || 0),
      initialDraw: Number(stats.startingCards ?? 4) + Number(difficulty.cardnum || 0),
      slashCount: Number(stats.slashCount ?? 1) + Number(difficulty.skill || 0),
      damageBonus: Number(stats.damageBonus || 0), killDraw: Number(stats.killDraw || 0), maxArmor: Number(stats.maxArmor || 0),
      cards: fixedCards.filter(x => !(x.equipment ?? cardRefs.get(Number(x.id ?? x))?.type === 3)).map(x => cardSpec(x.id ?? x, true)).filter(Boolean),
      equips: fixedCards.filter(x => (x.equipment ?? cardRefs.get(Number(x.id ?? x))?.type === 3)).map(x => cardSpec(x.id ?? x, true)).filter(Boolean),
    };
  }

  return {
    resolve, resolveSkill, resolveEnemySkill, enemySpec, cardSpec, characterList, characterByName,
    isSupported(kind, id) { const k = kindOf(kind); return !entries[k] || Boolean(resolve(k, id)?.supported); },
    supported(kind) { const k = kindOf(kind); return [...(entries[k]?.values() || [])].map(x => resolve(k, x.id)).filter(x => x.supported); },
    skillName(id) { return plain(translations[id] || id); },
    skillDescription(id) { return plain(translations[id + '_info'] || ''); },
  };
}
