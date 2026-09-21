// 点赞功能。数据存在服务器一个很小的独立接口里（不是 nav.json，不会进 git 仓库），
// 页面打开时一次性拉取全部点赞数，点了之后在浏览器本地记一下"这个人点过"（localStorage），
// 刷新页面还能看到自己点过的是实心状态。
//
// 每个"分类/事件"卡片显示的数字是"汇总数字"：它自己被点的次数 + 它底下所有子分类/事件/
// 物料链接被点次数的总和，一路往上加（比如在某个事件详情页里单独点赞一条物料链接，这个
// 事件、以及它往上的每一层分类，显示的数字都会跟着多 1）。这个汇总完全是前端算的，服务器
// 那边还是只存"每个 id 自己被点了几次"这么简单的一份数据，好处是改分类结构、加新链接都
// 不用去动服务器数据。
//
// 事件的物料内容来自 data/events-bundle.json（common.js 的 fetchEventsBundle()，全部事件
// 打包成的一份文件，一次请求，不是一个个事件文件单独去拉）——早期版本是现拉每个事件自己的
// json 文件，首页给好几个大 tab 算汇总，等于要把几十个事件文件全部现读一遍，实测多发 30+
// 个请求、明显拖慢访问速度；改成读这一份打包文件之后，不管分类里有多少事件，都只多这一次
// 请求。**这份打包文件是衍生文件，改了 data/events/ 下面任何一个事件之后要记得重新跑一次
// tools/generate-events-bundle.py**，见 PROJECT_HANDOFF.md。
//
// 如果以后要整个撤掉这个功能：删掉这个文件、删掉 style.css 里 KUDOS 那一段、
// 把 category.js / event.js 里包 kudos 按钮的那层 <div class="node-card-row"> 换回单独的
// <a class="node-card">、breadcrumb 旁边的排序按钮（搜 "sort-toggle"）也删掉，三个 html
// 文件里 <script src="js/kudos.js"> 那一行、以及新加的 <div class="page-toolbar">...</div>
// 也删掉，就完全恢复到没有点赞之前的样子。服务器那边的接口是完全独立的一个服务，
// 直接停掉/删掉不会影响网站本身任何其他功能。

const KUDOS_API = "/api/kudos";
const KUDOS_LS_KEY = "zyx-archive-kudos-liked";

let kudosCountsPromise = null;

function fnv1aHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function kudosIdForLink(url) {
  return "link-" + fnv1aHash(url);
}

function kudosIdForFolder(id) {
  return "folder-" + id;
}

function kudosIdForEvent(eventId) {
  return "event-" + eventId;
}

function getLikedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KUDOS_LS_KEY) || "[]"));
  } catch (err) {
    return new Set();
  }
}

function saveLikedSet(set) {
  try {
    localStorage.setItem(KUDOS_LS_KEY, JSON.stringify([...set]));
  } catch (err) {
    // 存不进去（比如隐私模式）就算了，不影响这次点赞请求本身
  }
}

function fetchKudosCounts() {
  if (!kudosCountsPromise) {
    kudosCountsPromise = fetch(KUDOS_API, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
  }
  return kudosCountsPromise;
}

// 递归算一个节点自己 + 底下所有内容的点赞总数，只沿着 nav.json 里已经加载好的树走，
// 不会再额外发请求（这是修过一次性能问题之后的版本，见下面的说明）。
//
// 【2026-09-20 晚些时候修过一次性能问题】最早的版本里，事件节点还会去把它 data/events/*.json
// 里每条物料链接的赞数也加进来，这样算需要现拉取那个事件的 json 文件——首页这种要给好几个
// 顶层大 tab 算汇总的页面，等于要把底下几十个事件文件全部现读一遍，实测多发了 30+ 个请求，
// 网站明显变慢。改成现在这样"文件夹/事件只算自己的赞数往上加，不钻进事件内部的物料链接"，
// 整个计算完全基于已经在内存里的 nav.json，不用再多发一个请求。代价是"事件详情页里单独点赞
// 某一条物料链接"不会往上算进事件/分类的汇总数字——只有事件卡片本身被点赞才会往上算，
// 这个取舍是为了保住首页/分类页的加载速度。
async function computeKudosTotal(node, counts) {
  if (!node || node.type === "divider") return 0;

  if (node.type === "link") {
    if (!node.url) return 0;
    return counts[kudosIdForLink(node.url)] || 0;
  }

  if (node.type === "event") {
    let total = counts[kudosIdForEvent(node.eventId)] || 0;
    const bundle = await fetchEventsBundle();
    const ev = bundle[node.eventId];
    for (const m of (ev && ev.materials) || []) {
      if (m.url) total += counts[kudosIdForLink(m.url)] || 0;
    }
    return total;
  }

  // 文件夹节点
  let total = counts[kudosIdForFolder(node.id)] || 0;
  const childTotals = await Promise.all((node.children || []).map((c) => computeKudosTotal(c, counts)));
  return total + childTotals.reduce((a, b) => a + b, 0);
}

function kudosHeartSvg(filled) {
  return `<svg class="kudos-heart-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 20.5s-7.5-4.6-10-9.3C0.3 7.8 1.8 4 5.4 4c2 0 3.4 1 4.6 2.6C11.2 5 12.6 4 14.6 4c3.6 0 5.1 3.8 3.4 7.2-2.5 4.7-10 9.3-10 9.3z"
      fill="${filled ? "var(--kudos-color)" : "none"}"
      stroke="var(--kudos-color)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

// 渲染卡片的时候直接把当时已知的数字/是否点过 烤进 HTML 里（这两样这时候都已经知道了，
// 不需要再等一轮"占位再回填"）。initKudos 之后只负责绑点击事件。
function kudosButtonHtml(kudosId, count, liked) {
  return `<button type="button" class="kudos-btn${liked ? " kudos-liked" : ""}" data-kudos-id="${escapeHtml(
    kudosId
  )}" aria-label="点赞">${kudosHeartSvg(liked)}<span class="kudos-count">${count}</span></button>`;
}

function initKudos(root) {
  const scope = root || document;
  const buttons = scope.querySelectorAll(".kudos-btn[data-kudos-id]");
  buttons.forEach((btn) => {
    const id = btn.dataset.kudosId;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleKudos(btn, id);
    });
  });
}

async function toggleKudos(btn, id) {
  const liked = getLikedSet();
  const wasLiked = liked.has(id);
  const countEl = btn.querySelector(".kudos-count");
  const current = parseInt((countEl && countEl.textContent) || "0", 10) || 0;
  const optimistic = wasLiked ? Math.max(0, current - 1) : current + 1;

  btn.classList.toggle("kudos-liked", !wasLiked);
  btn.innerHTML = kudosHeartSvg(!wasLiked) + `<span class="kudos-count">${optimistic}</span>`;
  if (wasLiked) {
    liked.delete(id);
  } else {
    liked.add(id);
  }
  saveLikedSet(liked);

  try {
    const res = await fetch(`${KUDOS_API}/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: wasLiked ? "unlike" : "like" }),
    });
    if (!res.ok) throw new Error("bad status " + res.status);
    // 服务器返回的是这个节点自己的赞数，不是页面上显示的汇总数字，这里不用它来覆盖
    // 界面——上面乐观更新的汇总结果已经是对的，请求这一步只是确认有没有成功记进服务器。
  } catch (err) {
    // 网络失败也不回滚界面，保留这次点击的乐观结果；下次刷新页面会用服务器的真实数据重新算一遍
  }
}
