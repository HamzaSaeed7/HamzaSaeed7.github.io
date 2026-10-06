// ── Intro motion sequence ─────────────────────────────────────────────────────
// Particles spiral into a nucleus, the atom's orbits draw on, the nucleus bursts
// into the name, then the atom flies onto the hero's avatar ring on exit.
// Interactive: the cursor repels the lettering, a click sends a shockwave.
(function () {
  const root    = document.documentElement;
  const overlay = document.getElementById('intro');
  if (!overlay) return;

  const canvas   = overlay.querySelector('.intro-canvas');
  const ctx      = canvas.getContext('2d');
  const meta     = overlay.querySelector('.intro-meta');
  const roleEl   = overlay.querySelector('.intro-role');
  const tickerEl = overlay.querySelector('.intro-ticker');
  const wordEl   = overlay.querySelector('.intro-ticker-word');
  const enterBtn = overlay.querySelector('.intro-enter');
  const skipBtn  = overlay.querySelector('.intro-skip');
  const hintEl   = overlay.querySelector('.intro-hint');
  const barEl    = overlay.querySelector('.intro-progress span');

  // Same orbit geometry as the hero atom (main.js), so the hand-off lines up
  const ORBITS = [
    { a: 115, b: 26, rz: 15  * Math.PI / 180, dur: 2200, color: [192, 168, 255] },
    { a:  88, b: 52, rz: 82  * Math.PI / 180, dur: 3700, color: [126, 184, 255] },
    { a: 128, b: 68, rz: 145 * Math.PI / 180, dur: 5200, color: [168, 230, 207] },
  ];
  const GRADIENT = [   // matches the hero name gradient
    [0.00, [192, 168, 255]],
    [0.45, [126, 184, 255]],
    [0.75, [168, 230, 207]],
    [1.00, [192, 168, 255]],
  ];
  const WORDS = ['Wedding Tech', 'PropTech', 'Photography', 'FinTech', 'Social', 'Startups'];

  // Timeline (seconds)
  const T_BURST  = 2.5;   // nucleus bursts into lettering
  const T_ROLE   = 3.7;
  const T_TICKER = 4.25;
  const T_ENTER  = 5.0;
  const T_HINT   = 5.5;
  const T_AUTO   = 9.5;   // auto-advance once the viewer stops interacting
  const EXIT_LEN = 1.25;

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp  = (a, b, p) => a + (b - a) * p;
  const easeOutCubic   = p => 1 - (1 - p) ** 3;
  const easeOutQuart   = p => 1 - (1 - p) ** 4;
  const easeInCubic    = p => p * p * p;
  const easeInOutCubic = p => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

  function gradientAt(f) {
    for (let i = 1; i < GRADIENT.length; i++) {
      const [p1, c1] = GRADIENT[i];
      if (f <= p1) {
        const [p0, c0] = GRADIENT[i - 1];
        const k = (f - p0) / (p1 - p0);
        return c0.map((c, j) => Math.round(lerp(c, c1[j], k)));
      }
    }
    return GRADIENT[GRADIENT.length - 1][1];
  }

  let W, H, DPR;
  let particles = [], stars = [], waves = [];
  let box, atomStart, atomHome, avatar;
  let t, lastNow, raf, exiting, tExit, exitFrom, lastPointer, wordIdx;
  const pointer = { x: 0, y: 0, active: false };
  const shown = new Set();

  // ── Build: sample the name into particle targets ─────────────────────────
  function build() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = W * DPR;
    canvas.height = H * DPR;

    const lines = W < 640 ? ['HAMZA', 'SAEED'] : ['HAMZA SAEED'];
    const off   = document.createElement('canvas');
    off.width = W; off.height = H;
    const oc = off.getContext('2d');
    const family = '"DM Sans", sans-serif';
    oc.font = `700 100px ${family}`;
    const widest = Math.max(...lines.map(l => oc.measureText(l).width));
    const size   = Math.min(100 * (Math.min(W * 0.84, 1100) / widest), H * 0.2);
    const lineH  = size * 0.98;
    const cy     = H * 0.47;

    oc.font = `700 ${size}px ${family}`;
    oc.textAlign = 'center';
    oc.textBaseline = 'middle';
    oc.fillStyle = '#fff';
    lines.forEach((l, i) => oc.fillText(l, W / 2, cy + (i - (lines.length - 1) / 2) * lineH));
    const data = oc.getImageData(0, 0, W, H).data;

    let step = Math.max(3, Math.round(size / 28)), pts;
    do {
      pts = [];
      for (let y = 0; y < H; y += step) {
        for (let x = 0; x < W; x += step) {
          if (data[(y * W + x) * 4 + 3] > 128) pts.push([x, y]);
        }
      }
      step++;
    } while (pts.length > 2600);
    const grid = step - 1;

    box = { left: W, right: 0, top: H, bottom: 0 };
    pts.forEach(([x, y]) => {
      box.left = Math.min(box.left, x);  box.right  = Math.max(box.right, x);
      box.top  = Math.min(box.top, y);   box.bottom = Math.max(box.bottom, y);
    });

    const reach = Math.max(W, H);
    particles = pts.map(([tx, ty]) => {
      const xf  = (tx - box.left) / Math.max(1, box.right - box.left);
      const rgb = gradientAt(xf).map(c => Math.min(255, c + Math.round((Math.random() - 0.3) * 30)));
      return {
        tx, ty, xf,
        x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
        rgb: `rgb(${rgb})`,
        size: Math.max(1.3, grid * (0.5 + Math.random() * 0.25)),
        mode: 'script',
        a0: Math.random() * Math.PI * 2,
        r0: reach * (0.55 + Math.random() * 0.5),
        gd: Math.random() * 0.5,
        gdur: 1.1 + Math.random() * 0.3,
        cloudA: Math.random() * Math.PI * 2,
        cloudR: Math.sqrt(Math.random()),
        bd: T_BURST + xf * 0.75 + Math.random() * 0.12,
        arc: (Math.random() - 0.5) * 0.5,
        ed: Math.random() * 0.3,
        eo: [Math.random() * Math.PI * 2, Math.random()],
      };
    });

    stars = Array.from({ length: 260 }, () => ({
      x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(),
    }));

    // Atom: big in the centre, then settles above the name
    const s0 = Math.min(1.5, Math.min(W, H) * 0.55 / 256);
    const sh = Math.min(0.45, s0 * 0.5);
    atomStart = { x: W / 2, y: H / 2, s: s0 };
    atomHome  = { x: W / 2, y: Math.max(128 * sh + 24, box.top - 128 * sh * 0.55 - 30), s: sh };

    meta.style.top = `${box.bottom + Math.max(18, H * 0.03)}px`;
  }

  function measureAvatar() {
    const ring = document.querySelector('.avatar-ring');
    const r = ring && ring.getBoundingClientRect();
    avatar = r && r.width
      ? { x: r.left + r.width / 2, y: r.top + r.height / 2, s: r.width / 280 }
      : { x: W / 2, y: H / 2, s: 0.6 };
  }

  function atomAt(time) {
    if (exiting && time >= tExit) {
      const p = easeInOutCubic(clamp((time - tExit) / 1.0));
      return { x: lerp(exitFrom.x, avatar.x, p), y: lerp(exitFrom.y, avatar.y, p), s: lerp(exitFrom.s, avatar.s, p) };
    }
    if (time < T_BURST) {
      return { ...atomStart, s: atomStart.s * (1 + 0.02 * Math.sin(time * 3)) };
    }
    const p = easeInOutCubic(clamp((time - T_BURST) / 1.1));
    return {
      x: lerp(atomStart.x, atomHome.x, p),
      y: lerp(atomStart.y, atomHome.y, p),
      s: lerp(atomStart.s, atomHome.s, p),
    };
  }

  // Position inside the nucleus cloud (spirals in from off-screen during gather)
  function gatherPos(p, time, atom) {
    const g    = easeInOutCubic(clamp((time - p.gd) / p.gdur));
    const ca   = p.cloudA + time * 2.2;
    const cr   = p.cloudR * 16 * atom.s;
    const th   = p.a0 + (1 - g) * 3;
    const r    = p.r0 * (1 - g);
    return {
      x: atom.x + Math.cos(th) * r + Math.cos(ca) * cr * g,
      y: atom.y + Math.sin(th) * r + Math.sin(ca) * cr * g,
    };
  }

  // ── Frame ────────────────────────────────────────────────────────────────
  function frame(now) {
    try {
      const dt = lastNow ? Math.min((now - lastNow) / 1000, 0.064) : 0.016;
      lastNow = now;
      t += dt;
      step(dt);
      draw();
      raf = requestAnimationFrame(frame);
    } catch (err) {
      finish();
      throw err;
    }
  }

  function step(dt) {
    const f = dt * 60;
    const atom = atomAt(t);

    particles.forEach(p => {
      p.px = p.x; p.py = p.y;

      if (p.mode === 'exit') {
        const e = easeInCubic(clamp((t - tExit - p.ed) / 0.8));
        const tx = avatar.x + Math.cos(p.eo[0]) * p.eo[1] * 40 * avatar.s;
        const ty = avatar.y + Math.sin(p.eo[0]) * p.eo[1] * 40 * avatar.s;
        p.x = lerp(p.ex, tx, e);
        p.y = lerp(p.ey, ty, e);
        p.alpha = 1 - clamp((e - 0.55) / 0.45);
        p.scale = 1 - 0.6 * e;
        return;
      }

      if (p.mode === 'script') {
        if (t < p.bd) {
          const g = gatherPos(p, t, atom);
          p.x = g.x; p.y = g.y;
          p.alpha = clamp((t - p.gd) / 0.4);
        } else {
          const b  = easeOutQuart(clamp((t - p.bd) / 0.95));
          const s  = gatherPos(p, p.bd, atomAt(p.bd));
          const dx = p.tx - s.x, dy = p.ty - s.y;
          const cx = (s.x + p.tx) / 2 - dy * p.arc;
          const cy = (s.y + p.ty) / 2 + dx * p.arc;
          const u  = 1 - b;
          p.x = u * u * s.x + 2 * u * b * cx + b * b * p.tx;
          p.y = u * u * s.y + 2 * u * b * cy + b * b * p.ty;
          p.alpha = 1;
          if (b >= 1) { p.mode = 'live'; p.vx = p.vy = 0; }
        }
        p.scale = 1;
        return;
      }

      // live: spring home, pushed around by the cursor and shockwaves
      let ax = (p.tx - p.x) * 0.045;
      let ay = (p.ty - p.y) * 0.045;
      if (pointer.active) {
        const dx = p.x - pointer.x, dy = p.y - pointer.y;
        const R  = 95;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1;
          const force = (1 - d / R) ** 2 * 5.5;
          ax += dx / d * force;
          ay += dy / d * force;
        }
      }
      waves.forEach(w => {
        const age = t - w.t0;
        const r   = age * 900;
        const dx  = p.x - w.x, dy = p.y - w.y;
        const d   = Math.sqrt(dx * dx + dy * dy) || 1;
        const off = Math.abs(d - r);
        if (off < 40) {
          const s = (1 - age / 1.3) * 9 * (1 - off / 40);
          ax += dx / d * s;
          ay += dy / d * s;
        }
      });
      const damp = Math.pow(0.84, f);
      p.vx = (p.vx + ax * f) * damp;
      p.vy = (p.vy + ay * f) * damp;
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.alpha = 0.78 + 0.22 * Math.sin(t * 2.2 - p.xf * 7);
      p.scale = 1;
    });

    waves = waves.filter(w => t - w.t0 < 1.3);
    ORBITS.forEach(o => {
      o.angle += (Math.PI * 2 / o.dur) * dt * 1000;
      const pos = orbitPoint(o, atom, o.angle);
      o.hist.push(pos);
      if (o.hist.length > 22) o.hist.shift();
    });

    // DOM beats
    reveal(skipBtn, t > 0.3);
    reveal(roleEl,   t > T_ROLE);
    reveal(tickerEl, t > T_TICKER);
    reveal(enterBtn, t > T_ENTER);
    reveal(hintEl,   t > T_HINT);
    if (t > T_TICKER) {
      const idx = Math.floor((t - T_TICKER) / 1.15) % WORDS.length;
      if (idx !== wordIdx) { wordIdx = idx; swapWord(WORDS[idx]); }
    }
    barEl.style.width = `${clamp(t / T_AUTO) * 100}%`;

    if (!exiting && t > T_AUTO && t - lastPointer > 2.5) exit();
    if (exiting && t - tExit > EXIT_LEN) finish();
  }

  function orbitPoint(o, atom, ang) {
    const ex = o.a * atom.s * Math.cos(ang);
    const ey = o.b * atom.s * Math.sin(ang);
    return {
      x: atom.x + ex * Math.cos(o.rz) - ey * Math.sin(o.rz),
      y: atom.y + ex * Math.sin(o.rz) + ey * Math.cos(o.rz),
    };
  }

  function reveal(el, on) {
    if (on && !shown.has(el)) { shown.add(el); el.classList.add('show'); }
  }

  function swapWord(word) {
    if (!wordEl.animate) { wordEl.textContent = word; return; }
    wordEl.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-60%)' }],
      { duration: 220, easing: 'ease-in', fill: 'forwards' }
    ).onfinish = () => {
      wordEl.textContent = word;
      wordEl.animate(
        [{ opacity: 0, transform: 'translateY(60%)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }
      );
    };
  }

  // ── Draw ─────────────────────────────────────────────────────────────────
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const fade = exiting ? 1 - clamp((t - tExit - 0.15) / 0.6) : 1;

    // Warp starfield: fast streaks that decelerate into a calm drift
    const v = 0.035 * (1 - easeOutCubic(clamp(t / 1.8))) + 0.0007;
    ctx.lineCap = 'round';
    stars.forEach(s => {
      s.z -= v;
      if (s.z < 0.02) { s.z = 1; s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; }
      const k  = W * 0.5;
      const x1 = W / 2 + (s.x / s.z) * k, y1 = H / 2 + (s.y / s.z) * k;
      const z0 = Math.min(1, s.z + v * 5);
      const x0 = W / 2 + (s.x / z0) * k,  y0 = H / 2 + (s.y / z0) * k;
      const a  = clamp((1 - s.z) * 1.2) * 0.8 * fade;
      ctx.strokeStyle = `rgba(220,210,255,${a})`;
      ctx.lineWidth = (1 - s.z) * 1.6 + 0.3;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 + 0.1, y1); ctx.stroke();
    });

    ctx.globalCompositeOperation = 'lighter';
    drawAtom();

    // Cursor glow
    if (pointer.active && !exiting) {
      const g = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 140);
      g.addColorStop(0, 'rgba(140,131,250,0.14)');
      g.addColorStop(1, 'rgba(140,131,250,0)');
      ctx.fillStyle = g;
      ctx.fillRect(pointer.x - 140, pointer.y - 140, 280, 280);
    }

    // Shockwave rings
    waves.forEach(w => {
      const age = t - w.t0;
      ctx.strokeStyle = `rgba(192,168,255,${0.45 * (1 - age / 1.3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(w.x, w.y, age * 900, 0, Math.PI * 2); ctx.stroke();
    });

    // Particles — streak when moving fast, dot when settled
    particles.forEach(p => {
      if (!p.alpha) return;
      const sz = p.size * p.scale;
      ctx.globalAlpha = p.alpha;
      const dx = p.x - p.px, dy = p.y - p.py;
      if (dx * dx + dy * dy > 6) {
        ctx.strokeStyle = p.rgb;
        ctx.lineWidth = sz;
        ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
      } else {
        ctx.fillStyle = p.rgb;
        ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawAtom() {
    const atom = atomAt(t);
    // Canvas atom hands off to the real hero atom at the end of the exit
    const alpha = exiting ? 1 - clamp((t - tExit - 0.8) / 0.35) : 1;
    if (alpha <= 0) return;

    // Nucleus glow, brightest while it holds particles
    const held = particles.length ? particles.filter(p => p.mode === 'script' && t < p.bd && t > p.gd + p.gdur * 0.6).length / particles.length : 0;
    const core = (0.25 + held * 0.9) * alpha;
    const R = 46 * atom.s * (1 + held * 0.6);
    const g = ctx.createRadialGradient(atom.x, atom.y, 0, atom.x, atom.y, R);
    g.addColorStop(0,   `rgba(255,255,255,${core})`);
    g.addColorStop(0.3, `rgba(192,168,255,${core * 0.6})`);
    g.addColorStop(1,   'rgba(126,184,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(atom.x, atom.y, R, 0, Math.PI * 2); ctx.fill();

    // Burst flash
    const fb = (t - T_BURST) / 0.9;
    if (fb > 0 && fb < 1) {
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - fb)})`;
      ctx.lineWidth = 2 * (1 - fb) + 0.5;
      ctx.beginPath();
      ctx.arc(atomStart.x, atomStart.y, easeOutCubic(fb) * Math.max(W, H) * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }

    ORBITS.forEach((o, i) => {
      const prog = clamp((t - 1.0 - i * 0.18) / 0.9);
      if (prog <= 0) return;
      const [r, gg, b] = o.color;
      ctx.strokeStyle = `rgba(${r},${gg},${b},${0.4 * alpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(atom.x, atom.y, o.a * atom.s, o.b * atom.s, o.rz, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * easeInOutCubic(prog));
      ctx.stroke();

      const ea = clamp((prog - 0.5) * 2) * alpha;
      if (ea <= 0) return;
      o.hist.forEach((pos, j) => {
        const k = j / o.hist.length;
        ctx.fillStyle = `rgba(${r},${gg},${b},${k * k * 0.7 * ea})`;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, k * 4 * Math.max(0.6, atom.s), 0, Math.PI * 2); ctx.fill();
      });
      const head = o.hist[o.hist.length - 1];
      ctx.fillStyle = `rgba(${r},${gg},${b},${ea})`;
      ctx.shadowColor = `rgb(${r},${gg},${b})`;
      ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(head.x, head.y, 5 * Math.max(0.6, atom.s), 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  // ── Control ──────────────────────────────────────────────────────────────
  function exit() {
    if (exiting) return;
    window.scrollTo(0, 0);
    measureAvatar();
    exitFrom = atomAt(t);
    exiting = true;
    tExit = t;
    particles.forEach(p => { p.mode = 'exit'; p.ex = p.x; p.ey = p.y; });
    overlay.classList.add('leaving');
    root.classList.add('intro-leaving');
  }

  function finish() {
    cancelAnimationFrame(raf);
    detach();
    root.classList.remove('intro', 'intro-leaving');
    overlay.classList.remove('leaving');
  }

  function onMove(e) {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
    lastPointer = t;
  }
  function onLeave() { pointer.active = false; }
  function onDown(e) {
    if (e.target.closest('button')) return;
    onMove(e);
    waves.push({ x: e.clientX, y: e.clientY, t0: t });
  }
  function onKey(e) {
    if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); exit(); }
  }
  function onResize() {
    build();
    if (t > T_BURST) {
      particles.forEach(p => {
        p.mode = 'live';
        p.x = p.px = p.tx + (Math.random() - 0.5) * 300;
        p.y = p.py = p.ty + (Math.random() - 0.5) * 300;
      });
    }
  }

  function attach() {
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    enterBtn.addEventListener('click', exit);
    skipBtn.addEventListener('click', exit);
  }
  function detach() {
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    enterBtn.removeEventListener('click', exit);
    skipBtn.removeEventListener('click', exit);
  }

  function play() {
    root.classList.add('intro');
    root.classList.remove('intro-leaving');
    overlay.classList.remove('leaving');
    window.scrollTo(0, 0);
    shown.forEach(el => el.classList.remove('show'));
    shown.clear();
    t = 0; lastNow = null; exiting = false; lastPointer = 0; wordIdx = -1;
    waves = [];
    pointer.active = false;
    ORBITS.forEach((o, i) => { o.angle = i * 1.2; o.hist = []; });
    build();
    attach();
    raf = requestAnimationFrame(frame);
  }

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const replay = document.querySelector('.replay-intro');
  if (replay) replay.addEventListener('click', () => { cancelAnimationFrame(raf); detach(); play(); });

  if (!root.classList.contains('intro')) return;

  // Wait for DM Sans so the lettering is sampled from the real typeface
  const fontReady = document.fonts && document.fonts.load
    ? document.fonts.load('700 100px "DM Sans"').catch(() => {})
    : Promise.resolve();
  Promise.race([fontReady, new Promise(r => setTimeout(r, 1500))]).then(() => {
    try { play(); } catch (err) { finish(); throw err; }
  });
})();
