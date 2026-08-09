(() => {
  const root = document.getElementById("epaperRoot");
  const loading = document.getElementById("epaperLoading");
  const dateSelect = document.getElementById("epaperDate");
  const langBtn = document.getElementById("epaperLang");
  const printBtn = document.getElementById("epaperPrint");
  const pageNav = document.getElementById("epaperPageNav");
  const prevBtn = document.getElementById("epaperPrev");
  const nextBtn = document.getElementById("epaperNext");

  const params = new URLSearchParams(window.location.search);
  let lang = params.get("lang") === "en" ? "en" : "hi";
  let dayKey = params.get("date") || "";
  let currentPage = Math.max(1, Number(params.get("page") || 1) || 1);
  let editionCache = null;

  document.documentElement.lang = lang;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function articleHref(item) {
    return `article.html?id=${encodeURIComponent(item.id)}&lang=${lang}`;
  }

  function syncUrl() {
    const next = new URL(window.location.href);
    next.searchParams.set("lang", lang);
    if (dayKey) next.searchParams.set("date", dayKey);
    next.searchParams.set("page", String(currentPage));
    window.history.replaceState({}, "", next);
  }

  function updateChrome(edition) {
    const hi = lang === "hi";
    if (langBtn) langBtn.textContent = hi ? "EN" : "हिं";
    if (printBtn) printBtn.textContent = hi ? "प्रिंट / PDF" : "Print / PDF";
    const pages = edition?.pages || [];
    if (pageNav) {
      pageNav.innerHTML = pages
        .map(
          (page) => `
        <button type="button" class="epaper-page-btn${
          page.number === currentPage ? " is-active" : ""
        }" data-page="${page.number}" aria-current="${
            page.number === currentPage ? "page" : "false"
          }">
          <span>${hi ? "पेज" : "P"} ${page.number}</span>
          <small>${escapeHtml(page.label)}</small>
        </button>`
        )
        .join("");
    }
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= pages.length;
  }

  function storyBlock(item, opts = {}) {
    const hi = lang === "hi";
    const place = item.districtLabel || item.category || (hi ? "आदिभूमि" : "Adibhumi");
    const cls = ["ep-story", opts.feature ? "is-feature" : "", opts.compact ? "is-compact" : ""]
      .filter(Boolean)
      .join(" ");
    return `
      <article class="${cls}">
        <a href="${articleHref(item)}">
          ${
            opts.showImage && item.image
              ? `<div class="ep-story-media" style="background-image:url('${escapeHtml(
                  item.image
                )}')"></div>`
              : ""
          }
          <div class="ep-story-body">
            <span class="ep-rubric">${escapeHtml(place)}</span>
            <h3>${escapeHtml(item.title)}</h3>
            ${
              !opts.compact && item.summary
                ? `<p>${escapeHtml(item.summary)}</p>`
                : ""
            }
          </div>
        </a>
      </article>`;
  }

  function renderFrontPage(page, edition) {
    const hi = lang === "hi";
    const [lead, second, ...rest] = page.items;
    const side = rest.slice(0, 4);
    const bottom = rest.slice(4, 10);
    return `
      <section class="ep-page is-front" data-page="${page.number}">
        <header class="ep-masthead">
          <div class="ep-masthead-top">
            <span>${escapeHtml(edition.editionName || edition.focus)}</span>
            <span>${escapeHtml(edition.dateLabel)}</span>
            <span class="ep-edition-badge ${edition.status === "final" ? "is-final" : "is-live"}">
              ${escapeHtml(edition.statusLabel)}
            </span>
          </div>
          <div class="ep-masthead-brand">
            <img src="assets/adibhumi-logo.png" width="220" height="72" alt="आदिभूमि" />
            <div>
              <p class="ep-paper-label">${hi ? "दैनिक ई-पेपर" : "Daily e-Paper"}</p>
              <h1>${escapeHtml(edition.title)}</h1>
              <p class="ep-tagline">${escapeHtml(edition.focus)}</p>
            </div>
          </div>
          <div class="ep-masthead-rule" aria-hidden="true"></div>
          <p class="ep-page-kicker">${escapeHtml(page.kicker)} · ${hi ? "पेज" : "Page"} ${
            page.number
          }</p>
        </header>

        ${
          lead
            ? `<div class="ep-front-grid">
                <div class="ep-front-main">
                  ${storyBlock(lead, { feature: true, showImage: true })}
                  ${second ? storyBlock(second, { showImage: true }) : ""}
                </div>
                <aside class="ep-front-rail">
                  <h2>${hi ? "अभी पढ़ें" : "Also read"}</h2>
                  ${side.map((item) => storyBlock(item, { compact: true })).join("")}
                </aside>
              </div>
              ${
                bottom.length
                  ? `<div class="ep-front-bottom">
                      ${bottom.map((item) => storyBlock(item, { compact: true })).join("")}
                    </div>`
                  : ""
              }`
            : `<p class="epaper-empty">${
                hi
                  ? "आज अभी पर्याप्त खबरें एकत्र नहीं हुईं। लाइव फीड चलने दें — रात 11:59 तक संस्करण भरता रहेगा।"
                  : "Not enough stories yet. Keep the live feed running — the edition fills until 11:59 PM."
              }</p>`
        }
      </section>`;
  }

  function renderInnerPage(page, edition) {
    const hi = lang === "hi";
    const lead = page.items[0];
    const colA = page.items.slice(1, 7);
    const colB = page.items.slice(7, 13);
    const colC = page.items.slice(13, 20);
    return `
      <section class="ep-page" data-page="${page.number}">
        <header class="ep-page-head">
          <div>
            <p class="ep-paper-mini">${escapeHtml(edition.brand)} · ${escapeHtml(
              edition.dateLabel
            )}</p>
            <h2>${escapeHtml(page.label)}</h2>
            <p class="ep-page-kicker">${escapeHtml(page.kicker)}</p>
          </div>
          <span class="ep-page-num">${hi ? "पेज" : "Page"} ${page.number}</span>
        </header>
        <div class="ep-inner-lead">
          ${lead ? storyBlock(lead, { feature: true, showImage: true }) : ""}
        </div>
        <div class="ep-columns">
          <div class="ep-col">${colA.map((item) => storyBlock(item)).join("")}</div>
          <div class="ep-col">${colB.map((item) => storyBlock(item)).join("")}</div>
          <div class="ep-col">${colC.map((item) => storyBlock(item, { compact: true })).join("")}</div>
        </div>
      </section>`;
  }

  function renderEdition(edition) {
    const hi = lang === "hi";
    const pages = edition.pages?.length
      ? edition.pages
      : (edition.sections || []).map((section, index) => ({
          id: section.id,
          number: index + 1,
          label: section.title,
          kicker: section.title,
          items: section.items || [],
        }));

    if (!pages.length) {
      root.innerHTML = `<p class="epaper-empty">${
        hi
          ? "आज अभी पर्याप्त खबरें एकत्र नहीं हुईं।"
          : "Not enough stories for today's edition."
      }</p>`;
      return;
    }

    currentPage = Math.min(Math.max(1, currentPage), pages.length);
    document.title = `${edition.title} · ${edition.dateLabel} · ${hi ? "पेज" : "P"}${currentPage}`;
    updateChrome({ ...edition, pages });

    const page = pages.find((p) => p.number === currentPage) || pages[0];
    const sheet =
      page.number === 1
        ? renderFrontPage(page, edition)
        : renderInnerPage(page, edition);

    root.innerHTML = `
      <div class="epaper-viewer">
        <div class="epaper-sheet" id="epaperSheet">
          ${sheet}
          <footer class="ep-footer">
            <p>${
              hi
                ? "यह ई-पेपर आदिभूमि द्वारा दिन भर एकत्र समाचारों से तैयार हिंदी अखबार प्रारूप है — संदर्भ शैली: पारंपरिक हिंदी ई-पेपर। अंतिम संस्करण रात 11:59 (IST) पर लॉक होता है।"
                : "This Hindi newspaper-style e-paper is compiled by Adibhumi from the day's stories. Final edition locks at 11:59 PM IST."
            }</p>
            <p>© ${new Date().getFullYear()} आदिभूमि · ${escapeHtml(edition.dayKey)} · ${
              hi ? "पेज" : "Page"
            } ${page.number}/${pages.length}</p>
          </footer>
        </div>
        <div class="epaper-thumbs no-print" aria-label="${hi ? "सभी पेज" : "All pages"}">
          ${pages
            .map(
              (p) => `
            <button type="button" class="epaper-thumb${
              p.number === currentPage ? " is-active" : ""
            }" data-page="${p.number}">
              <strong>${p.number}</strong>
              <span>${escapeHtml(p.label)}</span>
            </button>`
            )
            .join("")}
        </div>
      </div>
    `;
    root.setAttribute("aria-busy", "false");
    syncUrl();
  }

  function goToPage(n) {
    if (!editionCache?.pages?.length) return;
    currentPage = Math.min(Math.max(1, n), editionCache.pages.length);
    renderEdition(editionCache);
    root.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadDates() {
    const res = await fetch("/api/epaper/dates");
    const data = await res.json();
    if (!dayKey) dayKey = data.today;
    if (dateSelect) {
      dateSelect.innerHTML = (data.dates || [])
        .map(
          (d) =>
            `<option value="${escapeHtml(d)}" ${d === dayKey ? "selected" : ""}>${escapeHtml(d)}${
              d === data.today ? (lang === "hi" ? " (आज)" : " (Today)") : ""
            }</option>`
        )
        .join("");
    }
  }

  async function loadEdition() {
    updateChrome(editionCache || { pages: [] });
    syncUrl();
    if (loading) loading.hidden = false;
    root.setAttribute("aria-busy", "true");
    try {
      const q = new URLSearchParams({ lang });
      if (dayKey) q.set("date", dayKey);
      const res = await fetch(`/api/epaper?${q}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const edition = await res.json();
      dayKey = edition.dayKey;
      editionCache = edition;
      renderEdition(edition);
    } catch (err) {
      console.error(err);
      root.innerHTML = `<p class="epaper-empty is-error">${
        lang === "hi"
          ? "ई-पेपर लोड नहीं हो सका। सर्वर चालू है या नहीं, जाँचें।"
          : "Could not load e-paper. Check that the server is running."
      }</p>`;
    } finally {
      if (loading) loading.hidden = true;
    }
  }

  if (dateSelect) {
    dateSelect.addEventListener("change", () => {
      dayKey = dateSelect.value;
      currentPage = 1;
      loadEdition();
    });
  }

  if (langBtn) {
    langBtn.addEventListener("click", () => {
      lang = lang === "hi" ? "en" : "hi";
      document.documentElement.lang = lang;
      currentPage = 1;
      loadDates().then(loadEdition);
    });
  }

  if (printBtn) {
    printBtn.addEventListener("click", () => window.print());
  }

  if (prevBtn) prevBtn.addEventListener("click", () => goToPage(currentPage - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => goToPage(currentPage + 1));

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-page]");
    if (!btn) return;
    goToPage(Number(btn.getAttribute("data-page")));
  });

  loadDates()
    .then(loadEdition)
    .catch((err) => {
      console.error(err);
      loadEdition();
    });
})();
