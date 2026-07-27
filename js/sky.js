/* ============================================================
   sky.js — ambient starfield + weather particles behind the UI
   The scene always follows the real reported weather.
   ============================================================ */
'use strict';

const CFG = {
  snow:  { n: 90,  color: 'rgba(255,255,255,', vy: [0.4, 1.3], vx: [-0.3, 0.3], size: [1.4, 3.2], shape: 'flake', drift: 0.7 },
  rain:  { n: 150, color: 'rgba(150,190,255,', vy: [6, 11],    vx: [-1.6, -0.8], size: [7, 14],  shape: 'streak', drift: 0 },
  wind:  { n: 70,  color: 'rgba(200,215,245,', vy: [-0.2, 0.2], vx: [3, 7],      size: [10, 26], shape: 'gust',   drift: 0 },
  sunny: { n: 40,  color: 'rgba(255,225,170,', vy: [-0.5, -0.1], vx: [-0.2, 0.2], size: [1.2, 2.6], shape: 'mote', drift: 0.4 },
};
const rand = ([a, b]) => a + Math.random() * (b - a);

export class Sky {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.scene = 'sunny';
    this.stars = [];
    this.parts = [];
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
    addEventListener('resize', () => this.resize(), { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop(); else this.start();
    });
    if (!this.reduced) this.start();
  }

  resize() {
    const dpr = this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = this.cv.width = innerWidth * dpr;
    this.H = this.cv.height = innerHeight * dpr;
    this.cv.style.width = `${innerWidth}px`;
    this.cv.style.height = `${innerHeight}px`;
    this.buildStars();
    this.buildParts();
  }

  buildStars() {
    const n = Math.round((innerWidth * innerHeight) / 11000);
    this.stars = Array.from({ length: n }, () => ({
      x: Math.random() * this.W, y: Math.random() * this.H,
      r: (Math.random() * 1.1 + 0.3) * this.dpr,
      a: Math.random() * 0.55 + 0.15, tw: Math.random() * 0.02 + 0.004, ph: Math.random() * 6,
    }));
  }

  buildParts() {
    const c = CFG[this.scene] || CFG.sunny;
    const n = this.reduced ? Math.round(c.n / 3) : c.n;
    this.parts = Array.from({ length: n }, () => this.spawn(c, true));
  }

  spawn(c, anywhere) {
    return {
      x: Math.random() * this.W,
      y: anywhere ? Math.random() * this.H : (c.shape === 'mote' ? this.H + 10 : -20 * this.dpr),
      vx: rand(c.vx) * this.dpr, vy: rand(c.vy) * this.dpr, s: rand(c.size) * this.dpr,
      a: Math.random() * 0.5 + 0.3, ph: Math.random() * 6,
    };
  }

  setScene(name) {
    if (!CFG[name] || name === this.scene) return;
    this.scene = name;
    this.buildParts();
  }

  draw() {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    const t = performance.now() / 1000;
    for (const s of this.stars) {
      const a = s.a * (0.6 + 0.4 * Math.sin(t * s.tw * 60 + s.ph));
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7);
      ctx.fillStyle = `rgba(210,225,255,${a})`; ctx.fill();
    }
    const c = CFG[this.scene] || CFG.sunny;
    for (const p of this.parts) {
      p.x += p.vx + (c.drift ? Math.sin(t + p.ph) * c.drift * this.dpr : 0);
      p.y += p.vy;
      if (c.shape === 'streak') {
        ctx.strokeStyle = `${c.color}${p.a})`; ctx.lineWidth = 1.2 * this.dpr;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 1.4, p.y - p.s); ctx.stroke();
      } else if (c.shape === 'gust') {
        ctx.strokeStyle = `${c.color}${p.a * 0.45})`; ctx.lineWidth = 1.4 * this.dpr;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.s, p.y - p.s * 0.15); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 0.5, 0, 7);
        ctx.fillStyle = `${c.color}${p.a})`; ctx.fill();
      }
      if (p.y > H + 20 || p.x < -30 || p.x > W + 30 || (c.shape === 'mote' && p.y < -20)) {
        Object.assign(p, this.spawn(c, false));
      }
    }
  }

  start() {
    if (this.raf || this.reduced) return;
    const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = null; }
}
