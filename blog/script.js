/* Theme */
(function () {
  const t = localStorage.getItem("pdfmaster-theme") || "light";
  document.documentElement.setAttribute("data-theme", t);
})();
document.getElementById("themeBtn").addEventListener("click", () => {
  const c = document.documentElement.getAttribute("data-theme");
  const n = c === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", n);
  localStorage.setItem("pdfmaster-theme", n);
});

/* Hamburger */
const ham = document.getElementById("hamburger");
const drw = document.getElementById("drawer");
ham.addEventListener("click", () => {
  const open = ham.classList.toggle("open");
  drw.classList.toggle("open", open);
  ham.setAttribute("aria-expanded", open);
  drw.setAttribute("aria-hidden", !open);
  document.body.style.overflow = open ? "hidden" : "";
});
drw.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    ham.classList.remove("open");
    drw.classList.remove("open");
    ham.setAttribute("aria-expanded", "false");
    drw.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }),
);

/* Hero tabs — smooth scroll to section */
document.getElementById("heroTabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".hero-tab");
  if (!btn) return;
  document.querySelectorAll(".hero-tab").forEach((b) => {
    b.classList.remove("active");
    b.setAttribute("aria-selected", "false");
  });
  btn.classList.add("active");
  btn.setAttribute("aria-selected", "true");
  const target = document.getElementById("sec-" + btn.dataset.section);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
});

/* Newsletter */

document.getElementById("emailForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("emailInput").value;
  const tokenEl = document.querySelector('[name="cf-turnstile-response"]');
  const token = tokenEl ? tokenEl.value : null;

  if (!token) {
    alert("Please complete verification");
    return;
  }
  try {
    const res = await fetch(
      "https://email-collector.gamingwithhappy39.workers.dev/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, token }),
      },
    );

    const text = await res.text();

    if (res.ok) {
      alert("Subscribed successfully!");
    } else {
      alert(text);
    }
  } catch (err) {
    alert("Network error");
  }
});

/* Scroll reveal */
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.07 },
);
document.querySelectorAll(".rev").forEach((el, i) => {
  el.style.transitionDelay = (i % 6) * 0.07 + "s";
  io.observe(el);
});

/* Back to top */
const btt = document.getElementById("btt");
window.addEventListener(
  "scroll",
  () => btt.classList.toggle("show", scrollY > 380),
  { passive: true },
);
btt.addEventListener("click", () =>
  window.scrollTo({ top: 0, behavior: "smooth" }),
);
