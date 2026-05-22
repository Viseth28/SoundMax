import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// ─────────────────────────────────────────
// Capability Detection
// ─────────────────────────────────────────
export function isWebCodecsSupported(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof AudioData !== 'undefined'
  );
}

// ─────────────────────────────────────────
// FFmpeg singleton (fallback only)
// ─────────────────────────────────────────
let ffmpegInst: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInst && ffmpegInst.loaded) return ffmpegInst;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegInst = new FFmpeg();
  const baseURL = window.location.origin + '/ffmpeg';

  ffmpegLoadPromise = (async () => {
    try {
      await ffmpegInst!.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
      });
      return ffmpegInst!;
    } catch {
      try {
        ffmpegInst = new FFmpeg();
        await ffmpegInst.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        ffmpegLoadPromise = null;
        return ffmpegInst;
      } catch (e2) {
        ffmpegLoadPromise = null;
        throw e2;
      }
    }
  })();

  return ffmpegLoadPromise;
}

// ─────────────────────────────────────────
// Progress timer (for FFmpeg fallback)
// ─────────────────────────────────────────
function startProgressTimer(durationSec: number, onProgress: (pct: number) => void): () => void {
  const start = Date.now();
  const estimatedMs = durationSec * 200;
  const interval = setInterval(() => {
    const pct = Math.min(95, Math.round(((Date.now() - start) / estimatedMs) * 100));
    onProgress(pct);
  }, 300);
  return () => clearInterval(interval);
}

// ─────────────────────────────────────────
// Web Codecs Engine (GPU Hardware Encoder)
// ─────────────────────────────────────────
async function encodeWithWebCodecs(
  imageFile: File,
  audioBuffer: AudioBuffer,
  onProgress: (pct: number) => void
): Promise<Blob> {
  const OUTPUT_WIDTH = 1920;
  const OUTPUT_HEIGHT = 1080;
  const FPS = 24;             // Changed to 24 FPS (Cinema standard, faster render)
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = Math.min(audioBuffer.numberOfChannels, 2);
  const duration = audioBuffer.duration;
  const totalVideoFrames = Math.ceil(duration * FPS);
  const AUDIO_CHUNK_FRAMES = 8192;

  // Draw image to offscreen canvas (centered, letterboxed)
  const img = await createImageBitmap(imageFile);
  const canvas = new OffscreenCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const ctx = canvas.getContext('2d')!;
  const scale = Math.min(OUTPUT_WIDTH / img.width, OUTPUT_HEIGHT / img.height);
  const scaledW = Math.round(img.width * scale);
  const scaledH = Math.round(img.height * scale);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  ctx.drawImage(img, Math.round((OUTPUT_WIDTH - scaledW) / 2), Math.round((OUTPUT_HEIGHT - scaledH) / 2), scaledW, scaledH);

  // Capture the final canvas frame once into GPU-friendly memory
  const preRenderedImage = await createImageBitmap(canvas);

  // Setup muxer
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, frameRate: FPS },
    audio: { codec: 'aac', numberOfChannels: numChannels, sampleRate },
    fastStart: 'in-memory',
  });

  let videoError: Error | null = null;
  let audioError: Error | null = null;

  // Video Encoder
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta!),
    error: (e) => { videoError = e; },
  });
  videoEncoder.configure({
    codec: 'avc1.4d002a',        
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    bitrate: 4_000_000,          
    framerate: FPS,
    hardwareAcceleration: 'prefer-hardware',
    latencyMode: 'quality',      // 🚀 Tells the GPU this is an offline render, not a live stream
    avc: { format: 'avc' },
  });

  // Audio Encoder
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta!),
    error: (e) => { audioError = e; },
  });
  audioEncoder.configure({
    codec: 'mp4a.40.2',          // AAC-LC
    numberOfChannels: numChannels,
    sampleRate,
    bitrate: 192_000,            // 192 kbps
  });

  // Backpressure queue
// 🚀 Change limit from 20 to 120
  const waitForDrain = async (encoder: VideoEncoder | AudioEncoder, limit = 120) => {
    if (encoder.encodeQueueSize > limit) {
      while (encoder.encodeQueueSize > limit) {
        if (videoError) throw videoError;
        if (audioError) throw audioError;
        // Yield to let the GPU catch up
        await new Promise(r => setTimeout(r, 1)); 
      }
    }
  };

  // ── Encode video frames at 24fps ──
  const frameDurationUs = Math.round(1_000_000 / FPS);
  for (let i = 0; i < totalVideoFrames; i++) {
    await waitForDrain(videoEncoder);
    if (videoError) throw videoError;

    // Pass the pre-rendered ImageBitmap instead of the Canvas
    const frame = new VideoFrame(preRenderedImage, {
      timestamp: i * frameDurationUs,
      duration: frameDurationUs,
    });
    videoEncoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    
    // Throttle UI updates
    if (i % 48 === 0) { // Changed to 48 (2 seconds of frames at 24fps)
      onProgress(Math.round((i / totalVideoFrames) * 50)); // 0–50%
    }
  }

  await videoEncoder.flush();
  if (videoError) throw videoError;

  // ── Encode audio chunks ──
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channelData.push(audioBuffer.getChannelData(c));
  const totalSamples = audioBuffer.length;
  let processed = 0;

  while (processed < totalSamples) {
    const chunkSize = Math.min(AUDIO_CHUNK_FRAMES, totalSamples - processed);
    const timestamp = Math.round((processed / sampleRate) * 1_000_000);

    await waitForDrain(audioEncoder);
    if (audioError) throw audioError;
    if (audioEncoder.state === 'closed') throw new Error('Audio encoder closed unexpectedly.');

    const planar = new Float32Array(numChannels * chunkSize);
    for (let c = 0; c < numChannels; c++) {
      planar.set(channelData[c].subarray(processed, processed + chunkSize), c * chunkSize);
    }

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfChannels: numChannels,
      numberOfFrames: chunkSize,
      timestamp,
      data: planar,
    });
    audioEncoder.encode(audioData);
    audioData.close();

    processed += chunkSize;
    
    if (Math.round(processed / AUDIO_CHUNK_FRAMES) % 10 === 0) {
      onProgress(50 + Math.round((processed / totalSamples) * 45)); // 50–95%
    }
  }

  await videoEncoder.flush();
  await audioEncoder.flush();
  muxer.finalize();

  // Clean up GPU memory
  preRenderedImage.close();

  onProgress(100);
  return new Blob([target.buffer], { type: 'video/mp4' });
}

// ─────────────────────────────────────────
// FFmpeg fallback encoder
// ─────────────────────────────────────────
async function encodeWithFFmpeg(
  imageFile: File,
  audioBlob: Blob,
  duration: number,
  onProgress: (pct: number) => void
): Promise<Blob> {
  const ff = await getFFmpeg();
  const imgExt = imageFile.name.split('.').pop() || 'jpg';
  const imgName = `cover.${imgExt}`;
  await ff.writeFile(imgName, await fetchFile(imageFile));
  await ff.writeFile('audio.wav', await fetchFile(audioBlob));

  const stopTimer = startProgressTimer(duration, onProgress);
  try {
    await ff.exec([
      '-loop', '1', '-framerate', '24', '-i', imgName, // Changed to 24
      '-i', 'audio.wav',
      '-t', String(duration),
      '-threads', '0',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage',
      '-b:v', '8000k',           
      '-c:a', 'aac', '-b:a', '320k',  
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1',
      '-movflags', '+faststart',
      'output.mp4',
    ]);
  } finally {
    stopTimer();
  }

  const data = await ff.readFile('output.mp4');
  await ff.deleteFile(imgName);
  await ff.deleteFile('audio.wav');
  await ff.deleteFile('output.mp4');

  onProgress(100);
  return new Blob([data as any], { type: 'video/mp4' });
}

// ─────────────────────────────────────────
// Public API — Individual track video
// ─────────────────────────────────────────
export async function exportIndividualVideo(
  imageFile: File,
  renderedBuffer: AudioBuffer,
  audioBlob: Blob,
  onProgress: (pct: number) => void
): Promise<Blob> {
  if (isWebCodecsSupported()) {
    return encodeWithWebCodecs(imageFile, renderedBuffer, onProgress);
  }
  return encodeWithFFmpeg(imageFile, audioBlob, renderedBuffer.duration, onProgress);
}

// ─────────────────────────────────────────
// Public API — Full album video
// ─────────────────────────────────────────
export async function exportAlbumVideo(
  imageFile: File,
  renderedBuffers: AudioBuffer[],
  audioBlobs: Blob[],
  onProgress: (pct: number) => void
): Promise<Blob> {
  if (isWebCodecsSupported()) {
    // Merge all AudioBuffers into one
    const sampleRate = renderedBuffers[0].sampleRate;
    const numChannels = Math.min(renderedBuffers[0].numberOfChannels, 2);
    const totalLength = renderedBuffers.reduce((sum, b) => sum + b.length, 0);
    const mergedCtx = new OfflineAudioContext(numChannels, totalLength, sampleRate);
    const mergedBuffer = mergedCtx.createBuffer(numChannels, totalLength, sampleRate);

    let offset = 0;
    for (const buf of renderedBuffers) {
      for (let c = 0; c < numChannels; c++) {
        mergedBuffer.getChannelData(c).set(buf.getChannelData(c), offset);
      }
      offset += buf.length;
    }

    return encodeWithWebCodecs(imageFile, mergedBuffer, onProgress);
  }

  // FFmpeg fallback: concatenate wav files
  const ff = await getFFmpeg();
  const imgExt = imageFile.name.split('.').pop() || 'jpg';
  const imgName = `cover.${imgExt}`;
  await ff.writeFile(imgName, await fetchFile(imageFile));

  let concatContent = '';
  const totalDuration = renderedBuffers.reduce((sum, b) => sum + b.duration, 0);

  for (let i = 0; i < audioBlobs.length; i++) {
    await ff.writeFile(`track_${i}.wav`, await fetchFile(audioBlobs[i]));
    concatContent += `file 'track_${i}.wav'\n`;
  }
  await ff.writeFile('concat.txt', concatContent);

  const stopTimer = startProgressTimer(totalDuration, onProgress);
  try {
    await ff.exec([
      '-loop', '1', '-framerate', '24', '-i', imgName, // Changed to 24
      '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
      '-t', String(totalDuration),
      '-threads', '0',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage',
      '-b:v', '8000k',
      '-c:a', 'aac', '-b:a', '320k',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1',
      '-movflags', '+faststart',
      'album_output.mp4',
    ]);
  } finally {
    stopTimer();
  }

  const data = await ff.readFile('album_output.mp4');
  await ff.deleteFile(imgName);
  await ff.deleteFile('concat.txt');
  for (let i = 0; i < audioBlobs.length; i++) await ff.deleteFile(`track_${i}.wav`);
  await ff.deleteFile('album_output.mp4');

  onProgress(100);
  return new Blob([data as any], { type: 'video/mp4' });
}