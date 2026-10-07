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
//   cheatingProver   builds the proof from a false colouring and silently
//                    drops the nonzero remainder that MultiDivide leaves:
//                    for a 3-colouring with a monochromatic edge, in the B0
//                    division; for a colouring that uses the fourth colour 0,
//                    in the A0 division. Only the zero test can catch this.
//   fakeHadamardEncoding, fakeZeroSlices   start from such a proof and make
//                    the zero test pass, by breaking the Hadamard encoding of
//                    chi_prime, or by replacing A0 and B0 with functions that
//                    are not polynomials.

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
      EHat,
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

  function cheatingProver(params, n, edges, coloring) {
    // Build a proof from an arbitrary colouring with colours in {0, 1, 2, 3}
    // (3 is the forbidden fourth colour), dropping the division remainders
    // the honest prover would refuse to drop
    return buildProof(params, n, edges, coloring.map(c => colourValue(params, c)), false);
  }

  // -------------------------------------------------------------------------
  // Cheating on the Hadamard encoding
  // -------------------------------------------------------------------------
  // The zero test for B0 compares B0(a, b, Z_H(a, b)), read through the lines
  // table, with one query to chi_prime at (a, b): the question
  // Lambda_gamma(z) = L(rho(gamma y^3 - gamma)), gamma = LDE(E)(a, b). For a
  // false colouring the two disagree at most points.
  //
  // At a point p, an honest Hadamard table answers P -> sum_S P_S v_S, where
  // S runs over the monomials and v_S = prod_{i in S} x_i are the products
  // of the bits of x = chi_prime(p). This prover keeps the answers linear in
  // P (so the affine tests pass) and keeps v_S for |S| <= 1 (so the linear
  // questions L, which are all the consistency tests ask, get honest
  // answers). It changes v_S for the quadratic monomials S such that, for
  // every L, the question Lambda_gamma is answered with L(rho(B0(p, Z_H(p)))).
  // That is t linear equations over F_2 in the binom(t, 2) unknowns. The
  // table is then no longer a Hadamard codeword, which only the
  // multiplicativity tests can notice.

  function solveF2(rows, rhs, numUnknowns) {
    // A solution of rows * x = rhs over F_2 (free variables 0), or null
    const pivots = [];
    rows = rows.map((row, i) => [...row, rhs[i]]);
    let r = 0;
    for (let col = 0; col < numUnknowns && r < rows.length; col += 1) {
      const pivot = rows.findIndex((row, i) => i >= r && row[col]);
      if (pivot < 0) continue;
      [rows[r], rows[pivot]] = [rows[pivot], rows[r]];
      for (let i = 0; i < rows.length; i += 1) {
        if (i !== r && rows[i][col]) rows[i] = rows[i].map((x, j) => x ^ rows[r][j]);
      }
      pivots.push(col);
      r += 1;
    }
    if (rows.slice(r).some(row => row[numUnknowns])) return null;   // inconsistent
    const x = new Array(numUnknowns).fill(0);
    pivots.forEach((col, i) => { x[col] = rows[i][numUnknowns]; });
    return x;
  }

  function fakeHadamardEncoding(params, built) {
    // The proof `built` with the point oracle chi_prime replaced as above
    const { chi_prime: chiPrime, B0 } = built.polynomials;
    const { mul, pow, Z_H, concat, F2Poly } = PCP;
    const t = params.T;
    const quadratic = [];                         // the monomials z_i z_j
    for (let i = 0; i < t; i += 1) {
      for (let j = i + 1; j < t; j += 1) quadratic.push((1 << i) | (1 << j));
    }

    function changedMonomials(p) {
      // The quadratic monomials S whose v_S this prover flips at p
      const x = chiPrime.evaluate(p);
      const gamma = built.EHat.evaluate(p);
      const target = B0.evaluate(concat(p, Z_H(params.H, p)));
      const lambda = y => mul(gamma, pow(y, 3)) ^ gamma;   // gamma y^3 - gamma
      const error = lambda(x) ^ target;
      if (error === 0) return [];
      // Lambda_gamma = sum_j L_j F_j, where F_j is bit j of lambda(y) as a
      // polynomial in the bits of y. Flipping v_S changes the answer to F_j
      // by the coefficient of S in F_j; bit j must change by bit j of error.
      const rows = [], rhs = [];
      for (let j = 0; j < t; j += 1) {
        const F = F2Poly.interpolate(y => (lambda(y) >> j) & 1);
        rows.push(quadratic.map(S => F.coef[S]));
        rhs.push((error >> j) & 1);
      }
      const flips = solveF2(rows, rhs, quadratic.length);
      return flips ? quadratic.filter((_, i) => flips[i]) : [];   // no solution: stay honest
    }

    const cache = new Map();
    const honest = built.proof.chi_prime;
    function chiPrimeOracle(a, P) {
      const key = a.join(",");
      if (!cache.has(key)) cache.set(key, changedMonomials(a));
      let answer = honest(a, P);
      for (const S of cache.get(key)) answer ^= P.coef[S];
      return answer;
    }
    return { ...built.proof, chi_prime: chiPrimeOracle };
  }

  // -------------------------------------------------------------------------
  // Cheating with functions that are not polynomials
  // -------------------------------------------------------------------------
  // The zero test reads a certificate M in 2k variables (X, Y) only on the
  // two slices Y = 0 and Y = Z_H(X), where M must equal 0 and the polynomial
  // P being certified (chi^3 - 1 for A0, LDE(E)(chi'^3 - 1) for B0). This
  // prover replaces M by the function that agrees with M everywhere except
  // on the slice Y = Z_H(X), where it is set equal to P. (On Y = 0, M is
  // already 0.) That function is not a polynomial of low degree. The
  // point table encodes it, and in the lines table each line starting on the
  // slice is moved by a constant so that it takes the new value at X = 0.
  // The zero test then passes, but a line through such a point no longer
  // agrees with the point table elsewhere: the line-vs-point test notices.

  function fakeZeroSlices(params, built) {
    const { chi, chi_prime: chiPrime, A0, B0 } = built.polynomials;
    const { mul, pow, Z_H } = PCP;
    const certified = {
      A0: x => pow(chi.evaluate(x), 3) ^ ONE,                                   // chi^3 - 1
      B0: x => mul(built.EHat.evaluate(x), pow(chiPrime.evaluate(x), 3) ^ ONE)  // LDE(E)(chi'^3 - 1)
    };
    const proof = { ...built.proof };

    for (const [name, M] of [["A0", A0], ["B0", B0]]) {
      const k = M.n / 2;
      const shifts = new Map();
      function shift(p) {
        // The fake value minus M(p): nonzero only on the slice Y = Z_H(X)
        const key = p.join(",");
        if (!shifts.has(key)) {
          const x = p.slice(0, k), y = p.slice(k);
          const onSlice = Z_H(params.H, x).every((z, i) => z === y[i]);
          shifts.set(key, onSlice ? certified[name](x) ^ M.evaluate(p) : ZERO);
        }
        return shifts.get(key);
      }

      const values = new Map();
      proof[name] = (a, P) => {
        const key = a.join(",");
        if (!values.has(key)) values.set(key, M.evaluate(a) ^ shift(a));
        return P.call(values.get(key));
      };

      const lines = new Map();
      proof[name + "_lines"] = (a, b, w, P) => {
        const key = a.join(",") + ";" + b.join(",");
        if (!lines.has(key)) {
          const coeffs = M.restrictToLine(a, b);
          coeffs[0] ^= shift(a);                 // the value at X = 0 is the fake one
          lines.set(key, coeffs);
        }
        return P.call(psiEvaluate(lines.get(key), w, params.c, params.m1));
      };
    }
    return proof;
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
    buildProof, colourValue, honestProver, cheatingProver, fakeHadamardEncoding, fakeZeroSlices,
    proofLengthLog2
  });

})(globalThis.PCP);
