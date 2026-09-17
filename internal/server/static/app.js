(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const t = (...args) => window.I18n.t(...args);
  const dash = () => t("dash");


  let connections = [];
  let selectedId = null;
  let ctxId = null;
  let browseId = null;
  let browseBucketMeta = {};
  let importPayload = null;
  let liveBuckets = []; // [{name, creationDate}] loaded from S3 on select
  let liveBucketsConnId = null;
  let pendingCreate = null;
  let pendingDeleteBucket = "";
  let createOpenAfter = false;
  let uiMode = "view"; // view | edit
  /** @type {Record<string, 'ok'|'err'|'pending'|undefined>} */
  let connStatus = {};

  function setUIMode(mode) {
    uiMode = mode;
    const isEdit = mode === "edit";
    const id = ($("#f-id").value || "").trim();
    $("#view-actions").classList.toggle("hidden", isEdit);
    $("#edit-actions").classList.toggle("hidden", !isEdit);
    $("#conn-form").classList.toggle("hidden", !isEdit);
    $("#buckets-panel").classList.toggle("hidden", !id || isEdit);
  }

  function statusTitle(st) {
    if (st === "ok") return t("status.ok");
    if (st === "err") return t("status.err");
    if (st === "pending") return t("status.pending");
    return t("status.unknown");
  }

  const listEl = $("#conn-list");
  const editor = $("#editor");
  const empty = $("#empty-state");
  const status = $("#form-status");
  const ctx = $("#ctx");
  const exportDlg = $("#export-dlg");
  const importDlg = $("#import-dlg");
  const dataDlg = $("#data-dlg");

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    }
    if (!res.ok) throw new Error(res.statusText);
    return res;
  }

  function setStatus(msg, kind = "") {
    status.textContent = msg || "";
    status.className = "status" + (kind ? " " + kind : "");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function matchesSearch(haystack, query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return true;
    return String(haystack || "").toLowerCase().includes(q);
  }

  function connectionSearchText(c) {
    return [c.name, c.endpoint, c.region, c.notes, c.accessKeyId].join("\n");
  }

  function renderList() {
    listEl.innerHTML = "";
    const q = $("#conn-search")?.value || "";
    const filtered = connections.filter((c) => matchesSearch(connectionSearchText(c), q));
    if (!connections.length) {
      listEl.innerHTML = `<li class="muted" style="padding:0.5rem">${escapeHtml(t("list.empty"))}</li>`;
      return;
    }
    if (!filtered.length) {
      listEl.innerHTML = `<li class="muted" style="padding:0.5rem">${escapeHtml(t("list.none"))}</li>`;
      return;
    }
    for (const c of filtered) {
      const li = document.createElement("li");
      li.className = "conn-item" + (c.id === selectedId ? " active" : "");
      li.dataset.id = c.id;
      const st = connStatus[c.id];
      const dotClass = st ? `status-dot ${st}` : "status-dot";
      li.innerHTML = `
        <span class="${dotClass}" title="${escapeHtml(statusTitle(st))}"></span>
        <div class="name">${escapeHtml(c.name || t("list.unnamed"))}</div>
        <div class="ep">${escapeHtml(c.endpoint || "")}</div>
        <div class="meta">${escapeHtml(c.region || "")}</div>`;
      li.addEventListener("click", () => select(c.id));
      li.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openCtx(c.id, e.clientX, e.clientY);
      });
      listEl.appendChild(li);
    }
  }

  async function probeConnection(id) {
    connStatus[id] = "pending";
    renderList();
    try {
      await api(`/api/connections/${id}/test`, { method: "POST", body: "{}" });
      connStatus[id] = "ok";
      return true;
    } catch {
      connStatus[id] = "err";
      return false;
    } finally {
      renderList();
    }
  }

  async function probeAllConnections() {
    const list = [...connections];
    for (const c of list) {
      if (!c.id) continue;
      connStatus[c.id] = "pending";
    }
    renderList();
    await Promise.all(list.filter((c) => c.id).map((c) => probeConnection(c.id)));
  }

  async function select(id) {
    selectedId = id;
    const c = connections.find((x) => x.id === id);
    renderList();
    if (!c) {
      editor.classList.add("hidden");
      empty.classList.remove("hidden");
      liveBuckets = [];
      liveBucketsConnId = null;
      return;
    }
    empty.classList.add("hidden");
    editor.classList.remove("hidden");
    $("#editor-title").textContent = c.name || t("editor.connection");
    fillForm(c);
    setUIMode("view");
    setStatus("");
    await loadLiveBuckets(id);
  }

  function fillForm(c) {
    $("#f-id").value = c.id || "";
    $("#f-name").value = c.name || "";
    $("#f-endpoint").value = c.endpoint || "";
    $("#f-region").value = c.region || "us-east-1";
    $("#f-ssl").checked = !!c.useSSL;
    $("#f-path").checked = c.pathStyle !== false;
    $("#f-access").value = c.accessKeyId || "";
    $("#f-secret").value = c.secretAccessKey || "";
    $("#f-secret").type = "password";
    $("#btn-toggle-secret").classList.remove("active");
    $("#btn-toggle-secret").setAttribute("aria-label", t("eye.show"));
    $("#eye-icon").innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
    $("#f-notes").value = c.notes || "";
    if ($("#bucket-search")) $("#bucket-search").value = "";
  }

  function blankConnection() {
    return {
      id: "",
      name: "",
      endpoint: "",
      region: "us-east-1",
      accessKeyId: "",
      secretAccessKey: "",
      useSSL: true,
      pathStyle: true,
      notes: "",
    };
  }

  async function loadLiveBuckets(id) {
    if (!id) {
      liveBuckets = [];
      liveBucketsConnId = null;
      renderBuckets();
      return;
    }
    const root = $("#buckets");
    root.innerHTML = `<p class="muted">${escapeHtml(t("buckets.loading"))}</p>`;
    try {
      const list = await api(`/api/connections/${id}/buckets`);
      if (selectedId !== id) return; // switched away
      liveBuckets = (list || []).map((b) => ({
        name: b.name,
        creationDate: b.creationDate || null,
      }));
      liveBuckets.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
      liveBucketsConnId = id;
      browseBucketMeta = {};
      for (const b of liveBuckets) {
        browseBucketMeta[b.name] = b.creationDate;
      }
      renderBuckets();
    } catch (err) {
      if (selectedId !== id) return;
      liveBuckets = [];
      liveBucketsConnId = id;
      root.innerHTML = `<p class="status err">${escapeHtml(err.message)}</p>`;
      setStatus(err.message, "err");
    }
  }

  function renderBuckets() {
    const root = $("#buckets");
    root.innerHTML = "";
    const q = $("#bucket-search")?.value || "";
    const filtered = liveBuckets.filter((b) => matchesSearch(b.name || "", q));

    if (!liveBucketsConnId) {
      root.innerHTML = `<p class="muted">${escapeHtml(t("buckets.saveFirst"))}</p>`;
      return;
    }
    if (!liveBuckets.length) {
      root.innerHTML = `<p class="muted">${escapeHtml(t("buckets.none"))}</p>`;
      return;
    }
    if (!filtered.length) {
      root.innerHTML = `<p class="muted">${escapeHtml(t("buckets.noneShort"))}</p>`;
      return;
    }

    const table = document.createElement("table");
    table.className = "table buckets-table";
    table.innerHTML = `<thead><tr><th>${escapeHtml(t("th.name"))}</th><th>${escapeHtml(t("th.created"))}</th><th></th></tr></thead>`;
    const tbody = document.createElement("tbody");
    for (const b of filtered) {
      const tr = document.createElement("tr");
      const created = b.creationDate ? formatDate(b.creationDate) : dash();
      tr.innerHTML = `
        <td class="bucket-name">${escapeHtml(b.name)}</td>
        <td class="bucket-date">${escapeHtml(created)}</td>
        <td>
          <div class="actions">
            <button type="button" class="btn btn-sm btn-open" data-name="${escapeHtml(b.name)}">${escapeHtml(t("btn.open"))}</button>
            <button type="button" class="btn btn-sm danger btn-rm" data-name="${escapeHtml(b.name)}">${escapeHtml(t("btn.delete"))}</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    root.appendChild(table);

    root.onclick = async (e) => {
      const rm = e.target.closest(".btn-rm[data-name]");
      const open = e.target.closest(".btn-open[data-name]");
      const btn = rm || open;
      if (!btn) return;
      const name = btn.dataset.name;
      const id = $("#f-id").value;
      if (!id || !name) return;
      if (rm) {
        openDeleteBucketDialog(name);
        return;
      }
      await openBucketEnsured(id, name, "");
    };
  }

  async function openBucketEnsured(id, name, prefix) {
    setStatus(t("openingBucket"));
    try {
      await api(`/api/connections/${id}/objects?${new URLSearchParams({ bucket: name, prefix: prefix || "", max: "1" })}`);
      setStatus("");
      showBrowse(id, name, prefix);
    } catch (err) {
      const msg = err.message || String(err);
      setStatus(msg, "err");
      openCreateBucketDialog(id, name, true);
    }
  }

  function openCreateBucketDialog(id, presetName = "", openAfter = false) {
    if (!id) {
      setStatus(t("saveFirst"), "err");
      return;
    }
    createOpenAfter = openAfter;
    pendingCreate = { id, prefix: "" };
    $("#create-bucket-input").value = presetName || "";
    $("#create-bucket-name").textContent = presetName || dash();
    $("#create-bucket-msg").textContent = openAfter
      ? t("create.msg.open")
      : t("create.msg.new");
    $("#create-bucket-status").textContent = "";
    $("#create-bucket-status").className = "status";
    $("#create-bucket-dlg").showModal();
    $("#create-bucket-input").focus();
  }

  async function doCreateBucket() {
    const id = pendingCreate?.id || $("#f-id").value;
    const name = ($("#create-bucket-input").value || "").trim();
    if (!id || !name) {
      $("#create-bucket-status").textContent = t("create.needName");
      $("#create-bucket-status").className = "status err";
      return;
    }
    const st = $("#create-bucket-status");
    const okBtn = $("#create-bucket-ok");
    const cancelBtn = $("#create-bucket-cancel");
    okBtn.disabled = true;
    cancelBtn.disabled = true;
    st.textContent = t("create.creating");
    st.className = "status";
    try {
      await api(`/api/connections/${id}/buckets`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      pendingCreate = null;
      $("#create-bucket-dlg").close();
      okBtn.disabled = false;
      cancelBtn.disabled = false;
      setStatus(t("create.done", name), "ok");
      if (selectedId === id) await loadLiveBuckets(id);
      if (createOpenAfter) showBrowse(id, name, "");
      createOpenAfter = false;
    } catch (e2) {
      st.textContent = e2.message;
      st.className = "status err";
      okBtn.disabled = false;
      cancelBtn.disabled = false;
      setStatus(t("create.fail", e2.message), "err");
    }
  }

  function readForm() {
    return {
      id: $("#f-id").value,
      name: $("#f-name").value.trim(),
      endpoint: $("#f-endpoint").value.trim(),
      region: $("#f-region").value.trim() || "us-east-1",
      accessKeyId: $("#f-access").value,
      secretAccessKey: $("#f-secret").value,
      useSSL: $("#f-ssl").checked,
      pathStyle: $("#f-path").checked,
      notes: $("#f-notes").value,
      buckets: [],
    };
  }

  async function reload(opts = {}) {
    const { probe = false } = opts;
    connections = await api("/api/connections");
    connections.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
    // drop statuses for removed connections
    const ids = new Set(connections.map((c) => c.id));
    for (const id of Object.keys(connStatus)) {
      if (!ids.has(id)) delete connStatus[id];
    }
    renderList();
    if (selectedId && !connections.some((c) => c.id === selectedId)) {
      selectedId = null;
      editor.classList.add("hidden");
      empty.classList.remove("hidden");
    } else if (selectedId) {
      await select(selectedId);
    }
    if (probe) await probeAllConnections();
  }

  function openCtx(id, x, y) {
    ctxId = id;
    ctx.classList.remove("hidden");
    const pad = 8;
    const w = ctx.offsetWidth || 220;
    const h = ctx.offsetHeight || 260;
    ctx.style.left = `${Math.max(pad, Math.min(x, window.innerWidth - w - pad))}px`;
    ctx.style.top = `${Math.max(pad, Math.min(y, window.innerHeight - h - pad))}px`;
  }

  function closeCtx() {
    ctx.classList.add("hidden");
    ctxId = null;
  }

  function formatAuthBlock(c) {
    const lines = [
      `S3: ${c.name || "connection"}`,
      "",
      `Endpoint: ${c.endpoint || ""}`,
      `Region: ${c.region || "us-east-1"}`,
      `Access Key: ${c.accessKeyId || ""}`,
      `Secret Key: ${c.secretAccessKey || ""}`,
      `Use SSL: ${c.useSSL ? "yes" : "no"}`,
      `Path-style: ${c.pathStyle ? "yes" : "no"}`,
    ];
    if (c.notes) {
      lines.push(`Notes: ${c.notes}`);
    }
    // Mattermost/Slack-friendly fenced code block
    return "```\n" + lines.join("\n") + "\n```";
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }

  function showEnteredData(id) {
    const c = connections.find((x) => x.id === id);
    if (!c) return;
    $("#data-title").textContent = c.name || t("data.title");
    $("#view-ui").classList.remove("hidden");
    $("#browse-ui").classList.add("hidden");

    const block = formatAuthBlock(c);
    $("#auth-copy-preview").textContent = block;
    $("#auth-copy-status").textContent = "";
    $("#auth-copy-status").className = "status";
    $("#btn-copy-auth").onclick = async () => {
      try {
        await copyText(block);
        $("#auth-copy-status").textContent = t("auth.copied");
        $("#auth-copy-status").className = "status ok";
      } catch (err) {
        $("#auth-copy-status").textContent = err.message || t("auth.copyFail");
        $("#auth-copy-status").className = "status err";
      }
    };

    const fields = [
      [t("field.name"), c.name || dash()],
      [t("field.endpoint"), c.endpoint || dash()],
      [t("field.region"), c.region || dash()],
      [t("field.accessKey"), c.accessKeyId || dash()],
      [t("field.secretKey"), c.secretAccessKey || dash(), true],
      [t("option.useSsl"), c.useSSL ? t("yes") : t("no")],
      [t("option.pathStyle"), c.pathStyle ? t("yes") : t("no")],
      [t("field.notes"), c.notes || dash()],
    ];
    const dl = $("#data-fields");
    dl.innerHTML = "";
    for (const [label, value, isSecret] of fields) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      if (isSecret) dd.classList.add("secret");
      dl.appendChild(dt);
      dl.appendChild(dd);
    }
    dataDlg.showModal();
  }

  async function showBrowse(id, bucketName = "", prefix = "") {
    browseId = id;
    browseBucketMeta = {};
    $("#data-title").textContent = bucketName ? t("browse.bucket", bucketName) : t("browse.title");
    $("#view-ui").classList.add("hidden");
    $("#browse-ui").classList.remove("hidden");
    dataDlg.showModal();
    const bucketSel = $("#browse-bucket");
    bucketSel.innerHTML = "";
    $("#browse-prefix").value = prefix || "";
        $("#browse-rows").innerHTML = `<tr><td colspan="4" class="muted">${escapeHtml(t("browse.loading"))}</td></tr>`;
    try {
      const buckets = await api(`/api/connections/${id}/buckets`);
      for (const b of buckets || []) {
        browseBucketMeta[b.name] = b.creationDate || null;
      }
      const names = new Set((buckets || []).map((b) => b.name));
      if (bucketName) names.add(bucketName);
      const list = [...names].sort((a, b) => a.localeCompare(b));
      if (!list.length) {
        bucketSel.innerHTML = `<option value="">${escapeHtml(t("browse.noBucketsOpt"))}</option>`;
        $("#browse-rows").innerHTML = `<tr><td colspan="4" class="muted">${escapeHtml(t("browse.noBuckets"))}</td></tr>`;
        $("#browse-meta").textContent = "";
        return;
      }
      for (const name of list) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        if (name === bucketName) opt.selected = true;
        bucketSel.appendChild(opt);
      }
      if (!bucketName) bucketSel.selectedIndex = 0;
      await loadObjects(id);
    } catch (e) {
      if (bucketName) {
        const opt = document.createElement("option");
        opt.value = bucketName;
        opt.textContent = bucketName;
        bucketSel.appendChild(opt);
        await loadObjects(id);
        return;
      }
      $("#browse-rows").innerHTML = `<tr><td colspan="4">${escapeHtml(e.message)}</td></tr>`;
      $("#browse-meta").textContent = "";
    }
  }

  async function loadObjects(id) {
    const bucket = $("#browse-bucket").value;
    const prefix = $("#browse-prefix").value;
    if (!bucket) return;
    $("#data-title").textContent = t("browse.bucket", bucket);
    const created = browseBucketMeta[bucket];
    const parts = [];
    if (created) parts.push(t("browse.createdMeta", formatDate(created)));
    parts.push(prefix ? t("browse.prefixMeta", prefix) : t("browse.root"));
    $("#browse-meta").textContent = parts.join(" · ");
    setBrowseStatus("");
    try {
      const q = new URLSearchParams({ bucket, prefix });
      const objs = await api(`/api/connections/${id}/objects?${q}`);
      const tbody = $("#browse-rows");
      tbody.innerHTML = "";
      if (!objs.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="muted">${escapeHtml(t("browse.empty"))}</td></tr>`;
        return;
      }
      for (const o of objs) {
        const tr = document.createElement("tr");
        const name = displayKey(o.key, prefix);
        const size = o.isPrefix ? dash() : formatSize(o.size);
        const date = o.isPrefix
          ? t("browse.folder")
          : (o.lastModified ? formatDate(o.lastModified) : dash());
        const actions = o.isPrefix
          ? ""
          : `<div class="actions"><button type="button" class="btn btn-sm" data-dl="${escapeHtml(o.key)}">${escapeHtml(t("browse.dl"))}</button></div>`;
        tr.innerHTML = `<td class="${o.isPrefix ? "prefix" : ""}">${escapeHtml(name)}</td><td>${size}</td><td>${escapeHtml(date)}</td><td>${actions}</td>`;
        if (o.isPrefix) {
          tr.querySelector("td").addEventListener("click", () => {
            $("#browse-prefix").value = o.key;
            loadObjects(id);
          });
        }
        const dl = tr.querySelector("[data-dl]");
        if (dl) {
          dl.addEventListener("click", () => downloadObject(id, bucket, o.key));
        }
        tbody.appendChild(tr);
      }
    } catch (e) {
      $("#browse-rows").innerHTML = `<tr><td colspan="4">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function setBrowseStatus(msg, kind = "") {
    const el = $("#browse-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status" + (kind ? " " + kind : "");
  }

  function downloadObject(id, bucket, key) {
    const q = new URLSearchParams({ bucket, key });
    const a = document.createElement("a");
    a.href = `/api/connections/${id}/download?${q}`;
    a.download = "";
    a.click();
  }

  async function uploadObject(id) {
    const bucket = $("#browse-bucket").value;
    const prefix = $("#browse-prefix").value;
    const input = $("#browse-file");
    const file = input.files?.[0];
    input.value = "";
    if (!file || !bucket) return;
    setBrowseStatus(t("browse.uploading", file.name));
    const fd = new FormData();
    fd.append("bucket", bucket);
    fd.append("prefix", prefix || "");
    fd.append("file", file);
    try {
      const res = await fetch(`/api/connections/${id}/upload`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setBrowseStatus(t("browse.uploaded", data.key), "ok");
      await loadObjects(id);
    } catch (e) {
      setBrowseStatus(e.message, "err");
    }
  }

  function openDeleteBucketDialog(name) {
    const id = $("#f-id").value;
    if (!id) {
      setStatus(t("saveFirst"), "err");
      return;
    }
    pendingDeleteBucket = name;
    $("#del-bucket-name").textContent = name;
    $("#del-bucket-confirm").value = "";
    $("#del-bucket-ok").disabled = true;
    $("#del-bucket-status").textContent = "";
    $("#del-bucket-status").className = "status";
    $("#del-bucket-dlg").showModal();
    $("#del-bucket-confirm").focus();
  }

  function syncDeleteBucketOk() {
    $("#del-bucket-ok").disabled = $("#del-bucket-confirm").value !== pendingDeleteBucket;
  }

  async function executeDeleteBucket() {
    const id = $("#f-id").value;
    const name = pendingDeleteBucket;
    const confirmName = $("#del-bucket-confirm").value;
    if (!id || !name || confirmName !== name) return;

    const st = $("#del-bucket-status");
    const okBtn = $("#del-bucket-ok");
    const cancelBtn = $("#del-bucket-cancel");
    okBtn.disabled = true;
    cancelBtn.disabled = true;
    st.textContent = t("browse.deleting");
    st.className = "status";

    try {
      await api(`/api/connections/${id}/buckets`, {
        method: "DELETE",
        body: JSON.stringify({ name, confirmName }),
      });
      pendingDeleteBucket = "";
      $("#del-bucket-dlg").close();
      cancelBtn.disabled = false;
      setStatus(t("del.done", name), "ok");
      if (selectedId === id) await loadLiveBuckets(id);
    } catch (err) {
      st.textContent = err.message;
      st.className = "status err";
      cancelBtn.disabled = false;
      syncDeleteBucketOk();
      setStatus(err.message, "err");
    }
  }

  function displayKey(key, prefix) {
    if (prefix && key.startsWith(prefix)) return key.slice(prefix.length) || key;
    return key;
  }

  function formatDate(v) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function parentPrefix(prefix) {
    const p = (prefix || "").replace(/\/+$/, "");
    if (!p) return "";
    const i = p.lastIndexOf("/");
    return i < 0 ? "" : p.slice(0, i + 1);
  }

  function formatSize(n) {
    if (n == null) return "—";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let v = Number(n);
    while (v >= 1024 && i < u.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
  }

  function downloadExport({ connectionIds, includeSecrets }) {
    const q = new URLSearchParams();
    if (includeSecrets) q.set("secrets", "1");
    if (connectionIds?.length) q.set("ids", connectionIds.join(","));
    const a = document.createElement("a");
    a.href = `/api/export?${q}`;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function syncExportScope() {
    const one = $('#export-form input[value="one"]').checked;
    $("#export-one-id").disabled = !one;
  }

  $("#btn-new").onclick = () => {
    selectedId = null;
    liveBuckets = [];
    liveBucketsConnId = null;
    renderList();
    empty.classList.add("hidden");
    editor.classList.remove("hidden");
    $("#editor-title").textContent = t("newConnection");
    fillForm(blankConnection());
    setUIMode("edit");
    renderBuckets();
    setStatus(t("fillAndSave"));
  };

  $("#btn-edit").onclick = () => {
    const id = $("#f-id").value;
    if (!id) return;
    setUIMode("edit");
    setStatus(t("editing"));
  };

  $("#btn-cancel-edit").onclick = () => {
    const id = $("#f-id").value;
    const c = connections.find((x) => x.id === id);
    if (c) {
      fillForm(c);
      setUIMode("view");
      setStatus("");
      return;
    }
    // new unsaved — back to empty
    selectedId = null;
    editor.classList.add("hidden");
    empty.classList.remove("hidden");
    renderList();
  };

  $("#btn-add-bucket").onclick = () => {
    openCreateBucketDialog($("#f-id").value, "", false);
  };

  $("#btn-refresh-buckets").onclick = () => {
    const id = $("#f-id").value;
    if (!id) {
      setStatus(t("saveFirst"), "err");
      return;
    }
    loadLiveBuckets(id);
  };

  const eyeOpen = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  const eyeOff = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;

  $("#btn-toggle-secret").onclick = () => {
    const input = $("#f-secret");
    const btn = $("#btn-toggle-secret");
    const icon = $("#eye-icon");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.classList.toggle("active", show);
    btn.setAttribute("aria-label", show ? t("eye.hide") : t("eye.show"));
    icon.innerHTML = show ? eyeOff : eyeOpen;
  };

  $("#btn-save").onclick = async (e) => {
    e.preventDefault();
    const body = readForm();
    if (!body.name || !body.endpoint) {
      setStatus(t("nameEndpointRequired"), "err");
      return;
    }
    setStatus(t("saving"));
    try {
      const res = await api("/api/connections", { method: "POST", body: JSON.stringify(body) });
      const saved = res.connection || res;
      selectedId = saved.id;
      await reload();
      setUIMode("view");
      setStatus(t("saved"), "ok");
      probeConnection(saved.id); // refresh status after save
    } catch (err) {
      setStatus(err.message, "err");
    }
  };

  $("#btn-test").onclick = async () => {
    const id = $("#f-id").value;
    if (!id) {
      setStatus(t("saveFirst"), "err");
      return;
    }
    setStatus(t("testing"));
    const ok = await probeConnection(id);
    setStatus(ok ? t("status.ok") : t("status.err"), ok ? "ok" : "err");
  };

  $("#btn-export-one").onclick = () => {
    const id = $("#f-id").value;
    if (!id) return;
    downloadExport({ connectionIds: [id], includeSecrets: true });
    setStatus(t("exported"), "ok");
  };

  $("#btn-export-all").onclick = () => {
    const sel = $("#export-one-id");
    sel.innerHTML = connections
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.endpoint)}</option>`)
      .join("");
    $('#export-form input[value="all"]').checked = true;
    syncExportScope();
    exportDlg.showModal();
  };

  $$('#export-form input[name="scope"]').forEach((r) => {
    r.addEventListener("change", syncExportScope);
  });

  $("#export-cancel").onclick = () => exportDlg.close();
  $("#export-ok").onclick = () => {
    const scope = $('#export-form input[name="scope"]:checked')?.value || "all";
    const includeSecrets = $("#export-secrets").checked;
    const connectionIds = scope === "one" ? [$("#export-one-id").value].filter(Boolean) : [];
    downloadExport({ connectionIds, includeSecrets });
    exportDlg.close();
    setStatus(t("jsonDownloaded"), "ok");
  };

  $("#btn-import").onclick = () => $("#import-file").click();
  $("#import-file").onchange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    importPayload = await file.text();
    $("#import-name").textContent = file.name;
    $("#import-replace").checked = false;
    importDlg.showModal();
  };

  importDlg.addEventListener("close", async () => {
    if (importDlg.returnValue !== "ok" || !importPayload) return;
    const replace = $("#import-replace").checked;
    try {
      const res = await api(`/api/import?replace=${replace ? "1" : "0"}`, {
        method: "POST",
        body: importPayload,
        headers: { "Content-Type": "application/json" },
      });
      importPayload = null;
      await reload({ probe: true });
      setStatus(t("import.result", res.added, res.updated), "ok");
    } catch (err) {
      setStatus(err.message, "err");
    }
  });

  ctx.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn || !ctxId) return;
    const id = ctxId;
    const act = btn.dataset.act;
    closeCtx();
    if (act === "edit") {
      await select(id);
      setUIMode("edit");
      setStatus(t("editing"));
      return;
    }
    if (act === "view") return showEnteredData(id);
    if (act === "browse") return showBrowse(id);
    if (act === "test") {
      await select(id);
      setStatus(t("testing"));
      const ok = await probeConnection(id);
      setStatus(ok ? t("status.ok") : t("status.err"), ok ? "ok" : "err");
      return;
    }
    if (act === "export") {
      downloadExport({ connectionIds: [id], includeSecrets: true });
      return;
    }
    if (act === "delete") {
      if (!confirm(t("confirm.deleteConn"))) return;
      await api(`/api/connections/${id}`, { method: "DELETE" });
      if (selectedId === id) selectedId = null;
      await reload();
    }
  });

  document.addEventListener("click", (e) => {
    if (!ctx.classList.contains("hidden") && !ctx.contains(e.target)) closeCtx();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCtx();
  });

  $("#data-close").onclick = () => dataDlg.close();
  $("#browse-load").onclick = () => loadObjects(browseId || selectedId);
  $("#browse-bucket").onchange = () => {
    $("#browse-prefix").value = "";
    loadObjects(browseId || selectedId);
  };
  $("#browse-up").onclick = () => {
    $("#browse-prefix").value = parentPrefix($("#browse-prefix").value);
    loadObjects(browseId || selectedId);
  };
  $("#browse-upload").onclick = () => $("#browse-file").click();
  $("#browse-file").onchange = () => uploadObject(browseId || selectedId);

  $("#conn-search").addEventListener("input", () => renderList());
  $("#bucket-search").addEventListener("input", () => renderBuckets());

  $("#create-bucket-cancel").onclick = () => {
    pendingCreate = null;
    createOpenAfter = false;
    $("#create-bucket-dlg").close();
  };
  $("#create-bucket-ok").onclick = () => doCreateBucket();
  $("#create-bucket-input").addEventListener("input", () => {
    $("#create-bucket-name").textContent = ($("#create-bucket-input").value || "").trim() || dash();
  });
  $("#create-bucket-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doCreateBucket();
    }
  });

  $("#del-bucket-confirm").addEventListener("input", syncDeleteBucketOk);
  $("#del-bucket-confirm").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$("#del-bucket-ok").disabled) {
      e.preventDefault();
      executeDeleteBucket();
    }
  });
  $("#del-bucket-cancel").onclick = () => {
    pendingDeleteBucket = "";
    $("#del-bucket-dlg").close();
  };
  $("#del-bucket-ok").onclick = () => executeDeleteBucket();


  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => I18n.setLang(btn.dataset.lang));
  });
  I18n.applyDom();
  I18n.onChange(() => {
    const id = $("#f-id").value;
    const c = connections.find((x) => x.id === id);
    if (c && !editor.classList.contains("hidden") && uiMode === "view") {
      $("#editor-title").textContent = c.name || t("editor.connection");
    } else if (!id && !editor.classList.contains("hidden") && uiMode === "edit") {
      $("#editor-title").textContent = t("newConnection");
    }
    const eye = $("#btn-toggle-secret");
    if (eye) {
      const show = $("#f-secret").type === "text";
      eye.setAttribute("aria-label", show ? t("eye.hide") : t("eye.show"));
    }
    if ($("#create-bucket-dlg")?.open) {
      $("#create-bucket-msg").textContent = createOpenAfter ? t("create.msg.open") : t("create.msg.new");
    }
    renderList();
    renderBuckets();
    if (!$("#browse-ui").classList.contains("hidden") && browseId) {
      loadObjects(browseId);
    }
  });

  reload({ probe: true }).catch((e) => setStatus(e.message, "err"));
})();
