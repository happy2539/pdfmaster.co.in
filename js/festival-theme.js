/**
 * PDFMaster Festival Theme Engine — Diwali Navbar Runtime
 * In-nav theme engine: manages Left & Right dancing Diyas, interactive Anar cracker fountain,
 * cascading downward golden sparkles, and festive navbar buttons.
 */

(function () {
  "use strict";

  const STORAGE_KEY = "pdfmaster_festival_theme";
  const WORKER_ENDPOINT = "https://admin-tracking-pdfmaster.guptamrhappy.workers.dev/api/theme";

  // Rich Vector Artwork: Dancing Terracotta Diya & Sparkling Diwali Anar Cracker
  const FESTIVAL_ASSETS = {
    // ── Dancing Clay Diya Lamp (Used for Left and Right Navbar positions) ──
    diya: `
      <svg class="diwali-nav-diya" viewBox="0 0 36 34" width="34" height="32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Diwali Diya">
        <!-- Terracotta Clay Diya Base -->
        <path d="M4 21 C4 29 18 31 18 31 C18 31 32 29 32 21 C28 18 18 18 18 18 C18 18 8 18 4 21 Z" fill="#b7410e" stroke="#8d2600" stroke-width="1"/>
        <!-- Golden Brass Rim -->
        <path d="M6 21 C11 23.5 25 23.5 30 21" stroke="#ffd54f" stroke-width="1.3" stroke-linecap="round"/>
        <!-- Oil Reservoir -->
        <ellipse cx="18" cy="19.5" rx="10" ry="2.2" fill="#ffb300"/>
        <!-- Dancing Triple Flame -->
        <g class="diya-flame-anim">
          <!-- Outer Flame Halo -->
          <path d="M18 3 C21 9 24 13 22 17 C20.5 20 15.5 20 14 17 C12 13 15 9 18 3 Z" fill="#ff6d00"/>
          <!-- Middle Flame -->
          <path d="M18 6 C20 10 22 13 20.5 16 C19.5 18 16.5 18 15.5 16 C14 13 16 10 18 6 Z" fill="#ffb300"/>
          <!-- Inner Core White/Yellow Flame -->
          <path d="M18 9 C19 12 20 14 19 16 C18.5 17 17.5 17 17 16 C16 14 17 12 18 9 Z" fill="#fffde7"/>
        </g>
      </svg>
    `,

    // ── Animated Diwali Cracker (Anar Fountain Sparkler with Shooting Sparks) ──
    anarCracker: `
      <svg class="diwali-anar-cracker" viewBox="0 0 38 42" width="34" height="36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Diwali Anar Cracker">
        <!-- Radiating Fountain Sparks -->
        <g class="anar-sparks-anim">
          <!-- Spark Rays -->
          <path d="M19 14 L19 2 M18 10 L14 3 M20 10 L24 3 M18 12 L11 6 M20 12 L27 6 M17 13 L8 10 M21 13 L30 10" stroke="#ffd700" stroke-width="1.6" stroke-linecap="round"/>
          <!-- Twinkling Spark Dots -->
          <circle class="spark-dot spark-dot-1" cx="19" cy="3" r="1.8" fill="#fff59d"/>
          <circle class="spark-dot spark-dot-2" cx="13" cy="5" r="1.5" fill="#ff9100"/>
          <circle class="spark-dot spark-dot-3" cx="25" cy="5" r="1.5" fill="#ffeb3b"/>
          <circle class="spark-dot spark-dot-4" cx="8" cy="10" r="1.3" fill="#ff4081"/>
          <circle class="spark-dot spark-dot-5" cx="30" cy="10" r="1.3" fill="#00e5ff"/>
        </g>
        <!-- Nozzle Glow Core -->
        <ellipse cx="19" cy="16" rx="4.5" ry="2" fill="#ffea00"/>
        <circle cx="19" cy="15" r="2.2" fill="#ffffff"/>
        <!-- Conical Anar Body -->
        <path d="M15 16 L23 16 L29 36 C29 38 9 38 9 36 Z" fill="#c2185b" stroke="#880e4f" stroke-width="1"/>
        <!-- Gold Decorative Ribbons on Anar -->
        <path d="M14 22 L24 22" stroke="#ffd700" stroke-width="1.4"/>
        <path d="M12 29 L26 29" stroke="#ffb300" stroke-width="1.4"/>
        <circle cx="19" cy="25" r="1.8" fill="#ffd700"/>
        <!-- Base Stand -->
        <rect x="7" y="36" width="24" height="3.5" rx="1.5" fill="#5d4037"/>
      </svg>
    `
  };

  // ── 60fps Golden Cascading Falling Sparkles & Ember Engine ──
  class DiwaliParticleEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
      this.particles = [];
      this.animId = null;
      this.isRunning = false;
      this.maxParticles = window.innerWidth < 480 ? 18 : (window.innerWidth < 768 ? 28 : 55);

      this.init();
    }

    init() {
      if (!this.canvas || !this.ctx) return;
      this.resize();
      window.addEventListener("resize", () => this.resize(), { passive: true });
      this.createParticles();
      this.start();
    }

    resize() {
      if (!this.canvas) return;
      this.width = this.canvas.width = window.innerWidth;
      this.height = this.canvas.height = window.innerHeight;
      this.maxParticles = window.innerWidth < 480 ? 18 : (window.innerWidth < 768 ? 28 : 55);
    }

    createParticles() {
      this.particles = [];
      for (let i = 0; i < this.maxParticles; i++) {
        // Initial scatter down the screen on page load
        this.particles.push(this.newParticle(true));
      }
    }

    newParticle(randomY = false) {
      const colors = ["#ffd54f", "#ffb300", "#ff9100", "#ffea00", "#ffffff", "#ffe082", "#fff59d"];
      const h = this.height || window.innerHeight;
      return {
        x: Math.random() * (this.width || window.innerWidth),
        y: randomY ? Math.random() * h : -15,
        radius: Math.random() * 2.2 + 0.9,
        speedY: Math.random() * 1.5 + 0.8, // Clearly cascading downwards!
        speedX: (Math.random() - 0.5) * 0.6,
        swaySpeed: Math.random() * 0.03 + 0.015,
        swayAngle: Math.random() * Math.PI * 2,
        opacity: Math.random() * 0.75 + 0.25,
        color: colors[Math.floor(Math.random() * colors.length)]
      };
    }

    burst(originX, originY) {
      const colors = ["#ffd700", "#ff007f", "#00e5ff", "#76ff03", "#ffea00", "#ffffff", "#ff9100"];
      for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3.5 + 1.2;
        this.particles.push({
          x: originX,
          y: originY,
          radius: Math.random() * 2.5 + 1,
          speedY: Math.sin(angle) * speed + 1.2, // arcs and falls down!
          speedX: Math.cos(angle) * speed,
          swaySpeed: 0.02,
          swayAngle: 0,
          opacity: 1,
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }
    }

    update() {
      const w = this.width || window.innerWidth;
      const h = this.height || window.innerHeight;

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        p.swayAngle += p.swaySpeed;
        p.x += p.speedX + Math.sin(p.swayAngle) * 0.45;
        p.y += p.speedY;

        if (p.y > h + 15 || p.x < -20 || p.x > w + 20) {
          if (this.particles.length > this.maxParticles) {
            this.particles.splice(i, 1);
            i--;
          } else {
            this.particles[i] = this.newParticle(false);
          }
        }
      }
    }

    draw() {
      if (!this.ctx) return;
      const w = this.width || window.innerWidth;
      const h = this.height || window.innerHeight;
      this.ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const alpha = Math.max(0.12, p.opacity * (0.65 + Math.sin(p.swayAngle * 2) * 0.35));
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = p.color;
        this.ctx.globalAlpha = alpha;
        this.ctx.shadowBlur = 5;
        this.ctx.shadowColor = p.color;
        this.ctx.fill();
      }
      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = 1;
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      const loop = () => {
        if (!this.isRunning) return;
        this.update();
        this.draw();
        this.animId = requestAnimationFrame(loop);
      };
      this.animId = requestAnimationFrame(loop);
    }

    stop() {
      this.isRunning = false;
      if (this.animId) {
        cancelAnimationFrame(this.animId);
        this.animId = null;
      }
      if (this.ctx) {
        this.ctx.clearRect(0, 0, this.width || 300, this.height || 68);
      }
    }
  }

  let activeParticleEngine = null;

  // ── Render Diwali Theme onto the Navbar ──
  function applyTheme(data) {
    if (!data || !data.active || !data.theme || data.theme === "none") {
      cleanupTheme();
      return;
    }

    const htmlEl = document.documentElement;
    const header = document.querySelector("header");
    const canvas = document.getElementById("festivalCanvas");
    const diyaLeft = document.getElementById("navDiyaLeft");
    const diyaRight = document.getElementById("navDiyaSlot");
    const crackerSlot = document.getElementById("navCrackerSlot");
    const pill = document.getElementById("navDiwaliPill");
    const toran = document.getElementById("diwaliToranBorder");

    if (!header) return;

    // 1. Set root & header attributes for CSS accents
    htmlEl.setAttribute("data-festival", data.theme);
    header.setAttribute("data-festival", data.theme);

    // Apply forced initial theme mode (dark/light) if visitor has not toggled during this session
    const userManuallyToggled = sessionStorage.getItem("pdfmaster_user_toggled_theme");
    if (!userManuallyToggled && data.initialThemeMode && (data.initialThemeMode === "dark" || data.initialThemeMode === "light")) {
      if (typeof window.PDFMasterApplyTheme === "function") {
        window.PDFMasterApplyTheme(data.initialThemeMode);
      } else {
        htmlEl.setAttribute("data-theme", data.initialThemeMode);
      }
    }

    // 2. Inject Dancing Diya on the LEFT side of the navbar (before logo)
    if (diyaLeft) {
      if (data.leftDiya !== false) {
        diyaLeft.innerHTML = FESTIVAL_ASSETS.diya;
        diyaLeft.style.display = "flex";
      } else {
        diyaLeft.innerHTML = "";
        diyaLeft.style.display = "none";
      }
    }

    // 3. Inject Dancing Diya on the RIGHT side of the navbar
    if (diyaRight) {
      if (data.mascotAnimation !== false) {
        diyaRight.innerHTML = FESTIVAL_ASSETS.diya;
        diyaRight.style.display = "flex";
      } else {
        diyaRight.innerHTML = "";
        diyaRight.style.display = "none";
      }
    }

    // 4. Inject Animated Anar Cracker Fountain in Nav
    if (crackerSlot) {
      if (data.crackerAnimation !== false) {
        crackerSlot.innerHTML = FESTIVAL_ASSETS.anarCracker;
        crackerSlot.style.display = "flex";

        // Interactive Click Pop for Cracker Sparks!
        crackerSlot.onclick = (e) => {
          if (activeParticleEngine) {
            const rect = crackerSlot.getBoundingClientRect();
            activeParticleEngine.burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
          }
        };
      } else {
        crackerSlot.innerHTML = "";
        crackerSlot.style.display = "none";
      }
    }

    // 5. Show In-Nav Diwali Badge and Toran Border
    if (pill) pill.style.display = "inline-flex";
    if (toran) toran.style.display = "block";

    // 6. Start Cascading Golden Falling Sparkles Canvas
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (canvas && data.snowfall !== false && !prefersReducedMotion) {
      canvas.style.display = "block";
      if (!activeParticleEngine) {
        activeParticleEngine = new DiwaliParticleEngine(canvas);
      }
    } else if (activeParticleEngine) {
      activeParticleEngine.stop();
      activeParticleEngine = null;
      if (canvas) canvas.style.display = "none";
    }
  }

  function cleanupTheme() {
    document.documentElement.removeAttribute("data-festival");
    const header = document.querySelector("header");
    if (header) header.removeAttribute("data-festival");
    const canvas = document.getElementById("festivalCanvas");
    if (canvas) canvas.style.display = "none";

    const diyaLeft = document.getElementById("navDiyaLeft");
    if (diyaLeft) {
      diyaLeft.innerHTML = "";
      diyaLeft.style.display = "none";
    }

    const diyaRight = document.getElementById("navDiyaSlot");
    if (diyaRight) {
      diyaRight.innerHTML = "";
      diyaRight.style.display = "none";
    }

    const crackerSlot = document.getElementById("navCrackerSlot");
    if (crackerSlot) {
      crackerSlot.innerHTML = "";
      crackerSlot.style.display = "none";
    }

    const pill = document.getElementById("navDiwaliPill");
    if (pill) pill.style.display = "none";

    const toran = document.getElementById("diwaliToranBorder");
    if (toran) toran.style.display = "none";

    if (activeParticleEngine) {
      activeParticleEngine.stop();
      activeParticleEngine = null;
    }
  }

  // ── Floating Badge for Live Preview Mode ──
  function renderFloatingPreviewBadge() {
    if (document.getElementById("festPreviewFloatingBadge")) return;
    const badge = document.createElement("div");
    badge.id = "festPreviewFloatingBadge";
    badge.innerHTML = `
      <div style="position: fixed; bottom: 18px; right: 18px; z-index: 99999; background: #120a0e; color: #ffffff; padding: 9px 16px; border-radius: 999px; box-shadow: 0 8px 25px rgba(255,145,0,0.35); display: flex; align-items: center; gap: 10px; font-size: 0.82rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; border: 1.5px solid rgba(255,179,0,0.6);">
        <span>🪔 <strong>Diwali Navbar Preview Active</strong> (Click Cracker for Sparks!)</span>
        <button id="festExitPreviewBtn" style="background: rgba(255,179,0,0.25); border: 1px solid rgba(255,179,0,0.5); color: #ffeb3b; padding: 3px 10px; border-radius: 6px; cursor: pointer; font-size: 0.74rem; font-weight: 700; transition: all 0.2s;">Exit</button>
      </div>
    `;
    document.body.appendChild(badge);

    document.getElementById("festExitPreviewBtn")?.addEventListener("click", () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("fest_preview");
      url.searchParams.delete("preview_theme");
      url.searchParams.delete("cfg");
      url.searchParams.delete("theme");
      localStorage.removeItem(STORAGE_KEY);
      window.location.href = url.pathname + (url.search ? url.search : "");
    });
  }

  // ── Sync with KV Worker Backend (Non-Blocking) ──
  async function syncTheme() {
    const urlParams = new URLSearchParams(window.location.search);
    const isPreview = urlParams.has("fest_preview") || urlParams.has("preview_theme");

    // 1. If in Preview Mode from Test Button:
    if (isPreview) {
      let previewConfig = {
        active: true,
        theme: "diwali",
        leftDiya: true,
        mascotAnimation: true,
        crackerAnimation: true,
        snowfall: true,
        initialThemeMode: "dark"
      };

      try {
        const rawCfg = urlParams.get("cfg") || urlParams.get("data");
        if (rawCfg) {
          previewConfig = Object.assign(previewConfig, JSON.parse(decodeURIComponent(rawCfg)));
        }
      } catch (_) {}

      previewConfig.active = true;
      previewConfig.theme = "diwali";
      localStorage.setItem(STORAGE_KEY, JSON.stringify(previewConfig));
      applyTheme(previewConfig);
      renderFloatingPreviewBadge();
      return; // Do NOT let the background worker fetch overwrite the preview!
    }

    // 2. Check localStorage (instant render from local draft or cached theme)
    let localData = null;
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        localData = JSON.parse(cached);
        if (localData && localData.active && localData.theme && localData.theme !== "none") {
          applyTheme(localData);
        }
      }
    } catch (_) {}

    // 3. Background Fetch to Cloudflare KV Edge
    try {
      const res = await fetch(WORKER_ENDPOINT, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      if (!res.ok) return;
      const remoteData = await res.json();

      const isLocalhost = window.location.hostname === "localhost" ||
                          window.location.hostname === "127.0.0.1" ||
                          window.location.hostname.endsWith(".localhost") ||
                          window.location.protocol === "file:";

      // If developer is on localhost and has an active local theme draft, preserve it
      if (isLocalhost && localData && localData.active && (!remoteData || !remoteData.active)) {
        return;
      }

      if (remoteData) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteData));
        applyTheme(remoteData);
      }
    } catch (err) {
      console.debug("[Festival Theme] Edge sync skipped or offline:", err);
    }
  }

  // Auto-init on DOM Ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncTheme);
  } else {
    syncTheme();
  }
})();
