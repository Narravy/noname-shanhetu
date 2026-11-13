import { wikiCardData } from './wiki-card-data.js';

const byName = new Map(wikiCardData.cards.map(row => [row.name, row]));
const byId = new Map(wikiCardData.cards.map(row => [row.id, row]));
const unavailable = new Map(wikiCardData.missing.map(row => [row.name, row]));
const nativeNames = {
  sha:'杀',huosha:'火杀',leisha:'雷杀',sha_fire:'火杀',sha_thunder:'雷杀',sha_ice:'冰杀',shan:'闪',tao:'桃',jiu:'酒',
  shunshou:'顺手牵羊',guohe:'过河拆桥',wugu:'五谷丰登',juedou:'决斗',nanman:'南蛮入侵',wanjian:'万箭齐发',shandian:'闪电',
  taoyuan:'桃园结义',wuxie:'无懈可击',lebu:'乐不思蜀',tiesuo:'铁索连环',bingliang:'兵粮寸断',jiedao:'借刀杀人',huogong:'火攻',wuzhong:'无中生有',
  zhuge:'诸葛连弩',cixiong:'雌雄双股剑',qinggang:'青釭剑',qinglong:'青龙偃月刀',zhangba:'丈八蛇矛',guanshi:'贯石斧',qilin:'麒麟弓',
  guding:'古锭刀',zhuque:'朱雀羽扇',fangtian:'方天画戟',hanbing:'寒冰剑',bagua:'八卦阵',renwang:'仁王盾',tengjia:'藤甲',baiyin:'白银狮子',
  chitu:'赤兔',zixin:'紫騂',dawan:'大宛',jueying:'绝影',dilu:'的卢',zhuahuang:'爪黄飞电',hualiu:'骅骝',
};
const clean = value => String(value ?? '').replace(/<[^>]*>/g, '').trim();
export const WIKI_BLANK_CARD = 'assets/wiki-cards/blank.png';

/** Resolve artwork independently from a physical card's suit and number.
 * The wiki's 186×260 artwork contains neither: callers retain real card corners.
 */
export function resolveWikiCardArt({ name, displayName, nature, cardId } = {}) {
  const native = clean(name);
  let label = clean(displayName) || nativeNames[native] || native;
  if (native === 'sha' || label === '杀') {
    const natures = Array.isArray(nature) ? nature : String(nature || '').split(/[|_,\s]+/);
    if (natures.includes('fire')) label = '火杀';
    else if (natures.includes('thunder')) label = '雷杀';
    else if (natures.includes('ice')) label = '冰杀';
  }
  const physicalId = cardId ?? (/^sht_card_\d+$/.test(native) ? Number(native.slice(9)) : undefined);
  const mapped = wikiCardData.physicalCardIds[physicalId];
  const row = byName.get(label) || byName.get(nativeNames[native]) || (mapped ? byId.get(mapped) : byId.get(Number(physicalId)));
  if (row) return { ...row, available:true, printedCorners:false };
  return { id:unavailable.get(label)?.id ?? null, name:label || '卡牌', asset:WIKI_BLANK_CARD, available:false, printedCorners:false };
}
