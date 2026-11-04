// Lightweight fire simulation (no fluid physics): per-fuel heat/moisture/burn-rate, a flame with heat + oxygen levels,
// tinder that can be too little / too much, and a rope with a heat buffer. Pure JS - runs in Node for tuning.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const range = (r, rng) => lerp(r[0], r[1], rng());

export class FireSim {
  constructor(cfg, rng = Math.random) { this.c = cfg; this.rng = rng; this.reset(); }

  reset() {
    const c = this.c;
    this.t = 0; this.nextId = 1;
    this.fuels = [];
    this.tinder = { amount: 0, dryness: 0, warm: 0, state: 'none', placed: 0 };   // none | unlit | burning | spent
    this.H = 0;            // flame heat
    this.O = 1;            // oxygen level (1 = normal air, >1 enriched by blowing)
    this.lit = false; this.dead = false; this.deadT = 0;
    this.rope = 0; this.snapped = false; this.snapT = 0;
    this.blow = 0; this.tip = 0;
    this.burnLoad = 0; this.smother = 0; this.snuffed = false;
    this.events = [];
    for (const [type, n] of Object.entries(c.pit)) for (let i = 0; i < n; i++) this.addFuel(type, true);
  }

  newFuel(type) {
    const d = this.c.fuels[type];
    return { id: this.nextId++, type, mass: d.mass, moist: range(d.moisture, this.rng), temp: 0, burning: false, spent: false };
  }

  /** add a piece to the pit */
  addFuel(type, initial = false) {
    if (!initial && this.fuels.filter((f) => !f.spent).length >= this.c.pitMax) return null;
    const f = this.newFuel(type);
    this.fuels.push(f);
    if (!initial) this.H = Math.max(0, this.H - this.c.addCool * f.mass * (0.5 + f.moist) * Math.min(1, this.H));
    return f;
  }

  addTinder(curls, dryness) {
    const T = this.tinder, amt = curls * this.c.tinder.curlAmount;
    T.dryness = T.amount + amt > 0 ? (T.dryness * T.amount + dryness * amt) / (T.amount + amt) : dryness;
    T.amount += amt; T.placed += amt;
    if (T.state === 'none') T.state = 'unlit';
  }

  /** one spark landing on the nest. q = spark quality 0..1. returns what happened */
  spark(q) {
    const T = this.tinder, c = this.c.tinder;
    if (T.state !== 'unlit' || T.amount <= 0) return { ok: false, why: T.state === 'burning' ? 'already burning' : 'no tinder' };
    const adequacy = T.amount >= c.minCatch ? 1 : (T.amount / c.minCatch) * 0.35;          // too little won't catch
    T.warm += q * T.dryness * adequacy * c.warmGain;
    if (T.warm >= c.ignitionWarm) { T.state = 'burning'; this.lit = true; this.H += 0.15; this.events.push('lit'); return { ok: true, ignited: true }; }
    return { ok: true, ignited: false, warm: T.warm };
  }

  burning() { return this.fuels.filter((f) => f.burning && !f.spent); }
  get alive() { return this.tinder.state === 'burning' || this.burning().length > 0 || this.H > this.c.dead.heat; }

  step(dt, blow = 0) {
    const C = this.c, F = C.flame, Ox = C.oxygen, T = this.tinder;
    this.t += dt;
    blow = clamp(blow, 0, 1); this.blow = blow;

    // too much tinder smothers: starves the fire of oxygen until enough of it has burned away
    this.smother = (T.state === 'unlit' || T.state === 'burning') && T.amount > C.tinder.ideal
      ? clamp((T.amount - C.tinder.ideal) / (C.tinder.maxAmount - C.tinder.ideal), 0, 1) * C.tinder.smotherMax : 0;
    const oTarget = clamp(1 - this.smother - Ox.consumption * this.burnLoad, 0.08, 1);
    this.O = clamp(this.O + (oTarget - this.O) * Ox.relax * dt + blow * Ox.blowGain * dt, 0, Ox.max);
    const Oeff = Math.min(this.O, Ox.burnBoostMax);

    let Q = 0, load = 0;
    if (T.state === 'unlit') T.warm = Math.max(0, T.warm - C.tinder.warmDecay * dt);
    if (T.state === 'burning') {
      T.amount -= C.tinder.burnRate * Oeff * dt;
      Q += C.tinder.heat * Oeff * (1 - 0.6 * this.smother);       // a smothered pile gives a weak, smoky flame
      load += C.tinder.burnRate * 0.5;
      if (T.amount <= 0) { T.amount = 0; T.state = 'spent'; }
    }

    for (const f of this.fuels) {
      if (f.spent) continue;
      const d = C.fuels[f.type];
      if (!f.burning) {
        // warmed by the flame; heavy pieces warm slowly; wet pieces need more heat to catch
        f.temp += ((this.H * F.heatFuelK - f.temp * F.coolK) / d.capacity) * dt;
        f.temp = Math.max(0, f.temp);
        if (f.temp > 0.15) f.moist = Math.max(0, f.moist - F.evaporation * (f.temp - 0.15) * dt);
        if (f.temp >= d.igniteTemp * (1 + F.moisturePenalty * f.moist)) { f.burning = true; this.events.push('caught:' + f.type); }
      } else {
        const br = d.burnRate * Oeff;
        f.mass -= br * dt;
        f.moist = Math.max(0, f.moist - 0.1 * dt);
        Q += d.heatValue * br * (1 - F.moistureDamp * f.moist) * F.heatScale;
        load += br;
        if (f.mass <= 0) { f.mass = 0; f.spent = true; f.burning = false; this.events.push('burnt:' + f.type); }
      }
    }
    this.burnLoad = load;

    this.H += (Q - F.loss * this.H) * dt;
    // blowing hard on a weak ember snuffs it
    if (blow > C.blow.snuffLevel && this.H < C.blow.weakHeat) {
      this.H -= C.blow.snuffCool * (blow - C.blow.snuffLevel) * (1 - this.H / C.blow.weakHeat) * dt;
      this.snuffed = true;
    }
    this.H = clamp(this.H, 0, F.maxHeat);

    // fail state: lit once, now nothing is left glowing
    if (this.lit && !this.snapped) {
      if (!this.alive) this.deadT += dt; else this.deadT = 0;
      if (this.deadT >= C.dead.seconds) { this.dead = true; this.events.push('dead'); }
    }

    // flame tip + rope heat buffer
    this.tip = F.tipMax * (1 - Math.exp(-F.tipSteepness * this.H)) * (0.75 + 0.25 * Math.min(Oeff, 1.2));
    const R = C.rope, reachY = R.height - R.reach;
    if (this.tip >= reachY && this.H >= R.minHeat) this.rope += R.heatRate * clamp((this.tip - reachY) / R.reach + 0.35, 0, 1.5) * dt;
    else this.rope = Math.max(0, this.rope - R.cool * dt);
    if (this.rope >= R.capacity && !this.snapped) { this.snapped = true; this.events.push('snap'); }
    return this;
  }
}
