/** Adapt the host's character artwork resolver to the campaign's <img> views.
 * A detached probe keeps the engine's mode/skin/extension rules without creating
 * a player, installing hooks on shared prototypes, or leaving DOM observers.
 */
export function createCharacterPortraitResolver({ lib, get, game, document: dom = globalThis.document, Image: ImageClass = globalThis.Image }) {
  const loading = new Map();
  const databases = new Map();

  function character(id) {
    try { return get.character(id) || lib.character?.[id] || {}; }
    catch { return lib.character?.[id] || {}; }
  }

  function tags(info) { return info.trashBin || info[4] || []; }
  function pictureTag(info) {
    return tags(info).find(value => typeof value === 'string' && /^(?:img|ext|db|character|mode):/.test(value));
  }
  function asset(source) {
    const value = String(source || '');
    if (!value) return '';
    if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('/')) return value;
    const prefix = String(lib.assetURL || '');
    if (prefix && value.startsWith(prefix)) return value;
    return prefix + value;
  }
  function fallback(id) {
    const info = character(id), sex = info.sex || info[0];
    return asset(`${lib.characterDefaultPicturePath || 'image/character/default_silhouette_'}${['male', 'female', 'double'].includes(sex) ? sex : 'male'}.jpg`);
  }
  function skin(id) {
    const choice = lib.config?.skin?.[id];
    if (Array.isArray(choice)) return choice[1];
    // Older engines store a skin number; current ones store [name, path].
    if (typeof choice === 'number' && choice > 0) return `image/skin/${id}/${choice}.jpg`;
    return typeof choice === 'string' ? choice : null;
  }

  function readDatabase(key) {
    if (databases.has(key)) return databases.get(key);
    const pending = Promise.resolve().then(() => game.getDB('image', key)).then(async value => {
      if (typeof value === 'string') return value;
      // Data URLs need no object-URL lifetime management across view rerenders.
      if (typeof Blob !== 'undefined' && value instanceof Blob && typeof FileReader !== 'undefined') {
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.onerror = () => resolve('');
          reader.readAsDataURL(value);
        });
      }
      return '';
    }).catch(() => '');
    databases.set(key, pending);
    pending.then(() => databases.delete(key));
    return pending;
  }

  function collect(id, visited = new Set()) {
    if (!id || visited.has(id)) return [];
    const nextVisited = new Set(visited).add(id), info = character(id);
    let sources;
    const selectedSkin = skin(id);
    // Preserve legacy string/number skins and the image alias some older packs
    // expose. Current Character.img and trashBin use the host's method below.
    if (selectedSkin && !Array.isArray(lib.config?.skin?.[id])) sources = selectedSkin;
    else if (!selectedSkin && !info.img && typeof info.image === 'string') sources = info.image;
    else {
      const probe = dom?.createElement('div');
      if (typeof probe?.setBackground === 'function') {
        probe.setBackgroundImage = function(value) { sources = value; return this; };
        probe.setBackgroundDB = function(key) { sources = `db:${key}`; return Promise.resolve(this); };
        try {
          probe.setBackground(id, 'character');
          // Support a host override that sets CSS directly instead of using
          // either setter. The usual engine path never needs this branch.
          if (!sources && probe.style.backgroundImage) {
            sources = [...probe.style.backgroundImage.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)].map(match => match[1] ?? match[2] ?? match[3]);
          }
        } catch { /* Fall back to metadata for older engine implementations. */ }
      }
    }
    if (!sources) sources = selectedSkin || info.img || info.image || pictureTag(info) || `image/character/${id}.jpg`;
    const normalize = value => {
      if (typeof value !== 'string' || !value) return '';
      if (value.startsWith('img:')) return normalize(value.slice(4));
      if (value.startsWith('ext:')) return asset('extension/' + value.slice(4));
      if (value.startsWith('db:')) return readDatabase(value.slice(3)).then(normalize);
      if (value.startsWith('character:')) return collect(value.slice(10), nextVisited);
      if (value.startsWith('mode:')) return asset(`image/mode/${value.slice(5)}/character/${id}.jpg`);
      return asset(value);
    };
    return (Array.isArray(sources) ? sources : [sources]).map(normalize);
  }

  function loads(source) {
    if (loading.has(source)) return loading.get(source);
    const pending = new Promise(resolve => {
      const image = new ImageClass();
      const finish = success => { image.onload = image.onerror = null; resolve(success); };
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = source;
    });
    loading.set(source, pending);
    pending.then(() => loading.delete(source));
    return pending;
  }

  async function flatten(values) {
    const result = [];
    for (const value of values) {
      const source = await value;
      if (Array.isArray(source)) result.push(...await flatten(source));
      else if (source) result.push(source);
    }
    return [...new Set(result)];
  }

  function resolve(id) {
    const defaultSource = fallback(id);
    const sources = collect(id);
    // On the host, Image validates each original fallback in order. No resolved
    // skin or data URL is cached: changing skins takes effect on the next render.
    if (!ImageClass && sources.every(source => typeof source === 'string')) return sources.find(Boolean) || defaultSource;
    return flatten([...sources, defaultSource]).then(async candidates => {
      if (!ImageClass) return candidates[0] || defaultSource;
      for (const source of candidates) if (await loads(source)) return source;
      return defaultSource;
    }).catch(() => defaultSource);
  }
  resolve.fallback = fallback;
  resolve.hasCustomPortrait = id => {
    const info = character(id);
    return Boolean(skin(id) || info.img || info.image || pictureTag(info) || String(id).includes('::'));
  };
  return resolve;
}
