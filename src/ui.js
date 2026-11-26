// DOM layer: title, HUD count, hints, pause, ending.
export function createUI(game, { onBegin, onResume, onAgain, onMute, fireflyAt, tapCatch }) {
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const el = { title: $('title'), begin: $('begin'), pause: $('pause'), resume: $('resume'), end: $('end'), again: $('again'), share: $('share'),
    hud: $('hud'), count: $('count'), hint: $('hint'), mute: $('mute'), reticle: $('reticle') };
  let hintTimer = 0, hintUntil = 0;

  el.begin.addEventListener('click', () => { if (!el.begin.disabled) onBegin(); });
  el.resume.addEventListener('click', onResume);
  el.pause.addEventListener('click', (e) => { if (e.target !== el.resume) onResume(); });
  el.again.addEventListener('click', onAgain);
  el.mute.addEventListener('click', (e) => {
    // A firefly drifting behind the button still gets caught: the tap was meant for it.
    if (e.clientX && fireflyAt && fireflyAt(e.clientX, e.clientY)) { tapCatch(e.clientX, e.clientY); return; }
    const off = !el.mute.classList.contains('off'); el.mute.classList.toggle('off', off); onMute(off);
  });
  el.share.addEventListener('click', async () => {
    const url = location.href.split('?')[0];
    const data = { title: 'Firefly Jar', text: 'This reminded me of being eight. Catch fireflies in a jar, then let them go.', url };
    try {
      el.share.textContent = 'sharing\u2026';
      if (navigator.share) { await navigator.share(data); el.share.textContent = 'sent'; return; }
      await navigator.clipboard.writeText(url);
      el.share.textContent = 'link copied';
      return;
    } catch { el.share.textContent = url.replace(/^https?:\/\//, ''); }
    setTimeout(() => { el.share.textContent = 'send to a friend'; }, 2600);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && el.title.classList.contains('show') && !el.begin.disabled) onBegin();
    if (e.code === 'KeyM') el.mute.click();
  });

  const setPortrait = () => root.classList.toggle('portrait', window.innerHeight > window.innerWidth);
  window.addEventListener('resize', setPortrait);
  setPortrait();

  return {
    el,
    ready() { el.begin.disabled = false; el.begin.textContent = 'step into the meadow'; },
    showTitle(on) { el.title.classList.toggle('show', on); },
    playing(on) { root.classList.toggle('playing', on); },
    pause(on) { el.pause.classList.toggle('show', on); },
    end(on) { el.end.classList.toggle('show', on); },
    setCount(n, pop = true) {
      el.count.textContent = String(n);
      el.hud.classList.toggle('some', n >= 1);
      el.hud.classList.toggle('more', n >= 7);
      el.hud.classList.toggle('lots', n >= 14);
      if (pop) { el.hud.classList.remove('pop'); void el.hud.offsetWidth; el.hud.classList.add('pop'); }
    },
    hint(text, seconds = 4.5, priority = false) {
      const now = performance.now();
      if (!priority && now < hintUntil - 600) return false;
      el.hint.textContent = text;
      el.hint.classList.add('show');
      hintUntil = now + seconds * 1000;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => el.hint.classList.remove('show'), seconds * 1000);
      return true;
    },
    clearHint() { clearTimeout(hintTimer); el.hint.classList.remove('show'); hintUntil = 0; },
    reticle(state, ringPx = 0) {
      if (el.reticle.className !== (state || '')) el.reticle.className = state || '';
      const px = Math.round(ringPx);
      if (px && px !== el.reticle._px) { el.reticle._px = px; el.reticle.style.setProperty('--ring', px * 2 + 'px'); }
    },
    // A soft glow at the left or right edge, pointing toward the nearest firefly when none is in view.
    guide(side) {
      const g = document.getElementById('guide');
      const cls = side < 0 ? 'left' : side > 0 ? 'right' : '';
      if (g.className !== cls) g.className = cls;
    },
    // A reach that caught nothing: a soft ring where the hand went, so a miss is never silence.
    ripple(nx, ny) {
      const r = document.getElementById('ripple');
      r.style.left = ((nx * 0.5 + 0.5) * 100) + '%'; r.style.top = ((-ny * 0.5 + 0.5) * 100) + '%';
      r.classList.remove('go'); void r.offsetWidth; r.classList.add('go');
    },
    // Show where the thumbstick lives for a few seconds; after that it only appears under a thumb.
    stickHint() { const s = document.getElementById('stick'); s.classList.add('hinting'); setTimeout(() => s.classList.remove('hinting'), 7000); },
  };
}
