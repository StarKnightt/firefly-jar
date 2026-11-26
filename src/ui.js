// DOM layer: title, HUD count, hints, pause, ending.
export function createUI(game, { onBegin, onResume, onAgain, onMute }) {
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const el = { title: $('title'), begin: $('begin'), pause: $('pause'), resume: $('resume'), end: $('end'), again: $('again'), share: $('share'),
    hud: $('hud'), count: $('count'), hint: $('hint'), mute: $('mute'), reticle: $('reticle') };
  let hintTimer = 0, hintUntil = 0;

  el.begin.addEventListener('click', () => { if (!el.begin.disabled) onBegin(); });
  el.resume.addEventListener('click', onResume);
  el.pause.addEventListener('click', (e) => { if (e.target === el.pause) onResume(); });
  el.again.addEventListener('click', onAgain);
  el.mute.addEventListener('click', () => { const off = !el.mute.classList.contains('off'); el.mute.classList.toggle('off', off); onMute(off); });
  el.share.addEventListener('click', async () => {
    const url = location.href.split('?')[0];
    const data = { title: 'Firefly Jar', text: 'This reminded me of being eight. Catch fireflies in a jar, then let them go.', url };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(url);
      el.share.textContent = 'link copied';
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
    reticle(state) { el.reticle.className = state || ''; },
  };
}
