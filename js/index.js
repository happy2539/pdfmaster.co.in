// ── Theme ──────────────────────────────────────────
const btn = document.getElementById("themeBtn");
const root = document.documentElement;
const saved = localStorage.getItem("pdfmaster-theme") || "light";
root.setAttribute("data-theme", saved);

btn.addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  localStorage.setItem("pdfmaster-theme", next);
});

// ── Filter tabs ────────────────────────────────────
document.querySelectorAll(".ftab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".ftab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const f = tab.dataset.filter;
    document.querySelectorAll(".tcard").forEach((c) => {
      c.style.display = f === "all" || c.dataset.cat === f ? "flex" : "none";
    });
  });
});

// ── Smooth scroll ──────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const t = document.querySelector(a.getAttribute("href"));
    if (t) {
      e.preventDefault();
      t.scrollIntoView({ behavior: "smooth" });
    }
  });
});

// ── Scroll Reveal ──────────────────────────────────
const ro = new IntersectionObserver(
  (es) => {
    es.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        ro.unobserve(e.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: "0px 0px -36px 0px" },
);
document.querySelectorAll(".rv").forEach((el) => ro.observe(el));

// Tool cards stagger
const co = new IntersectionObserver(
  (es) => {
    es.forEach((e) => {
      if (e.isIntersecting) {
        e.target.style.opacity = "1";
        e.target.style.transform = "translateY(0)";
      }
    });
  },
  { threshold: 0.06 },
);
document.querySelectorAll(".tcard").forEach((c, i) => {
  c.style.cssText += `opacity:0;transform:translateY(22px);transition:opacity .5s ease ${i * 0.04}s, transform .5s ease ${i * 0.04}s, box-shadow .25s, border-color .25s;`;
  co.observe(c);
});

// ── Back to top ────────────────────────────────────
const b2t = document.getElementById("b2t");
window.addEventListener("scroll", () =>
  b2t.classList.toggle("show", scrollY > 380),
);
b2t.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);
// ── Theme ──────────────────────────────────────────
const btn = document.getElementById("themeBtn");
const root = document.documentElement;
const saved = localStorage.getItem("pdfmaster-theme") || "light";
root.setAttribute("data-theme", saved);

btn.addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  localStorage.setItem("pdfmaster-theme", next);
});

// ── Filter tabs ────────────────────────────────────
document.querySelectorAll(".ftab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".ftab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const f = tab.dataset.filter;
    document.querySelectorAll(".tcard").forEach((c) => {
      c.style.display = f === "all" || c.dataset.cat === f ? "flex" : "none";
    });
  });
});

// ── Smooth scroll ──────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const t = document.querySelector(a.getAttribute("href"));
    if (t) {
      e.preventDefault();
      t.scrollIntoView({ behavior: "smooth" });
    }
  });
});

// ── Scroll Reveal ──────────────────────────────────
const ro = new IntersectionObserver(
  (es) => {
    es.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        ro.unobserve(e.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: "0px 0px -36px 0px" },
);
document.querySelectorAll(".rv").forEach((el) => ro.observe(el));

// Tool cards stagger
const co = new IntersectionObserver(
  (es) => {
    es.forEach((e) => {
      if (e.isIntersecting) {
        e.target.style.opacity = "1";
        e.target.style.transform = "translateY(0)";
      }
    });
  },
  { threshold: 0.06 },
);
document.querySelectorAll(".tcard").forEach((c, i) => {
  c.style.cssText += `opacity:0;transform:translateY(22px);transition:opacity .5s ease ${i * 0.04}s, transform .5s ease ${i * 0.04}s, box-shadow .25s, border-color .25s;`;
  co.observe(c);
});

// ── Back to top ────────────────────────────────────
const b2t = document.getElementById("b2t");
window.addEventListener("scroll", () =>
  b2t.classList.toggle("show", scrollY > 380),
);
b2t.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);
// ── Theme ──────────────────────────────────────────
const btn = document.getElementById("themeBtn");
const root = document.documentElement;
const saved = localStorage.getItem("pdfmaster-theme") || "light";
root.setAttribute("data-theme", saved);

btn.addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  localStorage.setItem("pdfmaster-theme", next);
});

// ── Filter tabs ────────────────────────────────────
document.querySelectorAll(".ftab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".ftab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const f = tab.dataset.filter;
    document.querySelectorAll(".tcard").forEach((c) => {
      c.style.display = f === "all" || c.dataset.cat === f ? "flex" : "none";
    });
  });
});

// ── Smooth scroll ──────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const t = document.querySelector(a.getAttribute("href"));
    if (t) {
      e.preventDefault();
      t.scrollIntoView({ behavior: "smooth" });
    }
  });
});

// ── Scroll Reveal ──────────────────────────────────
const ro = new IntersectionObserver(
  (es) => {
    es.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        ro.unobserve(e.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: "0px 0px -36px 0px" },
);
document.querySelectorAll(".rv").forEach((el) => ro.observe(el));

// Tool cards stagger
const co = new IntersectionObserver(
  (es) => {
    es.forEach((e) => {
      if (e.isIntersecting) {
        e.target.style.opacity = "1";
        e.target.style.transform = "translateY(0)";
      }
    });
  },
  { threshold: 0.06 },
);
document.querySelectorAll(".tcard").forEach((c, i) => {
  c.style.cssText += `opacity:0;transform:translateY(22px);transition:opacity .5s ease ${i * 0.04}s, transform .5s ease ${i * 0.04}s, box-shadow .25s, border-color .25s;`;
  co.observe(c);
});

// ── Back to top ────────────────────────────────────
const b2t = document.getElementById("b2t");
window.addEventListener("scroll", () =>
  b2t.classList.toggle("show", scrollY > 380),
);
b2t.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);
