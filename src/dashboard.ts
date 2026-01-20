export function dashboardHtml(apiBase = "") {
  // apiBase = "" means same-origin calls (recommended)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Scope AI Detector — Dashboard</title>
  <style>
    :root { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; }
    body { margin: 0; background:#0b0f17; color:#e7ecf3; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 20px; }
    .card { background:#111827; border:1px solid #243044; border-radius: 12px; padding: 14px; }
    .row { display:flex; gap: 12px; flex-wrap: wrap; }
    .row > * { flex: 1; min-width: 220px; }
    label { display:block; font-size: 12px; opacity:.85; margin-bottom: 6px; }
    input, select { width: 100%; padding: 10px 12px; border-radius: 10px; border:1px solid #2a3a55; background:#0b1220; color:#e7ecf3; }
    button { padding: 10px 12px; border-radius: 10px; border:1px solid #2a3a55; background:#172554; color:#e7ecf3; cursor:pointer; }
    button:hover { filter: brightness(1.1); }
    .muted { opacity:.8; font-size: 12px; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    h2 { font-size: 14px; margin: 0 0 10px; opacity:.9; }
    .grid3 { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    @media (max-width: 900px) { .grid3 { grid-template-columns: 1fr; } }
    table { width:100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align:left; padding: 8px; border-bottom: 1px solid #22304a; vertical-align: top; }
    th { opacity: .85; }
    code { background:#0b1220; border:1px solid #22304a; padding:2px 6px; border-radius: 8px; }
    .pill { display:inline-block; padding:2px 8px; border-radius: 999px; border:1px solid #2a3a55; font-size: 12px; }
    .ok { border-color:#2b7a3d; }
    .warn { border-color:#8a6b16; }
    .err { border-color:#8a1f1f; }
    .chart { width:100%; height: 140px; background:#0b1220; border:1px solid #22304a; border-radius: 12px; padding: 8px; }
    canvas { width:100%; height: 100%; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="row" style="align-items:center; justify-content:space-between;">
      <div>
        <h1>Scope AI Detector — Dashboard</h1>
        <div class="muted">View stats/events for a tenant host. Dashboard key is stored in your browser (localStorage) for convenience.</div>
      </div>
      <div class="muted">API: <code id="apiBase"></code></div>
    </div>

    <div class="card" style="margin-top:12px;">
      <div class="row">
        <div>
          <label>Host (tenant)</label>
          <input id="host" placeholder="e.g. www.adidas.com or vercel-crawler-lab.vercel.app" />
        </div>
        <div>
          <label>Dashboard Key</label>
          <input id="dashKey" placeholder="x-dashboard-key" />
        </div>
        <div style="display:flex; gap:10px; align-items:end;">
          <button id="loadBtn">Load</button>
          <button id="clearBtn" title="Clears only the recent-events list (does not erase rollups)">Clear Events</button>
        </div>
      </div>
      <div class="muted" style="margin-top:10px;">
        Tip: this page calls <code>/api/stats</code>, <code>/api/events</code>, <code>/api/rollups</code> using your <code>x-dashboard-key</code>.
      </div>
    </div>

    <div class="grid3" style="margin-top:12px;">
      <div class="card">
        <h2>Tenant Info</h2>
        <div id="tenantInfo" class="muted">—</div>
      </div>
      <div class="card">
        <h2>Status</h2>
        <div id="status" class="muted">Idle</div>
      </div>
      <div class="card">
        <h2>Rollups (24h)</h2>
        <div class="row">
          <div>
            <label>Family</label>
            <select id="family">
              <option value="openai">openai</option>
              <option value="perplexity">perplexity</option>
              <option value="anthropic">anthropic</option>
              <option value="google">google</option>
            </select>
          </div>
          <div style="display:flex; align-items:end;">
            <button id="rollBtn">Load Rollups</button>
          </div>
        </div>
        <div class="chart" style="margin-top:10px;"><canvas id="rollCanvas"></canvas></div>
        <div id="rollTotal" class="muted" style="margin-top:8px;">—</div>
      </div>
    </div>

    <div class="card" style="margin-top:12px;">
      <h2>Stats</h2>
      <div id="statsBox" class="muted">—</div>
    </div>

    <div class="card" style="margin-top:12px;">
      <h2>Recent Events</h2>
      <div class="muted" style="margin-bottom:10px;">Newest first (as stored). If empty, trigger traffic or ingest.</div>
      <div style="overflow:auto;">
        <table>
          <thead>
            <tr>
              <th>ts</th>
              <th>family/type</th>
              <th>host</th>
              <th>path</th>
              <th>ua</th>
              <th>ip</th>
              <th>country/colo</th>
            </tr>
          </thead>
          <tbody id="eventsBody">
            <tr><td colspan="7" class="muted">—</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

<script>
  const API_BASE = ${JSON.stringify(apiBase || "")}; // same-origin by default
  const $ = (id) => document.getElementById(id);

  $("apiBase").textContent = API_BASE || "(same origin)";

  const LS_HOST = "scopeai_host";
  const LS_KEY  = "scopeai_dash_key";

  function setStatus(text, kind) {
    const el = $("status");
    el.innerHTML = kind ? '<span class="pill ' + kind + '">' + text + '</span>' : text;
  }

  function getAuthHeaders() {
    const key = $("dashKey").value.trim();
    return key ? { "x-dashboard-key": key } : {};
  }

  function apiUrl(path, host) {
    const u = new URL((API_BASE || "") + path, window.location.origin);
    if (host) u.searchParams.set("host", host);
    return u.toString();
  }

  async function apiGet(path, host) {
    const res = await fetch(apiUrl(path, host), { headers: { ...getAuthHeaders() }});
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error((json && json.error) ? json.error : ("HTTP " + res.status));
    return json;
  }

  async function apiPost(path, host, body) {
    const res = await fetch(apiUrl(path, host), {
      method: "POST",
      headers: { "content-type": "application/json", ...getAuthHeaders() },
      body: body ? JSON.stringify(body) : "{}"
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error((json && json.error) ? json.error : ("HTTP " + res.status));
    return json;
  }

  function renderStats(data) {
    const stats = data.stats || {};
    const rows = Object.entries(stats).map(([fam, s]) => {
      return \`
        <div class="card" style="margin:8px 0; background:#0b1220;">
          <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div><b>\${fam}</b> <span class="pill ok">total \${s.total}</span></div>
            <div class="muted">last_seen: <code>\${s.last_seen || "—"}</code></div>
          </div>
          <div class="muted" style="margin-top:8px;">
            training: <b>\${s.training}</b> • search: <b>\${s.search}</b> • user: <b>\${s.user}</b>
          </div>
          <div class="muted" style="margin-top:8px;">
            top_paths: \${(s.top_paths||[]).map(p => \`<code>\${p.path}</code>×\${p.count}\`).join("  ") || "—"}
          </div>
        </div>\`;
    }).join("");
    $("statsBox").innerHTML = rows || "—";
  }

  function renderEvents(data) {
    const events = data.events || [];
    const body = $("eventsBody");
    if (!events.length) {
      body.innerHTML = '<tr><td colspan="7" class="muted">No events yet</td></tr>';
      return;
    }
    body.innerHTML = events.slice().reverse().reverse().map(e => \`
      <tr>
        <td><code>\${e.ts}</code></td>
        <td><b>\${e.bot_family}</b> / \${e.bot_type}<div class="muted">conf: \${e.confidence}</div></td>
        <td>\${e.host}</td>
        <td><code>\${e.path}</code></td>
        <td style="max-width: 360px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="\${e.ua}">\${e.ua}</td>
        <td>\${e.ip || "—"}</td>
        <td>\${(e.country || "—")} / \${(e.colo || "—")}</td>
      </tr>
    \`).join("");
  }

  function drawRollups(series) {
    const canvas = $("rollCanvas");
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.clientWidth * devicePixelRatio;
    const h = canvas.height = canvas.clientHeight * devicePixelRatio;

    ctx.clearRect(0,0,w,h);

    const data = (series || []).map(x => x.count || 0);
    const max = Math.max(1, ...data);
    const pad = 10 * devicePixelRatio;
    const barW = (w - pad*2) / Math.max(1, data.length);

    // axes baseline
    ctx.globalAlpha = 0.6;
    ctx.fillRect(pad, h - pad, w - pad*2, 1);

    ctx.globalAlpha = 1.0;
    for (let i=0;i<data.length;i++) {
      const v = data[i];
      const bh = (h - pad*2) * (v / max);
      const x = pad + i*barW;
      const y = (h - pad) - bh;
      ctx.fillRect(x, y, Math.max(1, barW - 1), bh);
    }
  }

  async function loadAll() {
    const host = $("host").value.trim();
    if (!host) return setStatus("Enter host", "warn");
    localStorage.setItem(LS_HOST, host);
    localStorage.setItem(LS_KEY, $("dashKey").value.trim());

    try {
      setStatus("Loading…", "warn");
      const stats = await apiGet("/api/stats", host);
      renderStats(stats);
      $("tenantInfo").textContent = \`\${stats.customer || "—"} / \${stats.site_id || "—"}\`;

      const ev = await apiGet("/api/events", host);
      renderEvents(ev);

      setStatus("OK", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "err");
    }
  }

  async function loadRollups() {
    const host = $("host").value.trim();
    if (!host) return setStatus("Enter host", "warn");

    const fam = $("family").value;
    try {
      setStatus("Loading rollups…", "warn");
      const data = await apiGet("/api/rollups?range=24h&family=" + encodeURIComponent(fam), host);
      drawRollups(data.series || []);
      $("rollTotal").textContent = "total: " + (data.total ?? 0) + " (" + fam + ")";
      setStatus("OK", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "err");
    }
  }

  async function clearEvents() {
    const host = $("host").value.trim();
    if (!host) return setStatus("Enter host", "warn");
    try {
      setStatus("Clearing…", "warn");
      await apiPost("/api/events/clear", host);
      await loadAll();
      setStatus("Cleared", "ok");
    } catch (e) {
      setStatus(String(e.message || e), "err");
    }
  }

  $("loadBtn").addEventListener("click", loadAll);
  $("clearBtn").addEventListener("click", clearEvents);
  $("rollBtn").addEventListener("click", loadRollups);

  // restore
  $("host").value = localStorage.getItem(LS_HOST) || "";
  $("dashKey").value = localStorage.getItem(LS_KEY) || "";
</script>
</body>
</html>`;
}
