/* Theme */
const root = document.documentElement;
(function () {
  root.setAttribute(
    "data-theme",
    localStorage.getItem("pdfmaster-theme") || "light",
  );
})();
document.getElementById("themeToggle").addEventListener("click", () => {
  const n = root.getAttribute("data-theme") === "light" ? "dark" : "light";
  root.setAttribute("data-theme", n);
  localStorage.setItem("pdfmaster-theme", n);
});
/* Drawer */
const menuBtn = document.getElementById("menuToggle");
const drawer = document.getElementById("mobileDrawer");
const overlay = document.getElementById("drawerOverlay");
const closeBtn = document.getElementById("drawerClose");
function openDrawer() {
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  menuBtn.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
  closeBtn.focus();
}
function closeDrawer() {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
  menuBtn.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
  menuBtn.focus();
}
menuBtn.addEventListener("click", openDrawer);
closeBtn.addEventListener("click", closeDrawer);
overlay.addEventListener("click", closeDrawer);
drawer
  .querySelectorAll("a")
  .forEach((a) => a.addEventListener("click", closeDrawer));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
});
/* Back to top */
const btt = document.getElementById("btt");
let bttTicking = false;

window.addEventListener(
  "scroll",
  () => {
    if (!bttTicking) {
      window.requestAnimationFrame(() => {
        btt.classList.toggle("vis", window.scrollY > 500);
        bttTicking = false;
      });
      bttTicking = true;
    }
  },
  { passive: true },
);
btt.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);
/* Reading / TOC progress */
const rbar = document.getElementById("rbar");
const tpb = document.getElementById("tprogbar");
let ticking = false;

window.addEventListener(
  "scroll",
  () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const winScroll = window.scrollY;
        const height =
          document.documentElement.scrollHeight - window.innerHeight;
        const scrolled = (winScroll / height) * 100;
        const pct = scrolled.toFixed(1) + "%";

        if (rbar) {
          rbar.style.width = pct;
          rbar.setAttribute("aria-valuenow", Math.round(scrolled));
        }
        if (tpb) tpb.style.width = pct;
        ticking = false;
      });
      ticking = true;
    }
  },
  { passive: true },
);
/* FAQ */
document.querySelectorAll(".fq").forEach((btn) => {
  btn.addEventListener("click", () => {
    const item = btn.closest(".fitem");
    const was = item.classList.contains("open");
    document.querySelectorAll(".fitem.open").forEach((el) => {
      el.classList.remove("open");
      el.querySelector(".fq").setAttribute("aria-expanded", "false");
    });
    if (!was) {
      item.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
    }
  });
});
/* Mobile TOC */
const mtocWrap = document.getElementById("mtoc");
const mtocBtn = document.getElementById("mtocToggle");
if (mtocBtn) {
  mtocBtn.addEventListener("click", () => {
    const open = mtocWrap.classList.toggle("open");
    mtocBtn.setAttribute("aria-expanded", String(open));
  });
  mtocWrap.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      mtocWrap.classList.remove("open");
      mtocBtn.setAttribute("aria-expanded", "false");
    }),
  );
}
/* Scroll reveal */
const revObs = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        revObs.unobserve(e.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
);
document.querySelectorAll(".reveal").forEach((el) => revObs.observe(el));
/* Bar charts */
const barObs = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.querySelectorAll(".bfill").forEach((b) => {
          setTimeout(() => {
            b.style.width = (b.getAttribute("data-width") || "0") + "%";
          }, 120);
        });
        barObs.unobserve(e.target);
      }
    });
  },
  { threshold: 0.25 },
);
document.querySelectorAll(".bchart").forEach((bc) => barObs.observe(bc));
/* TOC active highlight */
const tocLinks = document.querySelectorAll(".toclist a");
const tocObs = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        tocLinks.forEach((a) => a.classList.remove("ta"));
        const a = document.querySelector(`.toclist a[href="#${e.target.id}"]`);
        if (a) a.classList.add("ta");
      }
    });
  },
  { rootMargin: `-${68 + 24}px 0px -55% 0px` },
);
document.querySelectorAll("section[id]").forEach((s) => tocObs.observe(s));
