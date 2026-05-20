import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export async function initFFmpeg() {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  if (loadPromise) return loadPromise;

  ffmpeg = new FFmpeg();

  const baseURL = window.location.origin + '/ffmpeg';
  
  loadPromise = (async () => {
    try {
      await ffmpeg!.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
      });
      return ffmpeg!;
    } catch (e) {
      // Fallback: try single-threaded core without workerURL
      try {
        ffmpeg = new FFmpeg();
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        loadPromise = null;
        return ffmpeg;
      } catch (e2) {
        loadPromise = null;
        throw e2;
      }
    }
  })();

  return loadPromise;
}

// Start an animated progress timer since ffmpeg cannot calculate progress 
// when total duration is unknown (looped image input)
function startProgressTimer(
  durationSec: number,
  onProgress: (pct: number) => void
): () => void {
  const start = Date.now();
  // Estimate encoding takes ~2x realtime as a safe upper bound
  const estimatedMs = durationSec * 2000;
  const interval = setInterval(() => {
    const elapsed = Date.now() - start;
    const pct = Math.min(95, Math.round((elapsed / estimatedMs) * 100));
    onProgress(pct);
  }, 500);
  return () => clearInterval(interval);
}

export async function exportIndividualVideo(
  ffmpegInst: FFmpeg,
  imageFile: File,
  audioBlob: Blob,
  audioDurationSec: number,
  outputName: string,
  onProgress: (pct: number) => void
): Promise<Blob> {
  const imgExt = imageFile.name.split('.').pop() || 'jpg';
  const imgName = `cover.${imgExt}`;
  const audioName = `audio.wav`;

  await ffmpegInst.writeFile(imgName, await fetchFile(imageFile));
  await ffmpegInst.writeFile(audioName, await fetchFile(audioBlob));

  const stopTimer = startProgressTimer(audioDurationSec, onProgress);

  try {
    await ffmpegInst.exec([
      '-loop', '1',
      '-i', imgName,
      '-i', audioName,
      '-t', String(audioDurationSec),   // Tell FFmpeg the exact duration
      '-c:v', 'libx264',
      '-preset', 'ultrafast',            // Use ultrafast preset to minimize CPU time
      '-tune', 'stillimage',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',         // YouTube optimization
      outputName
    ]);
  } finally {
    stopTimer();
  }

  onProgress(99);
  const data = await ffmpegInst.readFile(outputName);
  
  await ffmpegInst.deleteFile(imgName);
  await ffmpegInst.deleteFile(audioName);
  await ffmpegInst.deleteFile(outputName);

  onProgress(100);
  return new Blob([data as any], { type: 'video/mp4' });
}

export async function exportAlbumVideo(
  ffmpegInst: FFmpeg,
  imageFile: File,
  audioBlobs: { name: string, blob: Blob, duration: number }[],
  outputName: string,
  onProgress: (pct: number) => void
): Promise<Blob> {
  const imgExt = imageFile.name.split('.').pop() || 'jpg';
  const imgName = `cover.${imgExt}`;
  const totalDuration = audioBlobs.reduce((sum, a) => sum + a.duration, 0);

  await ffmpegInst.writeFile(imgName, await fetchFile(imageFile));

  let concatContent = '';
  for (let i = 0; i < audioBlobs.length; i++) {
    const trackName = `track_${i}.wav`;
    await ffmpegInst.writeFile(trackName, await fetchFile(audioBlobs[i].blob));
    concatContent += `file '${trackName}'\n`;
  }
  await ffmpegInst.writeFile('concat.txt', concatContent);

  const stopTimer = startProgressTimer(totalDuration, onProgress);

  try {
    await ffmpegInst.exec([
      '-loop', '1',
      '-i', imgName,
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-t', String(totalDuration),       // Tell FFmpeg the exact total duration
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'stillimage',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputName
    ]);
  } finally {
    stopTimer();
  }

  onProgress(99);
  const data = await ffmpegInst.readFile(outputName);

  await ffmpegInst.deleteFile(imgName);
  await ffmpegInst.deleteFile('concat.txt');
  for (let i = 0; i < audioBlobs.length; i++) {
    await ffmpegInst.deleteFile(`track_${i}.wav`);
  }
  await ffmpegInst.deleteFile(outputName);

  onProgress(100);
  return new Blob([data as any], { type: 'video/mp4' });
}
