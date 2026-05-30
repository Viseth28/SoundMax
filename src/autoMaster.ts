import type { AudioParameters } from './audioEngine';

export function calculateAutoMaster(buffer: AudioBuffer): AudioParameters {
  const channelData = buffer.getChannelData(0); // Analyze left channel for speed
  let sumSquares = 0;
  let peak = 0;
  const stride = 100;
  let count = 0;

  for (let i = 0; i < channelData.length; i += stride) {
    const val = Math.abs(channelData[i]);
    sumSquares += val * val;
    if (val > peak) peak = val;
    count++;
  }

  const rmsLinear = Math.sqrt(sumSquares / count);
  // Guard against complete silence
  const rmsDB = rmsLinear > 0.0001 ? 20 * Math.log10(rmsLinear) : -60;
  const crestFactor = peak / (rmsLinear || 0.0001);

  // 1. Gain Staging (Target -12 dBFS RMS for a loud modern master)
  const targetRMS = -12;
  let calculatedGain = targetRMS - rmsDB;
  
  // High-Fidelity Peak headroom guard:
  // To keep limiting transparent and prevent digital clipping/distortion,
  // we limit our gain boost so that we apply a maximum of 3.0 dB of limiting.
  const peakDb = peak > 0.0001 ? 20 * Math.log10(peak) : -60;
  const peakCeiling = -0.3; // matches the brickwall limiter ceiling
  const maxLimitingAmount = 3.0; // max dB of peak reduction for clean transparency
  const maxSafeGain = peakCeiling + maxLimitingAmount - peakDb;

  if (calculatedGain > maxSafeGain) {
    calculatedGain = maxSafeGain;
  }
  calculatedGain = Math.max(-12, Math.min(24, calculatedGain));

  // 2. Compression
  // Threshold should catch the peaks above RMS
  let compThreshold = rmsDB + 2; 
  compThreshold = Math.max(-60, Math.min(0, compThreshold));
  
  // Ratio scales with Crest Factor. High crest = needs more control.
  let compRatio = 2 + (crestFactor - 3) * 0.5;
  compRatio = Math.max(1.5, Math.min(8, compRatio));

  // 3. Saturation (Add warmth to highly dynamic or quiet tracks)
  let saturation = 0;
  if (crestFactor > 5) {
    saturation = Math.min(50, (crestFactor - 5) * 10);
  }

  // 4. EQ Profile & 10-Band Graphic EQ Smile Curve
  // Subtly scoop low-mids and boost bass/highs to add professional depth and modern sheen.
  const eqBass = rmsDB < -18 ? 3 : 1.5;
  const eqDeep = rmsDB < -18 ? -1 : -2; // Scoop low-mids
  const eqMid = rmsDB < -18 ? 2 : 1;    // Presence boost

  // Define an elegant dynamic mastering smile curve inside the 10-Band Graphic EQ faders!
  // Quiet, raw tracks get the full curve, while already loud/compressed files get a very subtle version.
  const curveScaler = rmsDB < -18 ? 1.0 : rmsDB < -14 ? 0.6 : 0.3;
  const eq10 = [
    0 * curveScaler,     // 31Hz
    1.2 * curveScaler,   // 62Hz (analog punch)
    0.8 * curveScaler,   // 125Hz (solid bass)
    -1.2 * curveScaler,  // 250Hz (mud scoop)
    -0.5 * curveScaler,  // 500Hz
    0 * curveScaler,     // 1kHz
    0.5 * curveScaler,   // 2kHz (definition)
    1.0 * curveScaler,   // 4kHz (bite)
    1.5 * curveScaler,   // 8kHz (sheen)
    1.0 * curveScaler    // 16kHz (air)
  ];

  return {
    eqBass: Math.round(eqBass * 10) / 10,
    eqDeep: Math.round(eqDeep * 10) / 10,
    eqMid: Math.round(eqMid * 10) / 10,
    eq10: eq10.map(val => Math.round(val * 10) / 10),
    compThreshold: Math.round(compThreshold * 10) / 10,
    compRatio: Math.round(compRatio * 10) / 10,
    limitCeiling: peakCeiling,
    saturation: Math.round(saturation),
    echo: 0,
    reverb: 0, 
    stereoWidth: 106, // Elegant subtle stereo widening
    gain: Math.round(calculatedGain * 10) / 10
  };
}
