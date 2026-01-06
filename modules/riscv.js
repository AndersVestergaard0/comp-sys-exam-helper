import { el } from "../lib/utils.js";

/**
 * RISC-V to C Compiler
 * Converts RISC-V assembly instructions to equivalent C code
 */

// RISC-V register names
const REGISTERS = {
    'x0': '0', 'zero': '0',
    'x1': 't0', 'ra': 't0',
    'x2': 'sp', 'x3': 'gp', 'x4': 'tp',
    'x5': 't1', 'x6': 't2', 'x7': 't3',
    'x8': 's0', 'fp': 's0',
    'x9': 's1', 'x10': 'a0', 'x11': 'a1',
    'x12': 'a2', 'x13': 'a3', 'x14': 'a4', 'x15': 'a5',
    'x16': 'a6', 'x17': 'a7',
    'x18': 's2', 'x19': 's3', 'x20': 's4', 'x21': 's5',
    'x22': 's6', 'x23': 's7', 'x24': 's8', 'x25': 's9',
    'x26': 's10', 'x27': 's11',
    'x28': 't3', 'x29': 't4', 'x30': 't5', 'x31': 't6',
};

// Map register to C variable name
function regToC(reg) {
    const r = reg.toLowerCase().trim();
    if (REGISTERS[r] !== undefined) {
        return REGISTERS[r] === '0' ? '0' : REGISTERS[r];
    }
    // Handle numeric registers like x5, x10
    const numMatch = r.match(/^x?(\d+)$/);
    if (numMatch) {
        const num = parseInt(numMatch[1]);
        if (num === 0) return '0';
        if (num >= 1 && num <= 31) {
            // Use ABI names for common registers
            if (num === 1) return 't0';
            if (num === 2) return 'sp';
            if (num >= 5 && num <= 7) return `t${num - 4}`;
            if (num === 8) return 's0';
            if (num === 9) return 's1';
            if (num >= 10 && num <= 17) return `a${num - 10}`;
            if (num >= 18 && num <= 27) return `s${num - 16}`;
            return `r${num}`;
        }
    }
    return reg; // fallback
}

// Parse immediate value (supports hex, decimal, binary)
function parseImmediate(imm) {
    const s = imm.trim();
    if (s.startsWith('0x') || s.startsWith('0X')) {
        return parseInt(s, 16);
    }
    if (s.startsWith('0b') || s.startsWith('0B')) {
        return parseInt(s.slice(2), 2);
    }
    const num = parseInt(s, 10);
    if (isNaN(num)) throw new Error(`Invalid immediate: ${imm}`);
    return num;
}

// Parse instruction line
function parseInstruction(line) {
    // Remove comments
    const commentIdx = line.indexOf('#');
    if (commentIdx !== -1) {
        line = line.substring(0, commentIdx);
    }
    
    line = line.trim();
    if (!line) return null;
    
    // Split into parts
    const parts = line.split(/[\s,]+/).filter(p => p.length > 0);
    if (parts.length === 0) return null;
    
    const mnemonic = parts[0].toLowerCase();
    const operands = parts.slice(1);
    
    return { mnemonic, operands, original: line };
}

// Convert RISC-V instruction to C
function riscvToC(mnemonic, operands, labels = new Map()) {
    const op = mnemonic.toLowerCase();
    
    // Arithmetic/Logical R-type
    if (['add', 'sub', 'sll', 'slt', 'sltu', 'xor', 'srl', 'sra', 'or', 'and'].includes(op)) {
        if (operands.length !== 3) throw new Error(`${op} requires 3 operands`);
        const rd = regToC(operands[0]);
        const rs1 = regToC(operands[1]);
        const rs2 = regToC(operands[2]);
        
        const ops = {
            'add': '+', 'sub': '-', 'sll': '<<', 'slt': '<', 'sltu': '<',
            'xor': '^', 'srl': '>>', 'sra': '>>', 'or': '|', 'and': '&'
        };
        
        if (op === 'slt') {
            return `${rd} = (${rs1} < ${rs2}) ? 1 : 0;`;
        }
        if (op === 'sltu') {
            return `${rd} = ((unsigned)${rs1} < (unsigned)${rs2}) ? 1 : 0;`;
        }
        if (op === 'sra') {
            return `${rd} = ${rs1} >> ${rs2};  // arithmetic shift`;
        }
        if (op === 'srl') {
            return `${rd} = (unsigned)${rs1} >> ${rs2};  // logical shift`;
        }
        
        return `${rd} = ${rs1} ${ops[op]} ${rs2};`;
    }
    
    // Arithmetic/Logical I-type
    if (['addi', 'slti', 'sltiu', 'xori', 'ori', 'andi', 'slli', 'srli', 'srai'].includes(op)) {
        if (operands.length !== 3) throw new Error(`${op} requires 3 operands`);
        const rd = regToC(operands[0]);
        const rs1 = regToC(operands[1]);
        const imm = parseImmediate(operands[2]);
        
        if (op === 'addi') {
            return `${rd} = ${rs1} + ${imm};`;
        }
        if (op === 'slti') {
            return `${rd} = (${rs1} < ${imm}) ? 1 : 0;`;
        }
        if (op === 'sltiu') {
            return `${rd} = ((unsigned)${rs1} < (unsigned)${imm}) ? 1 : 0;`;
        }
        if (op === 'xori') {
            return `${rd} = ${rs1} ^ ${imm};`;
        }
        if (op === 'ori') {
            return `${rd} = ${rs1} | ${imm};`;
        }
        if (op === 'andi') {
            return `${rd} = ${rs1} & ${imm};`;
        }
        if (op === 'slli') {
            return `${rd} = ${rs1} << ${imm};`;
        }
        if (op === 'srli') {
            return `${rd} = (unsigned)${rs1} >> ${imm};`;
        }
        if (op === 'srai') {
            return `${rd} = ${rs1} >> ${imm};  // arithmetic shift`;
        }
    }
    
    // Load instructions
    if (['lb', 'lh', 'lw', 'lbu', 'lhu'].includes(op)) {
        if (operands.length !== 2) throw new Error(`${op} requires 2 operands`);
        const rd = regToC(operands[0]);
        // Handle offset(base) format or just base
        let offset = 0;
        let base;
        const mem = operands[1].match(/^([+-]?\d+)\((.+)\)$/);
        if (mem) {
            offset = parseInt(mem[1]);
            base = regToC(mem[2]);
        } else {
            // Assume it's just a register (offset = 0)
            base = regToC(operands[1]);
        }
        
        const types = {
            'lb': 'char', 'lh': 'short', 'lw': 'int',
            'lbu': 'unsigned char', 'lhu': 'unsigned short'
        };
        const offsetStr = offset === 0 ? '' : ` + ${offset}`;
        return `${rd} = *(${types[op]}*)(${base}${offsetStr});`;
    }
    
    // Store instructions
    if (['sb', 'sh', 'sw'].includes(op)) {
        if (operands.length !== 2) throw new Error(`${op} requires 2 operands`);
        const rs2 = regToC(operands[0]);
        // Handle offset(base) format or just base
        let offset = 0;
        let base;
        const mem = operands[1].match(/^([+-]?\d+)\((.+)\)$/);
        if (mem) {
            offset = parseInt(mem[1]);
            base = regToC(mem[2]);
        } else {
            // Assume it's just a register (offset = 0)
            base = regToC(operands[1]);
        }
        
        const types = {
            'sb': 'char', 'sh': 'short', 'sw': 'int'
        };
        const offsetStr = offset === 0 ? '' : ` + ${offset}`;
        return `*(${types[op]}*)(${base}${offsetStr}) = ${rs2};`;
    }
    
    // Branch instructions
    if (['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu', 'bgt', 'ble', 'bgtu', 'bleu'].includes(op)) {
        if (operands.length !== 3) throw new Error(`${op} requires 3 operands`);
        let rs1 = regToC(operands[0]);
        let rs2 = regToC(operands[1]);
        const label = operands[2];
        
        // Handle pseudo-instructions by swapping operands
        if (op === 'bgt') {
            // bgt rs1, rs2, label == blt rs2, rs1, label
            [rs1, rs2] = [rs2, rs1];
            op = 'blt';
        } else if (op === 'ble') {
            // ble rs1, rs2, label == bge rs2, rs1, label
            [rs1, rs2] = [rs2, rs1];
            op = 'bge';
        } else if (op === 'bgtu') {
            // bgtu rs1, rs2, label == bltu rs2, rs1, label
            [rs1, rs2] = [rs2, rs1];
            op = 'bltu';
        } else if (op === 'bleu') {
            // bleu rs1, rs2, label == bgeu rs2, rs1, label
            [rs1, rs2] = [rs2, rs1];
            op = 'bgeu';
        }
        
        const conds = {
            'beq': '==', 'bne': '!=', 'blt': '<',
            'bge': '>=', 'bltu': '<', 'bgeu': '>='
        };
        
        let cond;
        if (op === 'bltu' || op === 'bgeu') {
            cond = `((unsigned)${rs1} ${conds[op]} (unsigned)${rs2})`;
        } else {
            cond = `(${rs1} ${conds[op]} ${rs2})`;
        }
        
        return `if (${cond}) goto ${label};`;
    }
    
    // Jump instructions
    if (op === 'jal') {
        if (operands.length === 1) {
            // jal label (rd defaults to ra/x1)
            const label = operands[0];
            return `t0 = pc + 4; goto ${label};  // jal pseudo: save return address`;
        }
        if (operands.length === 2) {
            const rd = regToC(operands[0]);
            const label = operands[1];
            if (rd === '0') {
                return `goto ${label};  // jal with x0 (no return address)`;
            }
            return `${rd} = pc + 4; goto ${label};  // jal: save return address`;
        }
        throw new Error('jal requires 1 or 2 operands');
    }
    
    if (op === 'jalr') {
        if (operands.length === 1) {
            // jalr rs1 (rd defaults to ra/x1, offset defaults to 0)
            const rs1 = regToC(operands[0]);
            return `t0 = pc + 4; pc = ${rs1}; /* jalr: indirect jump - target in ${rs1} */`;
        }
        if (operands.length === 2) {
            // jalr rd, offset(rs1) or jalr rd, rs1
            const rd = regToC(operands[0]);
            const mem = operands[1].match(/^([+-]?\d+)\((.+)\)$/);
            if (mem) {
                const offset = parseInt(mem[1]);
                const rs1 = regToC(mem[2]);
                const offsetStr = offset === 0 ? '' : offset > 0 ? ` + ${offset}` : ` - ${Math.abs(offset)}`;
                if (rd === '0') {
                    return `pc = ${rs1}${offsetStr}; /* jalr with x0: jump to address in ${rs1}${offsetStr} */`;
                }
                return `${rd} = pc + 4; pc = ${rs1}${offsetStr}; /* jalr: save return addr, jump to ${rs1}${offsetStr} */`;
            }
            // Assume it's jalr rd, rs1 (offset = 0)
            const rs1 = regToC(operands[1]);
            if (rd === '0') {
                return `pc = ${rs1}; /* jalr with x0: jump to address in ${rs1} */`;
            }
            return `${rd} = pc + 4; pc = ${rs1}; /* jalr: save return addr, jump to ${rs1} */`;
        }
        if (operands.length === 3) {
            const rd = regToC(operands[0]);
            const offset = parseImmediate(operands[1]);
            const rs1 = regToC(operands[2]);
            const offsetStr = offset === 0 ? '' : offset > 0 ? ` + ${offset}` : ` - ${Math.abs(offset)}`;
            if (rd === '0') {
                return `pc = ${rs1}${offsetStr}; /* jalr with x0: jump to address in ${rs1}${offsetStr} */`;
            }
            return `${rd} = pc + 4; pc = ${rs1}${offsetStr}; /* jalr: save return addr, jump to ${rs1}${offsetStr} */`;
        }
        throw new Error('jalr requires 1, 2, or 3 operands');
    }
    
    // Pseudo-instructions
    if (op === 'j' || op === 'jr') {
        if (operands.length === 1) {
            const target = operands[0];
            // Check if it's a register (jr) or label (j)
            // If it's in labels map, it's a label; otherwise check if it looks like a register
            if (labels.has(target)) {
                return `goto ${labels.get(target)};  // j: unconditional jump to ${target}`;
            }
            // Try to see if it's a register name
            const regTest = regToC(target);
            // Special case: jr ra should be a return
            if (target.toLowerCase() === 'ra' || regTest === 't0') {
                return `return;  // jr ra: return from function`;
            }
            if (regTest !== target && regTest !== '0') {
                // It was recognized as a register
                return `pc = ${regTest}; /* jr: indirect jump - target in ${regTest} */`;
            }
            // Assume it's a label (will be resolved in second pass)
            return `goto ${target};  // j: unconditional jump`;
        }
        throw new Error(`${op} requires 1 operand`);
    }
    
    if (op === 'li') {
        // Load immediate pseudo-instruction
        if (operands.length !== 2) throw new Error('li requires 2 operands');
        const rd = regToC(operands[0]);
        const imm = parseImmediate(operands[1]);
        return `${rd} = ${imm};  // li: load immediate`;
    }
    
    if (op === 'mv' || op === 'move') {
        // Move pseudo-instruction (addi rd, rs, 0)
        if (operands.length !== 2) throw new Error(`${op} requires 2 operands`);
        const rd = regToC(operands[0]);
        const rs = regToC(operands[1]);
        return `${rd} = ${rs};  // mv: move register`;
    }
    
    // LUI (load upper immediate)
    if (op === 'lui') {
        if (operands.length !== 2) throw new Error('lui requires 2 operands');
        const rd = regToC(operands[0]);
        const imm = parseImmediate(operands[1]);
        return `${rd} = ${imm} << 12;`;
    }
    
    // AUIPC (add upper immediate to PC)
    if (op === 'auipc') {
        if (operands.length !== 2) throw new Error('auipc requires 2 operands');
        const rd = regToC(operands[0]);
        const imm = parseImmediate(operands[1]);
        return `${rd} = pc + (${imm} << 12);  // pc is program counter`;
    }
    
    // NOP
    if (op === 'nop') {
        return '// nop';
    }
    
    // Return
    if (op === 'ret') {
        return 'return;  // ret: return (jalr x0, 0(x1))';
    }
    
    // Call pseudo-instruction (jal ra, label)
    if (op === 'call') {
        if (operands.length !== 1) throw new Error('call requires 1 operand');
        const label = operands[0];
        return `t0 = pc + 4; goto ${label};  // call: save return address in ra (t0), jump to ${label}`;
    }
    
    // Tail pseudo-instruction (jal x0, label)
    if (op === 'tail') {
        if (operands.length !== 1) throw new Error('tail requires 1 operand');
        const label = operands[0];
        return `goto ${label};  // tail: tail call`;
    }
    
    // Unrecognized instruction
    throw new Error(`Unsupported instruction: ${op}`);
}

// Build instruction map with labels for control flow analysis
function buildInstructionMap(lines, labels) {
    const instructions = [];
    const labelToIndex = new Map(); // label name -> instruction index
    const indexToLabel = new Map(); // instruction index -> label name (if starts a block)
    
    let instIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        if (trimmed.endsWith(':')) {
            const label = trimmed.slice(0, -1).trim();
            if (label) {
                labelToIndex.set(label, instIndex);
                // Next instruction will be at this index
            }
            continue;
        }
        
        const inst = parseInstruction(line);
        if (inst) {
            instructions.push({ ...inst, lineNum: i, index: instIndex });
            instIndex++;
        }
    }
    
    return { instructions, labelToIndex };
}

// ---------- High-level cheat sheet generator (line-by-line explanation) ----------

function classifyInstrType(mnemonic) {
    const op = mnemonic.toLowerCase();
    if (['add', 'sub', 'sll', 'slt', 'sltu', 'xor', 'srl', 'sra', 'or', 'and'].includes(op)) return 'R-type (register)';
    if (['addi', 'slti', 'sltiu', 'xori', 'ori', 'andi', 'slli', 'srli', 'srai', 'jalr', 'lb', 'lh', 'lw', 'lbu', 'lhu'].includes(op)) return 'I-type (immediate)';
    if (['sb', 'sh', 'sw'].includes(op)) return 'S-type (store)';
    if (['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu', 'bgt', 'ble', 'bgtu', 'bleu'].includes(op)) return 'B-type (branch)';
    if (['jal'].includes(op)) return 'J-type (jump-and-link)';
    if (['lui', 'auipc'].includes(op)) return 'U-type (upper immediate)';
    if (['li', 'mv', 'j', 'jr', 'call', 'tail', 'ret', 'nop'].includes(op)) return 'Pseudo-instruction';
    return 'Other / pseudo';
}

function explainRegisters(operands) {
    const out = [];
    if (!operands || operands.length === 0) return out;

    const prettyReg = (r) => regToC(r);

    if (operands[0]) {
        out.push(`dest: ${operands[0]} (${prettyReg(operands[0])})`);
    }
    if (operands[1]) {
        out.push(`src1: ${operands[1]} (${prettyReg(operands[1])})`);
    }
    if (operands[2]) {
        out.push(`src2/immediate: ${operands[2]}`);
    }
    return out;
}

function explainInstruction(inst, lineNo) {
    const { mnemonic, operands, original } = inst;
    const op = mnemonic.toLowerCase();
    const lines = [];

    lines.push(`L${String(lineNo).padStart(2, "0")}: ${original}`);
    lines.push(`  Kind: ${classifyInstrType(op)}`);

    const rd = operands[0];
    const rs1 = operands[1];
    const rs2 = operands[2];

    const pr = (r) => regToC(r ?? '');

    // --- arithmetic / logic ---
    if (op === 'addi') {
        const imm = operands[2];
        lines.push(`  Meaning: ${rd} = ${rs1} + ${imm}  (add immediate)`);
        lines.push(`  Typical use: load small constants, pointer/index offset.`);
    } else if (op === 'add') {
        lines.push(`  Meaning: ${rd} = ${rs1} + ${rs2}  (integer addition)`);
        lines.push(`  Typical use: arithmetic on ints, address calculation.`);
    } else if (op === 'sub') {
        lines.push(`  Meaning: ${rd} = ${rs1} - ${rs2}  (integer subtraction)`);
    } else if (op === 'and' || op === 'andi') {
        const rhs = op === 'andi' ? operands[2] : rs2;
        lines.push(`  Meaning: ${rd} = ${rs1} & ${rhs}  (bitwise AND)`);
    } else if (op === 'or' || op === 'ori') {
        const rhs = op === 'ori' ? operands[2] : rs2;
        lines.push(`  Meaning: ${rd} = ${rs1} | ${rhs}  (bitwise OR)`);
    } else if (op === 'xor' || op === 'xori') {
        const rhs = op === 'xori' ? operands[2] : rs2;
        lines.push(`  Meaning: ${rd} = ${rs1} ^ ${rhs}  (bitwise XOR)`);
    } else if (op === 'sll' || op === 'slli') {
        const sh = op === 'slli' ? operands[2] : rs2;
        lines.push(`  Meaning: ${rd} = ${rs1} << ${sh}  (shift left logical)`);
    } else if (op === 'srl' || op === 'srli') {
        const sh = op === 'srli' ? operands[2] : rs2;
        lines.push(`  Meaning: ${rd} = (unsigned)${rs1} >> ${sh}  (shift right logical)`);
    } else if (op === 'sra' || op === 'srai') {
        const sh = op === 'srai' ? operands[2] : rs2;
        lines.push(`  Meaning: ${rd} = ${rs1} >> ${sh}  (shift right arithmetic, keeps sign)`);
    } else if (op === 'slt' || op === 'slti') {
        const rhs = op === 'slti' ? operands[2] : rs2;
        lines.push(`  Meaning: ${rd} = (${rs1} < ${rhs}) ? 1 : 0  (signed compare)`);
    } else if (op === 'sltu' || op === 'sltiu') {
        const rhs = op === 'sltiu' ? operands[2] : rs2;
        lines.push(`  Meaning: ${rd} = ((unsigned)${rs1} < (unsigned)${rhs}) ? 1 : 0  (unsigned compare)`);

    // --- memory ---
    } else if (['lb', 'lh', 'lw', 'lbu', 'lhu'].includes(op)) {
        // rd, offset(base)
        const mem = operands[1] || "";
        lines.push(`  Meaning: load ${op.toUpperCase()} from memory into ${rd}.`);
        lines.push(`  Address: ${mem}  (offset(base))`);
        lines.push(`  Typical use: read from stack, arrays, structs.`);
    } else if (['sb', 'sh', 'sw'].includes(op)) {
        const mem = operands[1] || "";
        lines.push(`  Meaning: store ${operands[0]} to memory as ${op.toUpperCase()}.`);
        lines.push(`  Address: ${mem}  (offset(base))`);
        lines.push(`  Typical use: write to stack, arrays, structs.`);

    // --- branches / jumps ---
    } else if (['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu', 'bgt', 'ble', 'bgtu', 'bleu'].includes(op)) {
        const label = operands[2];
        const condMap = {
            beq: `${rs1} == ${rs2}`,
            bne: `${rs1} != ${rs2}`,
            blt: `${rs1} < ${rs2}`,
            bge: `${rs1} >= ${rs2}`,
            bltu: `(unsigned)${rs1} < (unsigned)${rs2}`,
            bgeu: `(unsigned)${rs1} >= (unsigned)${rs2}`,
            bgt: `${rs1} > ${rs2}`,
            ble: `${rs1} <= ${rs2}`,
            bgtu: `(unsigned)${rs1} > (unsigned)${rs2}`,
            bleu: `(unsigned)${rs1} <= (unsigned)${rs2}`,
        };
        lines.push(`  Meaning: if (${condMap[op]}) goto ${label};`);
        lines.push(`  Typical use: if / while / for control flow.`);
    } else if (op === 'jal') {
        if (operands.length === 1) {
            const label = operands[0];
            lines.push(`  Meaning: jump to ${label} and store return address in ra (x1).`);
        } else if (operands.length === 2) {
            const rd = operands[0];
            const label = operands[1];
            lines.push(`  Meaning: ${rd} = return address; goto ${label}.`);
        }
        lines.push(`  Typical use: function calls, long jumps.`);
    } else if (op === 'jalr') {
        lines.push(`  Meaning: indirect jump via register (often used for returns / function pointers).`);
    } else if (op === 'j') {
        const label = operands[0];
        lines.push(`  Meaning: unconditional jump to ${label}.`);
        lines.push(`  Typical use: loop back-edge or skip over code (like 'goto').`);
    } else if (op === 'jr') {
        const target = operands[0];
        if (target?.toLowerCase() === 'ra') {
            lines.push(`  Meaning: return from function (jump to address in ra).`);
        } else {
            lines.push(`  Meaning: jump to address in ${target}.`);
        }

    // --- stack / frame setup ---
    } else if (op === 'lui') {
        lines.push(`  Meaning: ${rd} = imm << 12  (load upper 20 bits).`);
        lines.push(`  Typical use: build 32-bit/64-bit constants together with ADDI.`);
    } else if (op === 'auipc') {
        lines.push(`  Meaning: ${rd} = pc + (imm << 12).`);
        lines.push(`  Typical use: position-independent addresses (PC-relative).`);

    // --- pseudo ---
    } else if (op === 'li') {
        const imm = operands[1];
        lines.push(`  Meaning: ${rd} = ${imm}  (load immediate, pseudo).`);
    } else if (op === 'mv') {
        lines.push(`  Meaning: ${rd} = ${rs1}  (move register, pseudo for addi rd, rs1, 0).`);
    } else if (op === 'nop') {
        lines.push(`  Meaning: no operation (usually encoded as addi x0, x0, 0).`);
    } else if (op === 'call') {
        const label = operands[0];
        lines.push(`  Meaning: call function ${label} (saves return address in ra).`);
        lines.push(`  Follows standard RISC-V calling convention (a0–a7 args, a0/a1 return).`);
    } else if (op === 'tail') {
        const label = operands[0];
        lines.push(`  Meaning: tail call to ${label} (no new frame, jump instead of call+ret).`);
    } else if (op === 'ret') {
        lines.push(`  Meaning: return from function (jump to address in ra).`);
    }

    // For labels / generic case, handled outside.

    const regInfo = explainRegisters(operands);
    if (regInfo.length) {
        lines.push(`  Registers:`);
        for (const r of regInfo) lines.push(`    - ${r}`);
    }

    return lines;
}

function analyzeRiscvToCheatsheet(assembly) {
    const rawLines = assembly.split(/\r?\n/);
    const out = [];

    out.push("RISC-V instruction cheat sheet");
    out.push("================================");
    out.push("");

    for (let i = 0; i < rawLines.length; i++) {
        const raw = rawLines[i];
        const trimmed = raw.trim();
        const lineNo = i + 1;

        if (!trimmed) continue;

        // Comment-only line
        if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
            out.push(`L${String(lineNo).padStart(2, "0")}: ${trimmed}`);
            out.push("  Comment line (ignored by assembler).");
            out.push("");
            continue;
        }

        // Label line
        if (trimmed.endsWith(":")) {
            const label = trimmed.slice(0, -1);
            out.push(`L${String(lineNo).padStart(2, "0")}: ${trimmed}`);
            out.push(`  Label '${label}' — jump target (e.g. for branches, calls, loops).`);
            out.push("");
            continue;
        }

        const inst = parseInstruction(raw);
        if (!inst) continue;

        const lines = explainInstruction(inst, lineNo);
        out.push(...lines);
        out.push("");
    }

    return out.join("\n");
}

// Main compiler function with control flow analysis (kept for reference, not used by compute)
function compileRiscvToC(assembly) {
    const lines = assembly.split(/\r?\n/);
    const cLines = [];
    const labels = new Map();
    let labelCounter = 0;
    
    // First pass: collect labels
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.endsWith(':')) {
            const label = trimmed.slice(0, -1).trim();
            if (label && !labels.has(label)) {
                // Use sanitized label name (replace dots with underscores for C compatibility)
                const sanitized = label.replace(/\./g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
                labels.set(label, sanitized || `label_${labelCounter++}`);
            }
        }
    }
    
    // Also collect label references from branch/jump instructions (forward references)
    for (const line of lines) {
        const inst = parseInstruction(line);
        if (!inst) continue;
        const op = inst.mnemonic.toLowerCase();
        if (['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu', 'bgt', 'ble', 'bgtu', 'bleu', 'jal', 'j', 'call', 'tail'].includes(op)) {
            // Last operand is typically a label
            if (inst.operands.length > 0) {
                const label = inst.operands[inst.operands.length - 1];
                if (label && !labels.has(label) && !label.match(/^[+-]?\d+$/) && !label.match(/\(/)) {
                    // It's likely a label reference
                    const sanitized = label.replace(/\./g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
                    labels.set(label, sanitized || `label_${labelCounter++}`);
                }
            }
        }
    }
    
    // Analyze control flow
    const cf = analyzeControlFlow(lines, labels);
    
    // Second pass: convert instructions with structured control flow
    cLines.push('#include <stdio.h>');
    cLines.push('');
    cLines.push('int main() {');
    cLines.push('    // Variable declarations');
    
    // Collect all registers used (after labels are collected)
    const usedRegs = new Set();
    const allLabels = new Set(labels.keys());
    
    // Helper to check if something is a register name
    function isRegisterName(name) {
        const lower = name.toLowerCase();
        // Check if it's a known register name
        if (REGISTERS[lower] !== undefined) return true;
        // Check if it matches x0-x31 pattern
        if (/^x?\d+$/.test(lower)) {
            const num = parseInt(lower.replace('x', ''));
            return num >= 0 && num <= 31;
        }
        // Check common ABI names
        const abiNames = ['zero', 'ra', 'sp', 'gp', 'tp', 'fp', 't0', 't1', 't2', 't3', 't4', 't5', 't6',
                          's0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
                          'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
        return abiNames.includes(lower);
    }
    
    for (const line of lines) {
        const inst = parseInstruction(line);
        if (!inst) continue;
        
        const mnemonic = inst.mnemonic.toLowerCase();
        const isBranchOrJump = ['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu', 'bgt', 'ble', 'bgtu', 'bleu', 
                               'jal', 'j', 'call', 'tail', 'jr'].includes(mnemonic);
        
        for (let i = 0; i < inst.operands.length; i++) {
            const op = inst.operands[i];
            const isLastOperand = i === inst.operands.length - 1;
            
            // Skip if it's a known label
            if (allLabels.has(op)) {
                continue;
            }
            
            // If it's the last operand of a branch/jump and doesn't look like a register, it's probably a label
            if (isBranchOrJump && isLastOperand && !isRegisterName(op) && !op.match(/^[+-]?\d+$/) && !op.match(/\(/)) {
                continue; // Skip, it's a label
            }
            
            // Handle memory operands like "4(x1)" or "-8(sp)"
            const memMatch = op.match(/\(([^)]+)\)/);
            if (memMatch) {
                const baseReg = memMatch[1].trim();
                // Check if it's a label, not a register
                if (!allLabels.has(baseReg) && isRegisterName(baseReg)) {
                    const reg = regToC(baseReg);
                    if (reg !== '0' && !reg.match(/^\d+$/)) {
                        usedRegs.add(reg);
                    }
                }
            } else {
                // Regular operand - check if it's a number first
                if (op.match(/^[+-]?\d+$/)) {
                    continue;
                }
                // Check if it's a register
                if (isRegisterName(op)) {
                    const reg = regToC(op);
                    if (reg !== '0' && !reg.match(/^\d+$/)) {
                        usedRegs.add(reg);
                    }
                }
            }
        }
    }
    
    // Collect registers from all instructions
    for (const inst of cf.instructions) {
        const mnemonic = inst.mnemonic.toLowerCase();
        const isBranchOrJump = ['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu', 'bgt', 'ble', 'bgtu', 'bleu', 
                               'jal', 'j', 'call', 'tail', 'jr'].includes(mnemonic);
        
        for (let i = 0; i < inst.operands.length; i++) {
            const op = inst.operands[i];
            const isLastOperand = i === inst.operands.length - 1;
            
            if (allLabels.has(op)) continue;
            
            if (isBranchOrJump && isLastOperand && !isRegisterName(op) && !op.match(/^[+-]?\d+$/) && !op.match(/\(/)) {
                continue;
            }
            
            const memMatch = op.match(/\(([^)]+)\)/);
            if (memMatch) {
                const baseReg = memMatch[1].trim();
                if (!allLabels.has(baseReg) && isRegisterName(baseReg)) {
                    const reg = regToC(baseReg);
                    if (reg !== '0' && !reg.match(/^\d+$/)) {
                        usedRegs.add(reg);
                    }
                }
            } else {
                if (op.match(/^[+-]?\d+$/)) continue;
                if (isRegisterName(op)) {
                    const reg = regToC(op);
                    if (reg !== '0' && !reg.match(/^\d+$/)) {
                        usedRegs.add(reg);
                    }
                }
            }
        }
    }
    
    // Declare registers
    for (const reg of Array.from(usedRegs).sort()) {
        cLines.push(`    int ${reg} = 0;`);
    }
    cLines.push('');
    
    // Detect backward branches (loops)
    const loopHeaders = new Map(); // Map label -> instruction index if it's a loop header
    for (let i = 0; i < instMap.instructions.length; i++) {
        const inst = instMap.instructions[i];
        const op = inst.mnemonic.toLowerCase();
        if (['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu', 'bgt', 'ble', 'bgtu', 'bleu', 'j'].includes(op)) {
            const targetLabel = inst.operands[inst.operands.length - 1];
            const targetIdx = instMap.labelToIndex.get(targetLabel);
            if (targetIdx !== undefined && targetIdx <= i) {
                // Backward branch - this is a loop
                loopHeaders.set(targetLabel, targetIdx);
            }
        }
    }
    
    // Generate structured code with proper indentation
    const processed = new Set();
    
    function emitCode(startIdx, indent = '    ') {
        for (let i = startIdx; i < instMap.instructions.length; i++) {
            if (processed.has(i)) break;
            processed.add(i);
            
            const inst = instMap.instructions[i];
            const op = inst.mnemonic.toLowerCase();
            const isBranch = ['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu', 'bgt', 'ble', 'bgtu', 'bleu'].includes(op);
            const isJump = ['j', 'jal', 'call', 'tail'].includes(op);
            const isReturn = ['ret'].includes(op) || (op === 'jr' && inst.operands[0]?.toLowerCase() === 'ra');
            
            // Replace labels in operands
            const processedOperands = inst.operands.map(op => {
                if (labels.has(op)) return labels.get(op);
                if (!op.match(/^[+-]?\d+$/) && !op.match(/\(/)) {
                    if (!labels.has(op)) {
                        const sanitized = op.replace(/\./g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
                        labels.set(op, sanitized);
                    }
                    return labels.get(op);
                }
                return op;
            });
            
            try {
                if (isReturn) {
                    cLines.push(`${indent}return;`);
                    break;
                } else if (isBranch) {
                    const targetLabel = inst.operands[inst.operands.length - 1];
                    const targetIdx = instMap.labelToIndex.get(targetLabel);
                    const isBackward = targetIdx !== undefined && targetIdx <= i;
                    
                    if (isBackward && loopHeaders.has(targetLabel)) {
                        // This is a loop - convert to while
                        const rs1 = regToC(inst.operands[0]);
                        const rs2 = regToC(inst.operands[1]);
                        let cond = riscvToC(inst.mnemonic, [rs1, rs2, ''], labels);
                        cond = cond.replace(/goto\s+\w+;\s*$/, '').replace(/if\s*\(/, '').replace(/\)\s*goto/, '');
                        if (cond.includes('if')) {
                            cond = cond.replace(/if\s*\(/, '').replace(/\)\s*/, '');
                        }
                        if (!cond.includes('(')) cond = `(${cond})`;
                        
                        cLines.push(`${indent}while ${cond} {`);
                        // Emit loop body (from target to this branch) with increased indent
                        const loopBodyIndent = indent + '    ';
                        if (targetIdx !== undefined) {
                            // Process loop body up to but not including the branch instruction
                            for (let j = targetIdx; j < i; j++) {
                                if (!processed.has(j)) {
                                    processed.add(j);
                                    const bodyInst = instMap.instructions[j];
                                    const bodyOp = bodyInst.mnemonic.toLowerCase();
                                    const bodyIsBranch = ['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu', 'bgt', 'ble', 'bgtu', 'bleu'].includes(bodyOp);
                                    const bodyIsJump = ['j', 'jal', 'call', 'tail'].includes(bodyOp);
                                    const bodyIsReturn = ['ret'].includes(bodyOp) || (bodyOp === 'jr' && bodyInst.operands[0]?.toLowerCase() === 'ra');
                                    
                                    const bodyProcessedOperands = bodyInst.operands.map(op => {
                                        if (labels.has(op)) return labels.get(op);
                                        if (!op.match(/^[+-]?\d+$/) && !op.match(/\(/)) {
                                            if (!labels.has(op)) {
                                                const sanitized = op.replace(/\./g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
                                                labels.set(op, sanitized);
                                            }
                                            return labels.get(op);
                                        }
                                        return op;
                                    });
                                    
                                    if (bodyIsReturn) {
                                        cLines.push(`${loopBodyIndent}return;`);
                                    } else if (bodyIsBranch) {
                                        const bodyTargetLabel = bodyInst.operands[bodyInst.operands.length - 1];
                                        const bodyTargetIdx = instMap.labelToIndex.get(bodyTargetLabel);
                                        const bodyRs1 = regToC(bodyInst.operands[0]);
                                        const bodyRs2 = regToC(bodyInst.operands[1]);
                                        let bodyCond = riscvToC(bodyInst.mnemonic, [bodyRs1, bodyRs2, ''], labels);
                                        bodyCond = bodyCond.replace(/goto\s+\w+;\s*$/, '').replace(/if\s*\(/, '').replace(/\)\s*/, '');
                                        if (!bodyCond.includes('(')) bodyCond = `(${bodyCond})`;
                                        
                                        cLines.push(`${loopBodyIndent}if ${bodyCond} {`);
                                        if (bodyTargetIdx !== undefined) {
                                            emitCode(bodyTargetIdx, loopBodyIndent + '    ');
                                        }
                                        cLines.push(`${loopBodyIndent}}`);
                                    } else if (bodyIsJump && bodyOp !== 'call') {
                                        const bodyCCode = riscvToC(bodyInst.mnemonic, bodyProcessedOperands, labels);
                                        cLines.push(`${loopBodyIndent}${bodyCCode}`);
                                    } else {
                                        const bodyCCode = riscvToC(bodyInst.mnemonic, bodyProcessedOperands, labels);
                                        cLines.push(`${loopBodyIndent}${bodyCCode}`);
                                    }
                                }
                            }
                        }
                        cLines.push(`${indent}}`);
                        // Continue after loop
                        if (i + 1 < instMap.instructions.length && !processed.has(i + 1)) {
                            continue;
                        }
                        break;
                    } else {
                        // Regular branch - convert to if
                        const rs1 = regToC(inst.operands[0]);
                        const rs2 = regToC(inst.operands[1]);
                        let cond = riscvToC(inst.mnemonic, [rs1, rs2, ''], labels);
                        cond = cond.replace(/goto\s+\w+;\s*$/, '').replace(/if\s*\(/, '').replace(/\)\s*/, '');
                        if (!cond.includes('(')) cond = `(${cond})`;
                        
                        cLines.push(`${indent}if ${cond} {`);
                        // Emit if body with increased indent
                        const ifBodyIndent = indent + '    ';
                        if (targetIdx !== undefined) {
                            emitCode(targetIdx, ifBodyIndent);
                        }
                        cLines.push(`${indent}}`);
                        // Fallthrough - continue with same indent
                        if (i + 1 < instMap.instructions.length && !processed.has(i + 1)) {
                            continue;
                        }
                        break;
                    }
                } else if (isJump && op !== 'call') {
                    const cCode = riscvToC(inst.mnemonic, processedOperands, labels);
                    cLines.push(`${indent}${cCode}`);
                    break;
                } else {
                    const cCode = riscvToC(inst.mnemonic, processedOperands, labels);
                    cLines.push(`${indent}${cCode}`);
                }
            } catch (e) {
                cLines.push(`${indent}// ERROR: ${e.message}`);
                cLines.push(`${indent}// ${inst.original}`);
            }
        }
    }
    
    // Process instructions, handling labels with proper indentation
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        const trimmed = line.trim();
        
        if (trimmed.endsWith(':')) {
            const label = trimmed.slice(0, -1).trim();
            const cLabel = labels.get(label);
            const targetIdx = instMap.labelToIndex.get(label);
            
            if (cLabel && targetIdx !== undefined && !processed.has(targetIdx)) {
                // Labels are at base indentation level
                cLines.push(`    ${cLabel}:`);
                emitCode(targetIdx, '    ');
            }
            continue;
        }
        
        const inst = parseInstruction(line);
        if (inst) {
            const foundIdx = instMap.instructions.findIndex(i => i.lineNum === lineIdx);
            if (foundIdx !== -1 && !processed.has(foundIdx)) {
                // Start with base indentation
                emitCode(foundIdx, '    ');
            }
        } else if (trimmed) {
            // Comments maintain base indentation
            cLines.push(`    // ${line}`);
        }
    }
    
    // Ensure proper closing with indentation
    cLines.push('    return 0;');
    cLines.push('}');
    
    return cLines.join('\n');
}

export default {
    id: "riscv",
    title: "RISC-V Instruction Explainer",
    area: "Assembly",
    tags: ["riscv", "cheatsheet", "assembly", "explain"],
    
    notesHtml: `
        <p><b>RISC-V Instruction Explainer</b></p>
        <p>Paste a RISC-V function or code snippet on the left.</p>
        <p><b>Two modes:</b></p>
        <ul>
            <li><b>Detailed explanation</b> (default): Line-by-line cheat sheet showing instruction type, meaning, registers, and usage</li>
            <li><b>C code equivalent</b>: Convert RISC-V assembly to structured C code with loops and conditionals</li>
        </ul>
        <p>Toggle between modes using the checkbox above the input area.</p>
        <p><b>Big picture:</b></p>
        <ul>
            <li><b>Registers:</b> 
              <ul>
                <li><code>x0/zero</code>: always 0</li>
                <li><code>ra</code>: return address</li>
                <li><code>sp</code>: stack pointer (grows downwards)</li>
                <li><code>s0–s11</code>: callee-saved (must be restored before <code>ret</code>)</li>
                <li><code>a0–a7</code>: arguments &amp; return values</li>
                <li><code>t0–t6</code>: temporaries</li>
              </ul>
            </li>
            <li><b>Typical stack frame:</b></li>
        </ul>
        <pre style="margin-top:4px;">
func:
  addi sp, sp, -FRAME_SIZE   # make space
  sw   ra,  OFFSET_RA(sp)    # save return address
  sw   s0,  OFFSET_S0(sp)    # save callee-saved regs
  ...
  lw   ra,  OFFSET_RA(sp)    # restore
  lw   s0,  OFFSET_S0(sp)
  addi sp, sp, FRAME_SIZE
  ret
        </pre>
        <ul>
            <li><b>Instruction formats:</b></li>
        </ul>
        <pre>
R-type: add rd, rs1, rs2      # all registers
I-type: addi rd, rs1, imm     # 12-bit immediate
S-type: sw rs2, offset(rs1)   # store to memory
B-type: beq rs1, rs2, label   # conditional branch
U-type: lui rd, imm20         # upper 20 bits
J-type: jal rd, label         # jump-and-link
        </pre>
        <ul>
            <li><b>What this tool shows you:</b></li>
            <li>For each line: the <b>kind</b> (R/I/S/B/U/J/pseudo)</li>
            <li>A short <b>meaning</b> in words, often like high-level code</li>
            <li>Which registers are used and their roles (dest, src, immediate)</li>
            <li>Labels visualized as jump/loop targets</li>
        </ul>
        <p>Use this to translate exam RISC-V code into plain-language explanations before you write your answer.</p>
    `,
    
    render(container, ctx) {
        const s = ctx.state;
        
        const state = {
            assembly: s.assembly ?? `addi x1, x0, 5
addi x2, x0, 10
add x3, x1, x2
sw x3, 0(x2)
lw x4, 0(x2)
beq x3, x4, done
addi x5, x0, 1
done:
addi x6, x0, 0`,
            showCCode: s.showCCode ?? false,
        };
        
        const assembly = el("textarea", {
            class: "search",
            rows: "15",
            placeholder: "Enter RISC-V assembly code here...",
        });
        assembly.value = state.assembly;
        assembly.style.fontFamily = "var(--mono)";
        assembly.style.whiteSpace = "pre";
        assembly.style.resize = "vertical";
        assembly.style.fontSize = "14px";
        
        const showCCode = el("input", { type: "checkbox" });
        showCCode.checked = !!state.showCCode;
        
        const btnExample1 = el("button", { class: "btn btn-ghost", text: "Example: Simple arithmetic" });
        btnExample1.addEventListener("click", () => {
            assembly.value = `addi x1, x0, 5
addi x2, x0, 10
add x3, x1, x2
sub x4, x3, x1`;
            persist();
        });
        
        const btnExample2 = el("button", { class: "btn btn-ghost", text: "Example: Memory access" });
        btnExample2.addEventListener("click", () => {
            assembly.value = `addi sp, sp, -16
sw x1, 0(sp)
sw x2, 4(sp)
lw x3, 0(sp)
lw x4, 4(sp)
add x5, x3, x4`;
            persist();
        });
        
        const btnExample3 = el("button", { class: "btn btn-ghost", text: "Example: Branch" });
        btnExample3.addEventListener("click", () => {
            assembly.value = `addi x1, x0, 5
addi x2, x0, 10
blt x1, x2, less
addi x3, x0, 0
j end
less:
addi x3, x0, 1
end:
addi x4, x0, 0`;
            persist();
        });
        
        const btnExample4 = el("button", { class: "btn btn-ghost", text: "Example: Function call" });
        btnExample4.addEventListener("click", () => {
            assembly.value = `# Function: add two numbers
addi sp, sp, -8
sw ra, 4(sp)
sw a0, 0(sp)
addi a0, a0, 5
call func
lw ra, 4(sp)
lw a0, 0(sp)
addi sp, sp, 8
ret
func:
add a0, a0, a1
ret`;
            persist();
        });
        
        const form = el("div", {}, [
            el("div", { style: "display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;" }, [
                btnExample1,
                btnExample2,
                btnExample3,
                btnExample4,
            ]),
            el("div", { style: "display:flex; gap:12px; align-items:center; margin-bottom:8px;" }, [
                el("label", { style: "display:flex; gap:8px; align-items:center; color: var(--muted); cursor: pointer;" }, [
                    showCCode,
                    el("span", { text: "Show C code equivalent (instead of detailed explanation)" }),
                ]),
            ]),
            el("div", { class: "nav-tag", text: "RISC-V Assembly Code:" }),
            assembly,
        ]);
        
        container.appendChild(form);
        ctx.setNotes?.(this.notesHtml);
        
        const persist = () => {
            ctx.setState({
                ...ctx.state,
                assembly: assembly.value,
                showCCode: showCCode.checked,
            });
        };
        
        assembly.addEventListener("input", persist);
        showCCode.addEventListener("change", persist);
    },
    
    compute(ctx) {
        const s = ctx.state;
        const assembly = (s.assembly || "").trim();
        const showCCode = !!s.showCCode;
        
        if (!assembly) {
            throw new Error("Please enter RISC-V assembly code");
        }
        
        try {
            if (showCCode) {
                // Show C code equivalent
                const cCode = compileRiscvToC(assembly);
                return cCode;
            } else {
                // Show detailed explanation
                const explanation = analyzeRiscvToCheatsheet(assembly);
                return explanation;
            }
        } catch (e) {
            throw new Error(`Analysis error: ${e.message}`);
        }
    },
};
