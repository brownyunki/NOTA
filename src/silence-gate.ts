// Require sustained quiet, so one short dip in a ringing string cannot open the gate.
export class SilenceGate {
  private quietSince: number | null = null;
  ready = false;
  reset() { this.quietSince = null; this.ready = false; }
  update(rms: number, now: number, threshold = 0.006): boolean {
    if (this.ready) return true;
    if (!Number.isFinite(rms) || rms >= threshold) { this.quietSince = null; return false; }
    this.quietSince ??= now;
    this.ready = now - this.quietSince >= 300;
    return this.ready;
  }
}
