(() => {
  const params = new URLSearchParams(window.location.search);
  const articleId = params.get("id");
  const lang = params.get("lang") === "en" ? "en" : "hi";
  const hi = lang === "hi";

  document.documentElement.lang = lang;

  const dateEl = document.getElementById("liveDate");
  const articleCard = document.getElementById("articleCard");
  const articleStatus = document.getElementById("articleStatus");
  const relatedSection = document.getElementById("relatedSection");
  const relatedGrid = document.getElementById("relatedGrid");
  const backLink = document.getElementById("backLink");

  if (backLink) {
    backLink.textContent = hi ? "← वापस होम" : "← Back to home";
    backLink.href = `index.html`;
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat(hi ? "hi-IN" : "en-IN", {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso;
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

  function bodyFromArticle(article) {
    if (article.bodyHtml && /<p[\s>]/i.test(article.bodyHtml) && article.bodyHtml.trim().length > 80) {
      return `<div class="article-body-html">${article.bodyHtml}</div>`;
    }
    const text = article.body || article.summary || "";
    const chunks = text
      .replace(/\s+/g, " ")
      .split(/(?<=[।.!?])\s+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 40);
    const paragraphs = chunks.length
      ? chunks
      : text
          .split(/\n+/)
          .map((p) => p.trim())
          .filter(Boolean);
    if (!paragraphs.length) {
      return `<p>${escapeHtml(
        hi
          ? "इस खबर का विस्तृत विवरण जल्द अपडेट किया जाएगा।"
          : "Full details for this story will be updated shortly."
      )}</p>`;
    }
    return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  }

  function shouldShowDek(article) {
    if (!article.summary) return false;
    const body = (article.body || "").replace(/\s+/g, " ");
    const summary = article.summary.replace(/\s+/g, " ");
    if (!body) return true;
    // Avoid repeating the same lead under the title.
    if (body.startsWith(summary.slice(0, Math.min(80, summary.length)))) return false;
    if (summary.length < 60) return false;
    return true;
  }

  function renderArticle(article) {
    document.title = `${article.title} | आदिभूमि`;
    const brand = hi ? "आदिभूमि" : "Adibhumi";
    const byline = hi ? "आदिभूमि डेस्क" : "Adibhumi Desk";
    const dek = shouldShowDek(article)
      ? `<p class="article-dek">${escapeHtml(article.summary)}</p>`
      : "";

    articleCard.innerHTML = `
      <header class="article-header">
        <span class="chip">${escapeHtml(article.category || (hi ? "टॉप" : "Top"))}</span>
        <h1>${escapeHtml(article.title)}</h1>
        <p class="article-meta">
          <strong>${brand}</strong>
          <span>· ${byline}</span>
          ${article.publishedAt ? `<span>· ${escapeHtml(formatDate(article.publishedAt))}</span>` : ""}
        </p>
      </header>
      ${
        article.image
          ? `<figure class="article-figure">
              <img src="${escapeHtml(article.image)}" alt="" loading="eager">
            </figure>`
          : ""
      }
      ${dek}
      <div class="article-body">
        ${bodyFromArticle(article)}
      </div>
      <footer class="article-footer">
        <p>${
          hi
            ? "यह कवरेज आदिभूमि न्यूज़ पोर्टल पर प्रकाशित है।"
            : "This coverage is published on the Adibhumi news portal."
        }</p>
      </footer>
    `;
    articleCard.setAttribute("aria-busy", "false");
  }

  function renderRelated(items) {
    if (!relatedSection || !relatedGrid || !items.length) return;
    relatedSection.hidden = false;
    document.getElementById("relatedTitle").textContent = hi ? "और खबरें" : "More stories";
    relatedGrid.innerHTML = items
      .map(
        (item) => `
      <article class="related-card">
        <a href="${articleHref(item)}">
          ${
            item.image
              ? `<div class="related-thumb" style="background-image:url('${escapeHtml(item.image)}')"></div>`
              : `<div class="related-thumb related-thumb-empty"></div>`
          }
          <h3>${escapeHtml(item.title)}</h3>
          <span class="story-source">${hi ? "आदिभूमि" : "Adibhumi"}</span>
        </a>
      </article>`
      )
      .join("");
  }

  async function loadArticle() {
    if (!articleId) {
      if (articleStatus) {
        articleStatus.textContent = hi
          ? "खबर नहीं मिली। होम पेज से कोई खबर चुनें।"
          : "Article not found. Pick a story from the home page.";
      }
      return;
    }

    try {
      const res = await fetch(`/api/news/article?id=${encodeURIComponent(articleId)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderArticle(data.article);
      renderRelated(data.related || []);
    } catch (err) {
      console.error(err);
      if (articleCard) {
        articleCard.innerHTML = `<p class="article-status is-error">${
          hi
            ? "खबर लोड नहीं हो सकी। होम पर वापस जाएँ और दोबारा कोशिश करें।"
            : "Could not load this story. Go home and try again."
        }</p>`;
      }
    }
  }

  loadArticle();
})();
