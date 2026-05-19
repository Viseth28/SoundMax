import { buildID3v2Tag, type AudioMetadata as WavMetadata } from './id3Encoder';

export function encodeWAV(audioBuffer: AudioBuffer, sampleRate: number, bitDepth: 16 | 24 = 16, metadata?: WavMetadata): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;

  const chunks: { id: string, data: Uint8Array }[] = [];

  // Build the LIST INFO chunk
  if (metadata && (metadata.title || metadata.artist || metadata.album)) {
    const infoChunks: Uint8Array[] = [];
    const encoder = new TextEncoder();
    
    const addInfoField = (id: string, text?: string) => {
      if (!text) return;
      const textBytes = encoder.encode(text);
      const textLength = textBytes.length + 1; // +1 for null terminator
      const paddedLength = textLength % 2 !== 0 ? textLength + 1 : textLength; // Pad to even length
      
      const chunk = new Uint8Array(8 + paddedLength);
      const view = new DataView(chunk.buffer);
      writeString(view, 0, id);
      view.setUint32(4, paddedLength, true); // Size
      chunk.set(textBytes, 8);
      chunk[8 + textBytes.length] = 0; // Null terminator
      if (paddedLength > textLength) chunk[8 + textLength] = 0;
      infoChunks.push(chunk);
    };

    addInfoField('INAM', metadata.title);
    addInfoField('IART', metadata.artist);
    addInfoField('IPRD', metadata.album);
    addInfoField('IGNR', metadata.genre);
    addInfoField('ICRD', metadata.date);
    addInfoField('ISFT', 'SOUNDMAX Web');

    if (infoChunks.length > 0) {
      const listSize = 4 + infoChunks.reduce((acc, c) => acc + c.length, 0);
      const listChunkData = new Uint8Array(4 + listSize);
      const view = new DataView(listChunkData.buffer);
      writeString(view, 0, 'INFO');
      let offset = 4;
      for (const c of infoChunks) {
        listChunkData.set(c, offset);
        offset += c.length;
      }
      chunks.push({ id: 'LIST', data: listChunkData });
    }
  }

  // Build the ID3 chunk
  if (metadata && (metadata.title || metadata.artist || metadata.album || (metadata.coverImage && metadata.coverMime))) {
    const id3Data = buildID3v2Tag(metadata);
    if (id3Data) {
      chunks.push({ id: 'id3 ', data: id3Data });
    }
  }

  // Calculate total chunk sizes including padding
  let extraChunksSize = 0;
  for (const chunk of chunks) {
    extraChunksSize += 8 + chunk.data.length + (chunk.data.length % 2); // 8 bytes for ID+Size, plus padding
  }

  const buffer = new ArrayBuffer(44 + dataSize + extraChunksSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize + extraChunksSize, true); // update RIFF size
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write audio data
  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = channels[channel][i];
      sample = Math.max(-1, Math.min(1, sample));

      if (bitDepth === 16) {
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, sample, true);
      } else {
        sample = sample < 0 ? sample * 0x800000 : sample * 0x7FFFFF;
        view.setInt8(offset, sample & 0xFF);
        view.setInt8(offset + 1, (sample >> 8) & 0xFF);
        view.setInt8(offset + 2, (sample >> 16) & 0xFF);
      }
      offset += bytesPerSample;
    }
  }

  // Append extra chunks
  for (const chunk of chunks) {
    writeString(view, offset, chunk.id);
    view.setUint32(offset + 4, chunk.data.length, true); // Little endian for WAV chunks
    new Uint8Array(buffer).set(chunk.data, offset + 8);
    offset += 8 + chunk.data.length;
    if (chunk.data.length % 2 !== 0) {
      view.setUint8(offset, 0);
      offset++;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}


