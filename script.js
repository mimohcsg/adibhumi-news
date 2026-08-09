(() => {
  const REFRESH_MS = 15 * 60 * 1000;
  const THUMB_CLASSES = ["story-thumb-a", "story-thumb-b", "story-thumb-c", "story-thumb-d", "story-thumb-e"];

  const dateEl = document.getElementById("liveDate");
  const navToggle = document.getElementById("navToggle");
  const primaryNav = document.getElementById("primaryNav");
  const langToggle = document.getElementById("langToggle");
  const refreshBtn = document.getElementById("refreshNews");
  const liveStatusText = document.getElementById("liveStatusText");
  const trendingTrack = document.getElementById("trendingTrack");
  const heroTitle = document.getElementById("heroTitle");
  const heroDeck = document.getElementById("heroDeck");
  const heroKicker = document.getElementById("heroKicker");
  const heroLink = document.getElementById("heroLink");
  const heroMedia = document.getElementById("heroMedia");
  const heroReadLabel = document.getElementById("heroReadLabel");
  const leadRailList = document.getElementById("leadRailList");
  const leadRailTitle = document.getElementById("leadRailTitle");
  const topStoryGrid = document.getElementById("topStoryGrid");
  const topGridMeta = document.getElementById("topGridMeta");
  const liveFeedList = document.getElementById("liveFeedList");
  const liveFeedMeta = document.getElementById("liveFeedMeta");
  const stateTabs = document.querySelectorAll("#districtTabs .state-tab");
  const districtFeedList = document.getElementById("districtFeedList");
  const districtEmpty = document.getElementById("districtEmpty");
  const localMeta = document.getElementById("localMeta");

  let latestItems = [];
  let activeFilter = "all";
  const UJJAIN_DIV_DISTRICTS = ["ujjain", "dewas", "ratlam", "mandsaur", "neemuch", "shajapur", "agar"];
  const INDORE_DIV_DISTRICTS = ["indore", "dhar", "jhabua", "alirajpur", "khargone", "barwani", "khandwa", "burhanpur"];
  const TOP_FOCUS_DISTRICTS = ["alirajpur", "jhabua", "dhar", "barwani"];
  const TOP_FOCUS_ORDER = { alirajpur: 0, jhabua: 1, dhar: 2, barwani: 3 };
  const OTHER_TRIBAL_DISTRICTS = [
    "khargone",
    "khandwa",
    "burhanpur",
    "ratlam",
    "mandsaur",
    "neemuch",
  ];

  function storyTierOf(item) {
    if (item.storyTier) return item.storyTier;
    if (item.isTopFocus || TOP_FOCUS_DISTRICTS.includes(item.district)) return 1;
    if (item.isTribal || OTHER_TRIBAL_DISTRICTS.includes(item.district) || item.district || item.division)
      return 2;
    if (item.isMpStatewide) return 3;
    if (item.isIndia) return 4;
    return 5;
  }

  function sortByRecency(items) {
    return [...items].sort((a, b) => {
      const tb = Date.parse(b.publishedAt || 0) || 0;
      const ta = Date.parse(a.publishedAt || 0) || 0;
      if (tb !== ta) return tb - ta;
      if (Boolean(b.isBreaking) !== Boolean(a.isBreaking)) return a.isBreaking ? -1 : 1;
      const fb = b.frontScore || 0;
      const fa = a.frontScore || 0;
      if (fb !== fa) return fb - fa;
      return storyTierOf(a) - storyTierOf(b);
    });
  }

  /** @deprecated use sortByRecency — kept for older call sites */
  function sortByPriority(items) {
    return sortByRecency(items);
  }

  function isTopFocusItem(item) {
    return Boolean(item?.isTopFocus || TOP_FOCUS_DISTRICTS.includes(item?.district));
  }

  /** Newest first among Alirajpur / Jhabua / Dhar / Barwani (no district lock-order). */
  function buildTopFocusRail(items) {
    return sortByRecency(items.filter(isTopFocusItem));
  }

  /**
   * Round-robin Alirajpur → Jhabua → Dhar → Barwani so one district
   * cannot bury the others in Top News / hero rail.
   */
  function buildInterleavedFocusRail(items) {
    const pools = TOP_FOCUS_DISTRICTS.map((id) =>
      sortByRecency(items.filter((item) => item.district === id))
    );
    const out = [];
    const used = new Set();
    let grew = true;
    while (grew && out.length < 48) {
      grew = false;
      for (const pool of pools) {
        const next = pool.find((item) => !used.has(item.id));
        if (!next) continue;
        out.push(next);
        used.add(next.id);
        grew = true;
      }
    }
    // Any focus-tagged story missing a district id
    for (const item of buildTopFocusRail(items)) {
      if (used.has(item.id)) continue;
      out.push(item);
      used.add(item.id);
    }
    return out;
  }

  function splitByPriority(items) {
    const ordered = sortByRecency(items);
    const topFour = buildInterleavedFocusRail(items);
    const otherRegional = ordered.filter(
      (item) =>
        !topFour.some((t) => t.id === item.id) &&
        (item.isTribal ||
          OTHER_TRIBAL_DISTRICTS.includes(item.district) ||
          item.district ||
          item.division ||
          storyTierOf(item) === 2)
    );
    const tribalBlock = [...topFour, ...otherRegional];
    const used = new Set(tribalBlock.map((i) => i.id));
    const mp = ordered.filter(
      (item) => !used.has(item.id) && (item.isMpStatewide || storyTierOf(item) === 3)
    );
    mp.forEach((i) => used.add(i.id));
    const india = ordered.filter(
      (item) => !used.has(item.id) && (item.isIndia || storyTierOf(item) >= 4)
    );
    return { tribal: tribalBlock, topFour, mp, india, ordered };
  }

  /** Current news language: hi (default) or en. Button label shows the other language. */
  function getNewsLang() {
    return document.documentElement.lang === "en" ? "en" : "hi";
  }

  function formatDateForLang(date = new Date()) {
    const locale = getNewsLang() === "en" ? "en-IN" : "hi-IN";
    try {
      return new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date);
    } catch {
      return date.toDateString();
    }
  }

  function formatTime(iso) {
    if (!iso) return "";
    const locale = getNewsLang() === "en" ? "en-IN" : "hi-IN";
    try {
      return new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return "";
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateDateLabel() {
    if (!dateEl) return;
    const now = new Date();
    dateEl.dateTime = now.toISOString();
    dateEl.textContent = formatDateForLang(now);
  }

  updateDateLabel();

  if (navToggle && primaryNav) {
    navToggle.addEventListener("click", () => {
      const open = primaryNav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.setAttribute(
        "aria-label",
        open
          ? getNewsLang() === "en"
            ? "Close menu"
            : "मेनू बंद करें"
          : getNewsLang() === "en"
            ? "Open menu"
            : "मेनू खोलें"
      );
    });
  }

  if (langToggle) {
    langToggle.addEventListener("click", () => {
      const nextLang = getNewsLang() === "hi" ? "en" : "hi";
      document.documentElement.lang = nextLang;
      // Button shows the language you can switch to next
      langToggle.setAttribute("aria-pressed", String(nextLang === "en"));
      langToggle.textContent = nextLang === "en" ? "हिं" : "EN";
      updateDateLabel();
      loadNews();
    });
  }

  stateTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activeFilter = tab.dataset.filter || "all";
      stateTabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", String(active));
      });
      renderDistrictFeed(latestItems, activeFilter);
    });
  });

  document.querySelectorAll(".newsletter-form, .search-form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const btn = form.querySelector("button[type='submit']");
      if (!btn) return;
      const original = btn.textContent;
      btn.textContent = form.classList.contains("newsletter-form") ? "धन्यवाद!" : "खोज जारी…";
      setTimeout(() => {
        btn.textContent = original;
      }, 1400);
    });
  });

  document.querySelectorAll(".video-play").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.add("is-playing");
      const label = btn.parentElement?.querySelector("h3");
      window.alert(
        (label?.textContent || "वीडियो") +
          "\n\nडेमो मोड: यहाँ असली प्लेयर कनेक्ट किया जा सकता है।"
      );
    });
  });

  function articleHref(item) {
    return `article.html?id=${encodeURIComponent(item.id)}&lang=${getNewsLang()}`;
  }

  function setStatus(message, isError = false) {
    if (!liveStatusText) return;
    liveStatusText.textContent = message;
    liveStatusText.parentElement?.classList.toggle("is-error", isError);
  }

  function renderTrending(items) {
    if (!trendingTrack) return;
    const label = document.querySelector(".trending-label");
    if (label) {
      label.textContent = getNewsLang() === "en" ? "Trending News" : "ट्रेंडिंग न्यूज़";
    }
    const picks = [...items]
      .sort((a, b) => (b.frontScore || 0) - (a.frontScore || 0))
      .slice(0, 8);
    if (!picks.length) {
      trendingTrack.innerHTML = `<span class="trending-placeholder">अभी कोई सुर्खी नहीं</span>`;
      return;
    }
    const links = picks
      .map(
        (item) =>
          `<a href="${articleHref(item)}">${escapeHtml(item.title)}</a>`
      )
      .join("");
    trendingTrack.innerHTML = links + links;
  }

  function pickFrontStory(items) {
    if (!items?.length) return null;
    // Prefer newest Alirajpur, else newest Jhabua, else other focus, else overall.
    const alirajpur = sortByRecency(items.filter((i) => i.district === "alirajpur"));
    if (alirajpur[0]) return alirajpur[0];
    const jhabua = sortByRecency(items.filter((i) => i.district === "jhabua"));
    if (jhabua[0]) return jhabua[0];
    const focusRail = buildInterleavedFocusRail(items);
    if (focusRail.length) return focusRail[0];
    return sortByRecency(items)[0];
  }

  function renderHero(item) {
    if (!item || !heroTitle) return;
    const hi = getNewsLang() === "hi";
    heroTitle.textContent = item.title;
    if (heroDeck) {
      heroDeck.textContent =
        item.summary ||
        (hi
          ? "अलीराजपुर, झाबुआ, धार, बड़वानी — फिर अन्य ज़िले, मप्र और भारत की कवरेज।"
          : "Alirajpur, Jhabua, Dhar, Barwani first — then other districts, MP, and India.");
    }
    if (heroKicker) {
      const place =
        item.districtLabel ||
        item.divisionLabel ||
        (item.isMpStatewide ? (hi ? "मध्य प्रदेश" : "Madhya Pradesh") : null) ||
        (hi ? "मालवा-निमाड़" : "Malwa–Nimad");
      const tags = [];
      if (item.isBreaking) tags.push(hi ? "ब्रेकिंग" : "Breaking");
      tags.push(hi ? "टॉप" : "Top");
      tags.push(place);
      heroKicker.textContent = tags.join(" · ");
    }
    if (heroLink) {
      heroLink.href = articleHref(item);
      heroLink.removeAttribute("target");
      heroLink.removeAttribute("rel");
    }
    if (heroReadLabel) {
      heroReadLabel.textContent = hi ? "पूरी खबर पढ़ें →" : "Read full story →";
    }
    if (heroMedia) {
      const img = item.image;
      if (img) {
        heroMedia.style.backgroundImage = `linear-gradient(180deg, rgba(18,20,26,.08), rgba(18,20,26,.28)), url("${img}")`;
        heroMedia.style.backgroundSize = "cover";
        heroMedia.style.backgroundPosition = "center";
      } else {
        heroMedia.style.backgroundImage = "";
      }
      heroMedia.setAttribute("aria-label", item.title);
    }
  }

  function renderLeadRail(items, excludeId) {
    if (!leadRailList) return;
    const hi = getNewsLang() === "hi";
    if (leadRailTitle) {
      leadRailTitle.textContent = hi ? "अभी पढ़ें" : "Read now";
    }
    const list = (items || []).filter((item) => item.id !== excludeId).slice(0, 8);
    if (!list.length) {
      leadRailList.innerHTML = `<li class="lead-rail-empty">${
        hi ? "सुर्खियाँ लोड हो रही हैं…" : "Headlines loading…"
      }</li>`;
      return;
    }
    leadRailList.innerHTML = list
      .map((item) => {
        const place =
          item.districtLabel ||
          item.category ||
          (hi ? "आदिभूमि" : "Adibhumi");
        return `<li>
          <a href="${articleHref(item)}">
            <span>
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(place)}${
                item.publishedAt ? ` · ${formatTime(item.publishedAt)}` : ""
              }</span>
            </span>
          </a>
        </li>`;
      })
      .join("");
  }

  function filterByArea(items, filter = "all") {
    if (!filter || filter === "all") {
      return buildInterleavedFocusRail(items);
    }
    if (filter === "mp") {
      return sortByRecency(
        items.filter((item) => item.isMpStatewide || item.district || (item.regionScore || 0) >= 8)
      );
    }
    if (filter === "division:indore-div") {
      return sortByRecency(
        items.filter(
          (item) =>
            item.division === "indore-div" || INDORE_DIV_DISTRICTS.includes(item.district)
        )
      );
    }
    if (filter === "division:ujjain-div") {
      return sortByRecency(
        items.filter(
          (item) =>
            item.division === "ujjain-div" || UJJAIN_DIV_DISTRICTS.includes(item.district)
        )
      );
    }
    if (filter.startsWith("district:")) {
      const id = filter.slice("district:".length);
      return sortByRecency(items.filter((item) => item.district === id));
    }
    return sortByRecency(items);
  }

  function renderDistrictFeed(items, filter = "all") {
    if (!districtFeedList) return;
    const hi = getNewsLang() === "hi";
    const filtered = filterByArea(items, filter);
    const list = filtered.slice(0, 24);

    if (districtEmpty) {
      districtEmpty.hidden = list.length > 0;
      districtEmpty.textContent = hi
        ? "इस क्षेत्र की खबर अभी नहीं मिली — थोड़ी देर बाद देखें।"
        : "No stories for this area right now.";
    }

    districtFeedList.innerHTML = list
      .map(
        (item) => `
      <li class="live-feed-item">
        <a href="${articleHref(item)}">
          <span class="live-feed-source">${escapeHtml(
            item.districtLabel ||
              item.divisionLabel ||
              (item.isMpStatewide ? (hi ? "मध्य प्रदेश" : "MP") : null) ||
              item.category ||
              (hi ? "मप्र" : "MP")
          )}</span>
          <span class="live-feed-title">${escapeHtml(item.title)}</span>
          <span class="live-feed-time">${item.publishedAt ? formatTime(item.publishedAt) : "—"}</span>
        </a>
      </li>`
      )
      .join("");

    if (localMeta) {
      localMeta.textContent = hi
        ? `${list.length} खबरें · इंदौर / उज्जैन / देवास / मप्र`
        : `${list.length} stories · Indore / Ujjain / Dewas / MP`;
    }
  }

  function storyCard(item, index, feature = false) {
    const hi = getNewsLang() === "hi";
    const thumbClass = THUMB_CLASSES[index % THUMB_CLASSES.length];
    const thumbStyle = item.image
      ? `style="background-image:url('${escapeHtml(item.image)}');background-size:cover;background-position:center;"`
      : "";
    const summary =
      feature && item.summary ? `<p>${escapeHtml(item.summary)}</p>` : "";
    const place =
      item.districtLabel ||
      item.category ||
      (hi ? "टॉप" : "Top");
    return `
      <article class="db-row${feature ? " db-row-feature" : ""}">
        <a href="${articleHref(item)}">
          <div class="db-thumb ${thumbClass}" ${thumbStyle}></div>
          <div class="db-body">
            <span class="chip">${escapeHtml(place)}</span>
            <h3>${escapeHtml(item.title)}</h3>
            ${summary}
            <span class="db-meta">${
              item.publishedAt ? formatTime(item.publishedAt) : ""
            }</span>
          </div>
        </a>
      </article>
    `;
  }

  function renderTopGrid(items) {
    if (!topStoryGrid) return;
    const hi = getNewsLang() === "hi";
    const top = items.slice(0, 12);
    if (topGridMeta) {
      topGridMeta.textContent = hi
        ? "ताज़ा क्रम · टॉप 4 ज़िले"
        : "Latest · top 4 districts";
    }
    if (!top.length) {
      topStoryGrid.innerHTML = `<p class="feed-empty">${
        hi ? "अभी टॉप न्यूज़ उपलब्ध नहीं।" : "No top stories available right now."
      }</p>`;
      topStoryGrid.setAttribute("aria-busy", "false");
      return;
    }
    topStoryGrid.innerHTML = top
      .map((item, index) => storyCard(item, index, index < 2))
      .join("");
    topStoryGrid.setAttribute("aria-busy", "false");
  }

  function renderFeedItems(listEl, items, emptyText) {
    if (!listEl) return;
    const hi = getNewsLang() === "hi";
    const fallbackCat = hi ? "टॉप" : "Top";
    if (!items.length) {
      listEl.innerHTML = `<li class="live-feed-item live-feed-empty"><span>${escapeHtml(
        emptyText
      )}</span></li>`;
      return;
    }
    listEl.innerHTML = items
      .map(
        (item) => `
      <li class="live-feed-item">
        <a href="${articleHref(item)}">
          <span class="live-feed-source">${escapeHtml(item.category || fallbackCat)}</span>
          <span class="live-feed-title">${escapeHtml(item.title)}</span>
          <span class="live-feed-time">${item.publishedAt ? formatTime(item.publishedAt) : "—"}</span>
        </a>
      </li>`
      )
      .join("");
  }

  function renderLiveFeed(items, meta) {
    const hi = getNewsLang() === "hi";
    const { tribal, topFour, mp, india, ordered } = splitByPriority(items);
    const tribalList = [...topFour, ...tribal.filter((i) => !topFour.some((t) => t.id === i.id))];

    renderFeedItems(
      document.getElementById("tribalFeedList"),
      tribalList.slice(0, 14),
      hi
        ? "अभी अलीराजपुर/झाबुआ/धार/बड़वानी की खबर नहीं मिली"
        : "No Alirajpur/Jhabua/Dhar/Barwani stories right now"
    );
    renderFeedItems(
      document.getElementById("mpFeedList"),
      mp.slice(0, 10),
      hi ? "अभी मध्य प्रदेश की अलग खबर नहीं" : "No statewide MP stories right now"
    );
    renderFeedItems(
      document.getElementById("indiaFeedList"),
      india.slice(0, 10),
      hi ? "अभी भारत टॉप न्यूज़ नहीं" : "No India top stories right now"
    );

    if (liveFeedList) {
      renderFeedItems(liveFeedList, ordered.slice(0, 24), hi ? "कोई खबर नहीं" : "No stories");
    }

    const tribalHeading = document.querySelector('.priority-block[data-tier="tribal"] .priority-heading');
    const mpHeading = document.querySelector('.priority-block[data-tier="mp"] .priority-heading');
    const indiaHeading = document.querySelector('.priority-block[data-tier="india"] .priority-heading');
    if (tribalHeading) {
      tribalHeading.textContent = hi
        ? `१ · अलीराजपुर · झाबुआ · धार · बड़वानी (+अन्य) (${Math.min(tribalList.length, 14)})`
        : `1 · Alirajpur · Jhabua · Dhar · Barwani (+others) (${Math.min(tribalList.length, 14)})`;
    }
    if (mpHeading) {
      mpHeading.textContent = hi
        ? `२ · मध्य प्रदेश (${Math.min(mp.length, 10)})`
        : `2 · Madhya Pradesh (${Math.min(mp.length, 10)})`;
    }
    if (indiaHeading) {
      indiaHeading.textContent = hi
        ? `३ · भारत टॉप न्यूज़ (${Math.min(india.length, 10)})`
        : `3 · India top news (${Math.min(india.length, 10)})`;
    }

    if (liveFeedMeta && meta) {
      liveFeedMeta.textContent = hi
        ? `${meta.count} खबरें · क्रम: अलीराजपुर/झाबुआ/धार/बड़वानी → अन्य → मप्र → भारत`
        : `${meta.count} stories · order: Alirajpur/Jhabua/Dhar/Barwani → others → MP → India`;
    }
    if (topGridMeta && meta?.refreshedAt) {
      topGridMeta.textContent = hi
        ? `टॉप 4 ज़िले → अन्य · अपडेट ${formatTime(meta.refreshedAt)}`
        : `Top 4 districts → others · updated ${formatTime(meta.refreshedAt)}`;
    }
  }

  function byTopic(items, topic) {
    return items.filter((item) => item.topic === topic);
  }

  function pickTopicStories(items, topic, limit = 3) {
    let pool = byTopic(items, topic);
    if (topic === "cricket") {
      const cricketish = pool.filter((item) =>
        /क्रिकेट|cricket|ipl|टी.?20|टेस्ट|वनडे|विश्व कप|wc |bcci|गिल|कोहली|रोहित|बल्लेबाज|गेंदबाज/i.test(
          `${item.title} ${item.summary || ""}`
        )
      );
      if (cricketish.length >= limit) pool = cricketish;
    }
    return [...pool]
      .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
      .slice(0, limit);
  }

  function renderTopicColumns(items) {
    const hi = getNewsLang() === "hi";
    const empty = hi ? "अभी खबर उपलब्ध नहीं" : "No stories right now";
    document.querySelectorAll(".mini-list[data-topic]").forEach((list) => {
      const topic = list.getAttribute("data-topic");
      const picks = pickTopicStories(items, topic, 3);
      list.setAttribute("aria-busy", "false");
      if (!picks.length) {
        list.innerHTML = `<li>${empty}</li>`;
        return;
      }
      list.innerHTML = picks
        .map(
          (item) =>
            `<li><a href="${articleHref(item)}">${escapeHtml(item.title)}</a></li>`
        )
        .join("");
    });
  }

  function renderBusiness(items) {
    const grid = document.getElementById("bizGrid");
    if (!grid) return;
    const hi = getNewsLang() === "hi";
    const picks = pickTopicStories(items, "business", 3);
    grid.setAttribute("aria-busy", "false");
    if (!picks.length) {
      grid.innerHTML = `<p class="feed-empty">${
        hi ? "अभी बिजनेस खबर उपलब्ध नहीं।" : "No business stories right now."
      }</p>`;
      return;
    }
    grid.innerHTML = picks
      .map(
        (item) => `
      <article>
        <span class="chip">${escapeHtml(item.category || (hi ? "बिजनेस" : "Business"))}</span>
        <h3><a href="${articleHref(item)}">${escapeHtml(item.title)}</a></h3>
        <p>${escapeHtml(
          (item.summary || "").slice(0, 120) ||
            (hi ? "पूरी खबर पढ़ें।" : "Read full story.")
        )}</p>
      </article>`
      )
      .join("");
  }

  function renderWorld(items) {
    const strip = document.getElementById("worldStrip");
    if (!strip) return;
    const hi = getNewsLang() === "hi";
    const picks = pickTopicStories(items, "world", 3);
    strip.setAttribute("aria-busy", "false");
    if (!picks.length) {
      strip.innerHTML = `<p class="feed-empty">${
        hi ? "अभी विदेश खबर उपलब्ध नहीं।" : "No world stories right now."
      }</p>`;
      return;
    }
    strip.innerHTML = picks
      .map(
        (item) => `
      <article>
        <h3><a href="${articleHref(item)}">${escapeHtml(item.title)}</a></h3>
      </article>`
      )
      .join("");
  }

  async function loadNews({ force = false } = {}) {
    const lang = getNewsLang();
    const hi = lang === "hi";
    setStatus(
      force
        ? hi
          ? "अपडेट हो रहा है…"
          : "Refreshing…"
        : hi
          ? "आदिवासी ज़िले · मप्र · भारत की खबरें लोड हो रही हैं…"
          : "Loading tribal / MP / India feed…"
    );
    if (refreshBtn) refreshBtn.disabled = true;
    if (topStoryGrid) topStoryGrid.setAttribute("aria-busy", "true");

    try {
      const params = new URLSearchParams({ lang });
      if (force) params.set("refresh", "1");
      const res = await fetch(`/api/news?${params}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = data.items || [];
      latestItems = items;

      if (!items.length) {
        setStatus(
          hi
            ? "अभी क्षेत्रीय खबर नहीं मिली — थोड़ी देर बाद देखें"
            : "No regional stories found — try again shortly",
          true
        );
        return;
      }

      const { ordered, topFour } = splitByPriority(items);
      const interleaved = buildInterleavedFocusRail(items);
      const front = pickFrontStory(items) || interleaved[0] || ordered[0];
      const focusRail = interleaved.length ? interleaved : topFour;
      const topRail = [
        front,
        ...focusRail.filter((i) => i.id !== front.id),
        ...ordered.filter(
          (i) => i.id !== front.id && !focusRail.some((t) => t.id === i.id)
        ),
      ];
      renderHero(front);
      renderLeadRail(topRail, front?.id);
      renderTrending(focusRail.length ? focusRail : ordered);
      renderTopGrid(topRail.filter((i) => i.id !== front?.id));
      renderLiveFeed(items, data);
      renderDistrictFeed(items, activeFilter);
      renderTopicColumns(items);
      renderBusiness(items);
      renderWorld(items);
      setStatus(
        hi
          ? `लाइव · टॉप 4 ज़िले · ताज़ा · ${formatTime(data.refreshedAt)} · अगला अपडेट 15 मि`
          : `Live · top 4 districts · latest · ${formatTime(data.refreshedAt)} · next in 15 min`
      );
    } catch (err) {
      console.error(err);
      setStatus(
        hi ? "सर्वर से कनेक्ट नहीं — npm start चलाएँ" : "Cannot reach server — run npm start",
        true
      );
      if (heroTitle && /लोड|Loading/i.test(heroTitle.textContent)) {
        heroTitle.textContent = hi
          ? "लाइव न्यूज़ के लिए सर्वर चालू करें"
          : "Start the server for live news";
      }
      if (heroDeck) {
        heroDeck.textContent = hi
          ? "टर्मिनल में adibhumi-news फ़ोल्डर में जाकर npm install और npm start चलाएँ, फिर http://localhost:4174 खोलें।"
          : "In the adibhumi-news folder run npm install and npm start, then open http://localhost:4174.";
      }
    } finally {
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => loadNews({ force: true }));
  }

  loadNews();
  setInterval(() => loadNews(), REFRESH_MS);
})();
