// 点赞功能。数据存在服务器一个很小的独立接口里（不是 nav.json，不会进 git 仓库），
// 页面打开时一次性拉取全部点赞数，点了之后在浏览器本地记一下"这个人点过"（localStorage），
// 刷新页面还能看到自己点过的是实心状态。
//
// 如果以后要整个撤掉这个功能：删掉这个文件、删掉 style.css 里 KUDOS 那一段、
// 把 category.js / event.js 里包 kudos 按钮的那层 <div class="node-card-row"> 换回单独的
// <a class="node-card">（搜 "kudos" 能定位到全部改动点），三个 html 文件里那行
// <script src="js/kudos.js"> 也删掉，就完全恢复到没有点赞之前的样子。服务器那边的接口
// 是完全独立的一个服务，直接停掉/删掉不会影响网站本身任何其他功能。

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

function kudosHeartSvg(filled) {
  return `<svg class="kudos-heart-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 20.5s-7.5-4.6-10-9.3C0.3 7.8 1.8 4 5.4 4c2 0 3.4 1 4.6 2.6C11.2 5 12.6 4 14.6 4c3.6 0 5.1 3.8 3.4 7.2-2.5 4.7-10 9.3-10 9.3z"
      fill="${filled ? "var(--kudos-color)" : "none"}"
      stroke="var(--kudos-color)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

// 卡片渲染的时候先占位（这时候还不知道点赞数、也不知道这个浏览器点没点过），
// 等 initKudos() 统一拉取数据之后再回填成真正的爱心+数字
function kudosPlaceholderHtml(kudosId) {
  return `<button type="button" class="kudos-btn" data-kudos-id="${escapeHtml(kudosId)}" aria-label="点赞"></button>`;
}

function setKudosButtonState(btn, count, liked) {
  btn.classList.toggle("kudos-liked", liked);
  btn.innerHTML = kudosHeartSvg(liked) + `<span class="kudos-count">${count}</span>`;
}

async function initKudos(root) {
  const scope = root || document;
  const buttons = scope.querySelectorAll(".kudos-btn[data-kudos-id]");
  if (buttons.length === 0) return;

  const counts = await fetchKudosCounts();
  const liked = getLikedSet();

  buttons.forEach((btn) => {
    const id = btn.dataset.kudosId;
    setKudosButtonState(btn, counts[id] || 0, liked.has(id));
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

  setKudosButtonState(btn, optimistic, !wasLiked);
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
    if (res.ok) {
      const data = await res.json();
      setKudosButtonState(btn, data.count, !wasLiked);
    }
  } catch (err) {
    // 网络请求失败就保留本地这次乐观更新的结果，不影响用户看到的点击反馈
  }
}
