// @ts-ignore
import { Mp3Encoder } from 'lamejs';
import { buildID3v2Tag, type AudioMetadata } from './id3Encoder';

export async function encodeMP3(audioBuffer: AudioBuffer, metadata?: AudioMetadata): Promise<Blob> {
  // We use 320kbps MP3
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  
  // Initialize lamejs encoder
  const encoder = new Mp3Encoder(numChannels, sampleRate, 320);
  
  const mp3Data: Int8Array[] = [];

  // Lamejs expects Int16 arrays.
  const left = audioBuffer.getChannelData(0);
  const right = numChannels > 1 ? audioBuffer.getChannelData(1) : left;

  const sampleBlockSize = 1152; 
  for (let i = 0; i < left.length; i += sampleBlockSize) {
    const leftChunk = left.subarray(i, i + sampleBlockSize);
    const rightChunk = right.subarray(i, i + sampleBlockSize);

    const leftInt16 = new Int16Array(leftChunk.length);
    const rightInt16 = new Int16Array(rightChunk.length);

    for (let j = 0; j < leftChunk.length; j++) {
      let l = Math.max(-1, Math.min(1, leftChunk[j]));
      let r = Math.max(-1, Math.min(1, rightChunk[j]));
      leftInt16[j] = l < 0 ? l * 0x8000 : l * 0x7FFF;
      rightInt16[j] = r < 0 ? r * 0x8000 : r * 0x7FFF;
    }

    const mp3buf = encoder.encodeBuffer(leftInt16, rightInt16);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }

    // Yield to the main thread every ~2.5 seconds of audio data to prevent UI freezing
    if (i % (sampleBlockSize * 100) === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  const mp3buf = encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  // Prepend ID3 tag if available
  const blobs: any[] = [];
  if (metadata) {
    const id3Tag = buildID3v2Tag(metadata);
    if (id3Tag) {
      blobs.push(id3Tag.buffer);
    }
  }
  
  for (const chunk of mp3Data) {
    blobs.push(chunk.buffer);
  }

  return new Blob(blobs, { type: 'audio/mp3' });
}
