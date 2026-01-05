const KEY = "compsys-toolkit:v1";

export function loadState() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function getModuleState(state, moduleId) {
  return state[moduleId] ?? {};
}

export function setModuleState(state, moduleId, moduleState) {
  state[moduleId] = moduleState;
}
