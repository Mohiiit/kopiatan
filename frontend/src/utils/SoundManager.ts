/**
 * SoundManager - Procedural sound effects using Web Audio API
 *
 * Generates all game sounds programmatically without external audio files.
 * Includes volume control and mute functionality.
 */

type SoundType =
  | 'diceRoll'
  | 'placeSettlement'
  | 'placeCity'
  | 'placeRoad'
  | 'collectResources'
  | 'robberMove'
  | 'steal'
  | 'turnChange'
  | 'gameStart'
  | 'victory';

class SoundManagerClass {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private _volume: number = 0.5;
  private _muted: boolean = false;
  private initialized: boolean = false;

  // Callbacks for UI updates
  private onVolumeChange: ((volume: number) => void) | null = null;
  private onMuteChange: ((muted: boolean) => void) | null = null;

  constructor() {
    // Load settings from localStorage
    const savedVolume = localStorage.getItem('kopiatan_volume');
    const savedMuted = localStorage.getItem('kopiatan_muted');

    if (savedVolume !== null) {
      this._volume = parseFloat(savedVolume);
    }
    if (savedMuted !== null) {
      this._muted = savedMuted === 'true';
    }
  }

  /**
   * Initialize the audio context (must be called after user interaction)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.updateMasterGain();
      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }

  /**
   * Ensure audio context is ready (resume if suspended)
   */
  private async ensureReady(): Promise<boolean> {
    if (!this.audioContext) {
      await this.init();
    }

    if (!this.audioContext || !this.masterGain) return false;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    return true;
  }

  /**
   * Update the master gain based on volume and mute state
   */
  private updateMasterGain(): void {
    if (this.masterGain) {
      this.masterGain.gain.value = this._muted ? 0 : this._volume;
    }
  }

  // Getters and setters
  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = Math.max(0, Math.min(1, value));
    this.updateMasterGain();
    localStorage.setItem('kopiatan_volume', this._volume.toString());
    this.onVolumeChange?.(this._volume);
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
    this.updateMasterGain();
    localStorage.setItem('kopiatan_muted', this._muted.toString());
    this.onMuteChange?.(this._muted);
  }

  toggleMute(): boolean {
    this.muted = !this._muted;
    return this._muted;
  }

  setCallbacks(
    onVolumeChange: (volume: number) => void,
    onMuteChange: (muted: boolean) => void
  ): void {
    this.onVolumeChange = onVolumeChange;
    this.onMuteChange = onMuteChange;
  }

  /**
   * Play a sound effect
   */
  async play(sound: SoundType): Promise<void> {
    const ready = await this.ensureReady();
    if (!ready || !this.audioContext || !this.masterGain) return;

    switch (sound) {
      case 'diceRoll':
        this.playDiceRoll();
        break;
      case 'placeSettlement':
        this.playPlaceSettlement();
        break;
      case 'placeCity':
        this.playPlaceCity();
        break;
      case 'placeRoad':
        this.playPlaceRoad();
        break;
      case 'collectResources':
        this.playCollectResources();
        break;
      case 'robberMove':
        this.playRobberMove();
        break;
      case 'steal':
        this.playSteal();
        break;
      case 'turnChange':
        this.playTurnChange();
        break;
      case 'gameStart':
        this.playGameStart();
        break;
      case 'victory':
        this.playVictory();
        break;
    }
  }

  /**
   * Create an oscillator with envelope
   */
  private createOscillator(
    type: OscillatorType,
    frequency: number,
    startTime: number,
    duration: number,
    gain: number = 0.3,
    attackTime: number = 0.01,
    decayTime: number = 0.1
  ): void {
    if (!this.audioContext || !this.masterGain) return;

    const osc = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(gain, startTime + attackTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration - decayTime);

    osc.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  /**
   * Create noise for percussive sounds
   */
  private createNoise(
    startTime: number,
    duration: number,
    gain: number = 0.1,
    filterFreq: number = 5000
  ): void {
    if (!this.audioContext || !this.masterGain) return;

    const bufferSize = this.audioContext.sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();

    noise.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;

    gainNode.gain.setValueAtTime(gain, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    noise.start(startTime);
    noise.stop(startTime + duration);
  }

  // === Sound Effect Implementations ===

  /**
   * Dice rolling - multiple short "clacks" simulating dice bouncing
   */
  private playDiceRoll(): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;

    // Create multiple "clack" sounds
    const numClacks = 6 + Math.floor(Math.random() * 4);

    for (let i = 0; i < numClacks; i++) {
      const delay = i * 0.05 + Math.random() * 0.02;
      const freq = 800 + Math.random() * 400;

      // Short percussive hit
      this.createNoise(now + delay, 0.03, 0.15 - i * 0.015, 3000 + Math.random() * 2000);

      // Add a subtle tonal element
      this.createOscillator('triangle', freq, now + delay, 0.04, 0.08, 0.005, 0.02);
    }

    // Final settling sound
    this.createNoise(now + 0.4, 0.08, 0.08, 2000);
  }

  /**
   * Settlement placement - warm building sound
   */
  private playPlaceSettlement(): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;

    // Low thump
    this.createOscillator('sine', 150, now, 0.2, 0.4, 0.01, 0.15);

    // Mid frequency "placement" tone
    this.createOscillator('triangle', 400, now + 0.02, 0.15, 0.25, 0.02, 0.1);

    // High confirmation chime
    this.createOscillator('sine', 800, now + 0.05, 0.3, 0.15, 0.02, 0.2);
    this.createOscillator('sine', 1000, now + 0.08, 0.25, 0.1, 0.02, 0.15);

    // Subtle wooden "knock"
    this.createNoise(now, 0.05, 0.1, 800);
  }

  /**
   * City upgrade - more substantial building sound
   */
  private playPlaceCity(): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;

    // Deeper bass for more substantial feel
    this.createOscillator('sine', 100, now, 0.3, 0.5, 0.02, 0.2);
    this.createOscillator('sine', 200, now + 0.02, 0.25, 0.3, 0.02, 0.15);

    // Layered construction sounds
    this.createNoise(now, 0.08, 0.15, 600);
    this.createNoise(now + 0.1, 0.06, 0.1, 800);

    // Rising tone for "upgrade" feel
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now + 0.05);
    osc.frequency.linearRampToValueAtTime(600, now + 0.2);
    gain.gain.setValueAtTime(0, now + 0.05);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now + 0.05);
    osc.stop(now + 0.4);

    // Success chime
    this.createOscillator('sine', 800, now + 0.15, 0.2, 0.15, 0.02, 0.15);
    this.createOscillator('sine', 1200, now + 0.2, 0.25, 0.12, 0.02, 0.18);
  }

  /**
   * Road placement - construction/paving sound
   */
  private playPlaceRoad(): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;

    // Quick scraping/paving noise
    this.createNoise(now, 0.1, 0.12, 1500);

    // Low "placement" thump
    this.createOscillator('sine', 180, now, 0.12, 0.25, 0.01, 0.08);

    // Quick confirmation
    this.createOscillator('triangle', 500, now + 0.05, 0.1, 0.12, 0.01, 0.07);
  }

  /**
   * Resource collection - satisfying coin/collect sound
   */
  private playCollectResources(): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;

    // Bright "ding" sounds like coins
    const frequencies = [1200, 1400, 1600];
    frequencies.forEach((freq, i) => {
      this.createOscillator('sine', freq, now + i * 0.04, 0.15, 0.12, 0.005, 0.1);
    });

    // Subtle shimmer
    this.createOscillator('triangle', 2000, now + 0.08, 0.2, 0.05, 0.01, 0.15);
  }

  /**
   * Robber movement - ominous/mysterious sound
   */
  private playRobberMove(): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;

    // Deep ominous rumble
    this.createOscillator('sine', 80, now, 0.5, 0.3, 0.1, 0.3);

    // Descending tone for "danger"
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.4);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.5);

    // Dark noise sweep
    this.createNoise(now + 0.1, 0.3, 0.08, 400);
  }

  /**
   * Stealing from player - sneaky theft sound
   */
  private playSteal(): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;

    // Quick "swipe" sound
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.2);

    // Short "whoosh"
    this.createNoise(now, 0.12, 0.1, 2000);

    // Negative "bonk"
    this.createOscillator('triangle', 150, now + 0.05, 0.1, 0.15, 0.01, 0.08);
  }

  /**
   * Turn change - subtle notification chime
   */
  private playTurnChange(): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;

    // Gentle two-note chime
    this.createOscillator('sine', 600, now, 0.15, 0.12, 0.01, 0.1);
    this.createOscillator('sine', 800, now + 0.08, 0.2, 0.1, 0.01, 0.15);
  }

  /**
   * Game start - fanfare sound
   */
  private playGameStart(): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;

    // Rising fanfare
    const notes = [
      { freq: 400, time: 0, duration: 0.15 },
      { freq: 500, time: 0.12, duration: 0.15 },
      { freq: 600, time: 0.24, duration: 0.15 },
      { freq: 800, time: 0.36, duration: 0.4 },
    ];

    notes.forEach(({ freq, time, duration }) => {
      this.createOscillator('triangle', freq, now + time, duration, 0.2, 0.02, 0.1);
      this.createOscillator('sine', freq * 2, now + time, duration * 0.8, 0.08, 0.02, 0.08);
    });

    // Triumphant chord at the end
    this.createOscillator('sine', 800, now + 0.4, 0.5, 0.15, 0.05, 0.3);
    this.createOscillator('sine', 1000, now + 0.42, 0.48, 0.12, 0.05, 0.28);
    this.createOscillator('sine', 1200, now + 0.44, 0.46, 0.1, 0.05, 0.26);
  }

  /**
   * Victory - celebration sound
   */
  private playVictory(): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;

    // Victory fanfare - ascending arpeggios
    const arpeggio1 = [523.25, 659.25, 783.99, 1046.5]; // C major
    const arpeggio2 = [659.25, 783.99, 987.77, 1318.51]; // E major feel

    arpeggio1.forEach((freq, i) => {
      this.createOscillator('triangle', freq, now + i * 0.08, 0.3, 0.2, 0.02, 0.2);
    });

    arpeggio2.forEach((freq, i) => {
      this.createOscillator('sine', freq, now + 0.4 + i * 0.08, 0.4, 0.15, 0.02, 0.25);
    });

    // Final triumphant chord
    const finalChord = [783.99, 987.77, 1174.66, 1567.98];
    finalChord.forEach((freq) => {
      this.createOscillator('sine', freq, now + 0.8, 1.0, 0.12, 0.1, 0.7);
    });

    // Shimmer effect
    for (let i = 0; i < 5; i++) {
      this.createOscillator('sine', 2000 + i * 200, now + 0.9 + i * 0.05, 0.8 - i * 0.1, 0.03, 0.02, 0.5);
    }
  }
}

// Export singleton instance
export const SoundManager = new SoundManagerClass();

// Export type for external use
export type { SoundType };
