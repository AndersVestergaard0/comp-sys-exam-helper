// vm.js — full updated, copy-pasteable implementation
// Adds initial Page Table + initial TLB tables (12–16 rows) to populate contents before simulation.

import { el } from "../lib/utils.js";
import {
  parseHexToBigInt,
  log2IntPow2,
  isPowerOfTwo,
  maskBits,
  toHex,
  toBin,
  clampBigIntToBits,
} from "../lib/bit.js";

function parseIntStrict(s, name) {
  const n = Number.parseInt((s ?? "").toString().trim(), 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${name}`);
  return n;
}

function parseNumToBigInt(s, name) {
  const t = (s ?? "").toString().trim();
  if (!t) throw new Error(`Missing ${name}`);

  if (/^0x[0-9a-f]+$/i.test(t) || /^[0-9a-f]+$/i.test(t)) {
    const isHex = /^0x/i.test(t) || /[a-f]/i.test(t);
    if (isHex) return parseHexToBigInt(t);
  }

  if (!/^[0-9]+$/.test(t)) throw new Error(`Invalid ${name}: "${s}"`);
  return BigInt(t);
}

function parseOptionalNumToBigInt(s) {
  const t = (s ?? "").toString().trim();
  if (!t) return null;
  return parseNumToBigInt(t, "number");
}

/**
 * Mapping lines format (flexible):
 *  - "0x123 -> 0x45"
 *  - "0x123 0x45"
 *  - "291 69"
 * Optional flags in third column: "RWXU" or "R W X U" or "V" etc.
 */
function parseMappings(text) {
  const lines = (text ?? "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"));

  const map = new Map(); // vpn(BigInt)-> {ppn(BigInt), flags(string)}
  for (const line of lines) {
    const cleaned = line.replace(/,/g, " ").replace(/->/g, " ").replace(/\s+/g, " ");
    const parts = cleaned.split(" ").filter(Boolean);
    if (parts.length < 2) continue;

    const vpn = parseNumToBigInt(parts[0], "VPN");
    const ppn = parseNumToBigInt(parts[1], "PPN");
    const flags = parts.slice(2).join("").toUpperCase(); // optional

    map.set(vpn, { ppn, flags });
  }
  return map;
}

function initTLB(numSets, assoc) {
  const sets = [];
  for (let s = 0; s < numSets; s++) {
    const lines = [];
    for (let w = 0; w < assoc; w++) {
      lines.push({
        valid: false,
        tag: 0n,     // TLBTAG
        ppn: 0n,     // stored physical page number
        flags: "",   // stored flags
        lastUsed: 0, // for LRU
      });
    }
    sets.push(lines);
  }
  return sets;
}

function pickVictimLRU(lines) {
  const invalidIdx = lines.findIndex(x => !x.valid);
  if (invalidIdx !== -1) return invalidIdx;

  let best = 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].lastUsed < lines[best].lastUsed) best = i;
  }
  return best;
}

// MRU -> LRU tags (for printing)
function fmtTlbTagsMRU(setLines) {
  const valid = setLines.filter(x => x.valid);
  valid.sort((a, b) => b.lastUsed - a.lastUsed);
  return valid.map(x => toHex(x.tag)).join(", ");
}

// --- NEW: init rows helpers ---
function mkRows(n, factory) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(factory(i));
  return out;
}

// Table overrides textarea if same VPN
function applyPtInitRows(pageTableMap, rows) {
  for (const r of (rows ?? [])) {
    const vpn = parseOptionalNumToBigInt(r?.vpn);
    const ppn = parseOptionalNumToBigInt(r?.ppn);
    if (vpn == null || ppn == null) continue; // allow blank rows
    const flags = (r?.flags ?? "").toString().trim().toUpperCase();
    pageTableMap.set(vpn, { ppn, flags });
  }
}

// Seed initial TLB by explicit set/way/tag/ppn.
// lastUsed blank => auto increasing so MRU/LRU order is deterministic.
function applyTlbInitRows(tlbSets, rows, timeBase = 0) {
  let t = timeBase;
  for (const r of (rows ?? [])) {
    const setStr = (r?.set ?? "").toString().trim();
    const wayStr = (r?.way ?? "").toString().trim();
    const tag = parseOptionalNumToBigInt(r?.tag);
    const ppn = parseOptionalNumToBigInt(r?.ppn);
    if (!setStr || !wayStr || tag == null || ppn == null) continue;

    const setIdx = Number.parseInt(setStr, 10);
    const wayIdx = Number.parseInt(wayStr, 10);
    if (!Number.isFinite(setIdx) || !Number.isFinite(wayIdx)) continue;
    if (setIdx < 0 || setIdx >= tlbSets.length) continue;
    if (wayIdx < 0 || wayIdx >= tlbSets[setIdx].length) continue;

    const flags = (r?.flags ?? "").toString().trim().toUpperCase();

    let lastUsed = Number.parseInt((r?.lastUsed ?? "").toString().trim(), 10);
    if (!Number.isFinite(lastUsed)) lastUsed = ++t;

    const line = tlbSets[setIdx][wayIdx];
    line.valid = true;
    line.tag = tag;
    line.ppn = ppn;
    line.flags = flags;
    line.lastUsed = lastUsed;
  }
}

export default {
  id: "vm",
  title: "Virtual Memory: VA → PA + TLB (LRU)",
  area: "Operating Systems",
  tags: ["vm", "page table", "vpn", "ppn", "tlb", "offset", "LRU"],

  notesHtml: `
    <p><b>Split:</b> VA = VPN || offset, hvor offsetBits = log2(pageSize).</p>
    <p><b>Page table:</b> VPN → PPN (+ flags).</p>
    <p><b>Physical address:</b> PA = (PPN &lt;&lt; offsetBits) | offset.</p>
    <p><b>TLB:</b> cache over VPN→PPN (typisk set-assoc + LRU). TLB hit undgår page table lookup.</p>
  `,

  render(container, ctx) {
    const s = ctx.state;

    // pick table size: 12–16
    const initRowsN = (() => {
      const n = Number.parseInt((s.initRowsN ?? "12").toString(), 10);
      if (!Number.isFinite(n)) return 12;
      return Math.max(12, Math.min(16, n));
    })();

    const state = {
      vaBits: s.vaBits ?? "32",
      paBits: s.paBits ?? "32",
      pageSize: s.pageSize ?? "4096",

      addresses: s.addresses ?? "0x00001004\n0x00001008\n0x00002000\n0x00001004",
      mappings:
        s.mappings ??
        "# VPN  PPN  FLAGS(optional)\n0x1 0xA RWX\n0x2 0xB R--\n0x3 0xA RW-",

      enableTLB: s.enableTLB ?? true,
      tlbEntries: s.tlbEntries ?? "16",
      tlbAssoc: s.tlbAssoc ?? "4",

      showBinary: s.showBinary ?? false,
      showTlbState: s.showTlbState ?? true,

      // NEW: table size and init rows
      initRowsN: s.initRowsN ?? String(initRowsN),
      ptInitRows:
        s.ptInitRows ??
        mkRows(initRowsN, () => ({ vpn: "", ppn: "", flags: "" })),
      tlbInitRows:
        s.tlbInitRows ??
        mkRows(initRowsN, () => ({
          set: "",
          way: "",
          tag: "",
          ppn: "",
          flags: "",
          lastUsed: "",
        })),
    };

    const mkLabel = (txt) => el("div", { class: "nav-tag", text: txt });

    const vaBits = el("input", { class: "search", value: state.vaBits, inputmode: "numeric" });
    const paBits = el("input", { class: "search", value: state.paBits, inputmode: "numeric" });
    const pageSize = el("input", { class: "search", value: state.pageSize, inputmode: "numeric" });

    const addresses = el("textarea", { class: "search", rows: "7" });
    addresses.value = state.addresses;
    addresses.style.fontFamily = "var(--mono)";
    addresses.style.whiteSpace = "pre";
    addresses.style.resize = "vertical";

    const mappings = el("textarea", { class: "search", rows: "8" });
    mappings.value = state.mappings;
    mappings.style.fontFamily = "var(--mono)";
    mappings.style.whiteSpace = "pre";
    mappings.style.resize = "vertical";

    const enableTLB = el("input", { type: "checkbox" });
    enableTLB.checked = !!state.enableTLB;

    const tlbEntries = el("input", { class: "search", value: state.tlbEntries, inputmode: "numeric" });
    const tlbAssoc = el("input", { class: "search", value: state.tlbAssoc, inputmode: "numeric" });

    const showBinary = el("input", { type: "checkbox" });
    showBinary.checked = !!state.showBinary;

    const showTlbState = el("input", { type: "checkbox" });
    showTlbState.checked = !!state.showTlbState;

    const initRowsNInput = el("input", { class: "search", value: state.initRowsN, inputmode: "numeric" });

    const btnExample = el("button", { class: "btn btn-ghost", text: "Insert example" });
    btnExample.addEventListener("click", () => {
      addresses.value =
        "0x00001004\n0x00001008\n0x00002000\n0x00003010\n0x00001004\n0x00002004";
      mappings.value =
        "# VPN  PPN  FLAGS(optional)\n0x1 0xA RWX\n0x2 0xB R--\n0x3 0xA RW-";

      // fill a few table rows as demo
      state.ptInitRows[0] = { vpn: "0x1", ppn: "0xA", flags: "RWX" };
      state.ptInitRows[1] = { vpn: "0x2", ppn: "0xB", flags: "R--" };
      state.ptInitRows[2] = { vpn: "0x3", ppn: "0xA", flags: "RW-" };

      // Example TLB seeding: set 0 ways 0/1
      state.tlbInitRows[0] = { set: "0", way: "0", tag: "0x1", ppn: "0xA", flags: "RWX", lastUsed: "10" };
      state.tlbInitRows[1] = { set: "0", way: "1", tag: "0x2", ppn: "0xB", flags: "R--", lastUsed: "9" };

      // rerender by persisting (tables read from state arrays)
      persist(true);
    });

    const btnClearInit = el("button", { class: "btn btn-ghost", text: "Clear init tables" });
    btnClearInit.addEventListener("click", () => {
      state.ptInitRows = mkRows(initRowsN, () => ({ vpn: "", ppn: "", flags: "" }));
      state.tlbInitRows = mkRows(initRowsN, () => ({ set: "", way: "", tag: "", ppn: "", flags: "", lastUsed: "" }));
      persist(true);
    });

    // --- NEW: table builders ---
    function mkInputCell(value, onInput, placeholder = "") {
      const inp = el("input", { class: "search", value: value ?? "", placeholder });
      inp.style.fontFamily = "var(--mono)";
      inp.addEventListener("input", () => onInput(inp.value));
      return inp;
    }

    function mkTable(headers, rows, rowRenderer) {
      const head = el(
        "div",
        {
          style:
            `display:grid; grid-template-columns: repeat(${headers.length}, 1fr); ` +
            "gap:8px; font-weight:600; color: var(--muted);",
        },
        headers.map(h => el("div", { text: h }))
      );

      const body = el("div", { style: "display:flex; flex-direction:column; gap:6px; margin-top:6px;" }, []);
      rows.forEach((r, i) => {
        const row = el(
          "div",
          { style: `display:grid; grid-template-columns: repeat(${headers.length}, 1fr); gap:8px;` },
          rowRenderer(r, i)
        );
        body.appendChild(row);
      });

      return el("div", { style: "margin-top:8px;" }, [head, body]);
    }

    // These arrays are mutated by the cell inputs
    let ptInitRows = state.ptInitRows;
    let tlbInitRows = state.tlbInitRows;

    const ptTable = mkTable(["VPN", "PPN", "FLAGS"], ptInitRows, (r, i) => [
      mkInputCell(r.vpn, v => { ptInitRows[i].vpn = v; persist(); }, "0x1"),
      mkInputCell(r.ppn, v => { ptInitRows[i].ppn = v; persist(); }, "0xA"),
      mkInputCell(r.flags, v => { ptInitRows[i].flags = v; persist(); }, "RWX"),
    ]);

    const tlbTable = mkTable(["SET", "WAY", "TAG", "PPN", "FLAGS", "lastUsed"], tlbInitRows, (r, i) => [
      mkInputCell(r.set, v => { tlbInitRows[i].set = v; persist(); }, "0"),
      mkInputCell(r.way, v => { tlbInitRows[i].way = v; persist(); }, "0"),
      mkInputCell(r.tag, v => { tlbInitRows[i].tag = v; persist(); }, "0x1"),
      mkInputCell(r.ppn, v => { tlbInitRows[i].ppn = v; persist(); }, "0xA"),
      mkInputCell(r.flags, v => { tlbInitRows[i].flags = v; persist(); }, "RWX"),
      mkInputCell(r.lastUsed, v => { tlbInitRows[i].lastUsed = v; persist(); }, "10"),
    ]);

    const form = el("div", {}, [
      mkLabel("VA bits (typisk 32)"),
      vaBits,
      mkLabel("PA bits (typisk 32)"),
      paBits,
      mkLabel("Page size (bytes, typisk 4096)"),
      pageSize,

      el("div", { style: "display:flex; gap:12px; margin-top:10px; align-items:center;" }, [
        el("label", { style: "display:flex; gap:8px; align-items:center; color: var(--muted);" }, [
          enableTLB,
          el("span", { text: "Enable TLB simulation (LRU)" }),
        ]),
        el("label", { style: "display:flex; gap:8px; align-items:center; color: var(--muted);" }, [
          showBinary,
          el("span", { text: "Show binary split" }),
        ]),
        el("label", { style: "display:flex; gap:8px; align-items:center; color: var(--muted);" }, [
          showTlbState,
          el("span", { text: "Show TLB tags (MRU→LRU)" }),
        ]),
      ]),

      mkLabel("TLB entries (power of two, e.g. 16/32)"),
      tlbEntries,
      mkLabel("TLB associativity (e.g. 1/2/4)"),
      tlbAssoc,

      el("div", { style: "display:flex; justify-content:space-between; align-items:center; margin-top:12px;" }, [
        mkLabel("Virtual addresses (hex, one per line)"),
        el("div", { style: "display:flex; gap:8px; align-items:center;" }, [
          btnExample,
          btnClearInit,
        ]),
      ]),
      addresses,

      mkLabel("Page table mappings (VPN→PPN, optional flags). Lines like: `0x1 0xA RWX`"),
      mappings,

      el("div", { style: "display:flex; gap:10px; align-items:center; margin-top:12px;" }, [
        mkLabel("Init table rows (12–16)"),
        initRowsNInput,
        el("div", { style: "color: var(--muted); font-size: 12px;" , text: "Changing this requires reload (stored in state). Use 12–16." }),
      ]),

      mkLabel("Initial Page Table entries (table overrides textarea if same VPN)"),
      ptTable,

      mkLabel("Initial TLB contents (explicit set/way/tag/ppn). Leave rows blank if unused."),
      tlbTable,
    ]);

    container.appendChild(form);
    ctx.setNotes?.(this.notesHtml);

    function persist(forceRerender = false) {
      // update state values
      ctx.setState({
        ...ctx.state,
        vaBits: vaBits.value,
        paBits: paBits.value,
        pageSize: pageSize.value,
        addresses: addresses.value,
        mappings: mappings.value,
        enableTLB: enableTLB.checked,
        tlbEntries: tlbEntries.value,
        tlbAssoc: tlbAssoc.value,
        showBinary: showBinary.checked,
        showTlbState: showTlbState.checked,
        initRowsN: initRowsNInput.value,
        ptInitRows: ptInitRows,
        tlbInitRows: tlbInitRows,
      });

      // Optional: if your framework supports rerender, trigger it.
      // If not, this is harmless. Many offline apps re-render on state change.
      if (forceRerender && typeof ctx.requestRender === "function") ctx.requestRender();
    }

    [vaBits, paBits, pageSize, addresses, mappings, tlbEntries, tlbAssoc, initRowsNInput].forEach(x =>
      x.addEventListener("input", () => persist(false))
    );
    [enableTLB, showBinary, showTlbState].forEach(x => x.addEventListener("change", () => persist(false)));
  },

  compute(ctx) {
    const s = ctx.state;

    const vaBits = parseIntStrict(s.vaBits ?? "32", "vaBits");
    const paBits = parseIntStrict(s.paBits ?? "32", "paBits");
    const pageSize = parseIntStrict(s.pageSize ?? "4096", "pageSize");

    if (vaBits <= 0 || vaBits > 64) throw new Error("vaBits must be between 1 and 64.");
    if (paBits <= 0 || paBits > 64) throw new Error("paBits must be between 1 and 64.");
    if (!isPowerOfTwo(pageSize)) throw new Error("pageSize must be a power of two.");

    const offsetBits = log2IntPow2(pageSize);
    const vpnBits = vaBits - offsetBits;
    if (vpnBits <= 0) throw new Error("Invalid split: vpnBits <= 0 (pageSize too large for VA).");

    const enableTLB = !!s.enableTLB;
    const showBinary = !!s.showBinary;
    const showTlbState = !!s.showTlbState;

    const addrLines = (s.addresses ?? "")
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(x => x.length > 0);

    if (addrLines.length === 0) throw new Error("Provide at least one virtual address.");

    const addrs = addrLines.map(parseHexToBigInt).map(a => clampBigIntToBits(a, vaBits));

    // Page table from textarea + init table rows
    const pageTable = parseMappings(s.mappings ?? "");
    applyPtInitRows(pageTable, s.ptInitRows ?? []);

    // --- TLB parameters (optional) ---
    let tlbSets = null;
    let tlbIndexBits = 0;
    let tlbTagBits = 0;
    let tlbAssoc = 1;
    let tlbEntries = 0;

    if (enableTLB) {
      tlbEntries = parseIntStrict(s.tlbEntries ?? "16", "tlbEntries");
      tlbAssoc = parseIntStrict(s.tlbAssoc ?? "4", "tlbAssoc");
      if (tlbEntries <= 0) throw new Error("tlbEntries must be > 0");
      if (tlbAssoc <= 0) throw new Error("tlbAssoc must be > 0");
      if (tlbEntries % tlbAssoc !== 0) throw new Error("TLB entries must be divisible by associativity");

      const numSets = tlbEntries / tlbAssoc;
      if (!isPowerOfTwo(numSets)) throw new Error("TLB number of sets must be a power of two");
      tlbIndexBits = numSets === 1 ? 0 : log2IntPow2(numSets);
      tlbTagBits = vpnBits - tlbIndexBits;
      if (tlbTagBits < 0) throw new Error("Invalid TLB split: tlbTagBits < 0");

      tlbSets = initTLB(numSets, tlbAssoc);

      // NEW: apply initial TLB contents from table
      applyTlbInitRows(tlbSets, s.tlbInitRows ?? [], 0);
    }

    // --- simulate ---
    let time = 0;
    let tlbHits = 0;
    let tlbMisses = 0;
    let ptHits = 0;
    let ptMisses = 0;

    const outLines = [];
    const vaNibbles = Math.ceil(vaBits / 4);
    const paNibbles = Math.ceil(paBits / 4);

    for (let i = 0; i < addrs.length; i++) {
      time++;
      const va = addrs[i];

      const offset = va & maskBits(offsetBits);
      const vpn = va >> BigInt(offsetBits);

      // TLB lookup (if enabled)
      let tlbHit = false;
      let tlbSetIdx = 0;
      let tlbTag = 0n;
      let ppn = null;
      let flags = "";

      if (enableTLB) {
        const idx = tlbIndexBits === 0 ? 0n : vpn & maskBits(tlbIndexBits); // low bits of VPN
        tlbSetIdx = Number(idx);
        tlbTag = vpn >> BigInt(tlbIndexBits); // remaining high bits

        const setLines = tlbSets[tlbSetIdx];
        let hitWay = -1;
        for (let w = 0; w < setLines.length; w++) {
          const ln = setLines[w];
          if (ln.valid && ln.tag === tlbTag) { hitWay = w; break; }
        }

        if (hitWay !== -1) {
          tlbHit = true;
          tlbHits++;
          const ln = setLines[hitWay];
          ln.lastUsed = time;
          ppn = ln.ppn;
          flags = ln.flags || "";
        } else {
          tlbMisses++;
        }
      }

      // Page table lookup if TLB miss or disabled
      if (!tlbHit) {
        const entry = pageTable.get(vpn);
        if (!entry) {
          ptMisses++;
        } else {
          ptHits++;
          ppn = entry.ppn;
          flags = entry.flags || "";

          // Fill TLB on miss
          if (enableTLB) {
            const setLines = tlbSets[tlbSetIdx];
            const victim = pickVictimLRU(setLines);
            setLines[victim].valid = true;
            setLines[victim].tag = tlbTag;
            setLines[victim].ppn = ppn;
            setLines[victim].flags = flags;
            setLines[victim].lastUsed = time;
          }
        }
      }

      // Compute PA if we have a ppn
      let paStr = "— (page fault / unmapped)";
      if (ppn != null) {
        const pa = (ppn << BigInt(offsetBits)) | offset;
        const paClamped = clampBigIntToBits(pa, paBits);
        paStr = toHex(paClamped, paNibbles);
      }

      const vaStr = toHex(va, vaNibbles);
      const vpnStr = toHex(vpn);
      const offStr = offset.toString(10);

      // Print per access
      const parts = [];
      parts.push(`${String(i + 1).padStart(2, " ")}.`);
      parts.push(`VA=${vaStr}`);
      parts.push(`VPN=${vpnStr}`);
      parts.push(`off=${offStr}`);

      if (enableTLB) {
        const idxStr = tlbIndexBits === 0 ? "0" : (vpn & maskBits(tlbIndexBits)).toString(10);
        parts.push(`TLBidx=${idxStr}`);
        parts.push(`TLBtag=${toHex(tlbTag)}`);
        parts.push(tlbHit ? "TLB=HIT" : "TLB=MISS");
      }

      parts.push(`PPN=${ppn == null ? "—" : toHex(ppn)}`);
      if (flags) parts.push(`flags=${flags}`);
      parts.push(`PA=${paStr}`);

      outLines.push(parts.join("  "));

      if (showBinary) {
        const binVA = toBin(va, vaBits);
        const vpnBin = binVA.slice(0, vpnBits);
        const offBin = binVA.slice(vpnBits);
        outLines.push(`    VA bin: ${vpnBin} | ${offBin}`);
        if (enableTLB && tlbIndexBits > 0) {
          const vpnBinFull = toBin(vpn, vpnBits);
          const tlbTagBin = vpnBinFull.slice(0, tlbTagBits);
          const tlbIdxBin = vpnBinFull.slice(tlbTagBits);
          outLines.push(`    VPN bin: ${tlbTagBin} | ${tlbIdxBin}  (TLBtag | TLBidx)`);
        }
      }

      if (enableTLB && showTlbState) {
        const setLines = tlbSets[tlbSetIdx];
        outLines.push(`    TLB set[${tlbSetIdx}] tags (MRU→LRU): ${fmtTlbTagsMRU(setLines) || "—"}`);
      }
    }

    // Summary header
    const out = [];
    out.push("VIRTUAL MEMORY: VA → PA (+ optional TLB)");
    out.push("");
    out.push("Parameters:");
    out.push(`- VA bits: ${vaBits}`);
    out.push(`- PA bits: ${paBits}`);
    out.push(`- pageSize: ${pageSize} B`);
    out.push(`- offsetBits = log2(pageSize) = log2(${pageSize}) = ${offsetBits}`);
    out.push(`- VPN bits = VA bits - offsetBits = ${vaBits} - ${offsetBits} = ${vpnBits}`);

    if (enableTLB) {
      const numSets = tlbEntries / tlbAssoc;
      out.push("");
      out.push("TLB:");
      out.push(`- entries: ${tlbEntries}`);
      out.push(`- associativity: ${tlbAssoc}-way`);
      out.push(`- sets = entries/assoc = ${tlbEntries}/${tlbAssoc} = ${numSets}`);
      out.push(`- TLB index bits = log2(sets) = ${tlbIndexBits}`);
      out.push(`- TLB tag bits   = VPN bits - index bits = ${vpnBits} - ${tlbIndexBits} = ${tlbTagBits}`);
    }

    out.push("");
    out.push("Accesses:");
    out.push(...outLines);

    out.push("");
    out.push("Summary:");
    if (enableTLB) {
      const total = tlbHits + tlbMisses;
      out.push(`- TLB hits:   ${tlbHits}`);
      out.push(`- TLB misses: ${tlbMisses}`);
      out.push(`- TLB hit rate: ${total ? ((tlbHits / total) * 100).toFixed(2) : "0.00"}%`);
    }
    out.push(`- Page table hits (mapped VPN):   ${ptHits}`);
    out.push(`- Page table misses (unmapped):   ${ptMisses}`);

    return out.join("\n");
  },
};
