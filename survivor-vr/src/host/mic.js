// Optional microphone "blow" detector. Needs a user gesture + permission BEFORE entering VR
// (host panel toggle). If anything fails the fire challenge silently uses hands-only fanning.
export class MicInput {
  constructor() { this.enabled = false; this.status = 'off'; this._level = 0; }

  async enable() {
    if (this.enabled) return true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no mic API');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ac = new AC();
      const src = this.ac.createMediaStreamSource(this.stream);
      const lp = this.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;   // blowing = low rumble
      this.an = this.ac.createAnalyser(); this.an.fftSize = 1024;
      src.connect(lp); lp.connect(this.an);
      this.buf = new Float32Array(this.an.fftSize);
      this.enabled = true; this.status = 'on';
      return true;
    } catch (e) { this.status = 'unavailable (' + (e.message || e.name) + ')'; this.enabled = false; return false; }
  }

  disable() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ac?.close(); this.ac = null; this.enabled = false; this.status = 'off'; this._level = 0;
  }

  /** smoothed RMS level (0..~1) */
  level() {
    if (!this.enabled || !this.an) return 0;
    this.an.getFloatTimeDomainData(this.buf);
    let s = 0; for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(s / this.buf.length);
    this._level += (rms - this._level) * 0.4;
    return this._level;
  }
}
