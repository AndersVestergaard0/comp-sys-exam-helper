export function parseHexToBigInt(input) {
    if (input == null) throw new Error("Address is empty");
    let s = input.toString().trim().toLowerCase();
    if (!s) throw new Error("Address is empty");
  
    // Allow formats: 0x..., ..., with underscores/spaces
    s = s.replace(/_/g, "").replace(/\s+/g, "");
    if (s.startsWith("0x")) s = s.slice(2);
  
    if (!/^[0-9a-f]+$/i.test(s)) {
      throw new Error(`Invalid hex address: "${input}"`);
    }
    return BigInt("0x" + s);
  }
  
  export function isPowerOfTwo(n) {
    return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
  }
  
  export function log2IntPow2(n) {
    if (!isPowerOfTwo(n)) throw new Error(`Expected power of two, got ${n}`);
    return Math.log2(n) | 0;
  }
  
  export function maskBits(bits) {
    if (bits <= 0) return 0n;
    return (1n << BigInt(bits)) - 1n;
  }
  
  export function toHex(x, minNibbles = 0) {
    let s = x.toString(16).toUpperCase();
    if (minNibbles > 0) s = s.padStart(minNibbles, "0");
    return "0x" + s;
  }
  
  export function toBin(x, bits) {
    let s = x.toString(2);
    if (bits != null) s = s.padStart(bits, "0");
    return s;
  }
  
  export function clampBigIntToBits(x, bits) {
    if (bits <= 0) return 0n;
    return x & maskBits(bits);
  }
  