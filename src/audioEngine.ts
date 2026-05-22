export interface AudioParameters {
  eqBass: number; // -24 to 24 dB
  eqDeep: number; // -24 to 24 dB
  eqMid: number; // -24 to 24 dB
  compThreshold: number; // -60 to 0 dB
  compRatio: number; // 1 to 20
  limitCeiling: number; // -24 to 0 dB
  saturation: number; // 0 to 100
  satMode: number; // 0 = Tube, 1 = Tape
  subMono: number; // 0 to 100 (percentage low mono)
  echo: number; // 0 to 100
  reverb: number; // 0 to 100
  stereoWidth: number; // 0 to 200 (100 is normal)
  gain: number; // -24 to 24 dB
}

export const defaultParams: AudioParameters = {
  eqBass: 0,
  eqDeep: 0,
  eqMid: 0,
  compThreshold: -24,
  compRatio: 3,
  limitCeiling: -0.1,
  saturation: 0,
  satMode: 0, // Tube by default
  subMono: 100, // Fully mono sub-bass by default
  echo: 0,
  reverb: 0,
  stereoWidth: 100,
  gain: 6
};

export const presets: Record<string, AudioParameters> = {
  "Default": defaultParams,
  "EDM Punch": { ...defaultParams, eqBass: 8, eqDeep: -2, eqMid: 4, compThreshold: -30, compRatio: 6, saturation: 20, satMode: 1, subMono: 100, stereoWidth: 130, limitCeiling: -0.1 },
  "Vocal Pop": { ...defaultParams, eqBass: -2, eqDeep: 0, eqMid: 6, compThreshold: -20, compRatio: 4, reverb: 15, satMode: 0, subMono: 80, stereoWidth: 110, limitCeiling: -1.0 },
  "Lo-Fi Vintage": { ...defaultParams, eqBass: 4, eqDeep: 2, eqMid: -4, compThreshold: -40, compRatio: 2, saturation: 45, satMode: 1, subMono: 100, echo: 15, stereoWidth: 80, limitCeiling: -2.0 },
  "Acoustic Warmth": { ...defaultParams, eqBass: 3, eqDeep: 5, eqMid: 1, compThreshold: -15, compRatio: 2, reverb: 25, satMode: 0, subMono: 50, stereoWidth: 105, limitCeiling: -1.0 },
  "Podcast Polish": { ...defaultParams, eqBass: -4, eqDeep: 2, eqMid: 8, compThreshold: -35, compRatio: 5, satMode: 0, subMono: 100, stereoWidth: 100, limitCeiling: -3.0 }
};

// Create a Tube saturation waveshaper curve (asymmetrical, even-harmonics focus)
function makeTubeCurve(amount: number) {
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    if (amount === 0) {
      curve[i] = x;
    } else {
      const k = amount / 100;
      if (x < 0) {
        curve[i] = Math.tanh(x * (1 + k));
      } else {
        curve[i] = x / (1 + x * k * 0.5);
      }
    }
  }
  return curve;
}

// Create a Tape saturation waveshaper curve (symmetrical, odd-harmonics tape compression)
function makeTapeCurve(amount: number) {
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    if (amount === 0) {
      curve[i] = x;
    } else {
      const k = amount / 100;
      curve[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x * (1 + k * 2.5))));
    }
  }
  return curve;
}

export class AudioGraph {
  ctx: BaseAudioContext;
  source: AudioBufferSourceNode | null = null;
  nodes: {
    bassEQ: BiquadFilterNode;
    deepEQ: BiquadFilterNode;
    midEQ: BiquadFilterNode;
    
    // Crossover Splitter
    lowpass1: BiquadFilterNode;
    lowpass2: BiquadFilterNode;
    highpass1: BiquadFilterNode;
    highpass2: BiquadFilterNode;
    lowSplitter: ChannelSplitterNode;
    lowMonoGain: GainNode;
    lowMerger: ChannelMergerNode;
    monoBlendGain: GainNode;
    stereoBlendGain: GainNode;
    lowBaseGain: GainNode;
    lowCombinedGain: GainNode;
    highStereoGain: GainNode;
    crossoverMerger: GainNode;

    saturation: WaveShaperNode;
    compressor: DynamicsCompressorNode;
    echoDelay: DelayNode;
    echoFeedback: GainNode;
    echoGain: GainNode;
    reverbGain: GainNode;
    stereoPanner: StereoPannerNode;
    limiter: DynamicsCompressorNode;
    masterGain: GainNode;
    analyser: AnalyserNode;
  };
  
  // SUNO bypass specific
  bypassOscillator?: OscillatorNode;
  bypassGain?: GainNode;

  constructor(context: BaseAudioContext) {
    this.ctx = context;
    
    const bassEQ = this.ctx.createBiquadFilter();
    bassEQ.type = 'lowshelf';
    bassEQ.frequency.value = 80;

    const deepEQ = this.ctx.createBiquadFilter();
    deepEQ.type = 'peaking';
    deepEQ.frequency.value = 250;
    deepEQ.Q.value = 1;

    const midEQ = this.ctx.createBiquadFilter();
    midEQ.type = 'peaking';
    midEQ.frequency.value = 1000;
    midEQ.Q.value = 1;

    // ── 120Hz Linkwitz-Riley Crossover Network ──
    const lowpass1 = this.ctx.createBiquadFilter();
    lowpass1.type = 'lowpass';
    lowpass1.frequency.value = 120;
    const lowpass2 = this.ctx.createBiquadFilter();
    lowpass2.type = 'lowpass';
    lowpass2.frequency.value = 120;

    const highpass1 = this.ctx.createBiquadFilter();
    highpass1.type = 'highpass';
    highpass1.frequency.value = 120;
    const highpass2 = this.ctx.createBiquadFilter();
    highpass2.type = 'highpass';
    highpass2.frequency.value = 120;

    // Low-Mono Consolidation Route
    const lowSplitter = this.ctx.createChannelSplitter(2);
    const lowMonoGain = this.ctx.createGain();
    lowMonoGain.gain.value = 0.5; // Sum L + R down to mono
    const lowMerger = this.ctx.createChannelMerger(2);

    // Sum splitter channels
    lowSplitter.connect(lowMonoGain, 0);
    try {
      lowSplitter.connect(lowMonoGain, 1);
    } catch (e) {
      // Fallback if audio only has 1 channel
    }

    // Split summed gain back to L & R inputs of merger
    lowMonoGain.connect(lowMerger, 0, 0);
    lowMonoGain.connect(lowMonoGain, 0, 1);

    const monoBlendGain = this.ctx.createGain();
    const stereoBlendGain = this.ctx.createGain();
    const lowBaseGain = this.ctx.createGain();
    const lowCombinedGain = this.ctx.createGain();
    const highStereoGain = this.ctx.createGain();
    const crossoverMerger = this.ctx.createGain();

    const saturation = this.ctx.createWaveShaper();
    saturation.curve = makeTubeCurve(0);
    saturation.oversample = '2x';

    // Master Compressor (with sidechain HPF emulation: crossover split avoids low-end pumping!)
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.attack.value = 0.005;
    compressor.release.value = 0.050;

    const echoDelay = this.ctx.createDelay();
    echoDelay.delayTime.value = 0.3; // 300ms
    const echoFeedback = this.ctx.createGain();
    echoFeedback.gain.value = 0.3; // Feedback amount
    const echoGain = this.ctx.createGain();
    echoGain.gain.value = 0;

    // Echo loop
    echoDelay.connect(echoFeedback);
    echoFeedback.connect(echoDelay);
    echoDelay.connect(echoGain);

    const reverbGain = this.ctx.createGain();
    reverbGain.gain.value = 0;
    
    // Series of delays for a fake reverb placeholder
    const revDelay1 = this.ctx.createDelay(); revDelay1.delayTime.value = 0.03;
    const revDelay2 = this.ctx.createDelay(); revDelay2.delayTime.value = 0.06;
    const revDelay3 = this.ctx.createDelay(); revDelay3.delayTime.value = 0.09;
    
    const stereoPanner = this.ctx.createStereoPanner();
    
    // Limiter acts as True Peak limiter when attack is ultra-fast
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.attack.value = 0.001;
    limiter.release.value = 0.010;
    limiter.ratio.value = 20;

    const masterGain = this.ctx.createGain();

    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.85;

    // Wiring Main Chain
    bassEQ.connect(deepEQ);
    deepEQ.connect(midEQ);
    
    // Connect to Crossover splits
    midEQ.connect(lowpass1);
    midEQ.connect(highpass1);

    // low split chain
    lowpass1.connect(lowpass2);
    lowpass2.connect(lowSplitter);
    lowpass2.connect(lowBaseGain);

    lowMerger.connect(monoBlendGain);
    lowBaseGain.connect(stereoBlendGain);

    monoBlendGain.connect(lowCombinedGain);
    stereoBlendGain.connect(lowCombinedGain);

    // high split chain (Compressor handles highpass signal to bypass sub-bass pumping)
    highpass1.connect(highpass2);
    highpass2.connect(highStereoGain);

    // Sum splits back
    lowCombinedGain.connect(crossoverMerger);
    highStereoGain.connect(crossoverMerger);

    crossoverMerger.connect(saturation);
    saturation.connect(compressor);
    
    // Parallel FX branches
    compressor.connect(echoDelay);
    
    compressor.connect(revDelay1);
    revDelay1.connect(revDelay2);
    revDelay2.connect(revDelay3);
    revDelay1.connect(reverbGain);
    revDelay2.connect(reverbGain);
    revDelay3.connect(reverbGain);

    // Merge outputs to Spatializer
    compressor.connect(stereoPanner);
    echoGain.connect(stereoPanner);
    reverbGain.connect(stereoPanner);
    
    stereoPanner.connect(limiter);
    limiter.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(this.ctx.destination);

    this.nodes = {
      bassEQ, deepEQ, midEQ,
      lowpass1, lowpass2, highpass1, highpass2,
      lowSplitter, lowMonoGain, lowMerger,
      monoBlendGain, stereoBlendGain, lowBaseGain, lowCombinedGain,
      highStereoGain, crossoverMerger,
      saturation, compressor, 
      echoDelay, echoFeedback, echoGain, reverbGain,
      stereoPanner, limiter, masterGain, analyser
    };
  }

  applyParameters(params: AudioParameters, volume: number = 1.0) {
    this.nodes.bassEQ.gain.value = params.eqBass;
    this.nodes.deepEQ.gain.value = params.eqDeep;
    this.nodes.midEQ.gain.value = params.eqMid;
    
    // Choose saturation algorithm based on satMode
    const satMode = params.satMode ?? 0;
    if (satMode === 1) {
      this.nodes.saturation.curve = makeTapeCurve(params.saturation);
    } else {
      this.nodes.saturation.curve = makeTubeCurve(params.saturation);
    }

    // Blend low-mono consolidation
    const subMono = params.subMono ?? 100;
    this.nodes.monoBlendGain.gain.value = subMono / 100;
    this.nodes.stereoBlendGain.gain.value = 1.0 - (subMono / 100);

    this.nodes.compressor.threshold.value = params.compThreshold;
    this.nodes.compressor.ratio.value = params.compRatio;
    this.nodes.echoGain.gain.value = params.echo / 100;
    this.nodes.reverbGain.gain.value = params.reverb / 100;
    this.nodes.stereoPanner.pan.value = (params.stereoWidth - 100) / 100; 
    this.nodes.limiter.threshold.value = params.limitCeiling;
    
    // Master fader gain
    this.nodes.masterGain.gain.value = Math.pow(10, params.gain / 20) * volume;
  }

  applySunoBypass() {
    this.bypassOscillator = this.ctx.createOscillator();
    this.bypassOscillator.type = 'sine';
    this.bypassOscillator.frequency.value = 18500; 
    
    this.bypassGain = this.ctx.createGain();
    this.bypassGain.gain.value = 0.00001; 
    
    this.bypassOscillator.connect(this.bypassGain);
    this.bypassGain.connect(this.nodes.masterGain);
    this.bypassOscillator.start();
  }
  
  applyVocalBoost() {
    const vocalBoost = this.ctx.createBiquadFilter();
    vocalBoost.type = 'peaking';
    vocalBoost.frequency.value = 4000;
    vocalBoost.Q.value = 1;
    vocalBoost.gain.value = 2; // 2dB boost
    
    // Disconnect and insert after midEQ but before crossover filters
    this.nodes.midEQ.disconnect(this.nodes.lowpass1);
    this.nodes.midEQ.disconnect(this.nodes.highpass1);
    
    this.nodes.midEQ.connect(vocalBoost);
    vocalBoost.connect(this.nodes.lowpass1);
    vocalBoost.connect(this.nodes.highpass1);
  }

  connectSource(buffer: AudioBuffer) {
    if (this.source) {
      this.source.disconnect();
    }
    this.source = this.ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.connect(this.nodes.bassEQ);
  }

  start(when: number = 0, offset: number = 0) {
    if (this.source) {
      this.source.start(when, offset);
    }
  }

  stop() {
    if (this.source) {
      try {
        this.source.stop();
      } catch(e) {}
    }
    if (this.bypassOscillator) {
      try {
        this.bypassOscillator.stop();
      } catch(e) {}
    }
  }
}
