/** Serializable xoshiro128** PRNG. State is four uint32s. */
export interface RngState {
  s0: number;
  s1: number;
  s2: number;
  s3: number;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Advance state by one step and return the next uint32. */
export function next(rng: RngState): { value: number; rng: RngState } {
  const result = (rotl((rng.s1 * 5) >>> 0, 7) * 9) >>> 0;
  const t = (rng.s1 << 9) >>> 0;

  const s2 = (rng.s2 ^ rng.s0) >>> 0;
  const s3 = (rng.s3 ^ rng.s1) >>> 0;
  const s1 = (rng.s1 ^ s2) >>> 0;
  const s0 = (rng.s0 ^ s3) >>> 0;
  const s2b = (s2 ^ t) >>> 0;
  const s3b = rotl(s3, 11);

  return { value: result, rng: { s0, s1, s2: s2b, s3: s3b } };
}

/** Return a float in [0, 1). */
export function nextFloat(rng: RngState): { value: number; rng: RngState } {
  const { value, rng: rng2 } = next(rng);
  return { value: value / 0x100000000, rng: rng2 };
}

/** Return an integer in [0, n). */
export function nextInt(rng: RngState, n: number): { value: number; rng: RngState } {
  const { value, rng: rng2 } = nextFloat(rng);
  return { value: Math.floor(value * n), rng: rng2 };
}

/** Seed from a string using a simple splitmix32 initialiser. */
export function seedFromString(seed: string): RngState {
  let h = 0x9e3779b9;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(h ^ seed.charCodeAt(i), 0x9e3779b9) + 0x6c62272e) >>> 0;
  }
  // Run splitmix32 four times to fill the state
  function sm(x: number): number {
    x = (Math.imul((x ^ (x >>> 16)) >>> 0, 0x45d9f3b) + 0x85ebca6c) >>> 0;
    x = (Math.imul((x ^ (x >>> 13)) >>> 0, 0xc2b2ae35) + 0xc2b2ae35) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  }
  return { s0: sm(h), s1: sm(sm(h)), s2: sm(sm(sm(h))), s3: sm(sm(sm(sm(h)))) };
}

/**
 * Fisher-Yates shuffle. Returns the shuffled array and updated rng.
 * Does not mutate the input.
 */
export function shuffle<T>(arr: readonly T[], rng: RngState): { result: T[]; rng: RngState } {
  const a = arr.slice();
  let r = rng;
  for (let i = a.length - 1; i > 0; i--) {
    const { value: j, rng: r2 } = nextInt(r, i + 1);
    r = r2;
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return { result: a, rng: r };
}
