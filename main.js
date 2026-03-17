// ── Star canvas background ────────────────────────────────────────────────────
(function () {
  const canvas = document.getElementById('stars');
  const ctx    = canvas.getContext('2d');
  let W, H;

  const stars = Array.from({ length: 220 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.4 + 0.2,
    a: Math.random(),
    speed: 0.0002 + Math.random() * 0.0004,
    twinkleOffset: Math.random() * Math.PI * 2,
  }));

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  let t = 0;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    t += 0.016;
    stars.forEach(s => {
      const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.5 + s.twinkleOffset));
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220, 210, 255, ${twinkle * s.a * 0.8})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

// ── Navbar scroll tint ────────────────────────────────────────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

// ── Smooth nav link scroll ────────────────────────────────────────────────────
document.querySelectorAll('.nav-links a').forEach(a => {
  a.addEventListener('click', e => {
    const href = a.getAttribute('href');
    if (href.startsWith('#')) {
      e.preventDefault();
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ── Scroll reveal (IntersectionObserver) ─────────────────────────────────────
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// ── Stagger-reveal project cards ─────────────────────────────────────────────
const cardObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const cards = entry.target.querySelectorAll('.proj-card, .about-card, .contact-card');
      cards.forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(28px)';
        setTimeout(() => {
          card.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(.22,1,.36,1)';
          card.style.opacity = '1';
          card.style.transform = 'none';
        }, i * 90);
      });
      cardObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.projects-grid, .about-grid, .contact-grid').forEach(el => {
  // Pre-hide cards so stagger works even if parent already revealed
  el.querySelectorAll('.proj-card, .about-card, .contact-card').forEach(c => {
    c.style.opacity = '0';
  });
  cardObserver.observe(el);
});

// ── Pill hover ripple ─────────────────────────────────────────────────────────
document.querySelectorAll('.pill').forEach(pill => {
  pill.addEventListener('mouseenter', () => {
    const hue = Math.floor(Math.random() * 60) + 240; // blue-purple range
    pill.style.borderColor = `hsl(${hue},70%,65%)`;
    pill.style.color = `hsl(${hue},70%,80%)`;
  });
  pill.addEventListener('mouseleave', () => {
    pill.style.borderColor = '';
    pill.style.color = '';
  });
});

// ── Electron orbit animation ──────────────────────────────────────────────────
(function () {
  const avatarRing = document.querySelector('.avatar-ring');
  if (!avatarRing) return;

  // Each orbit: a = semi-major axis, b = semi-minor axis (flatter = more tilted),
  // rz = rotation of the ellipse in radians, dur = period in ms, phase = start offset
  const ORBITS = [
    { a: 115, b: 26,  rz: 15  * Math.PI / 180, dur: 2200, phase: 0 },
    { a:  88, b: 52,  rz: 82  * Math.PI / 180, dur: 3700, phase: 1.1 },
    { a: 128, b: 68,  rz: 145 * Math.PI / 180, dur: 5200, phase: 2.4 },
  ];

  const rings = avatarRing.querySelectorAll('.orbit-ring');
  const dots  = avatarRing.querySelectorAll('.e-dot');

  // Lay out the visual ellipse rings (called once + on resize)
  function setupRings() {
    const size  = avatarRing.offsetWidth;
    const scale = size / 280;
    ORBITS.forEach((orb, i) => {
      const a  = orb.a * scale;
      const b  = orb.b * scale;
      const rz = orb.rz * 180 / Math.PI;
      rings[i].style.width     = `${a * 2}px`;
      rings[i].style.height    = `${b * 2}px`;
      rings[i].style.transform = `translate(-50%, -50%) rotate(${rz}deg)`;
    });
  }

  const t0 = performance.now();

  function animate(now) {
    const size  = avatarRing.offsetWidth;
    const scale = size / 280;
    const cx    = size / 2;
    const cy    = size / 2;

    ORBITS.forEach((orb, i) => {
      const a  = orb.a * scale;
      const b  = orb.b * scale;
      const rz = orb.rz;
      const t  = ((now - t0) / orb.dur) * Math.PI * 2 + orb.phase;

      // Parametric point on the ellipse (unrotated)
      const ex = a * Math.cos(t);
      const ey = b * Math.sin(t);

      // Rotate into screen space
      const sx = ex * Math.cos(rz) - ey * Math.sin(rz);
      const sy = ex * Math.sin(rz) + ey * Math.cos(rz);

      dots[i].style.left   = `${cx + sx}px`;
      dots[i].style.top    = `${cy + sy}px`;

      // sin(t) > 0 → dot is on the near half of the orbit → in front of nucleus
      dots[i].style.zIndex = Math.sin(t) > 0 ? 2 : 0;
    });

    requestAnimationFrame(animate);
  }

  setupRings();
  window.addEventListener('resize', setupRings);
  requestAnimationFrame(animate);
})();