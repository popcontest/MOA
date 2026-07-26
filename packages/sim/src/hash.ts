/**
 * FNV-1a, run as two lanes with different offset bases and folded into a
 * 64-bit hex string.
 *
 * CLAUDE.md says FNV-1a is fine, and it is — but 32 bits is thin once the
 * balance runner is producing tens of thousands of terminal states, and a
 * second lane costs one extra multiply per byte. Same algorithm, wider output.
 *
 * Floats go in as raw IEEE-754 bytes with little-endian forced, so byte order
 * is never a platform variable.
 */

const PRIME = 0x01000193;
const OFFSET_A = 0x811c9dc5;
const OFFSET_B = 0x9e3779b9;

export type Hasher = {
  a: number;
  b: number;
  readonly scratch: DataView;
};

export function makeHasher(): Hasher {
  return { a: OFFSET_A, b: OFFSET_B, scratch: new DataView(new ArrayBuffer(8)) };
}

export function pushByte(h: Hasher, byte: number): void {
  h.a = Math.imul(h.a ^ (byte & 0xff), PRIME) >>> 0;
  h.b = Math.imul(h.b ^ (byte & 0xff), PRIME) >>> 0;
}

export function pushU32(h: Hasher, v: number): void {
  const u = v >>> 0;
  pushByte(h, u);
  pushByte(h, u >>> 8);
  pushByte(h, u >>> 16);
  pushByte(h, u >>> 24);
}

export function pushI32(h: Hasher, v: number): void {
  pushU32(h, v | 0);
}

export function pushBool(h: Hasher, v: boolean): void {
  pushByte(h, v ? 1 : 0);
}

/**
 * A NaN reaching the hash means the sim produced one, which is always a bug —
 * two NaNs that arose differently would hash the same and mask it.
 */
export function pushF64(h: Hasher, v: number): void {
  if (Number.isNaN(v)) throw new Error('hashState: NaN in sim state');
  h.scratch.setFloat64(0, v, true);
  for (let i = 0; i < 8; i++) pushByte(h, h.scratch.getUint8(i));
}

export function pushBytes(h: Hasher, bytes: Uint8Array): void {
  let a = h.a;
  let b = h.b;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    const x = byte === undefined ? 0 : byte;
    a = Math.imul(a ^ x, PRIME) >>> 0;
    b = Math.imul(b ^ x, PRIME) >>> 0;
  }
  h.a = a;
  h.b = b;
}

export function pushString(h: Hasher, s: string): void {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    pushByte(h, c);
    pushByte(h, c >>> 8);
  }
  pushByte(h, 0);
}

export function digest(h: Hasher): string {
  return (h.a >>> 0).toString(16).padStart(8, '0') + (h.b >>> 0).toString(16).padStart(8, '0');
}
