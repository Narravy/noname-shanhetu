// One verified original texture for every copper display. Folios have their own
// resource and must never fall through to this coin or the generic stat icon.
export const COPPER_ASSET = 'reward/rogue_tongbi_icon.png';

export function copperIcon(view, parent, className = '', alt = '铜币') {
  const image = view.image(parent, view.asset(COPPER_ASSET), alt, `sht-copper-icon ${className}`.trim());
  image.dataset.currency = 'copper';
  return image;
}

export function copperAmount(view, parent, amount, className = '') {
  const group = document.createElement('span');
  group.className = `sht-copper-amount ${className}`.trim();
  group.setAttribute('aria-label', `${amount} 铜币`);
  parent.appendChild(group);
  copperIcon(view, group, '', '');
  const value = document.createElement('span');
  value.textContent = String(amount);
  group.appendChild(value);
  return group;
}
