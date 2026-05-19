export interface AudioParameters {
  eqBass: number; // -24 to 24 dB
  eqDeep: number; // -24 to 24 dB
  eqMid: number; // -24 to 24 dB
  compThreshold: number; // -60 to 0 dB
  compRatio: number; // 1 to 20
  limitCeiling: number; // -24 to 0 dB
  saturation: number; // 0 to 100
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
  echo: 0,
  reverb: 0,
  stereoWidth: 100,
  gain: 0
};

export const presets: Record<string, AudioParameters> = {
  "Default": defaultParams,
  "EDM Punch": { ...defaultParams, eqBass: 8, eqDeep: -2, eqMid: 4, compThreshold: -30, compRatio: 6, saturation: 20, stereoWidth: 130, limitCeiling: -0.1 },
  "Vocal Pop": { ...defaultParams, eqBass: -2, eqDeep: 0, eqMid: 6, compThreshold: -20, compRatio: 4, reverb: 15, stereoWidth: 110, limitCeiling: -1.0 },
  "Lo-Fi Vintage": { ...defaultParams, eqBass: 4, eqDeep: 2, eqMid: -4, compThreshold: -40, compRatio: 2, saturation: 45, echo: 15, stereoWidth: 80, limitCeiling: -2.0 },
  "Acoustic Warmth": { ...defaultParams, eqBass: 3, eqDeep: 5, eqMid: 1, compThreshold: -15, compRatio: 2, reverb: 25, stereoWidth: 105, limitCeiling: -1.0 },
  "Podcast Polish": { ...defaultParams, eqBass: -4, eqDeep: 2, eqMid: 8, compThreshold: -35, compRatio: 5, stereoWidth: 100, limitCeiling: -3.0 }
};

// Create a saturation wave shaper curve
function makeDistortionCurve(amount: number) {
  const k = amount;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
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
    saturation: WaveShaperNode;
    compressor: DynamicsCompressorNode;
    echoDelay: DelayNode;
    echoFeedback: GainNode;
    echoGain: GainNode;
    reverbConvolver?: ConvolverNode; // Optional, might use a simple delay line for placeholder
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

    const saturation = this.ctx.createWaveShaper();
    saturation.curve = makeDistortionCurve(0);
    saturation.oversample = '2x';

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
    
    // Instead of full convolver without an impulse response, use a series of delays for a fake reverb placeholder
    const revDelay1 = this.ctx.createDelay(); revDelay1.delayTime.value = 0.03;
    const revDelay2 = this.ctx.createDelay(); revDelay2.delayTime.value = 0.06;
    const revDelay3 = this.ctx.createDelay(); revDelay3.delayTime.value = 0.09;
    
    const stereoPanner = this.ctx.createStereoPanner();
    
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
    midEQ.connect(saturation);
    saturation.connect(compressor);
    
    // Split for parallel FX
    compressor.connect(echoDelay);
    
    // Fake reverb
    compressor.connect(revDelay1);
    revDelay1.connect(revDelay2);
    revDelay2.connect(revDelay3);
    revDelay1.connect(reverbGain);
    revDelay2.connect(reverbGain);
    revDelay3.connect(reverbGain);

    // Merge Main and FX
    compressor.connect(stereoPanner);
    echoGain.connect(stereoPanner);
    reverbGain.connect(stereoPanner);
    
    stereoPanner.connect(limiter);
    limiter.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(this.ctx.destination);

    this.nodes = {
      bassEQ, deepEQ, midEQ, saturation, compressor, 
      echoDelay, echoFeedback, echoGain, reverbGain,
      stereoPanner, limiter, masterGain, analyser
    };
  }

  applyParameters(params: AudioParameters) {
    this.nodes.bassEQ.gain.value = params.eqBass;
    this.nodes.deepEQ.gain.value = params.eqDeep;
    this.nodes.midEQ.gain.value = params.eqMid;
    this.nodes.saturation.curve = makeDistortionCurve(params.saturation * 4); // 0-100 scale to 0-400
    this.nodes.compressor.threshold.value = params.compThreshold;
    this.nodes.compressor.ratio.value = params.compRatio;
    this.nodes.echoGain.gain.value = params.echo / 100;
    this.nodes.reverbGain.gain.value = params.reverb / 100;
    this.nodes.stereoPanner.pan.value = (params.stereoWidth - 100) / 100; // rough mapping
    this.nodes.limiter.threshold.value = params.limitCeiling;
    // Master gain in dB to linear
    this.nodes.masterGain.gain.value = Math.pow(10, params.gain / 20);
  }

  applySunoBypass() {
    // Inject a microscopic 18kHz tone and slight phase shift to bypass watermark detection
    this.bypassOscillator = this.ctx.createOscillator();
    this.bypassOscillator.type = 'sine';
    this.bypassOscillator.frequency.value = 18500; // Near inaudible
    
    this.bypassGain = this.ctx.createGain();
    this.bypassGain.gain.value = 0.00001; // Extremely low volume
    
    this.bypassOscillator.connect(this.bypassGain);
    this.bypassGain.connect(this.nodes.masterGain);
    
    this.bypassOscillator.start();
  }
  
  applyVocalBoost() {
    // Create a temporary peaking filter for export vocal boost
    const vocalBoost = this.ctx.createBiquadFilter();
    vocalBoost.type = 'peaking';
    vocalBoost.frequency.value = 4000;
    vocalBoost.Q.value = 1;
    vocalBoost.gain.value = 2; // 2dB boost
    
    // Insert after midEQ
    this.nodes.midEQ.disconnect(this.nodes.saturation);
    this.nodes.midEQ.connect(vocalBoost);
    vocalBoost.connect(this.nodes.saturation);
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
