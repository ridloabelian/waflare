import type { WaflareStore } from "../state/store.ts";

/**
 * Formats a concise 3-line Smart-Glasses card suitable for Meta Ray-Ban Display WebKit HUDs.
 */
export function formatGlassesCard(title: string, replyText: string): string {
  const clean = replyText.replace(/\s+/g, " ").trim();
  const clipped = clean.length > 140 ? `${clean.slice(0, 137)}...` : clean;
  return `[${title.toUpperCase()}]\n${clipped}`;
}

export function pushGlassesHudEntry(store: WaflareStore, summary: string, now: number = Date.now()): void {
  store.glassesQueue.unshift({
    id: `hud_${now}`,
    summary: summary.slice(0, 160),
    timestamp: now
  });
  if (store.glassesQueue.length > 15) {
    store.glassesQueue.length = 15;
  }
}

export function renderGlassesHudHtml(store: WaflareStore): string {
  const pendingCount = Array.from(store.pendingOps.values()).filter((o) => o.status === "pending").length;
  const activeLeads = store.contacts.size;
  const latest = store.glassesQueue.slice(0, 5);

  const itemsHtml = latest
    .map(
      (item) =>
        `<li class="card"><div class="meta">${new Date(item.timestamp).toISOString().slice(11, 19)} UTC</div><div class="txt">${item.summary
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")}</div></li>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Waflare Smart-Glasses HUD</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; padding: 18px; background: #000; color: #00ff9c; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .hud { max-width: 440px; margin: 0 auto; border: 2px solid #00ff9c; border-radius: 12px; padding: 16px; }
    .top { display: flex; justify-content: space-between; font-size: 13px; border-bottom: 1px solid #00ff9c44; padding-bottom: 8px; margin-bottom: 12px; }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
    .card { border: 1px solid #00ff9c55; border-radius: 8px; padding: 10px; background: #04150d; }
    .meta { font-size: 11px; opacity: 0.75; margin-bottom: 4px; }
    .txt { font-size: 15px; line-height: 1.35; font-weight: 600; }
    .form { margin-top: 14px; display: flex; gap: 8px; }
    input { flex: 1; background: #04150d; color: #00ff9c; border: 1px solid #00ff9c; border-radius: 6px; padding: 8px; font-family: inherit; }
    button { background: #00ff9c; color: #000; border: 0; border-radius: 6px; padding: 8px 12px; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <main class="hud">
    <header class="top">
      <span>WAFLARE // GLASSES HUD</span>
      <span>LEADS:${activeLeads} OPS:${pendingCount}</span>
    </header>
    <ul id="feed">${itemsHtml}</ul>
    <form class="form" id="cmdForm">
      <input id="cmdInput" type="text" placeholder="Voice / quick cmd (e.g. /audit-e2ee)" />
      <button type="submit">RUN</button>
    </form>
  </main>
  <script>
    document.getElementById('cmdForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('cmdInput');
      const text = input.value.trim();
      if (!text) return;
      const res = await fetch('/api/glasses/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      const li = document.createElement('li');
      li.className = 'card';
      li.innerHTML = '<div class="meta">NOW</div><div class="txt"></div>';
      li.querySelector('.txt').textContent = data.hudCard || data.reply || 'OK';
      document.getElementById('feed').prepend(li);
      input.value = '';
    });
  </script>
</body>
</html>`;
}
