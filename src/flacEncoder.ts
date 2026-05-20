import encodeFlac from '@audio/encode-flac';
import type { AudioMetadata } from './id3Encoder';

export async function encodeFLAC(audioBuffer: AudioBuffer, bitDepth: 16 | 24, _metadata?: AudioMetadata): Promise<Blob> {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  
  // Extract Float32Array channel data
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  // Initialize the FLAC WASM encoder
  const encoder = await encodeFlac({
    sampleRate: sampleRate,
    channels: numChannels,
    bitDepth: bitDepth,
    compression: 5, // Standard compression level
  });

  const flacData: Uint8Array[] = [];

  // Encode in chunks to prevent blocking the main thread
  // Each chunk represents roughly 0.5s of audio
  const sampleBlockSize = Math.floor(sampleRate * 0.5); 
  
  for (let i = 0; i < channels[0].length; i += sampleBlockSize) {
    const chunkChannels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
      chunkChannels.push(channels[c].subarray(i, i + sampleBlockSize));
    }

    const chunk = encoder.encode(chunkChannels);
    if (chunk.length > 0) {
      flacData.push(chunk);
    }

    // Yield to main thread
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  const tail = encoder.flush();
  if (tail.length > 0) {
    flacData.push(tail);
  }

  encoder.free();

  // Note: FLAC metadata (Vorbis Comments/Picture Block) injection is complex 
  // and not supported by default in this simple encoder.
  // The resulting file will be pure lossless audio.

  return new Blob(flacData as any[], { type: 'audio/flac' });
}
