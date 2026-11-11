(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const audio = document.querySelector('audio[data-music]');
  const toggle = document.querySelector('[data-music-toggle]');
  const open = document.querySelector('[data-open]');

  const setPlaying = (playing) => {
    if (!toggle) return;
    toggle.hidden = false;
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.textContent = playing ? toggle.dataset.labelPause : toggle.dataset.labelPlay;
  };
  const play = () => {
    if (!audio) return;
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  // Music starts only from the guest's own tap on "open" (autoplay policies and courtesy); never on load.
  open?.addEventListener('click', () => {
    document.body.classList.add('is-open');
    document.getElementById('isi')?.focus({ preventScroll: true });
    play();
  });

  toggle?.addEventListener('click', () => {
    if (!audio) return;
    if (audio.paused) play();
    else {
      audio.pause();
      setPlaying(false);
    }
  });

  const sections = document.querySelectorAll('[data-reveal]');
  if (!reduceMotion && 'IntersectionObserver' in window) {
    document.body.classList.add('reveal-ready');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    sections.forEach((section) => observer.observe(section));
  }

  const countdown = document.querySelector('[data-countdown]');
  if (countdown) {
    const target = Date.parse(countdown.getAttribute('data-start') || '');
    const units = countdown.querySelectorAll('[data-unit]');
    let timer = 0;
    const tick = () => {
      const seconds = Math.max(0, Math.floor((target - Date.now()) / 1000));
      const values = { d: Math.floor(seconds / 86400), h: Math.floor((seconds % 86400) / 3600), m: Math.floor((seconds % 3600) / 60), s: seconds % 60 };
      units.forEach((unit) => {
        unit.textContent = String(values[unit.dataset.unit] ?? 0).padStart(2, '0');
      });
      if (!seconds || Number.isNaN(target)) window.clearInterval(timer);
    };
    tick();
    timer = window.setInterval(tick, 1000);
  }
})();
