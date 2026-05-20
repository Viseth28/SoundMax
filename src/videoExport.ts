import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export async function initFFmpeg(onLog?: (log: any) => void, onProgress?: (p: { progress: number, time: number }) => void) {
  if (ffmpeg) return ffmpeg;
  ffmpeg = new FFmpeg();
  
  if (onLog) ffmpeg.on('log', onLog);
  if (onProgress) ffmpeg.on('progress', onProgress);

  const baseURL = '/ffmpeg';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    // Worker is only for MT (multi-threading) which requires core-mt. We are using standard core umd.
  });

  return ffmpeg;
}

export async function exportIndividualVideo(
  ffmpegInst: FFmpeg,
  imageFile: File,
  audioBlob: Blob,
  outputName: string
): Promise<Blob> {
  const imgExt = imageFile.name.split('.').pop() || 'jpg';
  const imgName = `cover.${imgExt}`;
  const audioName = `audio.wav`; // We assume WAV for simplicity
  
  // Write files to virtual FS
  await ffmpegInst.writeFile(imgName, await fetchFile(imageFile));
  await ffmpegInst.writeFile(audioName, await fetchFile(audioBlob));

  // Run FFmpeg
  // -loop 1: loop the single image
  // -i imgName: input image
  // -i audioName: input audio
  // -c:v libx264: use H.264 video codec
  // -tune stillimage: optimize for static image
  // -c:a aac -b:a 320k: high quality AAC audio
  // -pix_fmt yuv420p: standard pixel format for web compatibility
  // -shortest: stop encoding when the shortest stream (the audio) ends
  await ffmpegInst.exec([
    '-loop', '1',
    '-i', imgName,
    '-i', audioName,
    '-c:v', 'libx264',
    '-tune', 'stillimage',
    '-c:a', 'aac',
    '-b:a', '320k',
    '-pix_fmt', 'yuv420p',
    '-shortest',
    outputName
  ]);

  const data = await ffmpegInst.readFile(outputName);
  
  // Cleanup FS
  await ffmpegInst.deleteFile(imgName);
  await ffmpegInst.deleteFile(audioName);
  await ffmpegInst.deleteFile(outputName);

  return new Blob([data as any], { type: 'video/mp4' });
}

export async function exportAlbumVideo(
  ffmpegInst: FFmpeg,
  imageFile: File,
  audioBlobs: { name: string, blob: Blob }[],
  outputName: string
): Promise<Blob> {
  const imgExt = imageFile.name.split('.').pop() || 'jpg';
  const imgName = `cover.${imgExt}`;
  
  await ffmpegInst.writeFile(imgName, await fetchFile(imageFile));

  let concatContent = '';
  
  // Write all audio files and prepare concat file
  for (let i = 0; i < audioBlobs.length; i++) {
    const trackName = `track_${i}.wav`;
    await ffmpegInst.writeFile(trackName, await fetchFile(audioBlobs[i].blob));
    concatContent += `file '${trackName}'\n`;
  }

  // Write concat.txt to virtual FS
  await ffmpegInst.writeFile('concat.txt', concatContent);

  // Run FFmpeg concatenation and video mapping
  await ffmpegInst.exec([
    '-loop', '1',
    '-i', imgName,
    '-f', 'concat',
    '-safe', '0',
    '-i', 'concat.txt',
    '-c:v', 'libx264',
    '-tune', 'stillimage',
    '-c:a', 'aac',
    '-b:a', '320k',
    '-pix_fmt', 'yuv420p',
    '-shortest',
    outputName
  ]);

  const data = await ffmpegInst.readFile(outputName);

  // Cleanup FS
  await ffmpegInst.deleteFile(imgName);
  await ffmpegInst.deleteFile('concat.txt');
  for (let i = 0; i < audioBlobs.length; i++) {
    await ffmpegInst.deleteFile(`track_${i}.wav`);
  }
  await ffmpegInst.deleteFile(outputName);

  return new Blob([data as any], { type: 'video/mp4' });
}
