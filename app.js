import { normalize } from "./lib/utils.js";
import { loadState, saveState, getModuleState, setModuleState } from "./lib/storage.js";

import home from "./modules/home.js";
import cache from "./modules/cache.js";
import vm from "./modules/vm.js";

const modules = [home, cache, vm];

const els = {
  nav: document.querySelector("#nav"),
  search: document.querySelector("#search"),
  page: document.querySelector("#page"),
  title: document.querySelector("#pageTitle"),
  notes: document.querySelector("#notes"),
  output: document.querySelector("#output"),
  btnCompute: document.querySelector("#btnCompute"),
  btnCopy: document.querySelector("#btnCopy"),
  btnReset: document.querySelector("#btnReset"),
  examMode: document.querySelector("#examMode"),
};

let appState = loadState();
let activeId = appState._activeId || "home";
let activeModule = modules.find(m => m.id === activeId) || home;

// --- nav rendering ---
function renderNav(filterText = "") {
  els.nav.innerHTML = "";
  const q = normalize(filterText);

  const filtered = modules.filter(m => {
    if (!q) return true;
    const hay = [m.title, ...(m.tags || [])].map(normalize).join(" ");
    return hay.includes(q);
  });

  for (const m of filtered) {
    const item = document.createElement("div");
    item.className = "nav-item" + (m.id === activeModule.id ? " active" : "");
    item.innerHTML = `
      <div>
        <div class="nav-title">${m.title}</div>
        <div class="nav-tag">${(m.tags || []).join(" · ")}</div>
      </div>
      <div class="nav-tag">${m.area || ""}</div>
    `;
    item.addEventListener("click", () => activate(m.id));
    els.nav.appendChild(item);
  }
}

// --- activate module ---
function activate(id) {
  const m = modules.find(x => x.id === id);
  if (!m) return;

  activeModule = m;
  activeId = id;

  appState._activeId = id;
  saveState(appState);

  renderNav(els.search.value);
  renderPage();
}

function renderPage() {
  els.title.textContent = activeModule.title;
  els.page.innerHTML = "";

  const moduleState = getModuleState(appState, activeModule.id);
  const ctx = {
    state: moduleState,
    setState: (next) => {
      setModuleState(appState, activeModule.id, next);
      saveState(appState);
    },
    setOutput: (txt) => { els.output.textContent = txt; },
    setNotes: (html) => { els.notes.innerHTML = html; },
  };

  // render UI
  activeModule.render(els.page, ctx);

  // notes (optional)
  els.notes.innerHTML = "";
  if (activeModule.notesHtml) els.notes.innerHTML = activeModule.notesHtml;

  // output default
  if (moduleState.lastOutput) els.output.textContent = moduleState.lastOutput;
  else els.output.textContent = "(intet endnu)";
}

function compute() {
  const moduleState = getModuleState(appState, activeModule.id);
  const ctx = {
    state: moduleState,
    setState: (next) => {
      setModuleState(appState, activeModule.id, next);
      saveState(appState);
    },
  };

  try {
    const result = activeModule.compute?.(ctx) ?? "(ingen compute() i dette modul)";
    const out = typeof result === "string" ? result : JSON.stringify(result, null, 2);

    // persist last output + history
    const nextState = { ...moduleState };
    nextState.lastOutput = out;
    nextState.history = [out, ...(moduleState.history || [])].slice(0, 10);

    ctx.setState(nextState);
    els.output.textContent = out;
  } catch (e) {
    els.output.textContent = `ERROR: ${e?.message || e}`;
  }
}

async function copyOutput() {
  const text = els.output.textContent || "";
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function resetModule() {
  setModuleState(appState, activeModule.id, {});
  saveState(appState);
  renderPage();
}

// --- events ---
els.search.addEventListener("input", () => renderNav(els.search.value));
els.btnCompute.addEventListener("click", compute);
els.btnCopy.addEventListener("click", copyOutput);
els.btnReset.addEventListener("click", resetModule);

els.examMode.checked = !!appState._examMode;
document.body.classList.toggle("exam", !!appState._examMode);
els.examMode.addEventListener("change", () => {
  appState._examMode = els.examMode.checked;
  saveState(appState);
  document.body.classList.toggle("exam", !!appState._examMode);
});

// keyboard
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "k") {
    e.preventDefault();
    els.search.focus();
  }
  if (e.key === "Enter" && (document.activeElement?.tagName !== "TEXTAREA")) {
    compute();
  }
  if (e.ctrlKey && e.key === "Enter") {
    compute();
    copyOutput();
  }
});

// init
renderNav();
renderPage();
