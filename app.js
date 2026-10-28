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
  handwritings: "zy.handwritings",
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

function getHandwritings() { return load(STORE_KEYS.handwritings, []); }
function setHandwritings(v) { save(STORE_KEYS.handwritings, v); }

function getSettings() {
  return load(STORE_KEYS.settings, {
    apiKey: "",
    baseURL: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    maxTokens: 8192,
    systemPrompt: "你是一位资深的学习笔记整理专家。请把用户提供的所有内容整合成一份详尽、完整、可延伸的专属笔记本。\n\n核心原则：\n1. 详尽完整：保留所有知识点、细节、例子、公式、数字、定义，不省略、不简化、不过度概括。\n2. 结构清晰：按主题/章节分门别类，用多级标题、列表、表格组织。\n3. 可延伸：在关键概念后补充必要的解释、例子、易错点、记忆技巧，方便继续学习扩展。\n4. 不缩减：只合并完全重复的内容，其余一律保留，宁可详细也不要精简。\n5. 保留原文关键表述：公式、定理、名词解释、数字务必原样保留，不缩写不改写。\n\n用 Markdown 格式输出，善用标题层级、列表、表格、加粗、引用等结构。",
    cloudOCR: false,
    baiduApiKey: "",
    baiduSecretKey: "",
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
  if (tab === "handwriting") {
    setTimeout(resizeHWCanvas, 0);
  }
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
    const titleStyle = n.color ? ` style="color:${n.color}"` : "";
    const previewStyle = n.color || n.fontSize
      ? ` style="${n.color ? "color:" + n.color + ";" : ""}${n.fontSize ? "font-size:" + n.fontSize + "px;" : ""}"`
      : "";
    return `
      <div class="card" data-note-id="${n.id}">
        <p class="note-title"${titleStyle}>${esc(n.title) || "（无标题）"} ${badges}</p>
        <p class="note-preview"${previewStyle}>${esc(n.content)}</p>
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
  document.getElementById("set-cloud-ocr").checked = !!s.cloudOCR;
  document.getElementById("set-baidu-apikey").value = s.baiduApiKey || "";
  document.getElementById("set-baidu-secret").value = s.baiduSecretKey || "";
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

async function callChat(userContent) {
  const s = getSettings();
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
    throw new Error("请求失败（" + res.status + "）" + body.slice(0, 300));
  }
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message.content;
  if (!content) throw new Error("AI 未返回内容");
  return content;
}

function makeChunks(notes, maxLen) {
  const chunks = [];
  let current = "";
  const flush = () => { if (current) { chunks.push(current); current = ""; } };
  for (const n of notes) {
    const block = "【笔记】" + n.title + "\n" + n.content + "\n\n";
    if (block.length > maxLen) {
      flush();
      for (let i = 0; i < block.length; i += maxLen) {
        chunks.push(block.slice(i, i + maxLen));
      }
      continue;
    }
    if (current.length + block.length > maxLen) flush();
    current += block;
  }
  flush();
  return chunks;
}

async function generateAI() {
  const s = getSettings();
  const notes = aiSelectedNotes();
  if (!notes.length) return;

  const btn = document.getElementById("btn-generate");
  btn.disabled = true;
  btn.textContent = "✦ 整合中…";

  try {
    const totalLen = notes.reduce((sum, n) => sum + n.title.length + n.content.length, 0);
    let result;

    if (totalLen > 16000) {
      const chunks = makeChunks(notes, 14000);
      if (chunks.length <= 1) {
        result = await callChat("请将以下内容整合成一份详尽、完整、可延伸的专属笔记本。要求：保留所有知识点和细节、不省略不简化、按主题结构化、公式数字定义原样保留。\n\n" + (chunks[0] || ""));
      } else {
        const parts = [];
        for (let i = 0; i < chunks.length; i++) {
          btn.textContent = "✦ 整合中 " + (i + 1) + "/" + chunks.length + "…";
          const part = await callChat("请将以下内容整理成「第 " + (i + 1) + "/" + chunks.length + " 部分」的详细笔记。要求：详尽完整、不省略细节、按主题归类、保留公式数字定义原样。\n\n" + chunks[i]);
          parts.push(part);
        }
        const merged = parts.map((p, i) => "【第 " + (i + 1) + " 部分】\n" + p).join("\n\n---\n\n");
        result = await callChat("请将以下各部分笔记合并成一份详尽、完整、结构清晰、无遗漏的专属笔记本（不要缩减任何内容，只做去重和整合）：\n\n" + merged);
      }
    } else {
      const formatted = notes.map((n, i) => "【笔记 " + (i + 1) + "】" + n.title + "\n" + n.content).join("\n\n---\n\n");
      result = await callChat("请将以下 " + notes.length + " 条笔记整合成一份详尽、完整、可延伸的专属笔记本。要求：保留所有知识点和细节、不省略不简化、按主题结构化、公式数字定义原样保留。\n\n" + formatted);
    }

    currentAI.result = result;
    document.getElementById("ai-result-content").textContent = result;
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

function unescapeXML(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

async function extractPPTXText(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/)[1], 10);
      const nb = parseInt(b.match(/slide(\d+)/)[1], 10);
      return na - nb;
    });
  let text = "";
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async("string");
    const matches = xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [];
    const texts = matches.map((m) => unescapeXML(m.replace(/<\/?a:t>/g, "")).trim()).filter(Boolean);
    if (texts.length) {
      text += "\n【第 " + (i + 1) + " 页】\n" + texts.join("\n") + "\n";
    }
  }
  return text;
}

async function extractImageText(file) {
  const worker = await Tesseract.createWorker("chi_sim+eng");
  try {
    const ret = await worker.recognize(file);
    return ret.data.text || "";
  } finally {
    await worker.terminate();
  }
}

function importFileAsNote(file) {
  const title = file.name.replace(/\.[^.]+$/, "");
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const finish = (content) => {
    if (!content.trim()) { alert("未能从该文件提取到文本内容"); return; }
    const now = Date.now();
    const notes = getNotes();
    notes.push({
      id: uuid(), title, content,
      categoryId: "", pinned: false, isAI: false, createdAt: now, updatedAt: now,
    });
    setNotes(notes);
    renderNotes();
  };

  if (ext === "docx") {
    if (typeof mammoth === "undefined") { alert("Word 解析库未加载，请检查网络后重试"); return; }
    file.arrayBuffer().then((buf) => mammoth.extractRawText({ arrayBuffer: buf }))
      .then((result) => finish(result.value))
      .catch((err) => alert("导入失败：" + err.message));
    return;
  }

  if (ext === "pdf") {
    if (typeof pdfjsLib === "undefined") { alert("PDF 解析库未加载，请检查网络后重试"); return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    file.arrayBuffer().then((buf) => pdfjsLib.getDocument({ data: buf }).promise)
      .then(async (pdf) => {
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((it) => it.str).join("") + "\n";
        }
        finish(text);
      })
      .catch((err) => alert("导入失败：" + err.message));
    return;
  }

  if (ext === "pptx") {
    if (typeof JSZip === "undefined") { alert("PPT 解析库未加载，请检查网络后重试"); return; }
    file.arrayBuffer().then((buf) => extractPPTXText(buf))
      .then((text) => finish(text))
      .catch((err) => alert("导入失败：" + err.message));
    return;
  }

  if (ext === "html" || ext === "htm") {
    file.text().then((htmlText) => {
      const doc = new DOMParser().parseFromString(htmlText, "text/html");
      const text = doc.body ? (doc.body.textContent || "") : "";
      finish(text);
    }).catch((err) => alert("导入失败：" + err.message));
    return;
  }

  const imageExts = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];
  if (imageExts.includes(ext)) {
    if (typeof Tesseract === "undefined") { alert("OCR 库未加载，请检查网络后重试"); return; }
    alert("开始识别图片文字。首次使用需下载中文语言包（约 20MB），请耐心等待…");
    extractImageText(file)
      .then((text) => finish(text))
      .catch((err) => alert("识别失败：" + err.message));
    return;
  }

  const reader = new FileReader();
  reader.onload = () => finish(String(reader.result || ""));
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
  document.querySelectorAll(".import-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.import;
      const input = document.getElementById("note-file-input");
      const acceptMap = {
        document: ".txt,.md,.markdown,.text,.docx,.pdf,.html,.htm,text/plain,text/markdown,application/pdf,text/html",
        ppt: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation",
        image: "image/*",
      };
      input.accept = acceptMap[type] || acceptMap.document;
      const menu = document.getElementById("import-menu");
      if (menu) menu.removeAttribute("open");
      input.click();
    });
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
    s.cloudOCR = document.getElementById("set-cloud-ocr").checked;
    s.baiduApiKey = document.getElementById("set-baidu-apikey").value.trim();
    s.baiduSecretKey = document.getElementById("set-baidu-secret").value.trim();
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
    if (e.target.closest("#hw-save-text") || e.target.closest("#hw-ai") || e.target.closest("#hw-both")) {
      const text = document.getElementById("hw-result-text").value.trim();
      if (!text) { alert("内容为空"); return; }
      const both = e.target.closest("#hw-both");
      const ai = e.target.closest("#hw-ai") || both;
      closeModal();
      if (ai) {
        if (!getSettings().apiKey) { alert("请先在设置页配置 AI 接口"); saveHWNote(text, false); return; }
        aiOptimizeText(text)
          .then((optimized) => {
            if (both) saveHWNote(text, false);
            saveHWNote(optimized, true);
          })
          .catch((err) => { alert("AI 优化失败：" + err.message); saveHWNote(text, false); });
      } else {
        saveHWNote(text, false);
      }
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

/* ---------- 手写画布 ---------- */
const HW_W = 4800;
const HW_H = 3200;
let hw = {
  color: "#1a1a1a",
  size: 5,
  eraser: false,
  strokes: [],
  current: null,
  drawing: false,
  scale: 1,
  zoom: 1,
  canvas: null,
  ctx: null,
};

function renderHWList() {
  const items = getHandwritings();
  const el = document.getElementById("hw-list");
  if (!items.length) {
    el.innerHTML = '<p class="empty">暂无手写，点「＋ 新建手写」开始</p>';
    return;
  }
  el.innerHTML = items.map((item) => `
    <div class="hw-card" data-hw-id="${item.id}">
      <img src="${item.dataUrl}" alt="手写">
      <span class="hw-date">${fmtDate(item.createdAt)}</span>
      <button class="hw-del" data-hw-del="${item.id}">×</button>
    </div>`).join("");
}

function showHWGallery() {
  document.getElementById("hw-gallery").classList.remove("hidden");
  document.getElementById("hw-editor").classList.add("hidden");
  renderHWList();
}

function showHWEditor() {
  document.getElementById("hw-gallery").classList.add("hidden");
  document.getElementById("hw-editor").classList.remove("hidden");
  setTimeout(resizeHWCanvas, 0);
}

function saveHW() {
  if (hw.strokes.length === 0) { alert("画布是空的，请先写点内容"); return; }
  const dataUrl = hw.canvas.toDataURL("image/png");
  const items = getHandwritings();
  items.push({ id: uuid(), dataUrl, createdAt: Date.now() });
  setHandwritings(items);
  hw.strokes = [];
  redrawHW();
  showHWGallery();
}

function initHandwriting() {
  hw.canvas = document.getElementById("hw-canvas");
  hw.ctx = hw.canvas.getContext("2d");
  resizeHWCanvas();

  const c = hw.canvas;
  c.addEventListener("pointerdown", hwPointerDown);
  c.addEventListener("pointermove", hwPointerMove);
  c.addEventListener("pointerup", hwPointerUp);
  c.addEventListener("pointercancel", hwPointerUp);
  window.addEventListener("resize", resizeHWCanvas);
  c.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomHW(e.deltaY < 0 ? 1.1 : 0.9);
  }, { passive: false });
  document.getElementById("hw-zoom-in").addEventListener("click", () => zoomHW(1.25));
  document.getElementById("hw-zoom-out").addEventListener("click", () => zoomHW(0.8));

  document.querySelectorAll(".hw-color").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".hw-color").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      hw.color = btn.dataset.color;
      hw.eraser = false;
      document.getElementById("hw-eraser").classList.remove("active");
    });
  });
  document.querySelectorAll(".hw-size").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".hw-size").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      hw.size = parseInt(btn.dataset.size, 10);
      hw.eraser = false;
      document.getElementById("hw-eraser").classList.remove("active");
    });
  });
  document.getElementById("hw-eraser").addEventListener("click", (e) => {
    hw.eraser = !hw.eraser;
    e.currentTarget.classList.toggle("active", hw.eraser);
  });
  document.getElementById("hw-undo").addEventListener("click", () => {
    hw.strokes.pop();
    redrawHW();
  });
  document.getElementById("hw-clear").addEventListener("click", () => {
    hw.strokes = [];
    redrawHW();
  });
  document.getElementById("hw-recognize").addEventListener("click", recognizeHW);
  document.getElementById("btn-hw-new").addEventListener("click", showHWEditor);
  document.getElementById("hw-save").addEventListener("click", saveHW);
  document.getElementById("hw-back").addEventListener("click", showHWGallery);
  document.getElementById("hw-list").addEventListener("click", (e) => {
    const del = e.target.closest("[data-hw-del]");
    if (del) {
      if (!confirm("删除这张手写？")) return;
      const id = del.dataset.hwDel;
      setHandwritings(getHandwritings().filter((x) => x.id !== id));
      renderHWList();
      return;
    }
    const card = e.target.closest(".hw-card");
    if (card) {
      const item = getHandwritings().find((x) => x.id === card.dataset.hwId);
      if (item) {
        openModal('<h3>手写</h3><img src="' + item.dataUrl + '" style="max-width:100%;background:#fff;border-radius:8px">');
      }
    }
  });
}

function hwPos(e) {
  const rect = hw.canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / hw.zoom,
    y: (e.clientY - rect.top) / hw.zoom,
  };
}

function hwPointerDown(e) {
  e.preventDefault();
  hw.drawing = true;
  hw.current = {
    color: hw.eraser ? "#fffdf6" : hw.color,
    size: hw.size,
    eraser: hw.eraser,
    points: [hwPos(e)],
  };
  if (hw.canvas.setPointerCapture) hw.canvas.setPointerCapture(e.pointerId);
}

function hwPointerMove(e) {
  if (!hw.drawing || !hw.current) return;
  e.preventDefault();
  const p = hwPos(e);
  hw.current.points.push(p);
  drawHWStroke(hw.current);
}

function hwPointerUp() {
  if (!hw.drawing || !hw.current) return;
  hw.drawing = false;
  hw.strokes.push(hw.current);
  hw.current = null;
}

function drawHWStroke(stroke) {
  const ctx = hw.ctx;
  const pts = stroke.points;
  const sc = hw.scale;
  if (pts.length === 1) {
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.arc(pts[0].x * sc, pts[0].y * sc, (stroke.size * sc) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size * sc;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0].x * sc, pts[0].y * sc);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * sc, pts[i].y * sc);
  ctx.stroke();
}

function redrawHW() {
  if (!hw.ctx) return;
  hw.ctx.clearRect(0, 0, hw.canvas.width, hw.canvas.height);
  for (const s of hw.strokes) drawHWStroke(s);
  if (hw.current) drawHWStroke(hw.current);
}

function applyHWZoom() {
  if (!hw.canvas) return;
  hw.canvas.style.width = (HW_W * hw.zoom) + "px";
  hw.canvas.style.height = (HW_H * hw.zoom) + "px";
}

function resizeHWCanvas() {
  if (!hw.canvas) return;
  hw.scale = 1;
  hw.canvas.width = HW_W;
  hw.canvas.height = HW_H;
  applyHWZoom();
  redrawHW();
}

function zoomHW(factor) {
  const newZoom = Math.min(4, Math.max(0.2, hw.zoom * factor));
  hw.zoom = newZoom;
  applyHWZoom();
  const label = document.getElementById("hw-zoom-label");
  if (label) label.textContent = Math.round(hw.zoom * 100) + "%";
}

function hwDominantStyle() {
  const colorCount = {};
  let totalSize = 0;
  let sizeCount = 0;
  for (const s of hw.strokes) {
    if (s.eraser) continue;
    colorCount[s.color] = (colorCount[s.color] || 0) + 1;
    totalSize += s.size;
    sizeCount++;
  }
  let domColor = "#1a1a1a";
  let maxCount = 0;
  for (const [color, count] of Object.entries(colorCount)) {
    if (count > maxCount) { maxCount = count; domColor = color; }
  }
  const avg = sizeCount ? totalSize / sizeCount : 5;
  const fontSize = avg <= 3 ? 14 : (avg <= 7 ? 18 : 24);
  return { color: domColor, fontSize };
}

async function baiduCloudOCR(imageDataUrl) {
  const s = getSettings();
  const tokenUrl = "https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials" +
    "&client_id=" + encodeURIComponent(s.baiduApiKey) +
    "&client_secret=" + encodeURIComponent(s.baiduSecretKey);
  const tokenRes = await fetch(tokenUrl, { method: "POST" });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error("百度 OCR 鉴权失败：" + (tokenData.error_description || "请检查 API Key / Secret Key"));
  }
  const base64 = imageDataUrl.split(",")[1] || imageDataUrl;
  const url = "https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting?access_token=" + tokenData.access_token;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "image=" + encodeURIComponent(base64),
  });
  const data = await res.json();
  if (data.error_code) {
    throw new Error("百度 OCR 识别失败：" + (data.error_msg || data.error_code));
  }
  return (data.words_result || []).map((w) => w.words).join("\n");
}

async function recognizeHW() {
  if (hw.strokes.length === 0 && !hw.current) { alert("请先写点内容再识别"); return; }
  try {
    const dataUrl = hw.canvas.toDataURL("image/png");
    const s = getSettings();
    let text;

    if (s.cloudOCR && s.baiduApiKey && s.baiduSecretKey) {
      alert("正在使用云端精准识别…");
      text = await baiduCloudOCR(dataUrl);
    } else {
      if (typeof Tesseract === "undefined") { alert("OCR 库未加载，请检查网络后重试"); return; }
      alert("正在识别手写文字。首次使用需下载中文语言包（约 20MB），请耐心等待…");
      const worker = await Tesseract.createWorker("chi_sim+eng");
      try {
        const ret = await worker.recognize(dataUrl);
        text = ret.data.text || "";
      } finally {
        await worker.terminate();
      }
    }

    if (!text.trim()) { alert("未识别到文字，请尽量写工整些"); return; }
    showHWResult(text);
  } catch (err) {
    alert("识别失败：" + err.message);
  }
}

function showHWResult(text) {
  window.__hwStyle = hwDominantStyle();
  const style = window.__hwStyle;
  openModal(`
    <h3>识别结果</h3>
    <textarea id="hw-result-text" class="textarea input" rows="8">${esc(text)}</textarea>
    <p class="hint">主色 <span class="cat-dot" style="background:${style.color}"></span> 字号 ${style.fontSize}px</p>
    <div class="modal-actions">
      <button class="btn" id="hw-save-text">存为文本</button>
      <button class="btn" id="hw-ai">AI 优化</button>
      <button class="btn btn-primary" id="hw-both">两者都要</button>
    </div>`);
}

function saveHWNote(content, isAI) {
  const style = window.__hwStyle || { color: "#1a1a1a", fontSize: 18 };
  const now = Date.now();
  const notes = getNotes();
  notes.push({
    id: uuid(),
    title: isAI ? "AI 优化笔记" : "手写笔记",
    content,
    categoryId: "",
    pinned: false,
    isAI,
    color: style.color,
    fontSize: style.fontSize,
    createdAt: now,
    updatedAt: now,
  });
  setNotes(notes);
  renderNotes();
}

async function aiOptimizeText(text) {
  const s = getSettings();
  if (!s.apiKey || !s.baseURL || !s.model) throw new Error("请先在设置页配置 AI 接口");
  const endpoint = s.baseURL.replace(/\/+$/, "") + "/chat/completions";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + s.apiKey },
    body: JSON.stringify({
      model: s.model,
      messages: [
        { role: "system", content: "你是笔记整理助手。请对手写识别的文字进行润色、纠错、结构化整理，保留原意，输出干净易读的文本。" },
        { role: "user", content: text },
      ],
      max_tokens: Number(s.maxTokens) || 4000,
      stream: false,
    }),
  });
  if (!res.ok) { const body = await res.text(); throw new Error("请求失败（" + res.status + "）"); }
  const data = await res.json();
  return data.choices[0].message.content;
}

/* ---------- 启动 ---------- */
function startApp() {
  renderSettings();
  renderCategoryOptions();
  renderCategories();
  renderNotes();
  renderTodos();
  renderAI();
  renderHWList();
  initHandwriting();
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
