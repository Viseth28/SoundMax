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
  calculatedGain = Math.max(-12, Math.min(24, calculatedGain));

  // 2. Compression
  // Threshold should catch the peaks above RMS. 
  let compThreshold = rmsDB + 2; 
  compThreshold = Math.max(-60, Math.min(0, compThreshold));
  
  // Ratio scales with Crest Factor. High crest = needs more control.
  // Standard CF is around 4-6. 
  let compRatio = 2 + (crestFactor - 3) * 0.5;
  compRatio = Math.max(1.5, Math.min(8, compRatio));

  // 3. Saturation (Add warmth to highly dynamic or quiet tracks)
  let saturation = 0;
  if (crestFactor > 5) {
    saturation = Math.min(50, (crestFactor - 5) * 10);
  }

  // 4. EQ Profile (Subtle "modern" smile curve)
  // We can vary this based on loudness. Quiet mixes often need more presence.
  const eqBass = rmsDB < -18 ? 4 : 2;
  const eqDeep = rmsDB < -18 ? 0 : -2; // Scoop low-mids slightly
  const eqMid = rmsDB < -18 ? 3 : 1;   // Boost high-mids slightly
  
  return {
    eqBass: Math.round(eqBass * 10) / 10,
    eqDeep: Math.round(eqDeep * 10) / 10,
    eqMid: Math.round(eqMid * 10) / 10,
    eq10: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    compThreshold: Math.round(compThreshold * 10) / 10,
    compRatio: Math.round(compRatio * 10) / 10,
    limitCeiling: -0.3,
    saturation: Math.round(saturation),
    echo: 0,
    reverb: 0, // Don't add spatial effects automatically as they ruin mixes
    stereoWidth: 105, // Slight widening by default
    gain: Math.round(calculatedGain * 10) / 10
  };
}
