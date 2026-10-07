// The PCP verifier for 3-COLOR: a line-by-line port of simple_pcp/verifier.py.
//
// The verifier gets the graph and oracle access to the proof:
//
//     proof.chi(a, P)                 chi[a, P]                 a in F_q^m
//     proof.chi_lines(a, b, w, P)     chi_1[(a, b), w, P]       a, b in F_q^m, w in F_q^{c m1}
//     proof.chi_prime, proof.chi_prime_lines    over F_q^{2m}
//     proof.A0,        proof.A0_lines           over F_q^{2m}
//     proof.B0,        proof.B0_lines           over F_q^{4m}
//
// where P is a polynomial in P_3(t, F_2) and every answer is a bit. It reads
// only a handful of entries and outputs accept or reject.
//
// Since we are in characteristic 2, "-" is the same as "+" (here: ^).

"use strict";

(function (PCP) {

  const {
    ZERO, ONE, F2Poly, mul, sub, pow, vadd, scale, randomBit, randomElement, randomVector,
    zeroVector, concat, phi, Z_H, edgeLde
  } = PCP;

  function verify(params, n, edges, proof, rng, EHat = edgeLde(params, edges)) {
    // One run of the verifier. Returns { accept, failed, checks, randomness }.
    // EHat = LDE(E) depends only on the graph; it can be passed in to avoid
    // recomputing it on every run.
    params.checkField();
    const { m, c, m1, H, zeta } = params;
    if (n > params.maxVertices()) throw new Error("too many vertices");

    // ---- the randomness (red in the paper), shared by all tests -----------
    const a = randomVector(m, rng), b = randomVector(m, rng);
    const alpha = randomVector(2 * m, rng), beta = randomVector(4 * m, rng);
    const u = randomVector(c * m1, rng), v = randomVector(c * m1, rng);
    const lam = randomElement(rng, true);
    const P = [0, 1, 2, 3].map(i => F2Poly.random(i, rng));    // P_i in P_i(t, F_2)
    const R = F2Poly.random(3, rng);
    const s = randomBit(rng);
    const L = F2Poly.randomLinear(rng);                       // L(0) = 0

    // ---- subroutines ------------------------------------------------------
    function SC(g, poly) {
      // Self-correction: g[poly + R] - g[R]
      return g(poly.add(R)) ^ g(R);
    }

    function LC(theta, u0) {
      // Line correction: - sum_{i=1}^{c+1} theta[u0 + zeta^i v, L]
      let total = ZERO;
      for (let i = 1; i <= c + 1; i += 1) total ^= theta(vadd(u0, scale(pow(zeta, i), v)), L);
      return total;
    }

    function Lambda(gamma) {
      // Lambda_gamma(z) = L(rho(gamma * y^3 - gamma)) where y = rho^{-1}(z)
      return F2Poly.interpolate(y => L.call(sub(mul(gamma, pow(y, 3)), gamma)));
    }

    const sPoly = F2Poly.constant(s);
    const zerosM = zeroVector(m);
    const Z_a = Z_H(H, a);
    const Z_ab = Z_H(H, concat(a, b));
    const PhiLam = phi(lam, c, m1), Phi0 = phi(ZERO, c, m1);

    // theta[w, P]: the lines-table entry of A0 / B0 for the line through
    // `start` in direction `direction`
    function linesEntry(oracle, start, direction) {
      return (w, poly) => oracle(start, direction, w, poly);
    }

    const thetaA1 = linesEntry(proof.A0_lines, concat(a, zerosM), alpha);
    const thetaA2 = linesEntry(proof.A0_lines, concat(a, Z_a), alpha);
    const thetaB1 = linesEntry(proof.B0_lines, concat(a, b, zerosM, zerosM), beta);
    const thetaB2 = linesEntry(proof.B0_lines, concat(a, b, Z_ab), beta);

    const failed = [];
    const checks = [];       // every test, in order (bookkeeping for the page)

    function check(name, ok) {
      checks.push(name);
      if (!ok) failed.push(name);
    }

    // ---- low-degree tests -------------------------------------------------
    for (const [name, k] of [["chi", m], ["chi_prime", 2 * m], ["A0", 2 * m], ["B0", 4 * m]]) {
      const Pi = proof[name], PiLines = proof[name + "_lines"];
      const a2 = randomVector(k, rng), b2 = randomVector(k, rng);    // fresh (blue)

      const f = poly => Pi(a2, poly);                         // Pi[a', .]
      const f1 = (w, poly) => PiLines(a2, b2, w, poly);       // Pi_1[(a', b'), ., .]
      const f1AtU = poly => f1(u, poly);                      // Pi_1[(a', b'), u, .]

      for (const [gName, g] of [["point", f], ["lines", f1AtU]]) {
        // Hadamard test: affine-ness and multiplicativity of the encoding
        for (let i = 0; i < 4; i += 1) {
          check(`LDT.${name}.${gName}.affine${i}`,
                SC(g, P[i].add(sPoly)) === (g(P[i]) ^ s));
        }
        for (const i of [1, 2]) {
          check(`LDT.${name}.${gName}.mult${i}`,
                SC(g, L.mul(P[i])) === (SC(g, L) & SC(g, P[i])));
        }
      }

      // degree-c test:  Pi_1[u, L] + sum_i Pi_1[u + zeta^i v, L] = 0
      check(`LDT.${name}.degree_c`, (f1(u, L) ^ LC(f1, u)) === 0);
      // lines table agrees with the point table at a' + lambda b'
      check(`LDT.${name}.line_vs_point`, LC(f1, PhiLam) === Pi(vadd(a2, scale(lam, b2)), L));
    }

    // ---- 3-colouring tests ------------------------------------------------
    for (const [name, theta] of [["A1", thetaA1], ["A2", thetaA2], ["B1", thetaB1], ["B2", thetaB2]]) {
      const g = poly => theta(u, poly);
      for (const i of [0, 1]) {
        check(`ZERO.${name}.affine${i}`, SC(g, P[i].add(sPoly)) === (g(P[i]) ^ s));
      }
      check(`ZERO.${name}.degree_c`, LC(theta, u) === theta(u, L));
    }

    const { chi, chi_prime, A0, B0 } = proof;

    // A0 is 0 at (a, 0) and equals chi(a)^3 - 1 at (a, Z_H(a))
    check("ZERO.A1.line_vs_point",
          LC(thetaA1, PhiLam) === A0(vadd(concat(a, zerosM), scale(lam, alpha)), L));
    check("ZERO.A1.is_zero", LC(thetaA1, Phi0) === 0);
    check("ZERO.A2.line_vs_point",
          LC(thetaA2, PhiLam) === A0(vadd(concat(a, Z_a), scale(lam, alpha)), L));
    check("ZERO.A2.equals_val",
          LC(thetaA2, Phi0) === SC(poly => chi(a, poly), Lambda(ONE)));

    // chi'(a, b) = chi(a) - chi(b)
    check("CONS.chi_prime", chi_prime(concat(a, b), L) === (chi(a, L) ^ chi(b, L)));

    // B0 is 0 at (a, b, 0) and equals LDE(E)(a, b) (chi'(a, b)^3 - 1) at (a, b, Z_H(a, b))
    const E_ab = EHat.evaluate(concat(a, b));
    check("ZERO.B1.line_vs_point",
          LC(thetaB1, PhiLam) === B0(vadd(concat(a, b, zerosM, zerosM), scale(lam, beta)), L));
    check("ZERO.B1.is_zero", LC(thetaB1, Phi0) === 0);
    check("ZERO.B2.line_vs_point",
          LC(thetaB2, PhiLam) === B0(vadd(concat(a, b, Z_ab), scale(lam, beta)), L));
    check("ZERO.B2.equals_prop",
          LC(thetaB2, Phi0) === SC(poly => chi_prime(concat(a, b), poly), Lambda(E_ab)));

    return { accept: failed.length === 0, failed, checks, randomness: { a, b, lam } };
  }

  PCP.verify = verify;

})(globalThis.PCP);
