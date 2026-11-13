import { copperIcon } from './currency-view.js';
import { rewardGoods } from './reward-goods.js';

const defaultGoods = { copper: 14022001, tactic: 14001001, skill: 14002001, card: 14003001, equipment: 14004001, stat: 14021901 };

// Gcs.showRewards passes RewardGroup.GoodsId to gCs, which resolves PicID and
// toneType through the goods table. These are unopened reward-group previews;
// a selected tactic/card/skill keeps its own actual item presentation.
export function rewardPreviewIcon(view, parent, kind, group, className = '') {
  const goodsId = Number(group?.goods) || defaultGoods[kind] || defaultGoods.stat;
  const [pictureId, quality] = rewardGoods[goodsId] || rewardGoods[defaultGoods[kind]] || rewardGoods[defaultGoods.stat];
  const frame = document.createElement('span');
  frame.className = `sht-reward-preview-icon ${className}`.trim();
  frame.dataset.rewardKind = kind;
  frame.dataset.goodsId = String(goodsId);
  frame.dataset.goodsQuality = String(quality);
  parent.appendChild(frame);
  if (pictureId === 14021801) copperIcon(view, frame, 'sht-reward-preview-art', '');
  else view.image(frame, view.asset(`reward/goods_${pictureId}.png`), '', 'sht-reward-preview-art');
  return frame;
}
