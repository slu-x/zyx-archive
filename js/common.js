// 这个文件是给两个页面（首页 / 事件详情页）共用的小工具函数。
// 非程序员不需要看懂这个文件，正常维护资料完全不需要碰它。

const PLATFORM_STYLES = {
  "微博": { bg: "#E6162D", fg: "#ffffff" },
  "抖音": { bg: "#000000", fg: "#ffffff" },
  "小红书": { bg: "#FF2442", fg: "#ffffff" },
  "知乎": { bg: "#0084FF", fg: "#ffffff" },
  "贴吧": { bg: "#3385FF", fg: "#ffffff" },
  "Bilibili": { bg: "#FB7299", fg: "#ffffff" },
  "B站": { bg: "#FB7299", fg: "#ffffff" },
  "YouTube": { bg: "#FF0000", fg: "#ffffff" },
  "媒体": { bg: "#555555", fg: "#ffffff" }
};

const DEFAULT_PLATFORM_STYLE = { bg: "#888888", fg: "#ffffff" };

const CATEGORY_ORDER = ["正式内容", "官方物料", "当时的讨论", "其他"];

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function platformBadgeHtml(platform) {
  const style = PLATFORM_STYLES[platform] || DEFAULT_PLATFORM_STYLE;
  return `<span class="platform-badge" style="background:${style.bg};color:${style.fg}">${escapeHtml(platform)}</span>`;
}

async function fetchJson(url) {
  // cache: "no-cache" 会让浏览器每次都跟服务器确认一下内容有没有变，
  // 而不是直接用很久以前缓存的旧版本 —— 保证你更新完资料后，访问者不用手动刷新也能看到最新内容。
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`无法加载 ${url}（状态码 ${res.status}）`);
  }
  return res.json();
}

let eventsBundlePromise = null;

// 所有事件文件打包成的一份 data/events-bundle.json（生成脚本：tools/generate-events-bundle.py），
// 只在真正需要"把很多个事件的内容都看一遍"时才用这个（比如点赞汇总、全站搜索建索引）——
// 只看"某一个具体事件"的详情页（event.html）还是直接读它自己那个文件就够了，不需要整份都拉下来。
// 用 Promise 缓存住，一个页面里不管被调用几次都只会真正发一次请求。
function fetchEventsBundle() {
  if (!eventsBundlePromise) {
    eventsBundlePromise = fetchJson("data/events-bundle.json").catch(() => ({}));
  }
  return eventsBundlePromise;
}

async function loadAllEvents() {
  const manifest = await fetchJson("data/events/manifest.json");
  const events = await Promise.all(
    manifest.map((id) => fetchJson(`data/events/${id}.json`))
  );
  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return events;
}
