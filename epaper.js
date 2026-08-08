(() => {
  const root = document.getElementById("epaperRoot");
  const loading = document.getElementById("epaperLoading");
  const dateSelect = document.getElementById("epaperDate");
  const langBtn = document.getElementById("epaperLang");
  const printBtn = document.getElementById("epaperPrint");

  const params = new URLSearchParams(window.location.search);
  let lang = params.get("lang") === "en" ? "en" : "hi";
  let dayKey = params.get("date") || "";

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
    window.history.replaceState({}, "", next);
  }

  function updateChrome() {
    const hi = lang === "hi";
    if (langBtn) langBtn.textContent = hi ? "EN" : "हिं";
    if (printBtn) printBtn.textContent = hi ? "प्रिंट / PDF" : "Print / PDF";
  }

  function renderEdition(edition) {
    const hi = lang === "hi";
    document.title = `${edition.title} · ${edition.dateLabel}`;

    const lead = edition.sections[0]?.items?.[0];
    const restTop = (edition.sections[0]?.items || []).slice(1, 5);

    root.innerHTML = `
      <header class="epaper-masthead">
        <p class="epaper-kicker">${escapeHtml(edition.focus)}</p>
        <h1>${escapeHtml(edition.title)}</h1>
        <p class="epaper-date-line">${escapeHtml(edition.dateLabel)}</p>
        <p class="epaper-status ${edition.status === "final" ? "is-final" : "is-live"}">
          ${escapeHtml(edition.statusLabel)}
          · ${edition.count} ${hi ? "खबरें" : "stories"}
          · ${hi ? "कटऑफ" : "cutoff"} ${edition.cutoff} IST
        </p>
      </header>

      ${
        lead
          ? `<section class="epaper-hero">
              <a href="${articleHref(lead)}">
                ${
                  lead.image
                    ? `<div class="epaper-hero-media" style="background-image:url('${escapeHtml(lead.image)}')"></div>`
                    : ""
                }
                <div class="epaper-hero-copy">
                  <span class="chip">${escapeHtml(lead.districtLabel || lead.category || (hi ? "मुख्य" : "Lead"))}</span>
                  <h2>${escapeHtml(lead.title)}</h2>
                  ${lead.summary ? `<p>${escapeHtml(lead.summary)}</p>` : ""}
                </div>
              </a>
            </section>`
          : `<p class="epaper-empty">${
              hi
                ? "आज अभी पर्याप्त खबरें एकत्र नहीं हुईं। लाइव फीड चलने दें — रात 11:59 तक संस्करण भरता रहेगा।"
                : "Not enough stories yet. Keep the live feed running — the edition fills until 11:59 PM."
            }</p>`
      }

      ${
        restTop.length
          ? `<section class="epaper-top-grid">
              ${restTop
                .map(
                  (item) => `
                <article>
                  <a href="${articleHref(item)}">
                    <span class="chip">${escapeHtml(item.districtLabel || item.category || "")}</span>
                    <h3>${escapeHtml(item.title)}</h3>
                    ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
                  </a>
                </article>`
                )
                .join("")}
            </section>`
          : ""
      }

      ${edition.sections
        .slice(1)
        .map(
          (section) => `
        <section class="epaper-section">
          <h2 class="epaper-section-title">${escapeHtml(section.title)}</h2>
          <div class="epaper-columns">
            ${section.items
              .map(
                (item) => `
              <article class="epaper-item">
                <a href="${articleHref(item)}">
                  <h3>${escapeHtml(item.title)}</h3>
                  ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
                  <span class="epaper-meta">${escapeHtml(
                    item.districtLabel || item.divisionLabel || item.category || ""
                  )}</span>
                </a>
              </article>`
              )
              .join("")}
          </div>
        </section>`
        )
        .join("")}

      <footer class="epaper-footer">
        <p>${
          hi
            ? "यह ई-पेपर आदिभूमि द्वारा दिन भर एकत्र समाचारों से तैयार किया गया है। अंतिम संस्करण रात 11:59 (IST) पर लॉक होता है।"
            : "This e-paper is generated from stories gathered by Adibhumi during the day. The final edition locks at 11:59 PM IST."
        }</p>
        <p>© ${new Date().getFullYear()} आदिभूमि डिजिटल</p>
      </footer>
    `;
    root.setAttribute("aria-busy", "false");
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
    updateChrome();
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
      loadEdition();
    });
  }

  if (langBtn) {
    langBtn.addEventListener("click", () => {
      lang = lang === "hi" ? "en" : "hi";
      document.documentElement.lang = lang;
      loadDates().then(loadEdition);
    });
  }

  if (printBtn) {
    printBtn.addEventListener("click", () => window.print());
  }

  loadDates()
    .then(loadEdition)
    .catch((err) => {
      console.error(err);
      loadEdition();
    });
})();
