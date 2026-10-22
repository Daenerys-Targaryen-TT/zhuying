/* 晓笺藏竹影 - Web 版 */

const ACCESS_HASH = "abe79def23733a7fa4f6402c0dbbd22203d3544e76f10003e661db09fb807d76";
const UNLOCK_KEY = "zy.unlocked";

async function sha256(str) {
  const data = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const STORE_KEYS = {
  notes: "zy.notes",
  todos: "zy.todos",
  categories: "zy.categories",
  settings: "zy.settings",
};

const CATEGORY_COLORS = [
  "#5a7a5a", "#8a5a2b", "#5b6e8a", "#8a5a7a",
  "#7a6a2b", "#3a6a6a", "#9a4a3a", "#4a5a8a",
];

const PRIORITY = { low: "低", mid: "中", high: "高" };

function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- 数据层 ---------- */
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getNotes() { return load(STORE_KEYS.notes, []); }
function setNotes(v) { save(STORE_KEYS.notes, v); }

function getTodos() { return load(STORE_KEYS.todos, []); }
function setTodos(v) { save(STORE_KEYS.todos, v); }

function getCategories() { return load(STORE_KEYS.categories, []); }
function setCategories(v) { save(STORE_KEYS.categories, v); }

function getSettings() {
  return load(STORE_KEYS.settings, {
    apiKey: "",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    maxTokens: 4000,
    systemPrompt: "你是一个专业的笔记整理助手。请把用户提供的多条笔记整合成一篇结构清晰、重点突出、去重合并的专属笔记本，用 Markdown 格式输出。",
  });
}

function categoryById(id) {
  return getCategories().find((c) => c.id === id) || null;
}

/* ---------- 标签切换 ---------- */
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.querySelectorAll(".panel").forEach((p) => {
    p.classList.toggle("active", p.id === "panel-" + tab);
  });
}

/* ---------- 渲染 ---------- */
function renderCategoryOptions() {
  const cats = getCategories();
  const opts = '<option value="">全部分类</option>' +
    cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  const filter = document.getElementById("note-category-filter");
  const aiCat = document.getElementById("ai-category");
  const aiTarget = document.getElementById("ai-target-category");
  const aiTargetVal = aiTarget.value;
  filter.innerHTML = opts;
  aiCat.innerHTML = cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("") ||
    '<option value="">（暂无分类）</option>';
  aiTarget.innerHTML = '<option value="">无分类</option>' +
    cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  if (aiTargetVal) aiTarget.value = aiTargetVal;
}

function renderNotes() {
  const q = document.getElementById("note-search").value.trim().toLowerCase();
  const catFilter = document.getElementById("note-category-filter").value;
  const list = getNotes()
    .filter((n) => !catFilter || n.categoryId === catFilter)
    .filter((n) => !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    .sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));

  const el = document.getElementById("note-list");
  document.getElementById("note-empty").classList.toggle("hidden", list.length > 0);

  el.innerHTML = list.map((n) => {
    const cat = categoryById(n.categoryId);
    const badges = (n.pinned ? '<span class="badge badge-pin">置顶</span>' : "") +
      (n.isAI ? '<span class="badge badge-ai">✦ AI</span>' : "");
    const catHtml = cat
      ? `<span><span class="cat-dot" style="background:${cat.color}"></span>${esc(cat.name)}</span>`
      : "";
    return `
      <div class="card" data-note-id="${n.id}">
        <p class="note-title">${esc(n.title) || "（无标题）"} ${badges}</p>
        <p class="note-preview">${esc(n.content)}</p>
        <div class="note-meta">
          ${catHtml}
          <span>${fmtDate(n.updatedAt)}</span>
        </div>
      </div>`;
  }).join("");
}

function renderTodos() {
  const q = document.getElementById("todo-search").value.trim().toLowerCase();
  const filter = document.getElementById("todo-filter").value;
  const list = getTodos()
    .filter((t) => filter === "all" || (filter === "active" ? !t.completed : t.completed))
    .filter((t) => !q || t.title.toLowerCase().includes(q))
    .sort((a, b) => (a.completed - b.completed) || ((a.dueDate || 0) - (b.dueDate || 0)));

  const el = document.getElementById("todo-list");
  document.getElementById("todo-empty").classList.toggle("hidden", list.length > 0);

  el.innerHTML = list.map((t) => {
    const overdue = t.dueDate && !t.completed && t.dueDate < Date.now();
    const dueHtml = t.dueDate
      ? `<div class="todo-due ${overdue ? "overdue" : ""}">${overdue ? "已逾期 · " : ""}${fmtDate(t.dueDate)}</div>`
      : "";
    return `
      <div class="todo-row" data-todo-id="${t.id}">
        <div class="todo-check ${t.completed ? "done" : ""}" data-toggle="${t.id}">${t.completed ? "✓" : ""}</div>
        <div class="todo-body">
          <p class="todo-title ${t.completed ? "done" : ""}">${esc(t.title)}</p>
          ${dueHtml}
        </div>
        <span class="prio prio-${t.priority}">${PRIORITY[t.priority]}</span>
      </div>`;
  }).join("");
}

function renderCategories() {
  const cats = getCategories();
  document.getElementById("category-list").innerHTML = cats.map((c) => `
    <div class="category-item">
      <span class="cat-dot" style="background:${c.color}"></span>
      <span class="name">${esc(c.name)}</span>
      <button class="del" data-del-cat="${c.id}" title="删除">×</button>
    </div>`).join("") || '<p class="hint">暂无分类</p>';
}

function renderSettings() {
  const s = getSettings();
  document.getElementById("set-apikey").value = s.apiKey;
  document.getElementById("set-baseurl").value = s.baseURL;
  document.getElementById("set-model").value = s.model;
  document.getElementById("set-maxtokens").value = s.maxTokens;
  document.getElementById("set-prompt").value = s.systemPrompt;
}

function renderAI() {
  renderManualList();
  updateGenerateState();
}

function renderManualList() {
  const notes = getNotes().sort((a, b) => b.updatedAt - a.updatedAt);
  const selected = new Set(currentAI.selection);
  document.getElementById("ai-manual-list").innerHTML = notes.map((n) => `
    <label class="check-item">
      <input type="checkbox" data-manual-note="${n.id}" ${selected.has(n.id) ? "checked" : ""}>
      <span>${esc(n.title) || "（无标题）"}</span>
    </label>`).join("") || '<p class="hint">暂无笔记</p>';
  document.getElementById("ai-manual-count").textContent = selected.size;
}

/* ---------- AI 整合 ---------- */
const currentAI = { mode: "all", selection: new Set(), result: "" };

function aiSelectedNotes() {
  const notes = getNotes();
  if (currentAI.mode === "all") return notes;
  if (currentAI.mode === "category") {
    const cat = document.getElementById("ai-category").value;
    return cat ? notes.filter((n) => n.categoryId === cat) : [];
  }
  return notes.filter((n) => currentAI.selection.has(n.id));
}

function updateGenerateState() {
  const s = getSettings();
  const configured = s.apiKey && s.baseURL && s.model;
  const hasNotes = aiSelectedNotes().length > 0;
  const btn = document.getElementById("btn-generate");
  btn.disabled = !configured || !hasNotes;
  const hint = document.getElementById("ai-hint");
  if (!configured) hint.textContent = "请先在「设置」页填写 API Key、Base URL 与模型名称";
  else if (!hasNotes) hint.textContent = "当前范围内没有笔记";
  else hint.textContent = `将整合 ${aiSelectedNotes().length} 篇笔记`;
}

async function generateAI() {
  const s = getSettings();
  const notes = aiSelectedNotes();
  if (!notes.length) return;

  const btn = document.getElementById("btn-generate");
  btn.disabled = true;
  btn.textContent = "✦ 整合中…";

  const formatted = notes.map((n, i) => `【笔记 ${i + 1}】${n.title}\n${n.content}`).join("\n\n---\n\n");
  const userContent = `请将以下 ${notes.length} 条笔记整合成一份专属笔记本。要求：去重合并相近内容、提炼要点、按主题分类、保持关键信息完整。\n\n${formatted}`;

  try {
    const endpoint = s.baseURL.replace(/\/+$/, "") + "/chat/completions";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + s.apiKey,
      },
      body: JSON.stringify({
        model: s.model,
        messages: [
          { role: "system", content: s.systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: Number(s.maxTokens) || 4000,
        stream: false,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`请求失败（${res.status}）${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message.content;
    if (!content) throw new Error("AI 未返回内容");

    currentAI.result = content;
    document.getElementById("ai-result-content").textContent = content;
    document.getElementById("ai-result").classList.remove("hidden");
  } catch (err) {
    alert("AI 生成失败：" + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "✦ 生成专属笔记本";
  }
}

/* ---------- 弹窗 ---------- */
function openModal(html) {
  document.getElementById("modal-box").innerHTML = html;
  document.getElementById("modal-overlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

function noteModal(note) {
  const isNew = !note;
  const n = note || { title: "", content: "", categoryId: "", pinned: false };
  currentNoteEditId = note ? note.id : null;
  currentTodoEditId = null;
  const cats = getCategories();
  const catOpts = '<option value="">无分类</option>' +
    cats.map((c) => `<option value="${c.id}" ${c.id === n.categoryId ? "selected" : ""}>${esc(c.name)}</option>`).join("");

  openModal(`
    <h3>${isNew ? "新建笔记" : "编辑笔记"}</h3>
    <input type="text" id="m-title" class="input" placeholder="标题" value="${esc(n.title)}">
    <textarea id="m-content" class="textarea input" rows="8" placeholder="内容…">${esc(n.content)}</textarea>
    <label class="field-label">分类</label>
    <select id="m-category" class="input select">${catOpts}</select>
    <label class="check-item" style="margin-top:12px">
      <input type="checkbox" id="m-pinned" ${n.pinned ? "checked" : ""}>
      <span>置顶</span>
    </label>
    <div class="modal-actions">
      <button class="btn" id="m-cancel">取消</button>
      <button class="btn ${note ? "" : "hidden"}" id="m-export">导出PDF</button>
      <button class="btn btn-primary" id="m-save">保存</button>
    </div>`);
}

function todoModal(todo) {
  const isNew = !todo;
  const t = todo || { title: "", dueDate: "", priority: "mid" };
  currentNoteEditId = null;
  currentTodoEditId = todo ? todo.id : null;
  const dueStr = t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 16) : "";
  openModal(`
    <h3>${isNew ? "新建待办" : "编辑待办"}</h3>
    <input type="text" id="m-todo-title" class="input" placeholder="待办内容" value="${esc(t.title)}">
    <label class="field-label">截止时间</label>
    <input type="datetime-local" id="m-due" class="input" value="${dueStr}">
    <label class="field-label">优先级</label>
    <select id="m-priority" class="input select">
      <option value="low" ${t.priority === "low" ? "selected" : ""}>低</option>
      <option value="mid" ${t.priority === "mid" ? "selected" : ""}>中</option>
      <option value="high" ${t.priority === "high" ? "selected" : ""}>高</option>
    </select>
    <div class="modal-actions">
      <button class="btn" id="m-cancel">取消</button>
      <button class="btn btn-primary" id="m-save">保存</button>
    </div>`);
}

/* ---------- 备份 ---------- */
function exportData() {
  const data = {
    app: "晓笺藏竹影",
    exportedAt: new Date().toISOString(),
    notes: getNotes(),
    todos: getTodos(),
    categories: getCategories(),
    settings: getSettings(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  a.href = url;
  a.download = `晓笺藏竹影备份_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data.notes)) setNotes(data.notes);
      if (Array.isArray(data.todos)) setTodos(data.todos);
      if (Array.isArray(data.categories)) setCategories(data.categories);
      if (data.settings && typeof data.settings === "object") save(STORE_KEYS.settings, data.settings);
      startApp();
      alert("导入成功，数据已恢复");
    } catch (err) {
      alert("导入失败：" + err.message);
    }
  };
  reader.readAsText(file);
}

function importFileAsNote(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const title = file.name.replace(/\.[^.]+$/, "");
    const now = Date.now();
    const notes = getNotes();
    notes.push({
      id: uuid(), title, content: String(reader.result || ""),
      categoryId: "", pinned: false, isAI: false, createdAt: now, updatedAt: now,
    });
    setNotes(notes);
    renderNotes();
  };
  reader.readAsText(file);
}

/* ---------- PDF 导出 ---------- */
function renderPrintArea(html) {
  document.getElementById("print-area").innerHTML = html;
  window.print();
}

function exportNoteHTML(title, content, meta) {
  return `<h1 class="print-title">${esc(title) || "（无标题）"}</h1>` +
    (meta ? `<p class="print-meta">${esc(meta)}</p>` : "") +
    `<div class="print-content">${esc(content)}</div>`;
}

function exportAllPDF() {
  const notes = getNotes().sort((a, b) => b.updatedAt - a.updatedAt);
  const items = notes.map((n, i) => `
    <div class="print-note">
      <h2>【${i + 1}】${esc(n.title) || "（无标题）"}</h2>
      <p class="print-meta">${fmtDate(n.updatedAt)}</p>
      <div class="print-content">${esc(n.content)}</div>
    </div>
    <hr class="print-sep">`).join("");
  renderPrintArea(
    `<h1 class="print-title">晓笺藏竹影</h1>
     <p class="print-meta">共 ${notes.length} 篇笔记</p>
     ${items || '<p class="print-content">暂无笔记</p>'}`
  );
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  // 标签
  document.getElementById("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (btn) switchTab(btn.dataset.tab);
  });

  // 笔记
  document.getElementById("note-search").addEventListener("input", renderNotes);
  document.getElementById("note-category-filter").addEventListener("change", renderNotes);
  document.getElementById("btn-new-note").addEventListener("click", () => {
    noteModal(null);
  });
  document.getElementById("btn-import-note").addEventListener("click", () => {
    document.getElementById("note-file-input").click();
  });
  document.getElementById("note-file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importFileAsNote(file);
    e.target.value = "";
  });
  document.getElementById("btn-export-pdf").addEventListener("click", exportAllPDF);
  document.getElementById("note-list").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    const id = card.dataset.noteId;
    const note = getNotes().find((n) => n.id === id);
    if (note) noteModal(note);
  });

  // 待办
  document.getElementById("todo-search").addEventListener("input", renderTodos);
  document.getElementById("todo-filter").addEventListener("change", renderTodos);
  document.getElementById("btn-new-todo").addEventListener("click", () => todoModal(null));
  document.getElementById("todo-list").addEventListener("click", (e) => {
    const check = e.target.closest("[data-toggle]");
    if (check) {
      const id = check.dataset.toggle;
      const todos = getTodos();
      const t = todos.find((x) => x.id === id);
      if (t) { t.completed = !t.completed; setTodos(todos); renderTodos(); }
      return;
    }
    const row = e.target.closest(".todo-row");
    if (row) {
      const id = row.dataset.todoId;
      const todo = getTodos().find((x) => x.id === id);
      if (todo) todoModal(todo);
    }
  });

  // AI 模式
  document.getElementById("ai-mode").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    currentAI.mode = btn.dataset.mode;
    document.querySelectorAll("#ai-mode .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("ai-category-group").classList.toggle("hidden", currentAI.mode !== "category");
    document.getElementById("ai-manual-group").classList.toggle("hidden", currentAI.mode !== "manual");
    updateGenerateState();
  });

  document.getElementById("ai-category").addEventListener("change", updateGenerateState);
  document.getElementById("ai-manual-list").addEventListener("change", (e) => {
    const cb = e.target.closest("[data-manual-note]");
    if (!cb) return;
    const id = cb.dataset.manualNote;
    if (cb.checked) currentAI.selection.add(id);
    else currentAI.selection.delete(id);
    document.getElementById("ai-manual-count").textContent = currentAI.selection.size;
    updateGenerateState();
  });

  document.getElementById("btn-generate").addEventListener("click", generateAI);
  document.getElementById("btn-save-result").addEventListener("click", () => {
    const targetCat = document.getElementById("ai-target-category").value;
    const now = Date.now();
    const d = new Date(now);
    const p = (x) => String(x).padStart(2, "0");
    const title = `AI 整合笔记本 ${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
    const notes = getNotes();
    notes.push({
      id: uuid(),
      title,
      content: currentAI.result,
      categoryId: targetCat || "",
      pinned: false,
      isAI: true,
      createdAt: now,
      updatedAt: now,
    });
    setNotes(notes);
    renderNotes();
    document.getElementById("ai-result").classList.add("hidden");
    alert("已保存为笔记");
  });

  // 设置
  document.getElementById("btn-save-settings").addEventListener("click", () => {
    const s = getSettings();
    s.apiKey = document.getElementById("set-apikey").value.trim();
    s.baseURL = document.getElementById("set-baseurl").value.trim();
    s.model = document.getElementById("set-model").value.trim();
    s.maxTokens = Number(document.getElementById("set-maxtokens").value) || 4000;
    s.systemPrompt = document.getElementById("set-prompt").value;
    save(STORE_KEYS.settings, s);
    document.getElementById("settings-hint").textContent = "已保存 ✓";
    setTimeout(() => (document.getElementById("settings-hint").textContent = ""), 2000);
    updateGenerateState();
  });

  document.getElementById("btn-add-category").addEventListener("click", () => {
    const input = document.getElementById("new-category-name");
    const name = input.value.trim();
    if (!name) return;
    const cats = getCategories();
    const color = CATEGORY_COLORS[cats.length % CATEGORY_COLORS.length];
    cats.push({ id: uuid(), name, color });
    setCategories(cats);
    input.value = "";
    renderCategories();
    renderCategoryOptions();
  });

  document.getElementById("category-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-del-cat]");
    if (!btn) return;
    const id = btn.dataset.delCat;
    if (!confirm("删除该分类？（笔记会保留，仅移除分类标记）")) return;
    setCategories(getCategories().filter((c) => c.id !== id));
    const notes = getNotes().map((n) => (n.categoryId === id ? { ...n, categoryId: "" } : n));
    setNotes(notes);
    renderCategories();
    renderCategoryOptions();
    renderNotes();
  });

  // 备份
  document.getElementById("btn-export").addEventListener("click", exportData);
  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = "";
  });

  // 弹窗
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });

  document.getElementById("modal-box").addEventListener("click", (e) => {
    if (e.target.closest("#m-cancel")) return closeModal();
    if (e.target.closest("#m-export")) {
      const title = document.getElementById("m-title").value;
      const content = document.getElementById("m-content").value;
      renderPrintArea(exportNoteHTML(title, content, ""));
      return;
    }
    if (e.target.closest("#m-save")) {
      // 笔记
      if (document.getElementById("m-title")) {
        const title = document.getElementById("m-title").value.trim();
        if (!title) { alert("请填写标题"); return; }
        const notes = getNotes();
        const existingId = notes.some((n) => n.id === currentNoteEditId);
        const content = document.getElementById("m-content").value;
        const categoryId = document.getElementById("m-category").value;
        const pinned = document.getElementById("m-pinned").checked;
        if (existingId) {
          const n = notes.find((x) => x.id === currentNoteEditId);
          n.title = title; n.content = content; n.categoryId = categoryId; n.pinned = pinned; n.updatedAt = Date.now();
        } else {
          const now = Date.now();
          notes.push({ id: uuid(), title, content, categoryId, pinned, isAI: false, createdAt: now, updatedAt: now });
        }
        setNotes(notes);
        renderNotes();
        closeModal();
        return;
      }
      // 待办
      if (document.getElementById("m-todo-title")) {
        const title = document.getElementById("m-todo-title").value.trim();
        if (!title) { alert("请填写内容"); return; }
        const todos = getTodos();
        const dueVal = document.getElementById("m-due").value;
        const dueDate = dueVal ? new Date(dueVal).getTime() : null;
        const priority = document.getElementById("m-priority").value;
        if (currentTodoEditId && todos.some((t) => t.id === currentTodoEditId)) {
          const t = todos.find((x) => x.id === currentTodoEditId);
          t.title = title; t.dueDate = dueDate; t.priority = priority;
        } else {
          todos.push({ id: uuid(), title, completed: false, dueDate, priority, createdAt: Date.now() });
        }
        setTodos(todos);
        renderTodos();
        closeModal();
        return;
      }
    }
  });
}

let currentNoteEditId = null;
let currentTodoEditId = null;

/* ---------- 访问口令门 ---------- */
function isUnlocked() {
  return localStorage.getItem(UNLOCK_KEY) === "1";
}

function showGate() {
  document.getElementById("gate").classList.remove("hidden");
}

function hideGate() {
  document.getElementById("gate").classList.add("hidden");
}

function bindGate() {
  const submit = async () => {
    const input = document.getElementById("gate-password").value;
    const hash = await sha256(input);
    if (hash === ACCESS_HASH) {
      localStorage.setItem(UNLOCK_KEY, "1");
      hideGate();
      startApp();
    } else {
      document.getElementById("gate-error").classList.remove("hidden");
      document.getElementById("gate-password").value = "";
      document.getElementById("gate-password").focus();
    }
  };
  document.getElementById("gate-submit").addEventListener("click", submit);
  document.getElementById("gate-password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

/* ---------- 启动 ---------- */
function startApp() {
  renderSettings();
  renderCategoryOptions();
  renderCategories();
  renderNotes();
  renderTodos();
  renderAI();
  bindEvents();
}

document.addEventListener("DOMContentLoaded", () => {
  bindGate();
  if (isUnlocked()) {
    hideGate();
    startApp();
  } else {
    showGate();
  }
});
