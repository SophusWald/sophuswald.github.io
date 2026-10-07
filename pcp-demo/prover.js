// The provers: the honest prover of simple_pcp/prover.py, ported line by
// line, and cheating provers built from the same pieces.
//
// The proof consists of eight oracles
//
//     chi,       chi_lines         Had(LDE(Color))
//     chi_prime, chi_prime_lines   Had(chi~),  chi~(Y1, Y2) = LDE(Color)(Y1) - LDE(Color)(Y2)
//     A0,        A0_lines          Had(sum_i A^(i)(X) Y_i),  A^(i) from MultiDivide(LDE(Color)^3 - 1)
//     B0,        B0_lines          Had(sum_i B^(i)(X) Y_i),  B^(i) from MultiDivide(LDE(E) (chi~^3 - 1))
//
// For a polynomial f in k variables the two oracles are
//
//     point oracle  f[a, P]           = P(rho(f(a)))                    a in F_q^k
//     lines oracle  f_1[(a, b), w, P] = P(rho(Psi(f(a + X b))[w]))     a, b in F_q^k, w in F_q^{c m1}
//
// with P in P_3(t, F_2). Each oracle is a huge table of bits, so the prover
// returns it as a function that computes any requested entry.
//
// Cheating provers (for graphs that are not 3-colourable):
//   "closest"  a 3-colouring with as few monochromatic edges as possible.
//              B is then nonzero somewhere on H^{2m}, MultiDivide leaves a
//              nonzero remainder, and the prover silently drops it.
//   "four"     a proper colouring that uses a fourth colour, the field
//              element 0. Now chi^3 - 1 is nonzero at those vertices and the
//              remainder of the A0 division is dropped instead.
//   "corrupt"  the "closest" proof, with every oracle answer flipped at a
//              fixed pseudo-random fraction of all positions.

"use strict";

(function (PCP) {

  const { ONE, ZERO, Poly, psiEvaluate, edgeLde, numHadamardQuestionsLog2 } = PCP;

  function isProperColoring(n, edges, coloring) {
    return coloring.length === n && edges.every(([u, v]) => coloring[u] !== coloring[v]);
  }

  function multiDivide(P, H, strict = true) {
    // MultiDivide(P, Z_H(X_1), ..., Z_H(X_k)): the list Q_1, ..., Q_k with
    // P = sum_i Q_i * Z_H(X_i) + remainder. The honest prover (strict)
    // asserts that P vanishes on H^k, i.e. the remainder is zero; a
    // cheating prover discards a nonzero remainder.
    const quotients = [];
    let remainder = P;
    for (let i = 0; i < P.n; i += 1) {
      const [Qi, rest] = remainder.divideByVanishing(i, H);
      quotients.push(Qi);
      remainder = rest;
    }
    if (strict && !remainder.isZero()) throw new Error("P does not vanish on H^k");
    return { quotients, remainder };
  }

  function vanishingCertificate(P, H, strict = true) {
    // The polynomial sum_i P^(i)(X) * Y_i in 2k variables (X, Y)
    const k = P.n;
    let certificate = new Poly(2 * k);
    const { quotients, remainder } = multiDivide(P, H, strict);
    quotients.forEach((Qi, i) => {
      const Y_i = Poly.variable(2 * k, k + i);
      const X = Array.from({ length: k }, (_, j) => j);
      certificate = certificate.add(Qi.rename(2 * k, X).mul(Y_i));
    });
    return { certificate, droppedRemainder: !remainder.isZero() };
  }

  function hadamardOracle(f) {
    // Had(f): (a, P) -> P(rho(f(a)))
    const cache = new Map();
    function valueAt(a) {
      const key = a.join(",");
      if (!cache.has(key)) cache.set(key, f.evaluate(a));
      return cache.get(key);
    }
    return (a, P) => P.call(valueAt(a));
  }

  function linesOracle(f, params) {
    // Had(Psi*(L(f))): ((a, b), w, P) -> P(rho(Psi(f(a + X b))[w]))
    const cache = new Map();
    function line(a, b) {
      const key = a.join(",") + ";" + b.join(",");
      if (!cache.has(key)) cache.set(key, f.restrictToLine(a, b));
      return cache.get(key);
    }
    return (a, b, w, P) => {
      const coeffs = line(a, b);
      if (coeffs.length > params.D + 1) throw new Error("line restriction exceeds the degree bound");
      return P.call(psiEvaluate(coeffs, w, params.c, params.m1));
    };
  }

  function buildProof(params, n, edges, vertexColors, strict) {
    // The eight oracles for the colouring vertexColors (one field element
    // per vertex). With strict, both polynomials must vanish on the grid.
    params.checkField();
    if (n > params.maxVertices()) throw new Error("too many vertices");
    const { m, H } = params;

    // Color : H^m -> F_q. Grid points that are not vertices of G are
    // isolated vertices and get colour 1.
    const colorValues = [];
    for (let v = 0; v < params.maxVertices(); v += 1) colorValues.push([params.vertexPoint(v), ONE]);
    for (let v = 0; v < n; v += 1) colorValues.push([params.vertexPoint(v), vertexColors[v]]);

    const firstHalf = Array.from({ length: m }, (_, j) => j);
    const secondHalf = Array.from({ length: m }, (_, j) => m + j);

    const chiHat = Poly.lde(m, H, colorValues);                           // LDE(Color)
    const A = vanishingCertificate(chiHat.pow(3).sub(ONE), H, strict);

    const chiY1 = chiHat.rename(2 * m, firstHalf);                        // LDE(Color)(Y1)
    const chiY2 = chiHat.rename(2 * m, secondHalf);                       // LDE(Color)(Y2)
    const chiTilde = chiY1.sub(chiY2);
    const EHat = edgeLde(params, edges);                                  // LDE(E)
    const B = vanishingCertificate(EHat.mul(chiTilde.pow(3).sub(ONE)), H, strict);

    const proof = {};
    const polynomials = { chi: chiHat, chi_prime: chiTilde, A0: A.certificate, B0: B.certificate };
    for (const [name, f] of Object.entries(polynomials)) {
      if (f.degree() > params.D) throw new Error(`${name} exceeds the degree bound`);
      proof[name] = hadamardOracle(f);
      proof[name + "_lines"] = linesOracle(f, params);
    }
    return {
      proof,
      polynomials,
      droppedRemainder: { A0: A.droppedRemainder, B0: B.droppedRemainder }
    };
  }

  function colourValue(params, colour) {
    // Colour index 0, 1, 2 -> 1, omega, omega^2; the forbidden fourth colour 3 -> 0
    return [ONE, params.omega, PCP.pow(params.omega, 2), ZERO][colour];
  }

  function honestProver(params, n, edges, coloring) {
    // Build the proof for graph ([n], edges) from a proper 3-colouring (a
    // list of colours in {0, 1, 2}, one per vertex)
    if (!isProperColoring(n, edges, coloring) || coloring.some(c => c > 2)) {
      throw new Error("not a proper 3-colouring");
    }
    return buildProof(params, n, edges, coloring.map(c => colourValue(params, c)), true);
  }

  function cheatingProver(params, n, edges, coloring, corruptionRate = 0, corruptionSeed = 0) {
    // Build a proof from an arbitrary colouring with colours in {0, 1, 2, 3}
    // (3 is the forbidden fourth colour), dropping the division remainders
    // the honest prover would refuse to drop. With corruptionRate > 0, the
    // answers are then flipped on that fraction of all oracle positions.
    const built = buildProof(params, n, edges, coloring.map(c => colourValue(params, c)), false);
    if (corruptionRate > 0) built.proof = corruptProof(built.proof, corruptionRate, corruptionSeed);
    return built;
  }

  // -------------------------------------------------------------------------
  // Corrupting a proof
  // -------------------------------------------------------------------------
  // A position of an oracle is its name together with its arguments. It is
  // corrupted iff a hash of the position (and the seed) is below rate, so
  // the corrupted set is a fixed table of positions: asking the same
  // question twice gives the same (wrong) answer.

  function hashString(s, seed) {
    let h = (0x811C9DC5 ^ seed) >>> 0;                  // FNV-1a
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= h >>> 16;                                      // final mixing
    h = Math.imul(h, 0x85EBCA6B) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xC2B2AE35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }

  function positionKey(name, args) {
    return name + "|" + args.map(x => (x instanceof PCP.F2Poly ? x.key() : x.join(","))).join("|");
  }

  function corruptProof(proof, rate, seed) {
    const threshold = rate * 4294967296;
    const corrupted = {};
    for (const [name, oracle] of Object.entries(proof)) {
      corrupted[name] = (...args) => {
        const flip = hashString(positionKey(name, args), seed) < threshold ? 1 : 0;
        return oracle(...args) ^ flip;
      };
    }
    return corrupted;
  }

  function proofLengthLog2(params) {
    // log2 of the total number of bits in the eight oracle tables. A point
    // oracle over F_q^k has q^k * |P_3| entries; a lines oracle has
    // q^{2k} * q^{c m1} * |P_3| entries. The four polynomials live in
    // k = m, 2m, 2m, 4m variables.
    const { m, c, m1 } = params;
    const t = params.T;
    const questions = numHadamardQuestionsLog2(3);
    const exponents = [];
    for (const k of [m, 2 * m, 2 * m, 4 * m]) {
      exponents.push(k * t + questions);                  // point oracle
      exponents.push(2 * k * t + c * m1 * t + questions);  // lines oracle
    }
    const top = Math.max(...exponents);
    return top + Math.log2(exponents.reduce((s, e) => s + 2 ** (e - top), 0));
  }

  Object.assign(PCP, {
    isProperColoring, multiDivide, vanishingCertificate, hadamardOracle, linesOracle,
    buildProof, colourValue, honestProver, cheatingProver, corruptProof, proofLengthLog2
  });

})(globalThis.PCP);
