// Shared algebra for the PCP prover and verifier.
// A line-by-line JavaScript port of simple_pcp/algebra.py.
//
// Contents
// --------
// * The field F_q = GF(2^t). An element is stored as the integer whose binary
//   digits are its t bits rho(x), so rho is the identity on this
//   representation. add, mul, div, pow implement the field.
// * Vectors in F_q^k: plain arrays of field elements.
// * F2Poly: multilinear polynomials over F_2 in the t bits of a field
//   element. These are the "questions" P in P_3(t, F_2) that a
//   Hadamard-encoded oracle answers.
// * Poly: multivariate polynomials over F_q (low-degree extensions, the
//   vanishing certificates, restriction to lines).
// * The degree-reduction map Psi and the points Phi_lambda.
// * Params: all parameters of one PCP instance.
//
// Bits (elements of F_2) are the numbers 0 and 1; adding bits is ^.
//
// Unlike algebra.py, the field size is not a constant: setField(t) chooses it
// (t must be even, so that F_q contains the cube roots of unity 1, omega,
// omega^2 used as colours).

"use strict";

(function (PCP) {

  // -------------------------------------------------------------------------
  // The field F_q = GF(2^t)
  // -------------------------------------------------------------------------
  // F_q = F_2[x] / (modulus). The element b_0 + b_1 x + ... + b_{t-1} x^{t-1}
  // is stored as the integer with binary digits b_{t-1} ... b_0.

  const PRIMITIVE_MODULUS = {   // x generates F_q^* for these moduli
    2: 0b111,                   // x^2 + x + 1
    4: 0x13,                    // x^4 + x + 1
    6: 0x43,                    // x^6 + x + 1
    8: 0x11D                    // x^8 + x^4 + x^3 + x^2 + 1
  };

  let T = 0, Q = 0;
  let EXP = null;               // EXP[i] = (integer of) x^i
  let LOG = null;               // LOG[x^i] = i

  function setField(t) {
    if (!(t in PRIMITIVE_MODULUS)) throw new Error(`unsupported t = ${t}`);
    T = t;
    Q = 2 ** t;
    EXP = new Int32Array(Q - 1);
    LOG = new Int32Array(Q);
    let e = 1;
    for (let i = 0; i < Q - 1; i += 1) {
      EXP[i] = e;
      LOG[e] = i;
      e <<= 1;                                  // times x
      if (e & Q) e ^= PRIMITIVE_MODULUS[t];     // reduce modulo the modulus
    }
  }

  const ZERO = 0, ONE = 1;

  function add(x, y) {
    return x ^ y;               // coefficients of x^i are added mod 2
  }
  const sub = add;              // characteristic 2: x - y = x + y

  function mul(x, y) {
    if (x === 0 || y === 0) return ZERO;
    return EXP[(LOG[x] + LOG[y]) % (Q - 1)];
  }

  function div(x, y) {
    if (y === 0) throw new Error("division by zero");
    return mul(x, EXP[(Q - 1 - LOG[y]) % (Q - 1)]);
  }

  function pow(x, k) {
    // x ** k for an integer k >= 0, with the convention 0 ** 0 = 1
    if (k === 0) return ONE;
    if (x === 0) return ZERO;
    return EXP[(LOG[x] * k) % (Q - 1)];
  }

  function elementOfOrder(k) {
    // An element of multiplicative order exactly k (k must divide q - 1)
    if ((Q - 1) % k !== 0) throw new Error(`${k} does not divide q - 1 = ${Q - 1}`);
    return pow(2, (Q - 1) / k);                 // 2 is the generator x
  }

  // A seeded random source with Python's randrange(start, stop) interface.
  // Each call consumes one 32-bit output of mulberry32, so a Python object
  // with the same interface reproduces it exactly (see tests/crosscheck.py).
  class Random {
    constructor(seed) {
      this.state = seed >>> 0;
    }

    next32() {
      this.state = (this.state + 0x6D2B79F5) >>> 0;
      let t = this.state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    }

    randrange(start, stop) {
      if (stop === undefined) [start, stop] = [0, start];
      return start + this.next32() % (stop - start);
    }

    random() {
      return this.next32() / 4294967296;
    }
  }

  function randomBit(rng) {
    // A uniformly random bit
    return rng.randrange(2);
  }

  function randomElement(rng, nonzero = false) {
    return rng.randrange(nonzero ? 1 : 0, Q);
  }

  // -------------------------------------------------------------------------
  // Vectors in F_q^k
  // -------------------------------------------------------------------------

  function vadd(u, v) {
    // u + v coordinatewise (also u - v)
    if (u.length !== v.length) throw new Error("length mismatch");
    return u.map((x, i) => x ^ v[i]);
  }

  function scale(c, v) {
    // c * v
    return v.map(x => mul(c, x));
  }

  function concat(...vectors) {
    // (a, b, ...) as one vector, e.g. concat(a, b) in F_q^{2m}
    return [].concat(...vectors);
  }

  function zeroVector(k) {
    return new Array(k).fill(ZERO);
  }

  function randomVector(k, rng) {
    const out = [];
    for (let i = 0; i < k; i += 1) out.push(randomElement(rng));
    return out;
  }

  // -------------------------------------------------------------------------
  // Polynomials over F_2 in the t bits z_0, ..., z_{t-1}
  // -------------------------------------------------------------------------
  // A monomial prod_{i in S} z_i is the bit mask of S (the empty mask is the
  // constant 1). A polynomial stores one coefficient bit per monomial.

  function monomialsUpTo(degree) {
    // Same order as algebra.py: by size, then itertools.combinations order
    const out = [];
    function combos(start, k, mask) {
      if (k === 0) { out.push(mask); return; }
      for (let i = start; i < T; i += 1) combos(i + 1, k - 1, mask | (1 << i));
    }
    for (let k = 0; k <= degree; k += 1) combos(0, k, 0);
    return out;
  }

  class F2Poly {
    // A multilinear polynomial over F_2 in z_0..z_{t-1}. Only the values on
    // F_2^t matter, and z^2 = z there, so multilinear polynomials are enough.

    constructor(coef) {
      this.coef = coef || new Uint8Array(Q);
    }

    static fromMonomials(masks) {
      const p = new F2Poly();
      for (const mask of masks) p.coef[mask] ^= 1;
      return p;
    }

    add(other) {
      const coef = new Uint8Array(Q);
      for (let i = 0; i < Q; i += 1) coef[i] = this.coef[i] ^ other.coef[i];
      return new F2Poly(coef);
    }

    mul(other) {
      const coef = new Uint8Array(Q);
      for (let m1 = 0; m1 < Q; m1 += 1) {
        if (!this.coef[m1]) continue;
        for (let m2 = 0; m2 < Q; m2 += 1) {
          if (other.coef[m2]) coef[m1 | m2] ^= 1;    // z_i * z_i = z_i
        }
      }
      return new F2Poly(coef);
    }

    call(x) {
      // Evaluate at rho(x) in F_2^t: the sum of the monomials contained in x
      let bit = 0;
      for (let s = x; ; s = (s - 1) & x) {
        bit ^= this.coef[s];
        if (s === 0) break;
      }
      return bit;
    }

    key() {
      // A string identifying the polynomial (used to address oracle entries)
      return Array.from(this.coef).join("");
    }

    static constant(s) {
      // The constant polynomial s, for a bit s
      return F2Poly.fromMonomials(s ? [0] : []);
    }

    static random(degree, rng) {
      // Uniformly random element of P_degree(t, F_2)
      return F2Poly.fromMonomials(monomialsUpTo(degree).filter(() => rng.randrange(2)));
    }

    static randomLinear(rng) {
      // Uniformly random L in P_1(t, F_2) with L(0) = 0
      const masks = [];
      for (let i = 0; i < T; i += 1) if (rng.randrange(2)) masks.push(1 << i);
      return F2Poly.fromMonomials(masks);
    }

    static variable(i) {
      // The polynomial z_i
      return F2Poly.fromMonomials([1 << i]);
    }

    static interpolate(func) {
      // The multilinear polynomial agreeing with func : F_2^t -> F_2. The
      // coefficient of S is the sum of func(U) over all subsets U of S
      // (Moebius inversion).
      const coef = new Uint8Array(Q);
      for (let x = 0; x < Q; x += 1) coef[x] = func(x);
      for (let i = 0; i < T; i += 1) {
        for (let S = 0; S < Q; S += 1) {
          if (S & (1 << i)) coef[S] ^= coef[S ^ (1 << i)];
        }
      }
      return new F2Poly(coef);
    }
  }

  function numHadamardQuestionsLog2(degree = 3) {
    // log2 |P_degree(t, F_2)| = number of monomials of degree <= degree
    return monomialsUpTo(degree).length;
  }

  // -------------------------------------------------------------------------
  // Univariate polynomials over F_q (coefficient lists, lowest degree first)
  // -------------------------------------------------------------------------

  function uniMul(p, r) {
    const out = new Array(p.length + r.length - 1).fill(ZERO);
    for (let i = 0; i < p.length; i += 1) {
      if (p[i] === 0) continue;
      for (let j = 0; j < r.length; j += 1) out[i + j] ^= mul(p[i], r[j]);
    }
    return out;
  }

  function vanishingUnivariate(H) {
    // Z_H(X) = prod_{gamma in H} (X - gamma)
    let z = [ONE];
    for (const gamma of H) z = uniMul(z, [gamma, ONE]);
    return z;
  }

  function lagrangeBasis(H, gamma) {
    // The univariate polynomial that is 1 at gamma and 0 on H minus {gamma}
    let p = [ONE];
    for (const other of H) {
      if (other !== gamma) {
        const d = sub(gamma, other);
        p = uniMul(p, [div(other, d), div(ONE, d)]);
      }
    }
    return p;
  }

  function Z_H(H, point) {
    // The vector (Z_H(x_1), ..., Z_H(x_k)) for point = (x_1, ..., x_k)
    return point.map(x => {
      let value = ONE;
      for (const gamma of H) value = mul(value, sub(x, gamma));
      return value;
    });
  }

  // -------------------------------------------------------------------------
  // Multivariate polynomials over F_q
  // -------------------------------------------------------------------------
  // A monomial X_0^{e_0} ... X_{n-1}^{e_{n-1}} is stored as the number
  // sum_j e_j * 64^j, so multiplying monomials is adding their keys. This
  // needs n <= 8 and total degree < 64, which is checked.

  const BASE = 64;
  const MAX_VARS = 8;
  const PLACE = Array.from({ length: MAX_VARS }, (_, j) => BASE ** j);

  function exponents(key, n) {
    const e = new Array(n);
    for (let j = 0; j < n; j += 1) {
      e[j] = key % BASE;
      key = (key - e[j]) / BASE;
    }
    return e;
  }

  function digitOf(key, j) {
    return Math.floor(key / PLACE[j]) % BASE;
  }

  function keyDegree(key) {
    let d = 0;
    while (key > 0) {
      d += key % BASE;
      key = Math.floor(key / BASE);
    }
    return d;
  }

  function addTerm(terms, key, c) {
    const value = (terms.get(key) || 0) ^ c;
    if (value) terms.set(key, value);
    else terms.delete(key);
  }

  class Poly {
    // A polynomial over F_q in n variables: a Map {monomial key: nonzero coefficient}

    constructor(n, terms) {
      if (n > MAX_VARS) throw new Error(`at most ${MAX_VARS} variables`);
      this.n = n;
      this.terms = new Map();
      if (terms) for (const [key, c] of terms) addTerm(this.terms, key, c);
    }

    static constant(n, c) {
      return new Poly(n, [[0, c]]);
    }

    static variable(n, j) {
      // The polynomial X_j in n variables
      return Poly.univariate(n, j, [ZERO, ONE]);
    }

    static univariate(n, j, coeffs) {
      // The polynomial sum_k coeffs[k] X_j^k in n variables
      if (coeffs.length > BASE) throw new Error("degree too large");
      return new Poly(n, coeffs.map((c, k) => [k * PLACE[j], c]));
    }

    add(other) {
      if (typeof other === "number") other = Poly.constant(this.n, other);
      const result = new Poly(this.n, this.terms);
      for (const [key, c] of other.terms) addTerm(result.terms, key, c);
      return result;
    }

    sub(other) {
      return this.add(other);   // characteristic 2
    }

    mul(other) {
      if (this.degree() + other.degree() >= BASE) throw new Error("degree too large");
      const result = new Poly(this.n);
      for (const [k1, c1] of this.terms) {
        for (const [k2, c2] of other.terms) addTerm(result.terms, k1 + k2, mul(c1, c2));
      }
      return result;
    }

    pow(k) {
      let result = Poly.constant(this.n, ONE);
      for (let i = 0; i < k; i += 1) result = result.mul(this);
      return result;
    }

    isZero() {
      return this.terms.size === 0;
    }

    degree() {
      let d = 0;
      for (const key of this.terms.keys()) d = Math.max(d, keyDegree(key));
      return d;
    }

    evaluate(point) {
      if (point.length !== this.n) throw new Error("wrong number of coordinates");
      const D = this.degree();
      const powers = point.map(x => {
        const p = [ONE];
        for (let k = 1; k <= D; k += 1) p.push(mul(p[k - 1], x));
        return p;
      });
      let total = ZERO;
      for (const [key, c] of this.terms) {
        let term = c;
        let rest = key;
        for (let j = 0; j < this.n && term !== 0; j += 1) {
          const e = rest % BASE;
          rest = (rest - e) / BASE;
          term = mul(term, powers[j][e]);
        }
        total ^= term;
      }
      return total;
    }

    rename(newN, positions) {
      // Move variable i to variable positions[i] in a ring with newN
      // variables (e.g. chi(X) -> chi(Y_2))
      const result = new Poly(newN);
      for (const [key, c] of this.terms) {
        const e = exponents(key, this.n);
        let newKey = 0;
        e.forEach((k, i) => { newKey += k * PLACE[positions[i]]; });
        addTerm(result.terms, newKey, c);
      }
      return result;
    }

    divideByVanishing(i, H) {
      // PolyDivide: return [Q, R] with this = Q * Z_H(X_i) + R and
      // deg_{X_i}(R) < |H|
      const z = vanishingUnivariate(H);       // monic of degree h
      const h = H.length;
      const remainder = new Map(this.terms);
      const quotient = new Map();
      let top = 0;
      for (const key of remainder.keys()) top = Math.max(top, digitOf(key, i));
      for (let d = top; d >= h; d -= 1) {     // cancel X_i^d, highest d first
        for (const key of [...remainder.keys()].filter(key => digitOf(key, i) === d)) {
          const c = remainder.get(key);
          remainder.delete(key);
          addTerm(quotient, key - h * PLACE[i], c);
          for (let k = 0; k < h; k += 1) {    // subtract c * X^(d-h) * (z - X^h)
            addTerm(remainder, key - (h - k) * PLACE[i], mul(c, z[k]));
          }
        }
      }
      return [new Poly(this.n, quotient), new Poly(this.n, remainder)];
    }

    restrictToLine(a, b) {
      // The coefficients of the univariate polynomial X -> this(a + X b)
      const D = this.degree();
      const result = new Array(D + 1).fill(ZERO);
      // linePowers[j][k] = (a_j + b_j X)^k
      const linePowers = a.map((aj, j) => {
        const p = [[ONE]];
        for (let k = 1; k <= D; k += 1) p.push(uniMul(p[k - 1], [aj, b[j]]));
        return p;
      });
      for (const [key, c] of this.terms) {
        let p = [c];
        let rest = key;
        for (let j = 0; j < this.n; j += 1) {
          const e = rest % BASE;
          rest = (rest - e) / BASE;
          if (e > 0) p = uniMul(p, linePowers[j][e]);
        }
        for (let k = 0; k < p.length; k += 1) result[k] ^= p[k];
      }
      return result;
    }

    static lde(n, H, values) {
      // LDE(f): the unique polynomial of individual degree < |H| that agrees
      // with f on H^n. values is a list of [point of H^n, f(point)]; a later
      // entry for the same point replaces an earlier one, and missing points
      // mean f = 0.
      const byPoint = new Map();
      for (const [point, value] of values) byPoint.set(point.join(","), [point, value]);
      let total = new Poly(n);
      for (const [point, value] of byPoint.values()) {
        if (value === 0) continue;
        let term = Poly.constant(n, value);
        point.forEach((gamma, j) => {
          term = term.mul(Poly.univariate(n, j, lagrangeBasis(H, gamma)));
        });
        total = total.add(term);
      }
      return total;
    }

    termList() {
      // [[exponent list, coefficient], ...], for printing and testing
      return [...this.terms].map(([key, c]) => [exponents(key, this.n), c]);
    }
  }

  // -------------------------------------------------------------------------
  // Degree reduction (Psi) and the points Phi_lambda
  // -------------------------------------------------------------------------

  function baseDigits(k, base, numDigits) {
    const digits = [];
    for (let i = 0; i < numDigits; i += 1) {
      digits.push(k % base);
      k = Math.floor(k / base);
    }
    return digits;
  }

  function psiEvaluate(coeffs, w, c, m1) {
    // Psi(p)[w] = sum_k p_k * w_{0,k_0} * ... * w_{c-1,k_{c-1}}, where
    // (k_0, ..., k_{c-1}) is k in base m1 and w_{i,j} = w[i*m1 + j]
    let total = ZERO;
    coeffs.forEach((pk, k) => {
      let term = pk;
      baseDigits(k, m1, c).forEach((digit, i) => { term = mul(term, w[i * m1 + digit]); });
      total ^= term;
    });
    return total;
  }

  function phi(lam, c, m1) {
    // Phi_lambda = (1, lam^{m1^i}, ..., lam^{(m1-1) m1^i})_{0 <= i < c}, so
    // that Psi(p)[Phi_lambda] = p(lambda). With 0^0 = 1, phi(0) = Phi_0.
    const out = [];
    for (let i = 0; i < c; i += 1) {
      for (let j = 0; j < m1; j += 1) out.push(pow(lam, j * m1 ** i));
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Parameters and the graph <-> H^m dictionary
  // -------------------------------------------------------------------------

  class Params {
    // Parameters of one PCP instance. Vertices are the points of H^m, so
    // graphs have at most h^m vertices. The field must be set first.

    constructor(h = 3, m = 2, c = 2) {
      if ((c + 1) % 2 !== 1) throw new Error("c + 1 must be odd (c + 1 = 2^{c'} +- 1)");
      if (h > Q) throw new Error("H must be a subset of F_q");
      this.T = T;
      this.h = h;
      this.m = m;
      this.c = c;
      this.H = Array.from({ length: h }, (_, i) => i);   // h distinct field elements
      // Degree bound D for all four encoded polynomials. The largest is B0,
      // of degree <= deg(LDE(E)) + 3 deg(chi) = 2m(h-1) + 3m(h-1).
      this.D = 5 * m * (h - 1);
      this.m1 = 2;
      while (this.m1 ** c <= this.D) this.m1 += 1;     // m1^c > D, so Psi is defined
      this.omega = elementOfOrder(3);                  // colours are 1, omega, omega^2
      this.zeta = elementOfOrder(c + 1);
    }

    checkField() {
      if (this.T !== T) throw new Error("the field changed since these parameters were made");
    }

    maxVertices() {
      return this.h ** this.m;
    }

    vertexPoint(v) {
      // Vertex v in {0, ..., h^m - 1} -> point of H^m (base-h digits)
      return baseDigits(v, this.h, this.m).map(d => this.H[d]);
    }
  }

  function edgeLde(params, edges) {
    // LDE(E) on H^{2m}, where E(x, y) = 1 iff {x, y} is an edge
    const values = [];
    for (const [u, v] of edges) {
      const pu = params.vertexPoint(u), pv = params.vertexPoint(v);
      values.push([concat(pu, pv), ONE]);
      values.push([concat(pv, pu), ONE]);
    }
    return Poly.lde(2 * params.m, params.H, values);
  }

  Object.assign(PCP, {
    setField, ZERO, ONE, add, sub, mul, div, pow, elementOfOrder,
    Random, randomBit, randomElement,
    vadd, scale, concat, zeroVector, randomVector,
    F2Poly, numHadamardQuestionsLog2,
    uniMul, vanishingUnivariate, lagrangeBasis, Z_H,
    Poly, baseDigits, psiEvaluate, phi, Params, edgeLde
  });
  Object.defineProperty(PCP, "T", { get: () => T, configurable: true });
  Object.defineProperty(PCP, "Q", { get: () => Q, configurable: true });

})(typeof globalThis.PCP === "object" ? globalThis.PCP : (globalThis.PCP = {}));
