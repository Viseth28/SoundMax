import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// ─────────────────────────────────────────
// Capability & Interface Definitions
// ─────────────────────────────────────────
export interface VideoExportOptions {
  fps: number; // 1, 15, 24, 30, 60
  quality: 'low' | 'medium' | 'high' | 'ultra';
  resolution: '720p' | '1080p' | '1440p' | '4k';
  audioBitrate: number; // 128000, 192000, 256000, 320000
}

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
  options: VideoExportOptions,
  onProgress: (pct: number) => void
): Promise<Blob> {
  const resolutionMap = {
    '720p': { w: 1280, h: 720 },
    '1080p': { w: 1920, h: 1080 },
    '1440p': { w: 2560, h: 1440 },
    '4k': { w: 3840, h: 2160 }
  };
  const { w: OUTPUT_WIDTH, h: OUTPUT_HEIGHT } = resolutionMap[options.resolution] || resolutionMap['1080p'];
  const FPS = options.fps;
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = Math.min(audioBuffer.numberOfChannels, 2);
  const duration = audioBuffer.duration;
  const totalVideoFrames = Math.ceil(duration * FPS);
  const AUDIO_CHUNK_FRAMES = 8192;

  // Video bitrate mapping
  const bitrateMap = {
    '720p': { low: 1_500_000, medium: 3_000_000, high: 5_000_000, ultra: 8_000_000 },
    '1080p': { low: 2_500_000, medium: 5_000_000, high: 8_000_000, ultra: 15_000_000 },
    '1440p': { low: 5_000_000, medium: 10_000_000, high: 16_000_000, ultra: 25_000_000 },
    '4k': { low: 10_000_000, medium: 20_000_000, high: 35_000_000, ultra: 60_000_000 }
  };
  const videoBitrate = bitrateMap[options.resolution]?.[options.quality] || 8_000_000;

  // ---- Apply a master gain boost (6 dB) to the export buffer ----
  const gainDb = 6;
  const gainFactor = Math.pow(10, gainDb / 20);
  const offlineCtx = new OfflineAudioContext(numChannels, audioBuffer.length, sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  const gainNode = offlineCtx.createGain();
  gainNode.gain.value = gainFactor;
  source.connect(gainNode).connect(offlineCtx.destination);
  source.start();
  const boostedBuffer = await offlineCtx.startRendering();
  const processedAudioBuffer = boostedBuffer;

  // Draw image to offscreen canvas (centered, letterboxed)
  const img = await createImageBitmap(imageFile);
  let preRenderedImage: ImageBitmap | null = null;
  let videoEncoder: VideoEncoder | null = null;
  let audioEncoder: AudioEncoder | null = null;

  try {
    const canvas = new OffscreenCanvas(OUTPUT_WIDTH, OUTPUT_HEIGHT);
    const ctx = canvas.getContext('2d')!;
    const scale = Math.min(OUTPUT_WIDTH / img.width, OUTPUT_HEIGHT / img.height);
    const scaledW = Math.round(img.width * scale);
    const scaledH = Math.round(img.height * scale);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    ctx.drawImage(img, Math.round((OUTPUT_WIDTH - scaledW) / 2), Math.round((OUTPUT_HEIGHT - scaledH) / 2), scaledW, scaledH);

    // Capture the final canvas frame once into GPU-friendly memory
    preRenderedImage = await createImageBitmap(canvas);

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
    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta!),
      error: (e) => { videoError = e; },
    });

    // Dynamically select AVC Profile/Level based on resolution/bitrate demands
    const codec = (OUTPUT_WIDTH > 1920) ? 'avc1.640033' : 'avc1.4d4028';

    videoEncoder.configure({
      codec,        
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      bitrate: videoBitrate,          
      framerate: FPS === 1 ? 24 : FPS, // Fallback high frame rate hint to prevent 1 FPS validation crash on GPU drivers
      hardwareAcceleration: 'no-preference', 
      avc: { format: 'avc' },
    });

    // Audio Encoder
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta!),
      error: (e) => { audioError = e; },
    });
    audioEncoder.configure({
      codec: 'mp4a.40.2',          // AAC-LC
      numberOfChannels: numChannels,
      sampleRate,
      bitrate: options.audioBitrate,
    });

    // Yield to allow async initialization errors to propagate
    await new Promise(resolve => setTimeout(resolve, 100));
    if (videoError) throw videoError;
    if (audioError) throw audioError;

    // Backpressure queue
    const waitForDrain = async (encoder: VideoEncoder | AudioEncoder, limit = 120) => {
      if (encoder.encodeQueueSize > limit) {
        while (encoder.encodeQueueSize > limit) {
          if (videoError) throw videoError;
          if (audioError) throw audioError;
          await new Promise(r => setTimeout(r, 1)); 
        }
      }
    };

    // ── Encode video frames ──
    const frameDurationUs = Math.round(1_000_000 / FPS);
    for (let i = 0; i < totalVideoFrames; i++) {
      await waitForDrain(videoEncoder);
      if (videoError) throw videoError;

      const frame = new VideoFrame(preRenderedImage, {
        timestamp: i * frameDurationUs,
        duration: frameDurationUs,
      });
      videoEncoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();
      
      // Throttle UI updates
      onProgress(Math.round((i / totalVideoFrames) * 50)); // 0–50%
    }

    await videoEncoder.flush();
    if (videoError) throw videoError;

    // ── Encode audio chunks ──
    const exportAudioBuffer = processedAudioBuffer;
    const channelData: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) channelData.push(exportAudioBuffer.getChannelData(c));
    const totalSamples = exportAudioBuffer.length;
    let processed = 0;

    while (processed < totalSamples) {
      const chunkSize = Math.min(AUDIO_CHUNK_FRAMES, totalSamples - processed);
      const timestamp = Math.round((processed / sampleRate) * 1_000_000);

      await waitForDrain(audioEncoder);
      if (videoError) throw videoError;
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

    await audioEncoder.flush();
    if (videoError) throw videoError;
    if (audioError) throw audioError;

    muxer.finalize();

    onProgress(100);
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    img.close();
    if (preRenderedImage) {
      preRenderedImage.close();
    }
    if (videoEncoder) {
      try {
        if (videoEncoder.state !== 'closed') {
          videoEncoder.close();
        }
      } catch (err) {
        console.warn('Failed to close videoEncoder:', err);
      }
    }
    if (audioEncoder) {
      try {
        if (audioEncoder.state !== 'closed') {
          audioEncoder.close();
        }
      } catch (err) {
        console.warn('Failed to close audioEncoder:', err);
      }
    }
  }
}

// ─────────────────────────────────────────
// FFmpeg fallback encoder
// ─────────────────────────────────────────
async function encodeWithFFmpeg(
  imageFile: File,
  audioBlob: Blob,
  duration: number,
  options: VideoExportOptions,
  onProgress: (pct: number) => void
): Promise<Blob> {
  const ff = await getFFmpeg();
  const imgExt = imageFile.name.split('.').pop() || 'jpg';
  const imgName = `cover.${imgExt}`;
  await ff.writeFile(imgName, await fetchFile(imageFile));
  await ff.writeFile('audio.wav', await fetchFile(audioBlob));

  const resolutionMap = {
    '720p': { w: 1280, h: 720 },
    '1080p': { w: 1920, h: 1080 },
    '1440p': { w: 2560, h: 1440 },
    '4k': { w: 3840, h: 2160 }
  };
  const { w: OUTPUT_WIDTH, h: OUTPUT_HEIGHT } = resolutionMap[options.resolution] || resolutionMap['1080p'];
  const FPS = options.fps;

  const bitrateMap = {
    '720p': { low: '1500k', medium: '3000k', high: '5000k', ultra: '8000k' },
    '1080p': { low: '2500k', medium: '5000k', high: '8000k', ultra: '15000k' },
    '1440p': { low: '5000k', medium: '10000k', high: '16000k', ultra: '25000k' },
    '4k': { low: '10000k', medium: '20000k', high: '35000k', ultra: '60000k' }
  };
  const videoBitrate = bitrateMap[options.resolution]?.[options.quality] || '8000k';
  const audioBitrateStr = `${Math.round(options.audioBitrate / 1000)}k`;

  const stopTimer = startProgressTimer(duration, onProgress);
  try {
    await ff.exec([
      '-loop', '1', '-framerate', String(FPS), '-i', imgName,
      '-i', 'audio.wav',
      '-t', String(duration),
      '-threads', '0',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage',
      '-b:v', videoBitrate,           
      '-c:a', 'aac', '-b:a', audioBitrateStr,  
      '-pix_fmt', 'yuv420p',
      '-vf', `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
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
  options: VideoExportOptions,
  onProgress: (pct: number) => void
): Promise<Blob> {
  if (isWebCodecsSupported()) {
    try {
      return await encodeWithWebCodecs(imageFile, renderedBuffer, options, onProgress);
    } catch (e) {
      console.warn("WebCodecs encoding failed, falling back to FFmpeg:", e);
    }
  }
  return encodeWithFFmpeg(imageFile, audioBlob, renderedBuffer.duration, options, onProgress);
}

// ─────────────────────────────────────────
// Public API — Full album video
// ─────────────────────────────────────────
export async function exportAlbumVideo(
  imageFile: File,
  renderedBuffers: AudioBuffer[],
  audioBlobs: Blob[],
  options: VideoExportOptions,
  onProgress: (pct: number) => void
): Promise<Blob> {
  if (isWebCodecsSupported()) {
    try {
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

      return await encodeWithWebCodecs(imageFile, mergedBuffer, options, onProgress);
    } catch (e) {
      console.warn("WebCodecs album encoding failed, falling back to FFmpeg:", e);
    }
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

  const resolutionMap = {
    '720p': { w: 1280, h: 720 },
    '1080p': { w: 1920, h: 1080 },
    '1440p': { w: 2560, h: 1440 },
    '4k': { w: 3840, h: 2160 }
  };
  const { w: OUTPUT_WIDTH, h: OUTPUT_HEIGHT } = resolutionMap[options.resolution] || resolutionMap['1080p'];
  const FPS = options.fps;

  const bitrateMap = {
    '720p': { low: '1500k', medium: '3000k', high: '5000k', ultra: '8000k' },
    '1080p': { low: '2500k', medium: '5000k', high: '8000k', ultra: '15000k' },
    '1440p': { low: '5000k', medium: '10000k', high: '16000k', ultra: '25000k' },
    '4k': { low: '10000k', medium: '20000k', high: '35000k', ultra: '60000k' }
  };
  const videoBitrate = bitrateMap[options.resolution]?.[options.quality] || '8000k';
  const audioBitrateStr = `${Math.round(options.audioBitrate / 1000)}k`;

  const stopTimer = startProgressTimer(totalDuration, onProgress);
  try {
    await ff.exec([
      '-loop', '1', '-framerate', String(FPS), '-i', imgName,
      '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
      '-t', String(totalDuration),
      '-threads', '0',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage',
      '-b:v', videoBitrate,
      '-c:a', 'aac', '-b:a', audioBitrateStr,
      '-pix_fmt', 'yuv420p',
      '-vf', `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
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