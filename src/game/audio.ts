export class CozyAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private driftSource: AudioBufferSourceNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;
  private driftGain: GainNode | null = null;

  private muted = false;
  private unlocked = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.45,
        this.ctx.currentTime,
        0.04,
      );
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public unlock(): void {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.45;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Soft warm engine purr
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 180;
      engineFilter.Q.value = 1.2;

      const engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;

      const osc1 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.value = 58;

      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 116;

      const subGain = ctx.createGain();
      subGain.gain.value = 0.25;

      osc1.connect(engineFilter);
      osc2.connect(subGain);
      subGain.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);

      osc1.start();
      osc2.start();

      this.engineOsc1 = osc1;
      this.engineOsc2 = osc2;
      this.engineFilter = engineFilter;
      this.engineGain = engineGain;

      // Filtered noise buffer for cozy tire drift hiss
      const bufSize = ctx.sampleRate * 2;
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const driftSource = ctx.createBufferSource();
      driftSource.buffer = noiseBuf;
      driftSource.loop = true;

      const driftFilter = ctx.createBiquadFilter();
      driftFilter.type = 'bandpass';
      driftFilter.frequency.value = 950;
      driftFilter.Q.value = 0.9;

      const driftGain = ctx.createGain();
      driftGain.gain.value = 0;

      driftSource.connect(driftFilter);
      driftFilter.connect(driftGain);
      driftGain.connect(master);
      driftSource.start();

      this.driftSource = driftSource;
      this.driftFilter = driftFilter;
      this.driftGain = driftGain;

      this.unlocked = true;
    } catch {
      // Ignore audio init errors in restricted sandboxes
    }
  }

  public updateEngine(
    speedRatio: number,
    isDrifting: boolean,
    isBoosting: boolean,
    isActive: boolean,
  ): void {
    if (!this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineFilter || !this.engineGain || !this.driftGain || !this.driftFilter) {
      return;
    }
    const now = this.ctx.currentTime;
    const clamped = Math.max(0, Math.min(1.4, speedRatio));
    const targetGain = isActive ? 0.06 + clamped * 0.065 : 0.0;
    const baseFreq = 52 + clamped * 92 + (isBoosting ? 24 : 0);

    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 2.01, now, 0.06);
    this.engineFilter.frequency.setTargetAtTime(
      170 + clamped * 440 + (isBoosting ? 220 : 0),
      now,
      0.06,
    );
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.08);

    const driftVol = isActive && isDrifting && clamped > 0.25 ? 0.085 : 0;
    this.driftGain.gain.setTargetAtTime(driftVol, now, 0.05);
    this.driftFilter.frequency.setTargetAtTime(850 + clamped * 450, now, 0.08);
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.14,
    delay = 0,
  ): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playCountdownTick(go: boolean): void {
    this.unlock();
    if (go) {
      this.playTone(523.25, 0.28, 'triangle', 0.18, 0);
      this.playTone(659.25, 0.34, 'triangle', 0.18, 0.04);
      this.playTone(783.99, 0.42, 'sine', 0.16, 0.08);
    } else {
      this.playTone(440, 0.18, 'triangle', 0.14, 0);
    }
  }

  public playStarPickup(): void {
    this.playTone(659.25, 0.18, 'sine', 0.14, 0);
    this.playTone(987.77, 0.26, 'sine', 0.12, 0.055);
  }

  public playBoost(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.28);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  public playBump(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.14);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playLapComplete(): void {
    this.playTone(523.25, 0.22, 'triangle', 0.15, 0);
    this.playTone(659.25, 0.22, 'triangle', 0.15, 0.09);
    this.playTone(783.99, 0.32, 'sine', 0.16, 0.18);
  }

  public playFinishFanfare(): void {
    const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.45, 'triangle', 0.15, idx * 0.085);
    });
  }

  public dispose(): void {
    try {
      this.engineOsc1?.stop();
      this.engineOsc2?.stop();
      this.driftSource?.stop();
      void this.ctx?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.ctx = null;
    this.unlocked = false;
  }
}
