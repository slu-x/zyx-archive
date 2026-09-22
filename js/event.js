// 事件详情页逻辑：根据网址里的 ?id= 参数，读取对应事件的 JSON 文件并显示。

async function renderEventPage() {
  const statusEl = document.getElementById("status");
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  if (!id) {
    statusEl.textContent = "网址缺少事件编号（?id=...），请从首页点击进入。";
    return;
  }

  try {
    const ev = await fetchJson(`data/events/${id}.json`);
    statusEl.remove();

    document.title = ev.title + " - Archive of Lay";
    document.getElementById("event-title").textContent = ev.title;
    document.getElementById("event-date").textContent = ev.date;
    document.getElementById("event-summary").textContent = ev.summary || "";

    const materials = ev.materials || [];
    const groups = new Map();
    for (const cat of CATEGORY_ORDER) groups.set(cat, []);
    for (const m of materials) {
      const cat = m.category && m.category.trim() ? m.category : "其他";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(m);
    }

    const kudosCounts = await fetchKudosCounts();
    const likedSet = getLikedSet();

    const container = document.getElementById("materials");
    let html = "";
    for (const [cat, items] of groups) {
      if (items.length === 0) continue;
      html += `<section class="material-group">
        <h2 class="material-group-title">${escapeHtml(cat)}</h2>
        <ul class="material-list">
          ${items
            .map((m) => {
              const kudosId = kudosIdForLink(m.url);
              const count = kudosCounts[kudosId] || 0;
              return `
            ${m.caption ? `<li class="material-caption-item">${captionHtml(m.caption)}</li>` : ""}
            <li class="node-card-row">
              <a class="material-link" href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer">
                ${platformBadgeHtml(m.platform || "?")}
                <span class="material-title">${escapeHtml(m.title || "(未命名链接)")}</span>
                <span class="material-arrow">↗</span>
              </a>
              ${kudosButtonHtml(kudosId, count, likedSet.has(kudosId))}
            </li>`;
            })
            .join("")}
        </ul>
      </section>`;
    }

    if (materials.length === 0) {
      html = `<p class="empty-hint">这个事件还没有添加任何物料链接。</p>`;
    }

    container.innerHTML = html;
    initKudos(container);
  } catch (err) {
    statusEl.textContent = "加载资料时出错：" + err.message;
    console.error(err);
  }
}

renderEventPage();
