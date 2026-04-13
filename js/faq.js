/* ── Theme ── */
const html = document.documentElement;
const themeBtn = document.getElementById("themeBtn");
const savedTheme = localStorage.getItem("pdfmaster-theme");
if (savedTheme) html.setAttribute("data-theme", savedTheme);
themeBtn.addEventListener("click", () => {
  const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  localStorage.setItem("pdfmaster-theme", next);
});

/* ── Hamburger ── */
const hamburgerBtn = document.getElementById("hamburgerBtn");
const navDropdown = document.getElementById("navDropdown");
const navOverlay = document.getElementById("navOverlay");
const openMenu = () => {
  hamburgerBtn.classList.add("open");
  navDropdown.classList.add("open");
  navOverlay.classList.add("active");
  hamburgerBtn.setAttribute("aria-expanded", "true");
};
const closeMenu = () => {
  hamburgerBtn.classList.remove("open");
  navDropdown.classList.remove("open");
  navOverlay.classList.remove("active");
  hamburgerBtn.setAttribute("aria-expanded", "false");
};
hamburgerBtn.addEventListener("click", () =>
  hamburgerBtn.classList.contains("open") ? closeMenu() : openMenu(),
);
navOverlay.addEventListener("click", closeMenu);
navDropdown
  .querySelectorAll("a")
  .forEach((a) => a.addEventListener("click", closeMenu));

/* ── Category filter ── */
const allItems = Array.from(document.querySelectorAll(".faq-item"));
const allGroups = Array.from(document.querySelectorAll(".faq-group"));
const tabs = document.querySelectorAll(".ctab");
const noResults = document.getElementById("noResults");

function applyFilter(cat) {
  let visible = 0;
  allItems.forEach((item) => {
    const show = cat === "all" || item.dataset.cat === cat;
    item.style.display = show ? "" : "none";
    if (show) visible++;
  });
  allGroups.forEach((g) => {
    g.style.display = cat === "all" || g.dataset.group === cat ? "" : "none";
  });
  noResults.classList.toggle("show", visible === 0);
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    applyFilter(tab.dataset.cat);
    document.getElementById("faqSearch").value = "";
    document.getElementById("searchCount").textContent = "";
  });
});

/* ── Live search ── */
const searchInput = document.getElementById("faqSearch");
const searchCount = document.getElementById("searchCount");

searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  tabs.forEach((t) => t.classList.remove("active"));
  document.querySelector('[data-cat="all"]').classList.add("active");

  if (!q) {
    allItems.forEach((i) => (i.style.display = ""));
    allGroups.forEach((g) => (g.style.display = ""));
    noResults.classList.remove("show");
    searchCount.textContent = "";
    return;
  }

  let found = 0;
  const groupsWithHits = new Set();
  allItems.forEach((item) => {
    const qText = (item.dataset.q || "").toLowerCase();
    const qBtn = item.querySelector(".faq-q").textContent.toLowerCase();
    const qAns =
      (item.querySelector(".faq-a-inner") || {}).textContent?.toLowerCase() ||
      "";
    const match = qText.includes(q) || qBtn.includes(q) || qAns.includes(q);
    item.style.display = match ? "" : "none";
    if (match) {
      found++;
      groupsWithHits.add(item.dataset.cat);
    }
  });
  allGroups.forEach((g) => {
    g.style.display = groupsWithHits.has(g.dataset.group) ? "" : "none";
  });
  noResults.classList.toggle("show", found === 0);
  searchCount.textContent =
    found > 0 ? `${found} question${found !== 1 ? "s" : ""} found` : "";
});

/* ── Accordion ── */
document.querySelectorAll(".faq-q").forEach((q) => {
  q.addEventListener("click", () => {
    const item = q.closest(".faq-item");
    const wasOpen = item.classList.contains("open");
    document.querySelectorAll(".faq-item.open").forEach((i) => {
      i.classList.remove("open");
      i.querySelector(".faq-q").setAttribute("aria-expanded", "false");
    });
    if (!wasOpen) {
      item.classList.add("open");
      q.setAttribute("aria-expanded", "true");
    }
  });
});

/* ── Scroll reveal ── */
const ro = new IntersectionObserver(
  (es) =>
    es.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        ro.unobserve(e.target);
      }
    }),
  { threshold: 0.07, rootMargin: "0px 0px -30px 0px" },
);
document.querySelectorAll(".rv").forEach((el) => ro.observe(el));

/* ── Smooth scroll ── */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const t = document.querySelector(a.getAttribute("href"));
    if (t) {
      e.preventDefault();
      t.scrollIntoView({ behavior: "smooth" });
    }
  });
});

/* ── Back to top ── */
const b2t = document.getElementById("b2t");
window.addEventListener(
  "scroll",
  () => b2t.classList.toggle("show", scrollY > 400),
  { passive: true },
);
b2t.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);

/* ── Auto-count badges ── */
const counts = { all: allItems.length };
allItems.forEach((i) => {
  const c = i.dataset.cat;
  counts[c] = (counts[c] || 0) + 1;
});
Object.entries(counts).forEach(([cat, n]) => {
  const el = document.getElementById(`cnt-${cat}`);
  if (el) el.textContent = n;
});
const totalEl = document.getElementById("totalFaqs");
if (totalEl) totalEl.textContent = allItems.length;
