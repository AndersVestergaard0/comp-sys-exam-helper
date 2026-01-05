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

function parseAddresses(text) {
    const lines = (text ?? "")
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0);

    return lines.map(l => parseHexToBigInt(l));
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

function initCache(numSets, assoc) {
    const sets = [];
    for (let s = 0; s < numSets; s++) {
        const lines = [];
        for (let w = 0; w < assoc; w++) {
            lines.push({
                valid: false,
                tag: 0n,
                lastUsed: 0,
            });
        }
        sets.push(lines);
    }
    return sets;
}

export default {
    id: "cache",
    title: "Cache: Address breakdown + hit/miss (LRU)",
    area: "Machine Arch",
    tags: ["cache", "tag", "index", "offset", "LRU", "direct-mapped"],

    notesHtml: `
    <p><b>Formler</b></p>
    <ul>
      <li>blocks = cacheSize / blockSize</li>
      <li>sets = blocks / associativity</li>
      <li>offsetBits = log2(blockSize)</li>
      <li>indexBits = log2(sets)</li>
      <li>tagBits = addrBits - offsetBits - indexBits</li>
    </ul>
    <p><b>Hit/miss</b>: Samme <i>index</i> → samme set. Hit hvis en line i set har samme <i>tag</i>.</p>
    <p><b>LRU</b>: ved miss evict den line, der blev brugt for længst tid siden.</p>
  `,

    render(container, ctx) {
        const s = ctx.state;

        const state = {
            addrBits: s.addrBits ?? "32",
            cacheSize: s.cacheSize ?? "1024",
            blockSize: s.blockSize ?? "16",
            assoc: s.assoc ?? "1",
            addresses: s.addresses ?? "0x00000000\n0x00000004\n0x00000010\n0x00000000",
            showBinary: s.showBinary ?? true,
            showSetState: s.showSetState ?? false,
            showMasks: s.showMasks ?? false,
        };

        const mkLabel = (txt) => el("div", { class: "nav-tag", text: txt });

        const addrBits = el("input", { class: "search", value: state.addrBits, inputmode: "numeric" });
        const cacheSize = el("input", { class: "search", value: state.cacheSize, inputmode: "numeric" });
        const blockSize = el("input", { class: "search", value: state.blockSize, inputmode: "numeric" });
        const assoc = el("input", { class: "search", value: state.assoc, inputmode: "numeric" });

        const addresses = el("textarea", {
            class: "search",
            rows: "8",
            placeholder: "One hex address per line (e.g. 0x00400010)",
        });
        addresses.value = state.addresses;
        addresses.style.fontFamily = "var(--mono)";
        addresses.style.whiteSpace = "pre";
        addresses.style.resize = "vertical";

        const showBinary = el("input", { type: "checkbox" });
        showBinary.checked = !!state.showBinary;

        const showSetState = el("input", { type: "checkbox" });
        showSetState.checked = !!state.showSetState;

        const showMasks = el("input", { type: "checkbox" });
        showMasks.checked = !!state.showMasks

        const btnExample = el("button", { class: "btn btn-ghost", text: "Insert example" });
        btnExample.addEventListener("click", () => {
            addresses.value =
                "0x00000000\n0x00000004\n0x00000010\n0x00000020\n0x00000000\n0x00000030\n0x00000010";
            persist();
        });

        const form = el("div", {}, [
            mkLabel("Address bits (typisk 32)"),
            addrBits,
            mkLabel("Cache size (bytes)"),
            cacheSize,
            mkLabel("Block size (bytes)"),
            blockSize,
            mkLabel("Associativity (1 = direct-mapped)"),
            assoc,

            el("div", { style: "display:flex; gap:12px; margin-top:10px; align-items:center;" }, [
                el("label", { style: "display:flex; gap:8px; align-items:center; color: var(--muted);" }, [
                    showBinary,
                    el("span", { text: "Show binary breakdown" }),
                ]),
                el("label", { style: "display:flex; gap:8px; align-items:center; color: var(--muted);" }, [
                    showSetState,
                    el("span", { text: "Show set state after each access" }),
                ]),
                el("label", { style: "display:flex; gap:8px; align-items:center; color: var(--muted);" }, [
                    showMasks,
                    el("span", { text: "Show tag/index/offset masks" }),
                ]),
            ]),

            el("div", { style: "display:flex; justify-content:space-between; align-items:center; margin-top:12px;" }, [
                mkLabel("Addresses (hex, one per line)"),
                btnExample,
            ]),
            addresses,
        ]);

        container.appendChild(form);
        ctx.setNotes?.(this.notesHtml);

        const persist = () => {
            ctx.setState({
                ...ctx.state,
                addrBits: addrBits.value,
                cacheSize: cacheSize.value,
                blockSize: blockSize.value,
                assoc: assoc.value,
                addresses: addresses.value,
                showBinary: showBinary.checked,
                showSetState: showSetState.checked,
                showMasks: showMasks.checked,
            });
        };

        [addrBits, cacheSize, blockSize, assoc, addresses].forEach(x =>
            x.addEventListener("input", persist)
        );
        [showBinary, showSetState, showMasks].forEach(x => x.addEventListener("change", persist));
    },

    compute(ctx) {
        const s = ctx.state;

        const addrBits = parseIntStrict(s.addrBits ?? "32", "addrBits");
        const cacheSize = parseIntStrict(s.cacheSize ?? "1024", "cacheSize");
        const blockSize = parseIntStrict(s.blockSize ?? "16", "blockSize");
        const assoc = parseIntStrict(s.assoc ?? "1", "associativity");
        const showBinary = !!s.showBinary;
        const showSetState = !!s.showSetState;
        const showMasks = !!s.showMasks;

        if (addrBits <= 0 || addrBits > 64) throw new Error("addrBits must be between 1 and 64.");
        if (cacheSize <= 0) throw new Error("cacheSize must be > 0");
        if (blockSize <= 0) throw new Error("blockSize must be > 0");
        if (assoc <= 0) throw new Error("associativity must be > 0");

        if (!isPowerOfTwo(blockSize)) throw new Error("blockSize must be a power of two");
        if (cacheSize % blockSize !== 0) throw new Error("cacheSize must be divisible by blockSize");

        const numBlocks = cacheSize / blockSize;
        if (numBlocks % assoc !== 0) throw new Error("blocks must be divisible by associativity");
        const numSets = numBlocks / assoc;

        if (!isPowerOfTwo(numSets)) {
            throw new Error(`Number of sets (${numSets}) is not a power of two. Check your parameters.`);
        }

        const offsetBits = log2IntPow2(blockSize);
        const indexBits = numSets === 1 ? 0 : log2IntPow2(numSets);
        const tagBits = addrBits - offsetBits - indexBits;
        if (tagBits < 0) throw new Error("Invalid bit split: tagBits became negative.");

        const addrs = parseAddresses(s.addresses ?? "");
        if (addrs.length === 0) throw new Error("Provide at least one address.");

        const clampedAddrs = addrs.map(a => clampBigIntToBits(a, addrBits));

        const sets = initCache(numSets, assoc);
        let time = 0, hits = 0, misses = 0;
        const lines = [];
        const nibbles = Math.ceil(addrBits / 4);

        function fmtSetStateLRU(setIdx) {
            const setLines = sets[setIdx];
          
            // Only valid lines
            const valid = setLines.filter(ln => ln.valid);
          
            // Sort by recency: MRU first (largest lastUsed)
            valid.sort((a, b) => b.lastUsed - a.lastUsed);
          
            // Return tags as "0x10,0x110" etc.
            return valid.map(ln => toHex(ln.tag)).join(", ");
          }
          

        for (let i = 0; i < clampedAddrs.length; i++) {
            time++;

            const a = clampedAddrs[i];
            const offset = a & maskBits(offsetBits);
            const index = indexBits === 0 ? 0n : (a >> BigInt(offsetBits)) & maskBits(indexBits);
            const tag = a >> BigInt(offsetBits + indexBits);

            const setIdx = Number(index);
            const setLines = sets[setIdx];

            let hitWay = -1;
            for (let w = 0; w < setLines.length; w++) {
                const ln = setLines[w];
                if (ln.valid && ln.tag === tag) { hitWay = w; break; }
            }

            let result, evicted = "—";
            if (hitWay !== -1) {
                hits++;
                result = "HIT";
                setLines[hitWay].lastUsed = time;
            } else {
                misses++;
                result = "MISS";
                const victim = pickVictimLRU(setLines);
                if (setLines[victim].valid) evicted = toHex(setLines[victim].tag);
                setLines[victim].valid = true;
                setLines[victim].tag = tag;
                setLines[victim].lastUsed = time;
                hitWay = victim;
            }

            const addrHex = toHex(a, nibbles);
            const tagHex = toHex(tag);
            const indexDec = indexBits === 0 ? "0" : index.toString(10);
            const offsetDec = offset.toString(10);

            lines.push(
                `${String(i + 1).padStart(2, " ")}.  addr=${addrHex}  tag=${tagHex}  index=${indexDec}  offset=${offsetDec}  ${result} (set=${setIdx}, way=${hitWay}${result === "MISS" ? `, evict=${evicted}` : ""})`
            );

            if (showBinary) {
                const bin = toBin(a, addrBits);
                const t = tagBits > 0 ? bin.slice(0, tagBits) : "";
                const ix = indexBits > 0 ? bin.slice(tagBits, tagBits + indexBits) : "";
                const off = offsetBits > 0 ? bin.slice(tagBits + indexBits) : "";
                lines.push(`    bin: ${t}${indexBits ? " | " : ""}${ix}${(indexBits || tagBits) ? " | " : ""}${off}`);
            }

            if (showSetState) {
                lines.push(`    tags (MRU→LRU) in set[${setIdx}] => ${fmtSetStateLRU(setIdx)}`);
              }
              
            // if (showMasks) {
            //     const tagMask = maskBits(tagBits) << BigInt(indexBits + offsetBits);
            //     const indexMask = maskBits(indexBits) << BigInt(offsetBits);
            //     const offsetMask = maskBits(offsetBits);
            //     lines.push(`    masks: tag=${toHex(tagMask, nibbles)}  index=${toHex(indexMask, nibbles)}  offset=${toHex(offsetMask, nibbles)}`);
            // }

        }

        const total = hits + misses;
        const hitRate = total === 0 ? 0 : (hits / total) * 100;

        const out = [];
        out.push("CACHE ADDRESS BREAKDOWN + HIT/MISS (LRU)");
        out.push("");
        out.push("Parameters:");
        out.push(`- addrBits: ${addrBits}`);
        out.push(`- cacheSize: ${cacheSize} B`);
        out.push(`- blockSize: ${blockSize} B`);
        out.push(`- associativity: ${assoc}-way`);
        out.push(`- replacement: LRU`);
        out.push("");
        out.push("Derived:");
        out.push(`- blocks = cacheSize / blockSize = ${cacheSize} / ${blockSize} = ${numBlocks}`);
        out.push(`- sets = blocks / assoc = ${numBlocks} / ${assoc} = ${numSets}`);
        out.push(`- offsetBits = log2(blockSize) = log2(${blockSize}) = ${offsetBits}`);
        out.push(`- indexBits  = log2(sets) = log2(${numSets}) = ${indexBits}`);
        out.push(`- tagBits    = addrBits - offsetBits - indexBits = ${addrBits} - ${offsetBits} - ${indexBits} = ${tagBits}`);
        out.push("");
        out.push("Accesses:");
        out.push(...lines);
        out.push("");
        out.push("Summary:");
        out.push(`- hits:   ${hits}`);
        out.push(`- misses: ${misses}`);
        out.push(`- hit rate: ${hitRate.toFixed(2)}%`);
        if(showMasks) {
            out.push("");
            out.push("Masks:");
            const tagMask = maskBits(tagBits) << BigInt(indexBits + offsetBits);
            const indexMask = maskBits(indexBits) << BigInt(offsetBits);
            const offsetMask = maskBits(offsetBits);
            out.push(`- tag mask:    ${toHex(tagMask, nibbles)}`);
            out.push(`- index mask:  ${toHex(indexMask, nibbles)}`);
            out.push(`- offset mask: ${toHex(offsetMask, nibbles)}`);
        }

        return out.join("\n");
    },
};
