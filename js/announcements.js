(function () {
  "use strict";

  /* ── Constants ──────────────────────────────────── */
  // Published CSV export — works client-side with no CORS issues
  const SHEET_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTMZ3ZZjQtMoJ5lTXEmvqChbetdpktxZprd3imv_KoizLYd2N2bVGiYkElYTuajDVXyC9ydAv79GTBH/pub?output=csv";
  const PAGE_SIZE = 8; // cards per batch
  const CACHE_KEY = "pdfmaster_announcements";
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /* ── State ──────────────────────────────────────── */
  let allItems = []; // full parsed dataset
  let filteredItems = []; // after filter + search + sort
  let renderedCount = 0; // how many cards rendered
  let activeFilter = "all";
  let searchQuery = "";
  let sortOrder = "newest";
  let loading = false;
  let sentinelObserver = null;

  /* ── DOM refs ───────────────────────────────────── */
  const $ = (id) => document.getElementById(id);
  const skeletonGrid = $("skeletonGrid");
  const cardsContainer = $("cardsContainer");
  const emptyState = $("emptyState");
  const errorState = $("errorState");
  const statsCount = $("statsCount");
  const heroMetaText = $("heroMetaText");
  const pinnedBanner = $("pinnedBanner");
  const loadMoreWrap = $("loadMoreWrap");
  const lazySentinel = $("lazySentinel");

  /* ══════════════════════════════════════════════════
       THEME
    ══════════════════════════════════════════════════ */
  const html = document.documentElement;
  const sunIcon = $("sunIcon");
  const moonIcon = $("moonIcon");
  const themeToggle = $("themeBtn");

  function applyTheme(theme) {
    html.setAttribute("data-theme", theme);
    localStorage.setItem("pdfmaster-theme", theme);
    if (theme === "dark") {
      sunIcon.style.display = "block";
      moonIcon.style.display = "none";
    } else {
      sunIcon.style.display = "none";
      moonIcon.style.display = "block";
    }
  }

  (function initTheme() {
    const saved =
      localStorage.getItem("pdfmaster-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");
    applyTheme(saved);
  })();

  themeToggle.addEventListener("click", () => {
    applyTheme(html.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  /* ══════════════════════════════════════════════════
       HAMBURGER / DRAWER
    ══════════════════════════════════════════════════ */
  const hamburgerBtn = $("hamburgerBtn");
  const drawerNav = $("drawerNav");
  const drawerOverlay = $("drawerOverlay");
  const drawerClose = $("drawerClose");

  function openDrawer() {
    drawerNav.classList.add("open");
    drawerOverlay.classList.add("open");
    hamburgerBtn.classList.add("open");
    hamburgerBtn.setAttribute("aria-expanded", "true");
    drawerOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    drawerNav.classList.remove("open");
    drawerOverlay.classList.remove("open");
    hamburgerBtn.classList.remove("open");
    hamburgerBtn.setAttribute("aria-expanded", "false");
    drawerOverlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  hamburgerBtn.addEventListener("click", () =>
    drawerNav.classList.contains("open") ? closeDrawer() : openDrawer(),
  );
  drawerClose.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  /* ══════════════════════════════════════════════════
       BACK TO TOP
    ══════════════════════════════════════════════════ */
  const backTop = $("backTop");
  window.addEventListener(
    "scroll",
    () => {
      backTop.classList.toggle("show", window.scrollY > 400);
    },
    { passive: true },
  );
  backTop.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" }),
  );

  /* ══════════════════════════════════════════════════
       FOOTER YEAR
    ══════════════════════════════════════════════════ */
  $("footerYear").textContent = new Date().getFullYear();

  /* ══════════════════════════════════════════════════
       GOOGLE SHEETS FETCH + PARSE
    ══════════════════════════════════════════════════ */
  function getCached() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { data, version, ts } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_TTL) return null;

      // Restore version if cached
      if (version) window._pmSiteVersion = version;

      // Re-hydrate Date objects after JSON parsing
      data.forEach((item) => {
        if (item.dateObj) {
          item.dateObj = new Date(item.dateObj);
        }
      });

      return data;
    } catch {
      return null;
    }
  }

  function setCache(data) {
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          data,
          version: window._pmSiteVersion,
          ts: Date.now(),
        }),
      );
    } catch {}
  }

  /* ── RFC-4180 CSV parser ──────────────────────────
       Handles quoted fields, embedded commas, escaped
       quotes (""), and Windows/Unix line endings.
    ─────────────────────────────────────────────────── */
  function parseCSV(text) {
    const rows = [];
    let col = 0,
      row = [],
      inQuote = false,
      cell = "";
    // Normalise line endings
    const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const next = s[i + 1];

      if (inQuote) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i++;
        } // escaped quote
        else if (ch === '"') {
          inQuote = false;
        } // closing quote
        else {
          cell += ch;
        }
      } else {
        if (ch === '"') {
          inQuote = true;
        } else if (ch === ",") {
          row.push(cell);
          cell = "";
        } else if (ch === "\n") {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
        } else {
          cell += ch;
        }
      }
    }
    // Last cell / row
    if (cell !== "" || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  function parseSheetData(csvText) {
    const rows = parseCSV(csvText.trim());
    if (rows.length < 2) return []; // empty sheet

    // First row = header labels (case-insensitive)
    const headers = rows[0].map((h) => h.toLowerCase().trim());

    function colIdx(key) {
      return headers.indexOf(key);
    }
    function getCol(row, key) {
      const i = colIdx(key);
      return i >= 0 && row[i] !== undefined ? row[i].trim() : "";
    }

    return rows
      .slice(1)
      .map((row, idx) => {
        // Skip completely empty rows
        if (row.every((c) => !c.trim())) return null;

        const title = getCol(row, "title");
        const dateRaw = getCol(row, "date");
        const type = (getCol(row, "type") || "news").toLowerCase();
        const message =
          getCol(row, "message") ||
          getCol(row, "content") ||
          getCol(row, "body") ||
          getCol(row, "description") ||
          "";
        const priority = getCol(row, "priority").toLowerCase();
        const status = getCol(row, "status").toLowerCase();
        const link = getCol(row, "link") || getCol(row, "url");
        const linkLabel =
          getCol(row, "linklabel") || getCol(row, "link label") || "Learn more";
        const websiteVersion =
          getCol(row, "website version") || getCol(row, "version") || "";

        // Version row: Type = "version" → store globally, skip as a card
        if (type === "version") {
          const ver =
            getCol(row, "version") ||
            getCol(row, "value") ||
            getCol(row, "message") ||
            getCol(row, "content") ||
            title;
          if (ver) window._pmSiteVersion = ver.trim();
          return null;
        }

        if (!title) return null;
        // Hide archived / inactive / draft rows
        if (["archived", "inactive", "draft"].includes(status)) return null;

        // Parse date + time — Google Sheets CSV can give:
        //   "5/18/2025"           → date only
        //   "5/18/2025 14:30:00"  → date + time in one cell
        //   "2025-05-18T14:30:00" → ISO with time
        let dateObj = null;
        let timeFromDate = false; // true if time was embedded in the Date cell
        if (dateRaw) {
          let parsed = new Date(dateRaw);
          // If Invalid Date, try parsing DD/MM/YYYY
          if (isNaN(parsed)) {
            const dMatch = dateRaw.match(
              /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(.*))?/,
            );
            if (dMatch) {
              const day = parseInt(dMatch[1], 10);
              const month = parseInt(dMatch[2], 10) - 1; // JS months are 0-indexed
              const year = parseInt(dMatch[3], 10);
              parsed = new Date(year, month, day);
              const timePart = dMatch[4];
              if (timePart) {
                const tMatch = timePart.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
                if (tMatch) {
                  parsed.setHours(
                    parseInt(tMatch[1], 10),
                    parseInt(tMatch[2], 10),
                    parseInt(tMatch[3] || 0, 10),
                  );
                }
              }
            }
          }

          if (!isNaN(parsed) && parsed !== null) {
            dateObj = parsed;
            // If the raw string contains a colon it has time info embedded
            timeFromDate = /\d{1,2}:\d{2}/.test(dateRaw);
          }
        }

        // Message ID — use sheet column if present, otherwise auto-generate
        const rawId =
          getCol(row, "id") ||
          getCol(row, "message id") ||
          getCol(row, "msg id") ||
          getCol(row, "messageid") ||
          getCol(row, "msgid") ||
          "";
        const msgId = rawId
          ? String(rawId).trim()
          : "PM-" + String(idx + 1).padStart(4, "0");

        // Separate "Time" column — overrides whatever was in the Date cell
        const timeRaw = getCol(row, "time");
        if (dateObj && timeRaw) {
          const timeParsed = timeRaw.match(
            /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i,
          );
          if (timeParsed) {
            let h = parseInt(timeParsed[1], 10);
            const m = parseInt(timeParsed[2], 10);
            const s = parseInt(timeParsed[3] || 0, 10);
            const ampm = (timeParsed[4] || "").toLowerCase();
            if (ampm === "pm" && h < 12) h += 12;
            if (ampm === "am" && h === 12) h = 0;
            dateObj.setHours(h, m, s, 0);
          }
        }

        // Show time chip whenever time info exists (either column or embedded)
        const hasTime = !!(dateObj && (timeRaw || timeFromDate));

        return {
          id: idx,
          msgId,
          title,
          dateObj,
          hasTime,
          type,
          message,
          priority,
          status,
          link,
          linkLabel,
          websiteVersion,
        };
      })
      .filter(Boolean);
  }

  /* ══════════════════════════════════════════════════
       FILTER + SORT
    ══════════════════════════════════════════════════ */
  function applyFilterSort() {
    let items = [...allItems];

    // Filter by type
    if (activeFilter !== "all") {
      items = items.filter((i) => i.type === activeFilter);
    }

    // Search
    if (searchQuery.length > 1) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.message.toLowerCase().includes(q) ||
          i.type.toLowerCase().includes(q),
      );
    }

    // Sort
    if (sortOrder === "newest") {
      items.sort((a, b) => {
        if (!a.dateObj && !b.dateObj) return 0;
        if (!a.dateObj) return 1;
        if (!b.dateObj) return -1;
        return b.dateObj - a.dateObj;
      });
    } else if (sortOrder === "oldest") {
      items.sort((a, b) => {
        if (!a.dateObj && !b.dateObj) return 0;
        if (!a.dateObj) return 1;
        if (!b.dateObj) return -1;
        return a.dateObj - b.dateObj;
      });
    } else if (sortOrder === "priority") {
      const pOrder = { high: 0, medium: 1, normal: 2, low: 3, "": 4 };
      items.sort(
        (a, b) => (pOrder[a.priority] ?? 4) - (pOrder[b.priority] ?? 4),
      );
    }

    filteredItems = items;
  }

  /* ══════════════════════════════════════════════════
       RENDER CARDS
    ══════════════════════════════════════════════════ */
  const BADGE_ICONS = {
    update: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-5.96"/></svg>`,
    feature: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    maintenance: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    news: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6z"/></svg>`,
    hotfix: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };

  function formatDate(dateObj) {
    if (!dateObj || isNaN(dateObj)) return "";
    return dateObj.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatTime(dateObj) {
    if (!dateObj || isNaN(dateObj)) return "";
    return dateObj.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  function isoDate(dateObj) {
    if (!dateObj || isNaN(dateObj)) return "";
    return dateObj.toISOString().split("T")[0];
  }

  function buildCardHTML(item) {
    const typeClass = [
      "update",
      "feature",
      "maintenance",
      "news",
      "hotfix",
    ].includes(item.type)
      ? item.type
      : "default";
    const icon = BADGE_ICONS[item.type] || BADGE_ICONS.news;
    const dateStr = formatDate(item.dateObj);
    const timeStr = item.hasTime ? formatTime(item.dateObj) : "";
    const isoDateStr = isoDate(item.dateObj);
    const isHighPriority = item.priority === "high";
    const truncatedMsg =
      item.message.length > 320
        ? item.message.slice(0, 320) + "…"
        : item.message;

    return `
        <article class="card${isHighPriority ? " high-priority" : ""}" aria-labelledby="title-${item.msgId}" data-id="${escapeAttr(item.msgId)}">

          <!-- ── Top row: badges + ID chip ── -->
          <div class="card__header">
            <div class="card__meta">
              <span class="badge badge--${typeClass}">${icon}${capitalize(item.type)}</span>
              ${isHighPriority ? '<span class="badge badge--priority"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> High Priority</span>' : ""}
            </div>
            <button class="card__id" title="Click to copy Message ID" data-copy-id="${escapeAttr(item.msgId)}" aria-label="Copy Message ID: ${escapeAttr(item.msgId)}">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              ${escapeHTML(item.msgId)}
            </button>
          </div>

          <!-- ── Title ── -->
          <h2 class="card__title" id="title-${item.msgId}">${escapeHTML(item.title)}</h2>

          <!-- ── Date & Time row ── -->
          ${
            dateStr || item.websiteVersion
              ? `
          <div class="card__datetime">
            ${
              dateStr
                ? `
            <time class="card__date-item" datetime="${isoDateStr}">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              ${dateStr}
            </time>`
                : ""
            }
            ${
              timeStr
                ? `
            <span class="card__time-chip">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${timeStr}
            </span>`
                : ""
            }
            ${
              item.websiteVersion
                ? `
            <span class="card__time-chip" style="background: var(--bg-tertiary); color: var(--text-secondary); border-color: var(--border);">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" /><line x1="16" y1="8" x2="2" y2="22" /><line x1="17.5" y1="15" x2="9" y2="15" /></svg>
              v${escapeHTML(item.websiteVersion)}
            </span>`
                : ""
            }
          </div>`
              : ""
          }

          <!-- ── Body ── -->
          <div class="card__body">${escapeHTML(truncatedMsg)}</div>

          <!-- ── Footer: link ── -->
          ${
            item.link
              ? `
          <div class="card__footer">
            <a href="${escapeAttr(item.link)}" class="card__link" target="_blank" rel="noopener noreferrer">
              ${escapeHTML(item.linkLabel)}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </a>
          </div>`
              : ""
          }
        </article>`;
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(str) {
    return String(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function renderBatch(reset = false) {
    if (reset) {
      renderedCount = 0;
      // Remove old cards but keep skeleton placeholder if still loading
      document.querySelectorAll(".card").forEach((c) => c.remove());
    }

    const batch = filteredItems.slice(renderedCount, renderedCount + PAGE_SIZE);
    if (batch.length === 0) return;

    const frag = document.createDocumentFragment();
    batch.forEach((item) => {
      const div = document.createElement("div");
      div.innerHTML = buildCardHTML(item);
      const card = div.firstElementChild;
      frag.appendChild(card);
    });

    cardsContainer.appendChild(frag);
    renderedCount += batch.length;

    // Make newly added cards visible
    const cards = cardsContainer.querySelectorAll(".card:not(.revealed)");
    cards.forEach((card) => {
      card.classList.add("revealed");
    });
  }

  function updateUI() {
    const total = filteredItems.length;
    statsCount.textContent = `Showing ${Math.min(renderedCount, total)} of ${total} announcement${total !== 1 ? "s" : ""}`;

    emptyState.classList.toggle("hidden", total > 0);
    cardsContainer.style.display = total > 0 ? "" : "none";

    const hasMore = renderedCount < total;
    loadMoreWrap.classList.toggle("hidden", !hasMore);
  }

  /* ══════════════════════════════════════════════════
       PINNED BANNER (first high-priority item)
    ══════════════════════════════════════════════════ */
  function updatePinnedBanner() {
    const pinned = allItems.find(
      (i) => i.priority === "high" && activeFilter === "all",
    );
    if (pinned) {
      $("pinnedTitle").textContent = pinned.title;
      $("pinnedBody").textContent =
        pinned.message.slice(0, 180) + (pinned.message.length > 180 ? "…" : "");
      pinnedBanner.classList.add("visible");
    } else {
      pinnedBanner.classList.remove("visible");
    }
  }

  /* ══════════════════════════════════════════════════
       LAZY LOAD via IntersectionObserver
    ══════════════════════════════════════════════════ */
  function setupLazyObserver() {
    if (sentinelObserver) sentinelObserver.disconnect();

    sentinelObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && renderedCount < filteredItems.length) {
            renderBatch();
            updateUI();
          }
        });
      },
      { rootMargin: "200px" },
    );

    sentinelObserver.observe(lazySentinel);
  }

  /* ══════════════════════════════════════════════════
       LOAD DATA
    ══════════════════════════════════════════════════ */
  function showSkeleton() {
    skeletonGrid.style.display = "";
    cardsContainer.style.display = "none";
    emptyState.classList.add("hidden");
    errorState.classList.add("hidden");
  }

  function hideSkeleton() {
    skeletonGrid.style.display = "none";
    cardsContainer.style.display = "";
  }

  function showError() {
    hideSkeleton();
    errorState.classList.remove("hidden");
    cardsContainer.style.display = "none";
  }

  async function fetchData() {
    const cached = getCached();
    if (cached) return cached;

    // Append cache-busting param so fresh data is always fetched
    const url = SHEET_URL + "&_cb=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const items = parseSheetData(text);
    setCache(items);
    return items;
  }

  window.initLoad = async function () {
    if (loading) return;
    loading = true;
    showSkeleton();
    errorState.classList.add("hidden");

    try {
      allItems = await fetchData();

      // Sort items: Latest first (ensure newest is at index 0 for pinned banner)
      allItems.sort((a, b) => {
        if (!a.dateObj && !b.dateObj) return 0;
        if (!a.dateObj) return 1;
        if (!b.dateObj) return -1;
        return b.dateObj - a.dateObj;
      });

      // Hero meta - show actual latest announcement date
      const total = allItems.length;
      const lastUpdateStr =
        total > 0 ? formatDate(allItems[0].dateObj) : formatDate(new Date());
      heroMetaText.textContent =
        total > 0
          ? `${total} announcement${total !== 1 ? "s" : ""} — last updated ${lastUpdateStr}`
          : "All systems operational";

      // Version pill — populated by parseSheetData when it hits a type=version row
      const versionPill = $("versionPill");
      const versionText = $("versionText");
      if (window._pmSiteVersion) {
        versionText.textContent = window._pmSiteVersion;
        versionPill.classList.remove("hidden");
        // Also show in navbar
        const navVersion = $("navVersion");
        if (navVersion) {
          navVersion.textContent = "v" + window._pmSiteVersion;
          navVersion.classList.remove("hidden");
        }
      }

      hideSkeleton();
      updatePinnedBanner();
      applyFilterSort();
      renderBatch(true);
      updateUI();
      setupLazyObserver();
    } catch (err) {
      console.error("[PDFMaster Announcements] Failed to load:", err);
      heroMetaText.textContent = "Could not load announcements";
      showError();
    } finally {
      loading = false;
    }
  };

  /* ══════════════════════════════════════════════════
       CONTROLS
    ══════════════════════════════════════════════════ */
  // Filter buttons
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      activeFilter = btn.dataset.filter;
      updatePinnedBanner();
      applyFilterSort();
      renderBatch(true);
      updateUI();
    });
  });

  // Search
  let searchDebounce;
  $("searchInput").addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchQuery = e.target.value.trim();
      applyFilterSort();
      renderBatch(true);
      updateUI();
    }, 280);
  });

  // Sort
  $("sortSelect").addEventListener("change", (e) => {
    sortOrder = e.target.value;
    applyFilterSort();
    renderBatch(true);
    updateUI();
  });

  // Load more (fallback)
  $("loadMoreBtn").addEventListener("click", () => {
    renderBatch();
    updateUI();
  });

  /* ══════════════════════════════════════════════════
       JSON-LD DYNAMIC UPDATE (SEO)
    ══════════════════════════════════════════════════ */
  function injectItemListSchema(items) {
    const existing = document.querySelector("script[data-dynamic-ld]");
    if (existing) existing.remove();

    const schema = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "PDFMaster Announcements",
      description:
        "Latest updates, features, and maintenance notices from PDFMaster",
      numberOfItems: items.length,
      itemListElement: items.slice(0, 20).map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.title,
        description: item.message.slice(0, 160),
      })),
    };

    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.setAttribute("data-dynamic-ld", "1");
    el.textContent = JSON.stringify(schema);
    document.head.appendChild(el);
  }

  /* ══════════════════════════════════════════════════
       COPY MESSAGE ID
    ══════════════════════════════════════════════════ */
  const copyToast = $("copyToast");
  let toastTimer;

  function showToast(msg) {
    copyToast.textContent = msg;
    copyToast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => copyToast.classList.remove("show"), 2000);
  }

  // Delegated click on any [data-copy-id] element
  document.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-copy-id]");
    if (!chip) return;
    const id = chip.getAttribute("data-copy-id");
    if (!id) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(id)
        .then(() => showToast("Message ID copied: " + id))
        .catch(() => showToast("Copy failed"));
    } else {
      // Fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = id;
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand("copy");
        showToast("Message ID copied: " + id);
      } catch {
        showToast("Copy failed");
      }
      document.body.removeChild(ta);
    }
  });

  /* ══════════════════════════════════════════════════
       INIT
    ══════════════════════════════════════════════════ */
  document.addEventListener("DOMContentLoaded", () => {
    initLoad().then(() => {
      if (allItems.length) injectItemListSchema(allItems);
    });
  });
})();
