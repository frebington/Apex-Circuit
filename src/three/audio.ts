export class RaceAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOscA: OscillatorNode | null = null;
  private engineOscB: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private skidGain: GainNode | null = null;
  private muted = false;
  private unlocked = false;

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
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.32;
      this.masterGain.connect(this.ctx.destination);

      // Continuous two-oscillator engine synth
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 240;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;

      this.engineOscA = this.ctx.createOscillator();
      this.engineOscA.type = 'sawtooth';
      this.engineOscA.frequency.value = 55;

      this.engineOscB = this.ctx.createOscillator();
      this.engineOscB.type = 'triangle';
      this.engineOscB.frequency.value = 110;

      this.engineOscA.connect(this.engineFilter);
      this.engineOscB.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      this.engineOscA.start();
      this.engineOscB.start();

      // Tire skid filtered noise loop
      const bufferSize = this.ctx.sampleRate;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const skidFilter = this.ctx.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.value = 1150;
      skidFilter.Q.value = 3.2;

      this.skidGain = this.ctx.createGain();
      this.skidGain.gain.value = 0;

      noise.connect(skidFilter);
      skidFilter.connect(this.skidGain);
      this.skidGain.connect(this.masterGain);
      noise.start();

      this.unlocked = true;
    } catch {
      // AudioContext blocked or unavailable
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.32,
        this.ctx.currentTime,
        0.04,
      );
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public updateEngine(
    active: boolean,
    speedMs: number,
    throttle: number,
    skidAmount: number,
  ): void {
    if (!this.ctx || !this.engineGain || !this.engineOscA || !this.engineOscB || !this.engineFilter || !this.skidGain) {
      return;
    }
    const now = this.ctx.currentTime;
    if (!active || this.muted) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.08);
      this.skidGain.gain.setTargetAtTime(0, now, 0.06);
      return;
    }

    const speedNorm = Math.min(1, Math.abs(speedMs) / 46);
    const gearCycle = (speedNorm * 4.2) % 1;
    const baseFreq = 52 + speedNorm * 95 + gearCycle * 28 + throttle * 14;

    this.engineOscA.frequency.setTargetAtTime(baseFreq, now, 0.05);
    this.engineOscB.frequency.setTargetAtTime(baseFreq * 1.99, now, 0.05);
    this.engineFilter.frequency.setTargetAtTime(
      220 + speedNorm * 620 + throttle * 240,
      now,
      0.06,
    );
    this.engineGain.gain.setTargetAtTime(
      0.11 + speedNorm * 0.1 + throttle * 0.06,
      now,
      0.06,
    );

    const clampedSkid = Math.max(0, Math.min(1, skidAmount));
    this.skidGain.gain.setTargetAtTime(clampedSkid * 0.14, now, 0.04);
  }

  public playTone(freq: number, duration: number, type: OscillatorType = 'triangle', gain = 0.22): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playCountdownBeep(isGo: boolean): void {
    if (isGo) {
      this.playTone(880, 0.34, 'triangle', 0.28);
    } else {
      this.playTone(440, 0.16, 'triangle', 0.2);
    }
  }

  public playLapChime(isFinish: boolean): void {
    if (isFinish) {
      this.playTone(523.25, 0.18, 'triangle', 0.24);
      setTimeout(() => this.playTone(659.25, 0.18, 'triangle', 0.24), 110);
      setTimeout(() => this.playTone(783.99, 0.35, 'triangle', 0.28), 220);
    } else {
      this.playTone(659.25, 0.14, 'triangle', 0.2);
      setTimeout(() => this.playTone(880, 0.22, 'triangle', 0.22), 95);
    }
  }

  public playBump(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.12);
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public dispose(): void {
    try {
      this.engineOscA?.stop();
      this.engineOscB?.stop();
      void this.ctx?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.ctx = null;
    this.unlocked = false;
  }
}
