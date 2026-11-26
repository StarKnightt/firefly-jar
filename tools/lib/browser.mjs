// Shared launcher for every automated run: a local server, a headless Chrome on the
// discrete GPU, and teardown wired up before anything else can throw.
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOFTWARE = /swiftshader|llvmpipe|software|basic render/i;

export async function launch({ width = 1920, height = 1080, mobile = false, dpr = 1, built = false, url = null, allowSoftware = process.argv.includes('--allow-software'), extraArgs = [] } = {}) {
  let server = null, browser = null, closing = false;

  const teardown = async (code = 0, why) => {
    if (closing) return;
    closing = true;
    if (why) console.error('[teardown]', why?.stack || why);
    try { await browser?.close(); } catch {}
    try { await server?.close(); } catch {}
    try { server?.httpServer?.close(); } catch {}
    if (code !== null) process.exit(code);
  };
  process.on('SIGINT', () => teardown(130, 'interrupted'));
  process.on('SIGTERM', () => teardown(143, 'terminated'));
  process.on('uncaughtException', (e) => teardown(1, e));
  process.on('unhandledRejection', (e) => teardown(1, e));

  let base = url;
  if (!base) {
    if (built) {
      server = await preview({ root, preview: { host: '127.0.0.1', port: 4183 }, logLevel: 'error' });
      base = server.resolvedUrls.local[0];
    } else {
      server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5183 } });
      await server.listen();
      base = server.resolvedUrls.local[0];
    }
  }

  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--use-angle=d3d11', '--use-gl=angle', '--enable-gpu', '--enable-gpu-rasterization', '--ignore-gpu-blocklist',
      '--force_high_performance_gpu', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      ...extraArgs,
    ],
  });
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile,
    userAgent: mobile ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' : undefined,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || /THREE\.|WGSL|shader|error/i.test(t) && m.type() === 'warning') errors.push(`[${m.type()}] ${t}`);
    if (process.argv.includes('--verbose') || t.startsWith('[gpu]')) console.log('  page:', t.slice(0, 600));
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

  // Assert the GPU. Flags are never proof; ask the context itself.
  const assertGpu = async () => {
    const gpu = await page.evaluate(async () => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      const ext = gl?.getExtension('EXT_texture_filter_anisotropic');
      let webgpu = 'none';
      try {
        const a = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
        if (a) webgpu = [a.info?.vendor, a.info?.architecture, a.info?.description].filter(Boolean).join(' ') || 'adapter';
      } catch (e) { webgpu = 'error ' + e.message; }
      return {
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
        aniso: ext ? gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 0,
        webgpu,
      };
    });
    console.log('[gpu]', gpu.renderer, '| aniso', gpu.aniso, '| webgpu:', gpu.webgpu);
    if (!allowSoftware && (SOFTWARE.test(gpu.renderer) || SOFTWARE.test(gpu.webgpu) || gpu.renderer === 'unknown')) {
      await teardown(null);
      throw new Error(`CPU rasteriser: ${gpu.renderer} / ${gpu.webgpu}`);
    }
    return gpu;
  };

  const open = async (query = '') => {
    await page.goto(base + (query ? '?' + query : ''), { waitUntil: 'load' });
    const gpu = await assertGpu();
    await page.waitForFunction(() => window.__ffj && (window.__ffj.ready || window.__ffj.errors.length), null, { timeout: 120000 });
    const info = await page.evaluate(() => ({ gpu: window.__ffj.gpu, errors: window.__ffj.errors, tier: window.__ffj.tier?.name }));
    console.log('[game]', JSON.stringify(info));
    if (info.errors.length) { await teardown(null); throw new Error('boot failed: ' + info.errors.join('\n')); }
    if (!allowSoftware && SOFTWARE.test(info.gpu?.adapter || '')) { await teardown(null); throw new Error('game on CPU rasteriser: ' + info.gpu.adapter); }
    return { gpu, info };
  };

  // Shader compile/link problems are fatal in automated captures.
  const check = async () => {
    const bad = errors.filter((e) => !/favicon|Download the React/i.test(e));
    if (bad.length) { console.error(bad.join('\n')); await teardown(null); throw new Error(`${bad.length} page error(s)`); }
  };

  return { page, context, browser, base, errors, open, check, teardown, root };
}
