// 首页和分类页共用的渲染逻辑。
// index.html 没有 ?id= 参数，代表"根目录"（5 个大 tab）；
// category.html?id=xxx 显示某一个分类下面的内容。

function findAncestorColor(path) {
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].color) return path[i].color;
  }
  return "#D0CBE3";
}

function breadcrumbHtml(path) {
  return path
    .map((node, i) => {
      const isLast = i === path.length - 1;
      const label = node.id ? escapeHtml(node.title) : "首页";
      if (isLast) {
        return `<span class="crumb current">${label}</span>`;
      }
      const href = node.id ? `category.html?id=${encodeURIComponent(node.id)}` : "index.html";
      return `<a class="crumb" href="${href}">${label}</a>`;
    })
    .join('<span class="crumb-sep">›</span>');
}

async function renderChildCard(child, accentColor, kudosCounts, likedSet) {
  if (child.type === "event") {
    try {
      const ev = await fetchJson(`data/events/${child.eventId}.json`);
      const kudosId = kudosIdForEvent(ev.id);
      const total = await computeKudosTotal(child, kudosCounts);
      return `
        <div class="node-card-row">
          <a class="node-card event-card-mini" href="event.html?id=${encodeURIComponent(ev.id)}">
            <div class="node-card-kicker">事件</div>
            <div class="node-card-title">${escapeHtml(ev.title)}</div>
            ${ev.summary ? `<div class="node-card-desc">${escapeHtml(ev.summary)}</div>` : ""}
            <div class="node-tag">${escapeHtml(ev.date || "日期未知")}</div>
          </a>
          ${kudosButtonHtml(kudosId, total, likedSet.has(kudosId))}
        </div>`;
    } catch (err) {
      return `<div class="node-card node-card-error">事件加载失败：${escapeHtml(child.eventId)}</div>`;
    }
  }

  if (child.type === "divider") {
    return `<div class="year-divider"><span>${escapeHtml(child.label)}</span></div>`;
  }

  if (child.type === "honor") {
    return `
      <div class="node-card honor-card">
        <span class="node-card-title">${escapeHtml(child.title)}</span>
        ${child.year ? `<span class="honor-year">${escapeHtml(String(child.year))}</span>` : ""}
      </div>`;
  }

  if (child.type === "link") {
    if (!child.url) {
      return `
        <div class="node-card link-card link-card-pending">
          ${platformBadgeHtml(child.platform || "?")}
          <span class="node-card-title">${escapeHtml(child.title || "(未命名链接)")}</span>
          <span class="pending-tag">待补充</span>
        </div>`;
    }
    const kudosId = kudosIdForLink(child.url);
    const count = kudosCounts[kudosId] || 0;
    return `
      ${captionHtml(child.caption)}
      <div class="node-card-row">
        <a class="node-card link-card" href="${escapeHtml(child.url)}" target="_blank" rel="noopener noreferrer">
          ${platformBadgeHtml(child.platform || "?")}
          <span class="node-card-title">${escapeHtml(child.title || "(未命名链接)")}</span>
          <span class="material-arrow">↗</span>
        </a>
        ${kudosButtonHtml(kudosId, count, likedSet.has(kudosId))}
      </div>`;
  }

  // 普通分类节点（文件夹）：如果这个节点自己定义了颜色（比如顶层大 tab），优先用它自己的颜色。
  // 卡片下面第二行：只要这个节点下面有至少一个"小分类"（文件夹），就列出预览名字（文件夹用标题，
  // 事件用年份，链接用标题），跟首页大 tab 一个逻辑；如果下面全是事件/链接（没有任何子分类），
  // 就还是显示"共几项"
  const children = child.children || [];
  const count = children.length;
  const cardColor = child.color || accentColor;
  const subFolders = children.filter((c) => !c.type);
  const hasSubCategories = subFolders.length > 0;

  let secondLineHtml;
  if (hasSubCategories) {
    const names = [];
    for (const c of children) {
      if (c.type === "divider" || c.type === "link") continue;
      if (c.type === "event") {
        try {
          const ev = await fetchJson(`data/events/${c.eventId}.json`);
          names.push((ev.date || "").slice(0, 4) || ev.title || "");
        } catch (err) {
          // 单个事件加载失败不影响预览文字的其余部分
        }
        continue;
      }
      names.push(c.title || c.label || "");
    }
    const filtered = names.filter(Boolean);
    const preview = filtered.slice(0, 4).join("，") + (filtered.length > 4 ? " 等" : "");
    secondLineHtml = `<div class="node-tag">${escapeHtml(preview || "暂无内容")}</div>`;
  } else {
    secondLineHtml = `<div class="node-tag">${count > 0 ? `${count} 项` : "暂无内容"}</div>`;
  }

  const kudosId = kudosIdForFolder(child.id);
  const total = await computeKudosTotal(child, kudosCounts);

  return `
    <div class="node-card-row">
      <a class="node-card folder-card" href="category.html?id=${encodeURIComponent(child.id)}" style="--accent:${cardColor}">
        <div class="node-card-title">${escapeHtml(child.title)}</div>
        ${secondLineHtml}
      </a>
      ${kudosButtonHtml(kudosId, total, likedSet.has(kudosId))}
    </div>`;
}

async function renderNavPage() {
  const statusEl = document.getElementById("status");
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") || "";

  try {
    const path = await loadNodePath(id);
    const current = path[path.length - 1];
    const accentColor = findAncestorColor(path);

    statusEl.remove();

    document.getElementById("breadcrumb").innerHTML = breadcrumbHtml(path);
    const titleEl = document.getElementById("page-title");
    if (current.title) {
      titleEl.textContent = current.title;
    } else {
      titleEl.remove();
    }
    document.documentElement.style.setProperty("--accent", accentColor);

    const introEl = document.getElementById("intro");
    if (current.intro) {
      introEl.textContent = current.intro;
      introEl.classList.add("shown");
    } else {
      introEl.remove();
    }

    let children = current.children || [];
    const gridEl = document.getElementById("node-grid");

    // 首页顶部的大 banner：只在根目录（index.html）渲染，来自 nav.json 里 hero:true 的那个节点，
    // 渲染完之后要把它从下面的普通网格里去掉，不然会重复出现一次小卡片
    const heroSlot = document.getElementById("hero-banner-slot");
    if (heroSlot && !id) {
      const heroNode = children.find((c) => c.hero);
      if (heroNode) {
        heroSlot.innerHTML = `
          <a class="hero-banner" href="category.html?id=${encodeURIComponent(heroNode.id)}">
            <div class="hero-banner-title">${escapeHtml(heroNode.title)}</div>
            <div class="hero-banner-subtitle">${escapeHtml(heroNode.subtitle || "")}</div>
          </a>`;
        children = children.filter((c) => c !== heroNode);
      }
    }

    if (children.length === 0) {
      gridEl.innerHTML = `<p class="empty-hint">这里还没有资料，敬请期待。</p>`;
      return;
    }

    const sortToggleEl = document.getElementById("sort-toggle");
    let sortByLikes = false;

    // 排序按钮的点击事件在这里就绑定好（不等点赞数据拉回来），避免"页面刚打开、
    // 数据还没拉完的一瞬间点了按钮没反应"这种时序问题——renderGrid 内部自己用
    // fetchKudosCounts() 的缓存结果，不管什么时候被调用都能拿到正确数据
    if (sortToggleEl) {
      sortToggleEl.addEventListener("click", () => {
        sortByLikes = !sortByLikes;
        sortToggleEl.classList.toggle("active", sortByLikes);
        sortToggleEl.textContent = sortByLikes ? "恢复默认顺序" : "按点赞数排序";
        renderGrid();
      });
    }

    async function renderGrid() {
      const kudosCounts = await fetchKudosCounts();
      const likedSet = getLikedSet();
      let ordered = children;
      if (sortByLikes) {
        const totals = await Promise.all(children.map((c) => computeKudosTotal(c, kudosCounts)));
        ordered = children
          .map((c, i) => ({ c, total: totals[i] }))
          .sort((a, b) => b.total - a.total)
          .map((x) => x.c);
      }
      const cardsHtml = await Promise.all(
        ordered.map((c) => renderChildCard(c, accentColor, kudosCounts, likedSet))
      );
      gridEl.innerHTML = cardsHtml.join("");
      initKudos(gridEl);
    }

    await renderGrid();
  } catch (err) {
    statusEl.textContent = "加载出错：" + err.message;
    console.error(err);
  }
}

renderNavPage();
