import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, Settings, X, Download, Sparkles, Video, Volume2, VolumeX, Music } from 'lucide-react';
import { AudioGraph, type AudioParameters, defaultParams, presets } from './audioEngine';
import { encodeWAV } from './wavEncoder';
import { encodeMP3 } from './mp3Encoder';
import { encodeFLAC } from './flacEncoder';
import { calculateAutoMaster } from './autoMaster';
import { exportIndividualVideo, exportAlbumVideo, isWebCodecsSupported } from './videoExport';

interface QueuedFile {
  id: string;
  file: File;
  name: string;
  duration: number;
  type: string;
  status: 'Idle' | 'Processing' | 'Completed';
  buffer: AudioBuffer | null;
}

export default function App() {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [params, setParams] = useState<AudioParameters>(defaultParams);
  const [presetName, setPresetName] = useState("Default");
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [exportConfig, setExportConfig] = useState({
    format: 'WAV 16-bit',
    sampleRate: 44100,
    sunoBypass: true,
    vocalClarity: false,
    softClip: true,
    lufsTarget: 'Off',
    artistName: '',
    albumName: '',
    genre: '',
    date: '',
    coverImageFile: null as File | null,
    coverImageData: null as ArrayBuffer | null,
    coverMime: ''
  });

  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoConfig, setVideoConfig] = useState({
    imageFile: null as File | null,
    mode: 'individual' as 'individual' | 'album'
  });
  const [videoProgress, setVideoProgress] = useState(0);
  const [isExportingVideo, setIsExportingVideo] = useState(false);

  // Playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
  const [playbackVolume, setPlaybackVolume] = useState(() => {
    const saved = localStorage.getItem('soundmax_volume');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [isMuted, setIsMuted] = useState(false);

  const handleVideoExport = async () => {
    if (!videoConfig.imageFile || files.length === 0) return;
    setIsExportingVideo(true);
    setVideoProgress(0);

    try {
      if (videoConfig.mode === 'individual') {
        for (const file of files) {
          if (!file.buffer) continue;
          
          setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'Processing' } : f));
          
          const offlineCtx = new OfflineAudioContext(2, Math.ceil(file.buffer.duration * exportConfig.sampleRate), exportConfig.sampleRate);
          const offlineGraph = new AudioGraph(offlineCtx);
          offlineGraph.applyParameters(params);
          if (exportConfig.sunoBypass) offlineGraph.applySunoBypass();
          offlineGraph.connectSource(file.buffer);
          offlineGraph.start();
          const renderedBuffer = await offlineCtx.startRendering();
          const audioBlob = encodeWAV(renderedBuffer, exportConfig.sampleRate, 16);
          
          const videoBlob = await exportIndividualVideo(
            videoConfig.imageFile, renderedBuffer, audioBlob,
            (pct) => setVideoProgress(pct)
          );
          
          const outputName = `SOUNDMAX_Video_${file.name.replace(/\.[^/.]+$/, '')}.mp4`;
          const url = URL.createObjectURL(videoBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = outputName;
          a.click();
          URL.revokeObjectURL(url);
          
          setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'Completed' } : f));
          setVideoProgress(0);
        }
      } else {
        const renderedBuffers: AudioBuffer[] = [];
        const audioBlobs: Blob[] = [];

        for (const file of files) {
          if (!file.buffer) continue;
          setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'Processing' } : f));
          const offlineCtx = new OfflineAudioContext(2, Math.ceil(file.buffer.duration * exportConfig.sampleRate), exportConfig.sampleRate);
          const offlineGraph = new AudioGraph(offlineCtx);
          offlineGraph.applyParameters(params);
          if (exportConfig.sunoBypass) offlineGraph.applySunoBypass();
          offlineGraph.connectSource(file.buffer);
          offlineGraph.start();
          const renderedBuffer = await offlineCtx.startRendering();
          renderedBuffers.push(renderedBuffer);
          audioBlobs.push(encodeWAV(renderedBuffer, exportConfig.sampleRate, 16));
          setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'Completed' } : f));
        }
        
        const videoBlob = await exportAlbumVideo(
          videoConfig.imageFile, renderedBuffers, audioBlobs,
          (pct) => setVideoProgress(pct)
        );
        
        const url = URL.createObjectURL(videoBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'SOUNDMAX_Full_Album_Video.mp4';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error(e);
      alert('Video export failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsExportingVideo(false);
      setVideoProgress(0);
      setShowVideoModal(false);
      setFiles(prev => prev.map(f => f.status === 'Processing' ? { ...f, status: 'Idle' } : f));
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const buffer = await file.arrayBuffer();
      setExportConfig(prev => ({
        ...prev,
        coverImageFile: file,
        coverImageData: buffer,
        coverMime: file.type
      }));
    }
  };

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioGraphRef = useRef<AudioGraph | null>(null);
  const playbackStartCtxTimeRef = useRef<number>(0);
  const playbackOffsetRef = useRef<number>(0);
  const isManualStopRef = useRef<boolean>(false);
  const playbackTimerRef = useRef<any>(null);

  // Initialize Audio Context on first user interaction
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioGraphRef.current = new AudioGraph(audioContextRef.current);
      setAnalyserNode(audioGraphRef.current.nodes.analyser);
      audioGraphRef.current.applyParameters(params, isMuted ? 0 : playbackVolume);
    }
  };

  useEffect(() => {
    localStorage.setItem('soundmax_volume', playbackVolume.toString());
  }, [playbackVolume]);

  useEffect(() => {
    if (audioGraphRef.current) {
      audioGraphRef.current.applyParameters(params, isMuted ? 0 : playbackVolume);
    }
  }, [params, playbackVolume, isMuted]);

  const decodeAudioFile = async (file: File): Promise<AudioBuffer> => {
    initAudioContext();
    const arrayBuffer = await file.arrayBuffer();
    return await audioContextRef.current!.decodeAudioData(arrayBuffer);
  };

  const processFiles = async (newFiles: File[]) => {
    for (const file of newFiles) {
      if (file.type.startsWith('audio/')) {
        const id = Math.random().toString(36).substring(7);
        const qFile: QueuedFile = {
          id, file, name: file.name, duration: 0, type: file.type, status: 'Idle', buffer: null
        };
        setFiles(prev => {
          const updated = [...prev, qFile];
          filesRef.current = updated;
          return updated;
        });
        
        // Decode in background
        try {
          const buffer = await decodeAudioFile(file);
          setFiles(prev => {
            const updated = prev.map(f => f.id === id ? { ...f, duration: buffer.duration, buffer } : f);
            filesRef.current = updated;
            return updated;
          });
        } catch (err) {
          console.error(`Error decoding file ${file.name}:`, err);
          alert(`Failed to decode audio file "${file.name}". Please ensure it is a valid, uncorrupted audio format.`);
          setFiles(prev => {
            const updated = prev.filter(f => f.id !== id);
            filesRef.current = updated;
            return updated;
          });
        }
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    await processFiles(Array.from(event.target.files));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!e.dataTransfer.files) return;
    await processFiles(Array.from(e.dataTransfer.files));
  };

  // Ref Synchronization
  const filesRef = useRef(files);
  const playingIdRef = useRef(playingId);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { playingIdRef.current = playingId; }, [playingId]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const startPlaybackTimer = (duration: number) => {
    if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    
    playbackTimerRef.current = setInterval(() => {
      if (!audioContextRef.current) return;
      const elapsed = audioContextRef.current.currentTime - playbackStartCtxTimeRef.current;
      let current = playbackOffsetRef.current + elapsed;
      
      if (current >= duration) {
        current = duration;
        clearInterval(playbackTimerRef.current);
      }
      
      setCurrentPlaybackTime(current);
    }, 100);
  };

  const playTrack = (id: string, offsetSeconds = 0) => {
    initAudioContext();
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    const currentFiles = filesRef.current;
    const file = currentFiles.find(f => f.id === id);
    if (!file || !file.buffer) return;

    isManualStopRef.current = true;
    if (audioGraphRef.current?.source) {
      audioGraphRef.current.source.onended = null; // Clear old ended handler
    }
    audioGraphRef.current?.stop();
    isManualStopRef.current = false;

    audioGraphRef.current?.connectSource(file.buffer);

    const currentSource = audioGraphRef.current?.source;
    if (currentSource) {
      currentSource.onended = () => {
        // Double-check: only transition if this is still the active source and it ended naturally while playing
        if (audioGraphRef.current?.source === currentSource && isPlayingRef.current) {
          handleNextTrack();
        }
      };
    }

    audioGraphRef.current?.start(0, offsetSeconds);

    playbackStartCtxTimeRef.current = audioContextRef.current!.currentTime;
    playbackOffsetRef.current = offsetSeconds;
    
    setPlayingId(id);
    playingIdRef.current = id;
    setIsPlaying(true);
    isPlayingRef.current = true;
    setCurrentPlaybackTime(offsetSeconds);

    startPlaybackTimer(file.buffer.duration);
  };

  const pauseTrack = () => {
    if (!playingId) return;
    
    isManualStopRef.current = true;
    if (audioGraphRef.current?.source) {
      audioGraphRef.current.source.onended = null;
    }
    audioGraphRef.current?.stop();
    isManualStopRef.current = false;
    
    if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    
    setIsPlaying(false);
    isPlayingRef.current = false;
    
    if (audioContextRef.current) {
      const elapsed = audioContextRef.current.currentTime - playbackStartCtxTimeRef.current;
      playbackOffsetRef.current = playbackOffsetRef.current + elapsed;
      setCurrentPlaybackTime(playbackOffsetRef.current);
    }
  };

  const resumeTrack = () => {
    if (!playingId) return;
    playTrack(playingId, playbackOffsetRef.current);
  };

  const seekTrack = (timeSeconds: number) => {
    if (!playingId) return;
    const file = files.find(f => f.id === playingId);
    if (!file || !file.buffer) return;
    
    const clampedTime = Math.max(0, Math.min(timeSeconds, file.buffer.duration));
    
    if (isPlaying) {
      playTrack(playingId, clampedTime);
    } else {
      playbackOffsetRef.current = clampedTime;
      setCurrentPlaybackTime(clampedTime);
    }
  };

  const handleNextTrack = () => {
    const currentFiles = filesRef.current;
    const currentPlayingId = playingIdRef.current;
    
    if (currentFiles.length === 0) return;
    
    const currentIndex = currentFiles.findIndex(f => f.id === currentPlayingId);
    if (currentIndex === -1) {
      const firstPlayable = currentFiles.find(f => f.buffer !== null);
      if (firstPlayable) playTrack(firstPlayable.id, 0);
    } else {
      const nextIndex = (currentIndex + 1) % currentFiles.length;
      const nextFile = currentFiles[nextIndex];
      if (nextFile && nextFile.buffer) {
        playTrack(nextFile.id, 0);
      } else {
        const decodedFile = currentFiles.slice(nextIndex).find(f => f.buffer !== null) || currentFiles.find(f => f.buffer !== null);
        if (decodedFile) playTrack(decodedFile.id, 0);
      }
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, []);

  const togglePlayback = (id: string) => {
    initAudioContext();
    const currentFiles = filesRef.current;
    const file = currentFiles.find(f => f.id === id);
    if (!file || !file.buffer) return;

    const currentPlayingId = playingIdRef.current;
    if (currentPlayingId === id) {
      if (isPlayingRef.current) {
        pauseTrack();
      } else {
        resumeTrack();
      }
    } else {
      playTrack(id, 0);
    }
  };

  const removeFile = (id: string) => {
    if (playingId === id) {
      isManualStopRef.current = true;
      if (audioGraphRef.current?.source) {
        audioGraphRef.current.source.onended = null;
      }
      audioGraphRef.current?.stop();
      isManualStopRef.current = false;
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      setPlayingId(null);
      playingIdRef.current = null;
      setIsPlaying(false);
      isPlayingRef.current = false;
      setCurrentPlaybackTime(0);
    }
    setFiles(prev => {
      const updated = prev.filter(f => f.id !== id);
      filesRef.current = updated;
      return updated;
    });
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>, key: keyof AudioParameters) => {
    setParams(prev => ({ ...prev, [key]: parseFloat(e.target.value) }));
    setPresetName("Custom");
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setPresetName(name);
    if (presets[name]) {
      setParams(presets[name]);
    }
  };

  const handleAutoMaster = () => {
    if (files.length === 0) {
      alert("Please add an audio file to the queue first.");
      return;
    }
    // Prioritize currently playing file, otherwise use the first file
    const activeFile = files.find(f => f.id === playingId) || files.find(f => f.buffer !== null);
    if (!activeFile || !activeFile.buffer) {
      alert("Audio file is still decoding, please wait.");
      return;
    }

    const optimalParams = calculateAutoMaster(activeFile.buffer);
    setParams(optimalParams);
    setPresetName("AI Mastered");
  };

  const executeExport = async () => {
    setShowExportModal(false);
    
    try {
      // Process all files in queue sequentially
      for (const file of files) {
      if (!file.buffer) continue;
      
      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'Processing' } : f));
      
      const offlineCtx = new OfflineAudioContext(
        2, // Always render as Stereo (2 channels) for distributor compatibility (RouteNote etc)
        Math.ceil(file.buffer.duration * exportConfig.sampleRate),
        exportConfig.sampleRate
      );
      
      const offlineGraph = new AudioGraph(offlineCtx);
      offlineGraph.applyParameters(params);
      
      if (exportConfig.sunoBypass) offlineGraph.applySunoBypass();
      if (exportConfig.vocalClarity) offlineGraph.applyVocalBoost();
      // Soft clip is handled by the limiter inherently in the graph with ceiling config
      
      offlineGraph.connectSource(file.buffer);
      offlineGraph.start();
      
      const renderedBuffer = await offlineCtx.startRendering();
      
      const metadata = {
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: exportConfig.artistName,
        album: exportConfig.albumName,
        genre: exportConfig.genre,
        date: exportConfig.date,
        coverImage: exportConfig.coverImageData || undefined,
        coverMime: exportConfig.coverMime || undefined
      };
      
      let blob: Blob;
      
      if (exportConfig.format === 'MP3 320kbps') {
        blob = await encodeMP3(renderedBuffer, metadata);
      } else if (exportConfig.format.startsWith('FLAC')) {
        const bitDepth = exportConfig.format === 'FLAC 24-bit' ? 24 : 16;
        blob = await encodeFLAC(renderedBuffer, bitDepth, metadata);
      } else {
        const bitDepth = exportConfig.format === 'WAV 24-bit' ? 24 : 16;
        blob = encodeWAV(renderedBuffer, exportConfig.sampleRate, bitDepth);
      }
      
      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = exportConfig.format === 'MP3 320kbps' ? 'mp3' : exportConfig.format.startsWith('FLAC') ? 'flac' : 'wav';
      a.download = `SOUNDMAX_${file.name.replace(/\.[^/.]+$/, "")}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      
      
        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'Completed' } : f));
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert(`Export failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      setFiles(prev => prev.map(f => f.status === 'Processing' ? { ...f, status: 'Idle' } : f));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white font-sans overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4 bg-zinc-900 border-b border-zinc-800 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center font-bold text-lg shadow-[0_0_15px_rgba(245,158,11,0.6)]">
            SM
          </div>
          <h1 className="text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
            SOUNDMAX
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowVideoModal(true)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold rounded transition-all flex items-center gap-2 text-zinc-200">
            <Video size={16} /> Video Studio
          </button>
          <button onClick={() => setShowExportModal(true)} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-sm font-semibold rounded transition-all shadow-[0_0_10px_rgba(245,158,11,0.4)] flex items-center gap-2">
            <Download size={16} /> Export Config
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden gap-6">
        
        {/* Batch Queue Panel */}
        <div 
          className={`flex-1 rounded-xl border flex flex-col overflow-hidden shadow-lg relative transition-colors ${isDragging ? 'bg-zinc-800 border-amber-500' : 'bg-zinc-900 border-zinc-800'}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="px-4 py-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/80 backdrop-blur-sm z-10">
            <h2 className="text-sm font-semibold text-zinc-300">BATCH QUEUE</h2>
            <label className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-slate-600 rounded text-xs transition-colors">
              <Upload size={14} /> Add Files
              <input type="file" multiple accept="audio/*" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {files.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 border-2 border-dashed border-zinc-800 rounded-lg">
                <Upload size={32} className="mb-2 opacity-50" />
                <p>Drag & Drop audio files here or click Add Files</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="text-zinc-400 border-b border-zinc-800">
                    <th className="pb-2 font-medium">Filename</th>
                    <th className="pb-2 font-medium w-24">Duration</th>
                    <th className="pb-2 font-medium w-24">Type</th>
                    <th className="pb-2 font-medium w-32">Status</th>
                    <th className="pb-2 font-medium w-24 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map(f => (
                    <tr 
                      key={f.id} 
                      className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group cursor-pointer ${playingId === f.id ? 'bg-amber-500/5' : ''}`}
                      onClick={() => f.buffer && togglePlayback(f.id)}
                    >
                      <td className="py-3 text-zinc-200 truncate max-w-[200px] font-medium flex items-center gap-2">
                        {playingId === f.id && isPlaying ? (
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
                        ) : null}
                        {f.name}
                      </td>
                      <td className="py-3 text-zinc-400">
                        {f.duration ? `${Math.floor(f.duration / 60)}:${Math.floor(f.duration % 60).toString().padStart(2, '0')}` : '--'}
                      </td>
                      <td className="py-3 text-zinc-400 text-xs">{f.type.split('/')[1]?.toUpperCase() || 'AUDIO'}</td>
                      <td className="py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          f.status === 'Completed' ? 'bg-emerald-900/50 text-emerald-400' :
                          f.status === 'Processing' ? 'bg-amber-900/50 text-amber-400 animate-pulse' :
                          'bg-zinc-800 text-zinc-400'
                        }`}>
                          {f.status}
                        </span>
                      </td>
                      <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => removeFile(f.id)} title="Remove" className="p-2 bg-zinc-800 hover:bg-red-500 rounded-full transition-colors opacity-50 hover:opacity-100 group-hover:opacity-100">
                            <X size={14} className="text-zinc-300 hover:text-white" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Settings Console (Bottom Panel) */}
        <div className="h-[420px] bg-zinc-900 rounded-xl border border-zinc-800 flex flex-col p-4 shadow-[inset_0_2px_20px_rgba(0,0,0,0.2)]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-zinc-400 tracking-wider flex items-center gap-2">
              <Settings size={16} /> MASTERING CONSOLE
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={handleAutoMaster} className="mr-2 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-bold tracking-wider rounded shadow-[0_0_10px_rgba(245,158,11,0.5)] flex items-center gap-1.5 transition-all">
                <Sparkles size={14} /> AUTO-MASTER
              </button>
              <div className="w-px h-6 bg-zinc-800 mx-2"></div>
              <label className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Preset:</label>
              <select 
                value={presetName} 
                onChange={handlePresetChange} 
                className="bg-zinc-950 border border-zinc-800 text-sm text-zinc-200 rounded p-1 outline-none focus:border-amber-500 shadow-sm"
              >
                <option value="Custom" className="italic text-zinc-500">Custom</option>
                <option value="AI Mastered" className="font-bold text-amber-300" disabled>AI Mastered ✦</option>
                {Object.keys(presets).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          
          <Visualizer analyser={analyserNode} />

          <div className="flex-1 flex justify-around items-end pb-2 overflow-x-auto mt-4">
            {/* EQ Section */}
            <SliderGroup title="EQ / TONE">
              <VerticalSlider label="Bass" value={params.eqBass} min={-24} max={24} onChange={e => handleSliderChange(e, 'eqBass')} />
              <VerticalSlider label="Deep" value={params.eqDeep} min={-24} max={24} onChange={e => handleSliderChange(e, 'eqDeep')} />
              <VerticalSlider label="Mid" value={params.eqMid} min={-24} max={24} onChange={e => handleSliderChange(e, 'eqMid')} />
            </SliderGroup>

            <div className="w-px h-full bg-zinc-800 mx-4"></div>

            {/* Dynamics Section */}
            <SliderGroup title="DYNAMICS">
              <VerticalSlider label="Comp" value={params.compThreshold} min={-60} max={0} onChange={e => handleSliderChange(e, 'compThreshold')} />
              <VerticalSlider label="Ratio" value={params.compRatio} min={1} max={20} step={0.1} onChange={e => handleSliderChange(e, 'compRatio')} />
              <VerticalSlider label="Limit" value={params.limitCeiling} min={-24} max={0} step={0.1} onChange={e => handleSliderChange(e, 'limitCeiling')} />
            </SliderGroup>

            <div className="w-px h-full bg-zinc-800 mx-4"></div>

            {/* Saturation Color Section */}
            <SliderGroup title="COLOR / TONE">
              <VerticalSlider label="Drive" value={params.saturation} min={0} max={100} onChange={e => handleSliderChange(e, 'saturation')} />
            </SliderGroup>

            <div className="w-px h-full bg-zinc-800 mx-4"></div>

            {/* Space / Mono Section */}
            <SliderGroup title="SPACE / MONO">
              <VerticalSlider label="Width" value={params.stereoWidth} min={0} max={200} onChange={e => handleSliderChange(e, 'stereoWidth')} />
              <VerticalSlider label="Verb" value={params.reverb} min={0} max={100} onChange={e => handleSliderChange(e, 'reverb')} />
              <VerticalSlider label="Echo" value={params.echo} min={0} max={100} onChange={e => handleSliderChange(e, 'echo')} />
            </SliderGroup>

            <div className="w-px h-full bg-zinc-800 mx-4"></div>
            
            {/* Master */}
            <SliderGroup title="MASTER">
              <VerticalSlider label="Gain" value={params.gain} min={-24} max={24} onChange={e => handleSliderChange(e, 'gain')} />
            </SliderGroup>
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <h2 className="text-lg font-bold text-white">Export Configuration</h2>
              <button onClick={() => setShowExportModal(false)} className="text-zinc-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Artist Name</label>
                  <input 
                    type="text" 
                    value={exportConfig.artistName}
                    onChange={e => setExportConfig({...exportConfig, artistName: e.target.value})}
                    placeholder="Optional (e.g., BORAT)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-zinc-200 outline-none focus:border-amber-500 mb-4"
                  />
                  
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Genre</label>
                  <input 
                    type="text" 
                    value={exportConfig.genre}
                    onChange={e => setExportConfig({...exportConfig, genre: e.target.value})}
                    placeholder="Optional (e.g., Electronic)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-zinc-200 outline-none focus:border-amber-500 mb-4"
                  />
                  
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Format</label>
                  <select 
                    value={exportConfig.format}
                    onChange={e => setExportConfig({...exportConfig, format: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-zinc-200 outline-none focus:border-amber-500 mb-4"
                  >
                    <option>WAV 16-bit</option>
                    <option>WAV 24-bit</option>
                    <option>FLAC 16-bit</option>
                    <option>FLAC 24-bit</option>
                    <option>MP3 320kbps</option>
                  </select>
                  
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Album Cover</label>
                  <label className="cursor-pointer flex items-center justify-center border-2 border-dashed border-zinc-800 bg-zinc-950 rounded p-2 h-[68px] hover:bg-zinc-900 transition-colors overflow-hidden">
                    {exportConfig.coverImageFile ? (
                       <span className="text-xs text-zinc-300 truncate max-w-full px-2">{exportConfig.coverImageFile.name}</span>
                    ) : (
                       <div className="flex flex-col items-center">
                         <Upload size={14} className="text-zinc-500 mb-1" />
                         <span className="text-[10px] text-zinc-500">Upload Image</span>
                       </div>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                  </label>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Album Name</label>
                  <input 
                    type="text" 
                    value={exportConfig.albumName}
                    onChange={e => setExportConfig({...exportConfig, albumName: e.target.value})}
                    placeholder="Optional (e.g., BORAT LAP)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-zinc-200 outline-none focus:border-amber-500 mb-4"
                  />
                  
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Date (Year)</label>
                  <input 
                    type="text" 
                    value={exportConfig.date}
                    onChange={e => setExportConfig({...exportConfig, date: e.target.value})}
                    placeholder="Optional (e.g., 2026)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-zinc-200 outline-none focus:border-amber-500 mb-4"
                  />
                  
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Sample Rate</label>
                  <select 
                    value={exportConfig.sampleRate}
                    onChange={e => setExportConfig({...exportConfig, sampleRate: parseInt(e.target.value)})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-zinc-200 outline-none focus:border-amber-500 mb-4"
                  >
                    <option value={44100}>44100 Hz</option>
                    <option value={48000}>48000 Hz</option>
                  </select>
                  
                  <label className="block text-xs font-medium text-zinc-400 mb-1">LUFS Target</label>
                  <select 
                    value={exportConfig.lufsTarget}
                    onChange={e => setExportConfig({...exportConfig, lufsTarget: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-zinc-200 outline-none focus:border-amber-500"
                  >
                    <option>Off</option>
                    <option>-14 LUFS (Streaming)</option>
                    <option>-9 LUFS (Club/Loud)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3 bg-zinc-950/50 p-4 rounded border border-zinc-800/50">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center w-5 h-5">
                    <input type="checkbox" checked={exportConfig.sunoBypass} onChange={e => setExportConfig({...exportConfig, sunoBypass: e.target.checked})} className="peer sr-only" />
                    <div className="w-5 h-5 border-2 border-zinc-600 rounded bg-zinc-900 peer-checked:bg-amber-500 peer-checked:border-amber-500 transition-colors"></div>
                    <X size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity rotate-45 scale-110" style={{clipPath:'inset(0 0 0 0)'}} />
                  </div>
                  <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">SUNO Bypass (Watermark Strip)</span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center w-5 h-5">
                    <input type="checkbox" checked={exportConfig.vocalClarity} onChange={e => setExportConfig({...exportConfig, vocalClarity: e.target.checked})} className="peer sr-only" />
                    <div className="w-5 h-5 border-2 border-zinc-600 rounded bg-zinc-900 peer-checked:bg-amber-500 peer-checked:border-amber-500 transition-colors"></div>
                    <X size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity rotate-45 scale-110" style={{clipPath:'inset(0 0 0 0)'}} />
                  </div>
                  <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">Vocal Clarity Boost (3-5kHz)</span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center w-5 h-5">
                    <input type="checkbox" checked={exportConfig.softClip} onChange={e => setExportConfig({...exportConfig, softClip: e.target.checked})} className="peer sr-only" />
                    <div className="w-5 h-5 border-2 border-zinc-600 rounded bg-zinc-900 peer-checked:bg-amber-500 peer-checked:border-amber-500 transition-colors"></div>
                    <X size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity rotate-45 scale-110" style={{clipPath:'inset(0 0 0 0)'}} />
                  </div>
                  <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">Soft Clip Ceiling (Prevent Clip)</span>
                </label>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-800 flex justify-end gap-3">
              <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={executeExport} disabled={files.length === 0} className="px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:hover:bg-amber-600 text-white text-sm font-bold rounded shadow-[0_0_15px_rgba(245,158,11,0.4)] transition-all">
                Start Export
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Studio Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Video size={20} className="text-amber-500" />
                SOUNDMAX Video Studio
              </h2>
              <button onClick={() => !isExportingVideo && setShowVideoModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-400">Transform your mastered audio into a YouTube-ready MP4. No video editor needed.</div>
                {isWebCodecsSupported() ? (
                  <span className="ml-3 shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">⚡ GPU</span>
                ) : (
                  <span className="ml-3 shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-700/50 text-zinc-400 border border-zinc-600/30">CPU</span>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">Cover Artwork (Required)</label>
                <label className="cursor-pointer flex flex-col items-center justify-center border-2 border-dashed border-zinc-700 bg-zinc-950 rounded-lg p-6 hover:bg-zinc-900 hover:border-amber-500 transition-all">
                  {videoConfig.imageFile ? (
                    <div className="text-center">
                      <div className="text-amber-500 mb-1"><Video size={24} className="mx-auto" /></div>
                      <span className="text-sm text-zinc-200 block truncate max-w-[200px]">{videoConfig.imageFile.name}</span>
                      <span className="text-xs text-zinc-500">Click to change</span>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Upload size={24} className="text-zinc-500 mb-2 mx-auto" />
                      <span className="text-sm text-zinc-300 block mb-1">Upload Image (16:9 or Square)</span>
                      <span className="text-xs text-zinc-600">JPEG, PNG</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setVideoConfig({...videoConfig, imageFile: f});
                  }} />
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">Export Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setVideoConfig({...videoConfig, mode: 'individual'})}
                    className={`p-3 rounded border text-sm transition-all ${videoConfig.mode === 'individual' ? 'bg-amber-600/20 border-amber-500 text-amber-500' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
                  >
                    <div className="font-bold mb-1">Individual Videos</div>
                    <div className="text-[10px] opacity-80 leading-tight">1 MP4 file per track in the queue</div>
                  </button>
                  <button 
                    onClick={() => setVideoConfig({...videoConfig, mode: 'album'})}
                    className={`p-3 rounded border text-sm transition-all ${videoConfig.mode === 'album' ? 'bg-amber-600/20 border-amber-500 text-amber-500' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}
                  >
                    <div className="font-bold mb-1">Full Album Video</div>
                    <div className="text-[10px] opacity-80 leading-tight">1 massive MP4 file with all tracks</div>
                  </button>
                </div>
              </div>

              {isExportingVideo && (
                <div className="pt-2">
                  <div className="flex justify-between text-xs text-amber-500 mb-1 font-medium">
                    <span>Rendering Video (CPU Intensive)...</span>
                    <span>{videoProgress}%</span>
                  </div>
                  <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden">
                    <div className="bg-amber-500 h-full transition-all duration-300" style={{width: `${videoProgress}%`}}></div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-800 flex justify-end gap-3">
              <button disabled={isExportingVideo} onClick={() => setShowVideoModal(false)} className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button 
                onClick={handleVideoExport} 
                disabled={files.length === 0 || !videoConfig.imageFile || isExportingVideo} 
                className="px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:hover:bg-amber-600 text-white text-sm font-bold rounded shadow-[0_0_15px_rgba(245,158,11,0.4)] transition-all flex items-center gap-2"
              >
                {isExportingVideo ? <Sparkles className="animate-spin" size={16} /> : <Video size={16} />}
                {isExportingVideo ? 'Rendering...' : 'Render Video'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Controller Bar */}
      <div className="h-20 bg-zinc-900 border-t border-zinc-800 px-6 flex items-center justify-between shadow-2xl z-40 select-none">
        {/* Left: Track Info */}
        <div className="flex items-center gap-3 w-1/3 min-w-[240px]">
          <div className="w-12 h-12 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-500 shadow-inner shrink-0 relative overflow-hidden group">
            {exportConfig.coverImageFile && playingId ? (
              <img src={URL.createObjectURL(exportConfig.coverImageFile)} className="w-full h-full object-cover" alt="Cover" />
            ) : (
              <Music size={20} className="text-zinc-400 group-hover:text-amber-500 transition-colors" />
            )}
          </div>
          <div className="flex flex-col truncate">
            <span className="text-sm font-semibold text-zinc-100 truncate">
              {playingId ? (files.find(f => f.id === playingId)?.name || 'Unknown Track') : 'No Track Playing'}
            </span>
            <span className="text-xs text-zinc-400 truncate flex items-center gap-1">
              {playingId ? (
                <>
                  {exportConfig.artistName || 'Unknown Artist'} 
                  <span className="w-1 h-1 rounded-full bg-zinc-600"></span> 
                  <span className="text-amber-500 font-bold uppercase text-[9px] tracking-wider bg-amber-500/10 px-1 rounded">{presetName}</span>
                </>
              ) : 'Select a track to play'}
            </span>
          </div>
        </div>

        {/* Center: Controls & Seek */}
        <div className="flex flex-col items-center gap-1.5 flex-1 max-w-xl px-4">
          {/* Controls */}
          <div className="flex items-center gap-5">
            <button 
              onClick={() => playingId && togglePlayback(playingId)} 
              disabled={!playingId} 
              className="w-8 h-8 rounded-full bg-white text-zinc-950 flex items-center justify-center hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)]"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} className="ml-0.5" fill="currentColor" />}
            </button>
          </div>

          {/* Seekbar */}
          <div className="flex items-center gap-3 w-full">
            <span className="text-[10px] font-mono text-zinc-500 w-8 text-right">
              {formatTime(currentPlaybackTime)}
            </span>
            <div className="flex-1 relative group flex items-center py-1.5">
              <input 
                type="range" 
                min={0} 
                max={playingId ? (files.find(f => f.id === playingId)?.duration || 1) : 1} 
                step={0.1}
                value={currentPlaybackTime}
                onChange={(e) => seekTrack(parseFloat(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none transition-all group-hover:h-1.5 focus:outline-none accent-amber-500"
                style={{
                  background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${
                    playingId 
                      ? (currentPlaybackTime / (files.find(f => f.id === playingId)?.duration || 1)) * 100 
                      : 0
                  }%, #27272a ${
                    playingId 
                      ? (currentPlaybackTime / (files.find(f => f.id === playingId)?.duration || 1)) * 100 
                      : 0
                  }%, #27272a 100%)`
                }}
              />
            </div>
            <span className="text-[10px] font-mono text-zinc-500 w-8">
              {playingId ? formatTime(files.find(f => f.id === playingId)?.duration || 0) : '0:00'}
            </span>
          </div>
        </div>

        {/* Right: Volume & Format Info */}
        <div className="flex items-center justify-end gap-4 w-1/3 min-w-[240px]">
          <div className="hidden sm:flex items-center gap-1 bg-zinc-950/60 border border-zinc-800/80 px-2.5 py-1 rounded text-[10px] font-bold tracking-wider text-zinc-400 font-mono">
            <Sparkles size={11} className="text-amber-500" />
            {exportConfig.format}
          </div>

          <div className="flex items-center gap-2 w-32 group/vol">
            <button 
              onClick={() => setIsMuted(!isMuted)} 
              className="text-zinc-400 hover:text-white transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || playbackVolume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input 
              type="range" 
              min={0} 
              max={1} 
              step={0.01}
              value={isMuted ? 0 : playbackVolume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setPlaybackVolume(v);
                if (isMuted && v > 0) setIsMuted(false);
              }}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none group-hover/vol:h-1.5 focus:outline-none accent-amber-500"
              style={{
                background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${
                  (isMuted ? 0 : playbackVolume) * 100
                }%, #27272a ${
                  (isMuted ? 0 : playbackVolume) * 100
                }%, #27272a 100%)`
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SliderGroup({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center h-full">
      <div className="flex gap-4 items-end flex-1 pb-2">
        {children}
      </div>
      <div className="text-[10px] font-bold text-zinc-500 tracking-widest mt-2">{title}</div>
    </div>
  );
}

function VerticalSlider({ label, value, min, max, step = 1, onChange }: { label: string, value: number, min: number, max: number, step?: number, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="flex flex-col items-center h-full w-12 group">
      <div className="flex-1 relative flex justify-center py-2">
        <input 
          type="range" 
          // @ts-ignore - React type for orientation is missing but standard DOM supports it
          orientation="vertical" 
          className="w-1.5 h-full rounded-full appearance-none bg-zinc-950 outline-none slider-vertical cursor-ns-resize shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]"
          style={{
            WebkitAppearance: 'slider-vertical',
          }}
          min={min} max={max} step={step} value={value} onChange={onChange} 
        />
        <div className="pointer-events-none absolute bottom-0 w-4 h-[2px] bg-amber-500 rounded opacity-0 group-hover:opacity-100 transition-opacity" style={{ bottom: `${((value - min) / (max - min)) * 100}%` }}></div>
      </div>
      <div className="text-center mt-1">
        <div className="text-white text-xs font-mono">{value > 0 && max > 100 ? `+${value}` : value}</div>
        <div className="text-[9px] text-zinc-400 uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

function Visualizer({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Draw background
      ctx.fillStyle = 'rgba(9, 9, 11, 1)'; 
      ctx.fillRect(0, 0, width, height);

      // ── Calculate RMS & estimated LUFS ──
      const timeDomainArray = new Float32Array(bufferLength);
      analyser.getFloatTimeDomainData(timeDomainArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const val = timeDomainArray[i];
        sum += val * val;
      }
      const rms = Math.sqrt(sum / (bufferLength || 1));
      let rmsDb = rms > 0.0001 ? 20 * Math.log10(rms) : -60;
      rmsDb = Math.max(-60, Math.min(0, rmsDb));

      // Calculate estimated LUFS (k-weighting frequency weight approximation)
      analyser.getByteFrequencyData(dataArray);
      let weightedSum = 0;
      let weightTotal = 0;
      for (let i = 0; i < bufferLength; i++) {
        const freq = (i * analyser.context.sampleRate) / analyser.fftSize;
        let weight = 1.0;
        if (freq < 100) weight = 0.3; 
        else if (freq > 2000 && freq < 6000) weight = 2.0; 
        
        weightedSum += (dataArray[i] / 255) * (dataArray[i] / 255) * weight;
        weightTotal += weight;
      }
      const weightedRms = Math.sqrt(weightedSum / (weightTotal || 1));
      let lufsEst = weightedRms > 0.0001 ? 20 * Math.log10(weightedRms) - 3 : -60;
      lufsEst = Math.max(-60, Math.min(0, lufsEst));

      // Draw spectrum on the left
      const specWidth = width - 150;
      const barWidth = (specWidth / bufferLength) * 2.8;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength * 0.75; i++) {
        barHeight = dataArray[i];
        
        const gradient = ctx.createLinearGradient(0, height, 0, height - (barHeight / 2));
        gradient.addColorStop(0, '#78350f'); 
        gradient.addColorStop(0.5, '#f59e0b'); 
        gradient.addColorStop(1, '#fbbf24'); 

        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - (barHeight / 2), barWidth, barHeight / 2);

        x += barWidth + 1;
      }

      // Draw Meters Area (right 150 pixels)
      ctx.fillStyle = '#18181b'; 
      ctx.fillRect(specWidth, 0, 150, height);
      ctx.fillStyle = '#09090b'; 
      ctx.fillRect(specWidth + 10, 10, 30, height - 20); 
      ctx.fillRect(specWidth + 50, 10, 30, height - 20); 

      // Helper function to draw vertical meter bar
      const drawMeterBar = (xOffset: number, dbVal: number, title: string) => {
        const meterH = height - 20;
        const fillH = ((dbVal + 60) / 60) * meterH;
        
        const meterGrad = ctx.createLinearGradient(0, height - 10, 0, 10);
        meterGrad.addColorStop(0, '#10b981'); 
        meterGrad.addColorStop(0.7, '#f59e0b'); 
        meterGrad.addColorStop(0.9, '#ef4444'); 

        ctx.fillStyle = meterGrad;
        ctx.fillRect(xOffset, height - 10 - fillH, 30, fillH);

        ctx.fillStyle = '#a1a1aa';
        ctx.font = '8px sans-serif';
        ctx.fillText(title, xOffset + 4, height - 12);
        ctx.fillText(`${Math.round(dbVal)}`, xOffset + 4, 18);
      };

      drawMeterBar(specWidth + 10, rmsDb, 'RMS');
      drawMeterBar(specWidth + 50, lufsEst, 'LUFS');

      // Draw guidelines
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.font = '7px sans-serif';
      ctx.fillStyle = '#a1a1aa';

      // Guide for -14dB (Streaming Standard)
      const y14 = 10 + (1 - (-14 + 60) / 60) * (height - 20);
      ctx.beginPath();
      ctx.moveTo(specWidth + 5, y14);
      ctx.lineTo(specWidth + 85, y14);
      ctx.stroke();
      ctx.fillText('-14', specWidth + 90, y14 + 3);

      // Guide for -9dB (Club Level)
      const y9 = 10 + (1 - (-9 + 60) / 60) * (height - 20);
      ctx.beginPath();
      ctx.moveTo(specWidth + 5, y9);
      ctx.lineTo(specWidth + 85, y9);
      ctx.stroke();
      ctx.fillText('-9', specWidth + 90, y9 + 3);
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [analyser]);

  return (
    <div className="w-full h-24 flex-shrink-0 bg-zinc-950 rounded-lg overflow-hidden shadow-[inset_0_0_10px_rgba(0,0,0,0.8)] border border-zinc-800/50">
      <canvas ref={canvasRef} className="w-full h-full" width={1024} height={128}></canvas>
    </div>
  );
}
