import { tacticArtById } from './tactic-art-manifest.js';
import { nativeTacticArtById } from './native-tactic-art.js';

// Prefer the icon named by OL's PlotPic. Only verified built-in counterparts
// may serve as a fallback; an effect implementation's placeholder is not art.
export function tacticIcon(view, parent, id, className = '') {
  const key = Number(typeof id === 'object' && id ? id.itemId ?? id.rewardId ?? id.id : id);
  const candidates = [];
  if (tacticArtById[key]) candidates.push({ src: view.asset(`season5/tactics/${tacticArtById[key]}`), original: true });
  if (nativeTacticArtById[key]) candidates.push({ src: `${view.baseURL}../../image/zhanfa/${nativeTacticArtById[key]}`, native: true });
  candidates.push({ src: view.asset('reward/rogue_zhanfa_icon.png') });
  const img = document.createElement('img');
  img.alt = ''; img.loading = 'lazy';
  const next = () => {
    const candidate = candidates.shift();
    if (!candidate) { img.style.visibility = 'hidden'; return; }
    const art = candidate.original || candidate.native;
    img.className = `${art ? 'sht-tactic-picture' : 'sht-item-icon'} ${className}`.trim();
    img.dataset.source = candidate.original ? 'ol' : candidate.native ? 'noname' : 'category';
    parent.classList.toggle('sht-has-tactic-art', Boolean(art));
    img.src = candidate.src;
  };
  img.onerror = next; parent.appendChild(img); next();
  return img;
}
