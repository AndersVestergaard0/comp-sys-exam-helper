export function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
  
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
  
    for (const child of children) {
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
  
    return node;
  }
  
  export function safeParseJSON(text, fallback) {
    try { return JSON.parse(text); } catch { return fallback; }
  }
  
  export function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
  
  export function normalize(str) {
    return (str ?? "").toString().trim().toLowerCase();
  }
  