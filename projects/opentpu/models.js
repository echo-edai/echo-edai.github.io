/* Original educational models. MIT. No model here is the openTPU simulator. */
(function (root) {
  'use strict';
  const clone = x => JSON.parse(JSON.stringify(x));
  function fifoInit() { return {q: [], cycle: 0}; }
  function fifoStep(s, i) {
    const ready = s.q.length < 2, valid = s.q.length > 0;
    const put = !!i.iv && ready, pop = !!i.or && valid;
    const q = s.q.slice(), output = q[0];
    if (i.reset) return {state: fifoInit(), put: false, pop: false, ready: false, valid: false};
    if (pop) q.shift();
    if (put) q.push(Number(i.data) & 255);
    return {state: {q, cycle: s.cycle + 1}, put, pop, output, ready, valid};
  }
  function route(cx, cy, dx, dy) {
    return dx > cx ? 1 : dx < cx ? 2 : dy > cy ? 3 : dy < cy ? 4 : 0;
  }
  function xyPath(cx, cy, dx, dy) {
    const path = [[cx, cy]];
    for (let k = 0; k < 16 && (cx !== dx || cy !== dy); k++) {
      const p = route(cx, cy, dx, dy);
      if (p === 1) cx++; else if (p === 2) cx--; else if (p === 3) cy++; else cy--;
      path.push([cx, cy]);
    }
    return path;
  }
  function directoryInit() {
    return {cycle: 0, state: 0, sharers: 0, owner: 0, busy: false, pending: 0,
      rspValid: false, rspClient: 0, rspModified: false, targetState: 0,
      targetSharers: 0, targetOwner: 0, client: 0, getm: false};
  }
  function directoryStep(s, i) {
    if (i.reset) return directoryInit();
    const n = clone(s); n.cycle++;
    const ready = !s.busy && !s.rspValid;
    if (s.rspValid && i.rspReady) n.rspValid = false;
    if (i.reqValid && ready) {
      const client = i.client ? 1 : 0, onehot = 1 << client;
      let targets = 0, st = s.state, sh = s.sharers, owner = s.owner;
      if (i.getm) {
        st = 2; sh = 0; owner = client;
        if (s.state === 1) targets = s.sharers & ~onehot;
        else if (s.state === 2 && s.owner !== client) targets = 1 << s.owner;
      } else {
        if (s.state === 0) { st = 1; sh = onehot; }
        else if (s.state === 1) sh = s.sharers | onehot;
        else if (s.owner !== client) { targets = 1 << s.owner; st = 1; sh = targets | onehot; }
      }
      if (targets === 0) {
        n.state = st; n.sharers = sh; n.owner = owner;
        n.rspValid = true; n.rspClient = client; n.rspModified = st === 2;
      } else {
        n.busy = true; n.pending = targets; n.targetState = st;
        n.targetSharers = sh; n.targetOwner = owner; n.client = client; n.getm = !!i.getm;
      }
    }
    if (s.busy) {
      n.pending = s.pending & ~(i.ack || 0);
      if (n.pending === 0) {
        n.state = s.targetState; n.sharers = s.targetSharers; n.owner = s.targetOwner;
        n.busy = false; n.rspValid = true; n.rspClient = s.client;
        n.rspModified = s.targetState === 2;
      }
    }
    return n;
  }
  function scoreboardStep(busy, reads, writes, complete, valid = true) {
    const ready = (busy & (reads | writes)) === 0;
    return {ready, busy: ((busy & ~complete) | (valid && ready ? writes : 0)) & 255};
  }
  function roundEven(x) {
    const f = Math.floor(x), d = x - f;
    return d < .5 ? f : d > .5 ? f + 1 : (f % 2 === 0 ? f : f + 1);
  }
  function quantize(values, range = 127) {
    const maximum = Math.max(...values.map(Math.abs));
    const scale = maximum === 0 ? 1 : maximum / range;
    const q = values.map(v => Math.max(-range, Math.min(range, roundEven(v / scale))));
    const restored = q.map(v => v * scale);
    return {scale, q, restored, maxError: Math.max(...values.map((v, k) => Math.abs(v - restored[k])))};
  }
  function bankArbitrate(addresses, banks, slots) {
    const used = Array(banks).fill(0);
    return addresses.map((addr, lane) => {
      const bank = ((addr % banks) + banks) % banks;
      const granted = used[bank] < slots; if (granted) used[bank]++;
      return {lane, addr, bank, granted};
    });
  }
  function matmul(A, W, terms = A[0].length) {
    return A.map(row => W.map(w => row.slice(0, terms).reduce((s, x, k) => s + x * w[k], 0)));
  }
  const api = {fifoInit, fifoStep, route, xyPath, directoryInit, directoryStep,
    scoreboardStep, quantize, bankArbitrate, matmul, roundEven};
  root.OTPU_MODELS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
