export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  date?: string;
  coverImage?: ArrayBuffer;
  coverMime?: string;
}

export function buildID3v2Tag(metadata: AudioMetadata): Uint8Array | null {
  const encodeUTF16LE = (str: string) => {
    const buf = new Uint8Array(str.length * 2 + 2);
    buf[0] = 0xFF; buf[1] = 0xFE;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      buf[2 + i*2] = code & 0xFF;
      buf[2 + i*2 + 1] = (code >> 8) & 0xFF;
    }
    return buf;
  };
  
  const frames: Uint8Array[] = [];

  const createTextFrame = (id: string, text: string) => {
    const textBytes = encodeUTF16LE(text);
    const size = 1 + textBytes.length + 2; // +1 encoding, +2 null terminator
    const frame = new Uint8Array(10 + size);
    const view = new DataView(frame.buffer);
    frame[0] = id.charCodeAt(0); frame[1] = id.charCodeAt(1); frame[2] = id.charCodeAt(2); frame[3] = id.charCodeAt(3);
    view.setUint32(4, size, false); // Big endian for ID3
    frame[8] = 0; frame[9] = 0;
    frame[10] = 0x01; // UTF-16
    frame.set(textBytes, 11);
    return frame;
  };

  if (metadata.title) frames.push(createTextFrame('TIT2', metadata.title));
  if (metadata.artist) frames.push(createTextFrame('TPE1', metadata.artist));
  if (metadata.album) frames.push(createTextFrame('TALB', metadata.album));
  if (metadata.genre) frames.push(createTextFrame('TCON', metadata.genre));
  if (metadata.date) frames.push(createTextFrame('TYER', metadata.date));

  if (metadata.coverImage && metadata.coverMime) {
    const encoder = new TextEncoder();
    const mimeBytes = encoder.encode(metadata.coverMime);
    const imgData = new Uint8Array(metadata.coverImage);
    const size = 1 + mimeBytes.length + 1 + 1 + 1 + imgData.length;
    const frame = new Uint8Array(10 + size);
    const view = new DataView(frame.buffer);
    frame[0] = 'A'.charCodeAt(0); frame[1] = 'P'.charCodeAt(0); frame[2] = 'I'.charCodeAt(0); frame[3] = 'C'.charCodeAt(0);
    view.setUint32(4, size, false);
    frame[8] = 0; frame[9] = 0;
    
    let fOffset = 10;
    frame[fOffset++] = 0x00; // Text encoding: ISO-8859-1
    frame.set(mimeBytes, fOffset);
    fOffset += mimeBytes.length;
    frame[fOffset++] = 0; // null term for mime
    frame[fOffset++] = 0x03; // Picture type: Front cover
    frame[fOffset++] = 0; // Description (null)
    frame.set(imgData, fOffset);
    frames.push(frame);
  }

  if (frames.length === 0) return null;

  const totalFrameSize = frames.reduce((acc, f) => acc + f.length, 0);
  
  const header = new Uint8Array(10);
  header[0] = 0x49; header[1] = 0x44; header[2] = 0x33;
  header[3] = 0x03;
  header[4] = 0x00;
  header[5] = 0x00;
  
  header[6] = (totalFrameSize >> 21) & 0x7F;
  header[7] = (totalFrameSize >> 14) & 0x7F;
  header[8] = (totalFrameSize >> 7) & 0x7F;
  header[9] = totalFrameSize & 0x7F;

  const id3Tag = new Uint8Array(10 + totalFrameSize);
  id3Tag.set(header, 0);
  let offset = 10;
  for (const f of frames) {
    id3Tag.set(f, offset);
    offset += f.length;
  }
  
  return id3Tag;
}
