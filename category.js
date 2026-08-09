(() => {
  const params = new URLSearchParams(window.location.search);
  const topic = String(params.get("topic") || "breaking").toLowerCase();
  const lang = params.get("lang") === "en" ? "en" : "hi";
  const hi = lang === "hi";

  document.documentElement.lang = lang;

  const TOPICS = {
    breaking: {
      hi: "ब्रेकिंग न्यूज़",
      en: "Breaking News",
      meta: hi ? "ताज़ा · अलीराजपुर · झाबुआ · धार · बड़वानी" : "Latest · top focus districts",
    },
    local: {
      hi: "आदिवासी ज़िले",
      en: "Tribal Districts",
      meta: hi ? "झाबुआ · अलीराजपुर · धार · बड़वानी" : "Jhabua · Alirajpur · Dhar · Barwani",
    },
    malwa: {
      hi: "मालवा-निमाड़",
      en: "Malwa–Nimad",
      meta: hi ? "पश्चिम मप्र क्षेत्रीय कवरेज" : "West MP regional coverage",
    },
    business: {
      hi: "बिजनेस",
      en: "Business",
      meta: hi ? "बाज़ार · अर्थव्यवस्था" : "Markets · economy",
    },
    sports: {
      hi: "खेल",
      en: "Sports",
      meta: hi ? "क्रिकेट · खेल समाचार" : "Cricket · sports desk",
    },
    cricket: {
      hi: "खेल",
      en: "Sports",
      meta: hi ? "क्रिकेट · खेल समाचार" : "Cricket · sports desk",
    },
    lifestyle: {
      hi: "संस्कृति · जीवन",
      en: "Culture · Life",
      meta: hi ? "लाइफस्टाइल · संस्कृति" : "Lifestyle · culture",
    },
    jobs: {
      hi: "जॉब-एजुकेशन",
      en: "Jobs · Education",
      meta: hi ? "रोजगार · शिक्षा" : "Jobs · education",
    },
    opinion: {
      hi: "ओपिनियन",
      en: "Opinion",
      meta: hi ? "संपादकीय · विचार" : "Editorial · views",
    },
    entertainment: {
      hi: "मनोरंजन",
      en: "Entertainment",
      meta: hi ? "बॉलीवुड · मनोरंजन" : "Bollywood · entertainment",
    },
  };

  const meta = TOPICS[topic] || TOPICS.breaking;
  const titleEl = document.getElementById("categoryTitle");
  const kickerEl = document.getElementById("categoryKicker");
  const statusEl = document.getElementById("categoryStatus");
  const feedEl = document.getElementById("categoryFeed");
  const dateEl = document.getElementById("liveDate");
  const nav = document.getElementById("categoryNav");

  if (titleEl) titleEl.textContent = hi ? meta.hi : meta.en;
  if (kickerEl) kickerEl.textContent = meta.meta;
  document.title = `${hi ? meta.hi : meta.en} | आदिभूमि`;

  if (nav) {
    nav.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const active = href.includes(`topic=${topic}`) || (topic === "cricket" && href.includes("topic=sports"));
      a.classList.toggle("is-active", active);
    });
  }

  if (dateEl) {
    const now = new Date();
    dateEl.dateTime = now.toISOString();
    try {
      dateEl.textContent = new Intl.DateTimeFormat(hi ? "hi-IN" : "en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(now);
    } catch {
      dateEl.textContent = now.toDateString();
    }
  }

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

  function formatTime(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat(hi ? "hi-IN" : "en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return "";
    }
  }

  function storyCard(item, index) {
    const place = item.districtLabel || item.category || (hi ? "आदिभूमि" : "Adibhumi");
    const useImage = item.image && !item.imageIsFallback;
    const thumbStyle = useImage
      ? `style="background-image:url('${escapeHtml(item.image)}');background-size:cover;background-position:center;"`
      : "";
    return `
      <article class="db-row${index === 0 ? " db-row-feature" : ""}">
        <a href="${articleHref(item)}">
          <div class="db-thumb ${useImage ? "" : "thumb-tone-" + ((index % 5) + 1)}" ${thumbStyle}></div>
          <div class="db-body">
            <span class="chip">${escapeHtml(place)}</span>
            <h3>${escapeHtml(item.title)}</h3>
            ${item.summary && index < 2 ? `<p>${escapeHtml(item.summary)}</p>` : ""}
            <span class="db-meta">${item.publishedAt ? formatTime(item.publishedAt) : ""}</span>
          </div>
        </a>
      </article>`;
  }

  async function loadCategory() {
    if (statusEl) statusEl.textContent = hi ? "खबरें लोड हो रही हैं…" : "Loading stories…";
    if (feedEl) feedEl.setAttribute("aria-busy", "true");
    try {
      const q = new URLSearchParams({ lang, topic });
      const res = await fetch(`/api/news?${q}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = data.items || [];
      if (!items.length) {
        if (statusEl) {
          statusEl.textContent = hi
            ? "इस श्रेणी में अभी खबर नहीं मिली।"
            : "No stories in this category right now.";
        }
        if (feedEl) feedEl.innerHTML = "";
        return;
      }
      if (statusEl) {
        statusEl.textContent = hi
          ? `${items.length} खबरें · अपडेट ${formatTime(data.refreshedAt)}`
          : `${items.length} stories · updated ${formatTime(data.refreshedAt)}`;
      }
      if (feedEl) {
        feedEl.innerHTML = items.slice(0, 40).map((item, i) => storyCard(item, i)).join("");
        feedEl.setAttribute("aria-busy", "false");
      }
    } catch (err) {
      console.error(err);
      if (statusEl) {
        statusEl.textContent = hi
          ? "श्रेणी लोड नहीं हो सकी। सर्वर चालू करें।"
          : "Could not load category. Start the server.";
      }
    }
  }

  loadCategory();
})();
