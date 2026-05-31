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
const menuBtn = document.getElementById("menuToggle"),
  drawer = document.getElementById("mobileDrawer"),
  overlay = document.getElementById("drawerOverlay"),
  closeBtn = document.getElementById("drawerClose");
function openDrawer() {
  drawer.classList.add("open");
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  menuBtn.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
  closeBtn.focus();
}
function closeDrawer() {
  drawer.classList.remove("open");
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
const btt = document.getElementById("btt");
window.addEventListener(
  "scroll",
  () => btt.classList.toggle("vis", window.scrollY > 500),
  { passive: true },
);
btt.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);
const rbar = document.getElementById("rbar"),
  tpb = document.getElementById("tprogbar");
window.addEventListener(
  "scroll",
  () => {
    const p =
      (
        (window.scrollY /
          Math.max(1, document.body.scrollHeight - window.innerHeight)) *
        100
      ).toFixed(1) + "%";
    rbar.style.width = p;
    if (tpb) tpb.style.width = p;
  },
  { passive: true },
);
document.querySelectorAll(".fq").forEach((btn) => {
  btn.addEventListener("click", () => {
    const item = btn.closest(".fitem"),
      was = item.classList.contains("open");
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
const mtocWrap = document.getElementById("mtoc"),
  mtocBtn = document.getElementById("mtocToggle");
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
const dpiObs = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.querySelectorAll(".dpi-bar").forEach((b) => {
          setTimeout(() => {
            b.style.width = (b.getAttribute("data-dpi") || "0") + "%";
          }, 120);
        });
        dpiObs.unobserve(e.target);
      }
    });
  },
  { threshold: 0.3 },
);
document.querySelectorAll(".dpi-scale").forEach((d) => dpiObs.observe(d));
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
