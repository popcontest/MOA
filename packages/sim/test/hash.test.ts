import { describe, expect, it } from 'vitest';
import { digest, makeHasher, pushByte, pushBytes, pushF64, pushI32, pushString, pushU32 } from '../src/hash';

function hashOf(fn: (h: ReturnType<typeof makeHasher>) => void): string {
  const h = makeHasher();
  fn(h);
  return digest(h);
}

describe('FNV-1a hasher', () => {
  it('produces a 64-bit hex string', () => {
    const d = hashOf((h) => pushU32(h, 1));
    expect(d).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is stable for the same input', () => {
    const a = hashOf((h) => {
      pushU32(h, 7);
      pushF64(h, 1.5);
      pushString(h, 'lastStanding');
    });
    const b = hashOf((h) => {
      pushU32(h, 7);
      pushF64(h, 1.5);
      pushString(h, 'lastStanding');
    });
    expect(a).toBe(b);
  });

  it('is order sensitive', () => {
    const a = hashOf((h) => {
      pushByte(h, 1);
      pushByte(h, 2);
    });
    const b = hashOf((h) => {
      pushByte(h, 2);
      pushByte(h, 1);
    });
    expect(a).not.toBe(b);
  });

  it('separates values that differ only in the last bit of a double', () => {
    const a = hashOf((h) => pushF64(h, 0.1));
    const b = hashOf((h) => pushF64(h, 0.1 + Number.EPSILON / 8));
    expect(a).not.toBe(b);
  });

  it('distinguishes -0 from 0, which a naive comparison would not', () => {
    expect(hashOf((h) => pushF64(h, 0))).not.toBe(hashOf((h) => pushF64(h, -0)));
  });

  it('rejects NaN rather than hashing it', () => {
    expect(() => hashOf((h) => pushF64(h, Number.NaN))).toThrow(/NaN/);
  });

  it('hashes a byte array the same as the bytes pushed one at a time', () => {
    const bytes = new Uint8Array([3, 1, 4, 1, 5, 9, 2, 6]);
    const bulk = hashOf((h) => pushBytes(h, bytes));
    const single = hashOf((h) => {
      for (const b of bytes) pushByte(h, b);
    });
    expect(bulk).toBe(single);
  });

  it('handles negative integers', () => {
    expect(hashOf((h) => pushI32(h, -1))).not.toBe(hashOf((h) => pushI32(h, 1)));
  });

  it('avoids collisions across a large sweep', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50000; i++) seen.add(hashOf((h) => pushU32(h, i)));
    expect(seen.size).toBe(50000);
  });
});
