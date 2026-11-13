import spine from '../vendor/spine-4.0.js';

const sources = new Map();
const manifests = new Map();
const images = new Map();
const requests = new Set();
const owners = new Set();
const MAX_PIXELS = 1280 * 750;
function cached(key, loader) {
  if (!sources.has(key)) {
    const promise = loader().catch(error => { if (sources.get(key) === promise) sources.delete(key); throw error; });
    sources.set(key, promise);
  }
  return sources.get(key);
}
async function read(url, type = 'json') {
  const controller = new AbortController(); requests.add(controller);
  try {
    const response = await fetch(url, {signal:controller.signal});
    if (!response.ok) throw new Error(`原版动画资源无法读取：${url}`);
    return await response[type]();
  } finally { requests.delete(controller); }
}
function catalog(view) {
  if (!manifests.has(view.baseURL)) {
    const key = view.baseURL, promise = read(key + 'assets/original-motion-fonts/manifest.json').catch(error => { if (manifests.get(key) === promise) manifests.delete(key); throw error; });
    manifests.set(key, promise);
  }
  return manifests.get(view.baseURL);
}
function loadImage(url) {
  return cached(url, () => new Promise((resolve,reject) => {
    const image = new Image();
    images.set(image, () => { image.onload = image.onerror = null; image.removeAttribute('src'); reject(new DOMException('Animation view closed','AbortError')); });
    image.onload = () => { image.onload = image.onerror = null; resolve(image); };
    image.onerror = () => { image.onload = image.onerror = null; images.delete(image); reject(new Error(`原版动画贴图无法读取：${url}`)); };
    image.src = url;
  }));
}

function releaseSources() {
  for (const controller of requests) controller.abort();
  requests.clear();
  for (const release of images.values()) release();
  images.clear(); sources.clear(); manifests.clear();
}

// One WebGL context for all effects in a scene/layer. The source skeleton, atlas
// and timelines remain intact; DOM anchors supply the original scene positions.
class MotionLayer {
  constructor(view, host, background) {
    this.view = view; this.entries = []; this.textures = new Map(); this.data = new Map(); this.generation = 0;
    this.canvas = document.createElement('canvas'); this.canvas.setAttribute('aria-hidden','true');
    // These are flat, textured sprites. MSAA/depth/stencil buffers only multiply
    // mobile GPU memory, without improving the original atlas texture detail.
    this.context = new spine.ManagedWebGLRenderingContext(this.canvas, { alpha:true, premultipliedAlpha:true, antialias:false, depth:false, stencil:false });
    if (!this.context.gl) { this.canvas.remove(); throw new Error('WebGL unavailable'); }
    this.renderer = new spine.SceneRenderer(this.canvas, this.context, true);
    this.tick = this.tick.bind(this);
    this.attach(host, background);
  }
  wake() { if (!this.disposed && this.frame == null && this.wakeTimer == null && this.entries.length) this.frame = requestAnimationFrame(this.tick); }
  attach(host, background) {
    this.host = host; this.background = background;
    this.canvas.className = `sht-motion-layer${background ? ' sht-motion-background' : ''}`;
    host.appendChild(this.canvas); this.lastDraw = 0; this.staticSize = null;
  }
  reset() {
    this.generation++; cancelAnimationFrame(this.frame); clearTimeout(this.wakeTimer);
    this.frame = this.wakeTimer = null; this.entries.length = 0; this.lastDraw = 0;
    const gl = this.context.gl; gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    this.canvas.remove(); this.host = null;
  }
  async skeleton(name) {
    if (!this.data.has(name)) {
      const pending = (async () => {
        const baseURL = this.view.baseURL, manifest = await catalog(this.view);
        if (this.disposed) return null;
        const asset = manifest.motions.find(item => item.name === name);
        if (!asset) throw new Error(`未收录原版动画：${name}`);
        const [atlasText, buffer, images] = await Promise.all([
          cached(baseURL + asset.atlas, () => read(baseURL + asset.atlas, 'text')),
          cached(baseURL + asset.skel, () => read(baseURL + asset.skel, 'arrayBuffer')),
          Promise.all(asset.pages.map(page => loadImage(baseURL + page.path))),
        ]);
        if (this.disposed) return null;
        const atlas = new spine.TextureAtlas(atlasText);
        atlas.pages.forEach(page => {
          const index = asset.pages.findIndex(entry => entry.path.split('/').at(-1) === page.name);
          if (index < 0) throw new Error(`动画图集缺少页：${page.name}`);
          const key = asset.pages[index].path;
          if (!this.textures.has(key)) this.textures.set(key, new spine.GLTexture(this.context, images[index]));
          page.setTexture(this.textures.get(key));
        });
        const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(buffer));
        return { data, premultiplied: atlas.pages.some(page => page.pma) };
      })().catch(error => { if (this.data.get(name) === pending) this.data.delete(name); throw error; });
      this.data.set(name, pending);
    }
    return this.data.get(name);
  }
  async add(anchor, name, options) {
    const generation = this.generation;
    const loaded = await this.skeleton(name);
    if (this.disposed || generation !== this.generation || !loaded || !anchor.isConnected) return;
    const skeleton = new spine.Skeleton(loaded.data), state = new spine.AnimationState(new spine.AnimationStateData(loaded.data));
    const action = options.action || loaded.data.animations[0]?.name;
    if (!loaded.data.findAnimation(action)) throw new Error(`原版动画缺少动作：${name}/${action}`);
    state.setAnimation(0, action, options.loop !== false);
    if (options.then) state.addAnimation(0, options.then, true, 0);
    state.apply(skeleton); skeleton.updateWorldTransform();
    const entry = { anchor, name, options, skeleton, state, premultiplied:loaded.premultiplied, elapsed:0, duration:loaded.data.findAnimation(action).duration };
    this.entries.push(entry);
    this.staticSize = null;
    anchor.dataset.motion = name; anchor.dataset.motionAction = action;
    this.wake();
  }
  tick(now) {
    this.frame = null;
    if (this.disposed || !this.host?.isConnected || !this.entries.length) return;
    const modal = [...(this.view.root?.querySelectorAll('dialog[open]') || [])].at(-1);
    if (document.hidden || modal && !modal.contains(this.host)) {
      this.lastDraw = 0;
      this.wakeTimer = setTimeout(() => { this.wakeTimer = null; this.wake(); }, 250);
      return;
    }
    if (now - (this.lastDraw || 0) < 1000 / 30) { this.wake(); return; }
    const elapsed = Math.min(.1, Math.max(0, (now - (this.lastDraw || now)) / 1000)); this.lastDraw = now;
    const hostRect = this.host.getBoundingClientRect(), width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height || !hostRect.width) return;
    const density = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (hostRect.width * hostRect.height)));
    const pixelWidth = Math.max(1, Math.floor(hostRect.width * density)), pixelHeight = Math.max(1, Math.floor(hostRect.height * density));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) { this.canvas.width = pixelWidth; this.canvas.height = pixelHeight; }
    const gl = this.context.gl;
    if (gl.isContextLost()) {
      this.staticSize = null;
      for (const {options} of this.entries) if (options.fallback) options.fallback.style.visibility = '';
      this.wakeTimer = setTimeout(() => { this.wakeTimer = null; this.wake(); }, 250);
      return;
    }
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const staticSize = [hostRect.x,hostRect.y,hostRect.width,hostRect.height,pixelWidth,pixelHeight].join(':');
    if (reduceMotion && this.staticSize === staticSize) {
      this.wakeTimer = setTimeout(() => { this.wakeTimer = null; this.wake(); }, 250);
      return;
    }
    gl.viewport(0,0,pixelWidth,pixelHeight); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    this.renderer.camera.viewportWidth = width; this.renderer.camera.viewportHeight = height; this.renderer.camera.position.set(width/2,height/2,0);
    this.renderer.begin();
    this.drawCount = (this.drawCount || 0) + 1;
    this.entries = this.entries.filter(entry => entry.anchor.isConnected && !(entry.options.loop === false && !entry.options.then && entry.elapsed > entry.duration && entry.options.hideAfter !== false));
    for (const entry of this.entries) {
      const { anchor, options, skeleton, state } = entry;
      if (!anchor.isConnected || options.visible?.() === false) continue;
      if (options.loop === false && !options.then && entry.elapsed > entry.duration && options.hideAfter !== false) continue;
      const rect = anchor.getBoundingClientRect();
      const ratioX = width / hostRect.width, ratioY = height / hostRect.height;
      skeleton.x = (rect.left - hostRect.left + rect.width * (options.x ?? .5)) * ratioX + (options.offsetX || 0);
      skeleton.y = height - (rect.top - hostRect.top + rect.height * (options.y ?? .5)) * ratioY - (options.offsetY || 0);
      skeleton.scaleX = options.scaleX ?? options.scale ?? 580/750;
      skeleton.scaleY = options.scaleY ?? options.scale ?? 580/750;
      if (!reduceMotion) { state.update(elapsed); entry.elapsed += elapsed; }
      else if (!entry.staticFrame) { state.update(Math.min(.4,entry.duration/2)); entry.staticFrame=true; }
      state.apply(skeleton); skeleton.updateWorldTransform();
      skeleton.color.a = options.opacity ?? 1;
      this.renderer.drawSkeleton(skeleton,entry.premultiplied);
      if (options.fallback && options.fallback.style.visibility !== 'hidden') options.fallback.style.visibility = 'hidden';
    }
    this.renderer.end();
    this.staticSize = staticSize;
    if (reduceMotion) this.wakeTimer = setTimeout(() => { this.wakeTimer = null; this.wake(); }, 250);
    else this.wake();
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; cancelAnimationFrame(this.frame); clearTimeout(this.wakeTimer);
    this.frame = this.wakeTimer = null;
    this.renderer?.dispose(); for (const texture of this.textures.values()) texture.dispose();
    this.context?.gl?.getExtension('WEBGL_lose_context')?.loseContext(); this.canvas.width = this.canvas.height = 1; this.canvas.remove(); this.entries.length=0;
    this.textures.clear(); this.data.clear(); this.renderer = this.context = this.host = this.view = null;
  }
}

export function addMotion(view, host, anchor, name, options = {}) {
  if (!host || !anchor || !view.root) return;
  owners.add(view);
  view.motionLayers ??= [];
  let layer = view.motionLayers.find(item => item.host === host && item.background === Boolean(options.background));
  if (!layer) {
    try {
      layer = view.motionLayerPool?.shift();
      if (layer) layer.attach(host,Boolean(options.background));
      else layer = new MotionLayer(view,host,Boolean(options.background));
      view.motionLayers.push(layer);
    }
    catch (error) { console.warn('[山河图] 原动画暂不可用，保留静态图。',error); return; }
  }
  const promise = layer.add(anchor,name,options).catch(error => { if (!layer.disposed && error.name !== 'AbortError') console.warn('[山河图] 原动画载入失败，保留静态图。',error); });
  view.motionPromises ??= []; view.motionPromises.push(promise);
  view.motionReady = Promise.all(view.motionPromises);
}

export function beginMotions(view) {
  view.motionLayerPool = [...(view.motionLayers || []),...(view.motionLayerPool || [])];
  for (const layer of view.motionLayerPool) layer.reset();
  view.motionLayers = []; view.motionPromises = []; view.motionReady = Promise.resolve();
}

export function finishMotions(view) {
  for (const layer of view.motionLayerPool || []) layer.dispose();
  view.motionLayerPool = [];
}

export function disposeMotions(view, {releaseAssets = false} = {}) {
  for (const layer of [...(view.motionLayers || []),...(view.motionLayerPool || [])]) layer.dispose();
  view.motionLayerPool = [];
  view.motionLayers = []; view.motionPromises = []; view.motionReady = Promise.resolve();
  if (releaseAssets) { owners.delete(view); if (!owners.size) releaseSources(); }
}
