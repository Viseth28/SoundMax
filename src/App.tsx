import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, Settings, X, Download, Sparkles, Video, Volume2, VolumeX, Music, RotateCcw, Power, ChevronDown, History as HistoryIcon, Clock, HelpCircle, Sliders, Keyboard } from 'lucide-react';
import { AudioGraph, type AudioParameters, defaultParams, presets } from './audioEngine';
import { encodeWAV } from './wavEncoder';
import { encodeMP3 } from './mp3Encoder';
import { encodeFLAC } from './flacEncoder';
import { calculateAutoMaster } from './autoMaster';
import { exportIndividualVideo, exportAlbumVideo, isWebCodecsSupported } from './videoExport';
import Knob from './components/Knob';
import Equalizer10Band, { eq10Presets } from './components/Equalizer10Band';
import LeftSidebar from './components/LeftSidebar';

export interface HistoryRecord {
  id: string;
  name: string;
  format: string;
  timestamp: string;
  sampleRate: number;
}

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

  // Custom states for bypasses, preset selector & section resets
  const [bypassState, setBypassState] = useState({
    eq: false,
    eq10: false,
    dynamics: false,
    color: false,
    space: false,
  });
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetName10, setPresetName10] = useState("Flat");
  const savedParamsRef = useRef<AudioParameters>({ ...defaultParams });
  const presetRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  // Workspace switching states
  const [activePanel, setActivePanel] = useState<'eq' | 'master'>('master');
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Click-outside listener for Preset Select Dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (presetRef.current && !presetRef.current.contains(event.target as Node)) {
        setPresetOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
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
    mode: 'individual' as 'individual' | 'album',
  });
  const [videoProgress, setVideoProgress] = useState(0);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [videoExportStatus, setVideoExportStatus] = useState('');

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
    setVideoExportStatus('Starting render process...');

    try {
      if (videoConfig.mode === 'individual') {
        for (const file of files) {
          if (!file.buffer) continue;
          
          setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'Processing' } : f));
          
          setVideoExportStatus('Mastering & rendering audio track...');
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
            (pct, status) => {
              setVideoProgress(pct);
              if (status) setVideoExportStatus(status);
            }
          );
          
          setVideoExportStatus('Downloading MP4 video...');
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
          setVideoExportStatus(`Mastering & rendering album track: ${file.name}...`);
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
          (pct, status) => {
            setVideoProgress(pct);
            if (status) setVideoExportStatus(status);
          }
        );
        
        setVideoExportStatus('Downloading full album MP4 video...');
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
      setVideoExportStatus('');
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

  const SECTION_PARAMS = {
    eq: ['eqBass', 'eqDeep', 'eqMid'] as const,
    eq10: ['eq10'] as const,
    dynamics: ['compThreshold', 'compRatio', 'limitCeiling'] as const,
    color: ['saturation'] as const,
    space: ['stereoWidth', 'reverb', 'echo'] as const,
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>, key: keyof AudioParameters, index?: number) => {
    const val = parseFloat(e.target.value);
    
    setParams(prev => {
      const next = { ...prev };
      if (key === 'eq10' && typeof index === 'number') {
        const nextEq10 = [...(prev.eq10 || [0,0,0,0,0,0,0,0,0,0])];
        nextEq10[index] = val;
        next.eq10 = nextEq10;
      } else {
        next[key] = val as any;
      }
      return next;
    });
    
    // Also save the change to savedParamsRef if that section is not bypassed
    if (key === 'eq10' && typeof index === 'number') {
      if (!bypassState.eq10) {
        savedParamsRef.current.eq10[index] = val;
      }
      setPresetName10("Custom");
    } else {
      Object.entries(SECTION_PARAMS).forEach(([sec, keys]) => {
        if ((keys as readonly string[]).includes(key)) {
          const isBypassed = bypassState[sec as keyof typeof bypassState];
          if (!isBypassed) {
            savedParamsRef.current[key] = val as any;
          }
        }
      });
      // Master gain is never bypassed, save it directly
      if (key === 'gain') {
        savedParamsRef.current.gain = val;
      }
      setPresetName("Custom");
    }
  };

  const handlePresetSelect10 = (name: string) => {
    setPresetName10(name);
    if (eq10Presets[name]) {
      const nextEq = [...eq10Presets[name]];
      savedParamsRef.current.eq10 = [...nextEq];
      setParams(prev => ({
        ...prev,
        eq10: bypassState.eq10 ? [0,0,0,0,0,0,0,0,0,0] : [...nextEq]
      }));
    }
  };

  const handlePresetSelect = (name: string) => {
    setPresetName(name);
    if (presets[name]) {
      const newPreset = presets[name];
      savedParamsRef.current = { 
        ...newPreset,
        eq10: newPreset.eq10 ? [...newPreset.eq10] : [0,0,0,0,0,0,0,0,0,0]
      };
      
      setParams(prev => {
        const next = { ...prev };
        Object.entries(SECTION_PARAMS).forEach(([sec, keys]) => {
          const isBypassed = bypassState[sec as keyof typeof bypassState];
          keys.forEach(k => {
            if (k === 'eq10') {
              if (!isBypassed) {
                next.eq10 = newPreset.eq10 ? [...newPreset.eq10] : [0,0,0,0,0,0,0,0,0,0];
              } else {
                next.eq10 = [0,0,0,0,0,0,0,0,0,0];
              }
            } else {
              if (!isBypassed) {
                next[k] = newPreset[k] as any;
              } else {
                next[k] = defaultParams[k] as any;
              }
            }
          });
        });
        next.gain = newPreset.gain;
        return next;
      });
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
    const autoEq10 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    savedParamsRef.current = { 
      ...optimalParams,
      eq10: autoEq10
    };
    
    setParams(prev => {
      const next = { ...prev };
      Object.entries(SECTION_PARAMS).forEach(([sec, keys]) => {
        const isBypassed = bypassState[sec as keyof typeof bypassState];
        keys.forEach(k => {
          if (k === 'eq10') {
            if (!isBypassed) {
              next.eq10 = [...autoEq10];
            } else {
              next.eq10 = [0,0,0,0,0,0,0,0,0,0];
            }
          } else {
            if (!isBypassed) {
              next[k] = optimalParams[k] as any;
            } else {
              next[k] = defaultParams[k] as any;
            }
          }
        });
      });
      next.gain = optimalParams.gain;
      return next;
    });
    setPresetName("AI Mastered");
  };

  const toggleBypass = (sec: keyof typeof SECTION_PARAMS) => {
    setBypassState(prev => {
      const isBypassing = !prev[sec];
      
      setParams(currentParams => {
        const nextParams = { ...currentParams };
        const paramKeys = SECTION_PARAMS[sec];
        
        if (isBypassing) {
          // Save current values to savedRef
          paramKeys.forEach(k => {
            if (k === 'eq10') {
              savedParamsRef.current.eq10 = [...(currentParams.eq10 || [0,0,0,0,0,0,0,0,0,0])];
              nextParams.eq10 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            } else {
              savedParamsRef.current[k] = currentParams[k] as any;
              // Set params in audioEngine to their clean default values
              nextParams[k] = defaultParams[k] as any;
            }
          });
        } else {
          // Restore from savedRef
          paramKeys.forEach(k => {
            if (k === 'eq10') {
              nextParams.eq10 = [...(savedParamsRef.current.eq10 || [0,0,0,0,0,0,0,0,0,0])];
            } else {
              nextParams[k] = savedParamsRef.current[k] as any;
            }
          });
        }
        return nextParams;
      });

      return { ...prev, [sec]: isBypassing };
    });
  };

  const resetSection = (sec: keyof typeof SECTION_PARAMS | 'master') => {
    if (sec === 'master') {
      setParams(prev => ({ ...prev, gain: defaultParams.gain }));
      savedParamsRef.current.gain = defaultParams.gain;
    } else {
      const paramKeys = SECTION_PARAMS[sec];
      setParams(prev => {
        const next = { ...prev };
        paramKeys.forEach(k => {
          if (k === 'eq10') {
            next.eq10 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            savedParamsRef.current.eq10 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          } else {
            // If bypassed, keep it at default in params; if active, update it to default
            next[k] = defaultParams[k] as any;
            // Set standard saved value to default
            savedParamsRef.current[k] = defaultParams[k] as any;
          }
        });
        return next;
      });
    }
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

      // Log exported file into Mastering History logs
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const record: HistoryRecord = {
        id: Math.random().toString(36).substring(7),
        name: `SOUNDMAX_${file.name.replace(/\.[^/.]+$/, "")}.${ext}`,
        format: exportConfig.format,
        timestamp: timeStr,
        sampleRate: exportConfig.sampleRate,
      };
      setHistory(prev => [record, ...prev]);
      
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
      <div className="flex-1 flex flex-row overflow-hidden h-[calc(100vh-5rem)]">
        
        {/* Left Sidebar */}
        <LeftSidebar 
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          onOpenLogs={() => setShowLogsModal(true)}
          onOpenHelp={() => setShowHelpModal(true)}
        />

        {/* Dashboard Content Columns */}
        <div className="flex-1 flex flex-row p-6 overflow-hidden gap-6 h-full min-w-0">
          
          {/* Left Column: Visualizer & Mastering Console */}
          <div className="flex-1 flex flex-col gap-6 h-full min-w-0">
          
          {/* Spectrum Analyzer Panel */}
          <Visualizer analyser={analyserNode} />

          {/* Conditional Control Panel Switcher */}
          {activePanel === 'eq' ? (
            <Equalizer10Band 
              values={params.eq10 || [0,0,0,0,0,0,0,0,0,0]} 
              isBypassed={bypassState.eq10}
              onBypassToggle={() => toggleBypass('eq10')}
              onReset={() => resetSection('eq10')}
              onChange={(val, idx) => handleSliderChange({ target: { value: String(val) } } as any, 'eq10', idx)}
              presetName={presetName10}
              onPresetSelect={handlePresetSelect10}
            />
          ) : (
            /* Settings Console (Bottom Panel) - Now flex-grow to occupy all vertical space beautifully */
            <div className="flex-grow flex-1 flex flex-col bg-zinc-900 rounded-xl border border-zinc-800 p-5 shadow-[inset_0_2px_20px_rgba(0,0,0,0.2)] select-none min-h-[360px]">
              <div className="flex justify-between items-center mb-4 shrink-0 font-sans">
                <h2 className="text-sm font-semibold text-zinc-400 tracking-wider flex items-center gap-2">
                  <Settings size={16} /> MASTERING CONSOLE
                </h2>
                <div className="flex items-center gap-2">
                  <button onClick={handleAutoMaster} className="mr-2 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-bold tracking-wider rounded shadow-[0_0_10px_rgba(245,158,11,0.5)] flex items-center gap-1.5 transition-all">
                    <Sparkles size={14} /> AUTO-MASTER
                  </button>
                  <div className="w-px h-6 bg-zinc-800 mx-2"></div>
                  <label className="text-xs text-zinc-500 font-bold uppercase tracking-wider mr-1">Preset:</label>
                  
                  {/* Styled Custom Preset Selector */}
                  <div className="relative" ref={presetRef}>
                    <button 
                      onClick={() => setPresetOpen(!presetOpen)}
                      className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 text-xs font-semibold text-zinc-200 rounded-lg px-3 py-1.5 outline-none hover:border-amber-500/50 hover:text-white transition-all shadow-sm min-w-[130px] justify-between cursor-pointer focus:ring-1 focus:ring-amber-500"
                    >
                      <span className="flex items-center gap-1.5 font-sans">
                        <Music size={12} className="text-amber-500" />
                        <span className={presetName === "AI Mastered" ? "text-amber-400 font-bold" : ""}>{presetName}</span>
                      </span>
                      <ChevronDown size={12} className={`text-zinc-500 transition-transform duration-200 ${presetOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {presetOpen && (
                      <div className="absolute right-0 mt-1.5 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-[0_10px_25px_rgba(0,0,0,0.5)] py-1.5 z-[100] animate-in fade-in slide-in-from-top-2 duration-150 font-sans">
                        <div className="px-2.5 py-1 text-[9px] font-bold text-zinc-500 tracking-wider uppercase border-b border-zinc-800/50 mb-1">
                          Select Preset
                        </div>
                        <button
                          onClick={() => {
                            setPresetName("Custom");
                            setPresetOpen(false);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 italic"
                        >
                          Custom
                        </button>
                        <button
                          disabled
                          className="w-full text-left px-3 py-1.5 text-xs text-amber-400/50 font-bold flex items-center gap-1 opacity-70 cursor-not-allowed"
                        >
                          AI Mastered ✦
                        </button>
                        {Object.keys(presets).map(p => (
                          <button
                            key={p}
                            onClick={() => {
                              handlePresetSelect(p);
                              setPresetOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                              presetName === p 
                                ? 'bg-amber-500/10 text-amber-400 font-semibold' 
                                : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-grow flex-1 flex flex-col justify-around py-2 min-h-0 gap-4">
                {/* ROW 1: EQ & Dynamics */}
                <div className="flex flex-row justify-around items-center w-full">
                  {/* EQ Section */}
                  <div className="flex-1 flex justify-center">
                    <SliderGroup 
                      title="EQ / TONE" 
                      isBypassed={bypassState.eq} 
                      onBypassToggle={() => toggleBypass('eq')} 
                      onReset={() => resetSection('eq')}
                    >
                      <Knob label="Bass" value={params.eqBass} min={-24} max={24} defaultValue={0} color="orange" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'eqBass')} />
                      <Knob label="Deep" value={params.eqDeep} min={-24} max={24} defaultValue={0} color="purple" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'eqDeep')} />
                      <Knob label="Mid" value={params.eqMid} min={-24} max={24} defaultValue={0} color="cyan" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'eqMid')} />
                    </SliderGroup>
                  </div>

                  <div className="w-px h-28 bg-zinc-800/60 mx-4"></div>

                  {/* Dynamics Section */}
                  <div className="flex-1 flex justify-center">
                    <SliderGroup 
                      title="DYNAMICS" 
                      isBypassed={bypassState.dynamics} 
                      onBypassToggle={() => toggleBypass('dynamics')} 
                      onReset={() => resetSection('dynamics')}
                    >
                      <Knob label="Comp" value={params.compThreshold} min={-60} max={0} defaultValue={-24} unit="dB" color="emerald" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'compThreshold')} />
                      <Knob label="Ratio" value={params.compRatio} min={1} max={20} step={0.1} defaultValue={3} color="emerald" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'compRatio')} />
                      <Knob label="Limit" value={params.limitCeiling} min={-24} max={0} step={0.1} defaultValue={-0.1} unit="dB" color="emerald" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'limitCeiling')} />
                    </SliderGroup>
                  </div>
                </div>

                <div className="h-px w-full bg-zinc-800/40 my-1"></div>

                {/* ROW 2: Color, Space & Master */}
                <div className="flex flex-row justify-around items-center w-full">
                  {/* Saturation Color Section */}
                  <div className="flex-1 flex justify-center">
                    <SliderGroup 
                      title="COLOR / TONE" 
                      isBypassed={bypassState.color} 
                      onBypassToggle={() => toggleBypass('color')} 
                      onReset={() => resetSection('color')}
                    >
                      <Knob label="Drive" value={params.saturation} min={0} max={100} defaultValue={0} unit="%" color="gold" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'saturation')} />
                    </SliderGroup>
                  </div>

                  <div className="w-px h-28 bg-zinc-800/60 mx-4"></div>

                  {/* Space / Mono Section */}
                  <div className="flex-1 flex justify-center">
                    <SliderGroup 
                      title="SPACE / MONO" 
                      isBypassed={bypassState.space} 
                      onBypassToggle={() => toggleBypass('space')} 
                      onReset={() => resetSection('space')}
                    >
                      <Knob label="Width" value={params.stereoWidth} min={0} max={200} defaultValue={100} unit="%" color="cyan" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'stereoWidth')} />
                      <Knob label="Verb" value={params.reverb} min={0} max={100} defaultValue={0} unit="%" color="purple" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'reverb')} />
                      <Knob label="Echo" value={params.echo} min={0} max={100} defaultValue={0} unit="%" color="purple" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'echo')} />
                    </SliderGroup>
                  </div>

                  <div className="w-px h-28 bg-zinc-800/60 mx-4"></div>
                  
                  {/* Master */}
                  <div className="flex-1 flex justify-center">
                    <SliderGroup 
                      title="MASTER" 
                      showBypass={false} 
                      onReset={() => resetSection('master')}
                    >
                      <Knob label="Gain" value={params.gain} min={-24} max={24} defaultValue={6} unit="dB" color="rose" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'gain')} />
                    </SliderGroup>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Batch Queue Panel */}
        <div 
          className={`w-[450px] rounded-xl border flex flex-col overflow-hidden shadow-lg relative transition-colors shrink-0 h-full ${isDragging ? 'bg-zinc-800 border-amber-500' : 'bg-zinc-900 border-zinc-800'}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="px-4 py-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/80 backdrop-blur-sm z-10">
            <h2 className="text-sm font-semibold text-zinc-300 tracking-wider">BATCH QUEUE</h2>
            <label className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-slate-600 rounded text-xs font-bold text-zinc-200 transition-colors">
              <Upload size={14} /> Add Files
              <input type="file" multiple accept="audio/*" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {files.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 border-2 border-dashed border-zinc-800 rounded-lg">
                <Upload size={32} className="mb-2 opacity-50" />
                <p className="text-xs text-center px-4">Drag & Drop audio files here or click Add Files</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="text-zinc-400 border-b border-zinc-800">
                    <th className="pb-2 font-medium">Filename</th>
                    <th className="pb-2 font-medium w-14">Dur.</th>
                    <th className="pb-2 font-medium w-14">Type</th>
                    <th className="pb-2 font-medium w-24">Status</th>
                    <th className="pb-2 font-medium w-10 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {files.map(f => (
                    <tr 
                      key={f.id} 
                      className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group cursor-pointer ${playingId === f.id ? 'bg-amber-500/5' : ''}`}
                      onClick={() => f.buffer && togglePlayback(f.id)}
                    >
                      <td className="py-3 text-zinc-200 truncate max-w-[150px] font-medium flex items-center gap-2">
                        {playingId === f.id && isPlaying ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
                        ) : null}
                        {f.name}
                      </td>
                      <td className="py-3 text-zinc-400">
                        {f.duration ? `${Math.floor(f.duration / 60)}:${Math.floor(f.duration % 60).toString().padStart(2, '0')}` : '--'}
                      </td>
                      <td className="py-3 text-zinc-400 text-[10px]">{f.type.split('/')[1]?.toUpperCase() || 'AUDIO'}</td>
                      <td className="py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          f.status === 'Completed' ? 'bg-emerald-900/50 text-emerald-400' :
                          f.status === 'Processing' ? 'bg-amber-900/50 text-amber-400 animate-pulse' :
                          'bg-zinc-800 text-zinc-400'
                        }`}>
                          {f.status}
                        </span>
                      </td>
                      <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => removeFile(f.id)} title="Remove" className="p-1 bg-zinc-800 hover:bg-red-500 rounded-full transition-colors opacity-50 hover:opacity-100 group-hover:opacity-100">
                            <X size={12} className="text-zinc-300 hover:text-white" />
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
                    <span>{videoExportStatus || 'Rendering Video...'}</span>
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

      {/* Mastering Logs Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <HistoryIcon size={20} className="text-amber-500" />
                Mastering History Logs
              </h2>
              <button onClick={() => setShowLogsModal(false)} className="text-zinc-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 max-h-[400px] overflow-y-auto">
              {history.length === 0 ? (
                <div className="h-[200px] flex flex-col items-center justify-center text-center text-zinc-500 border-2 border-dashed border-zinc-850 rounded-lg p-6">
                  <Clock size={32} className="text-zinc-600 mb-2 opacity-50" />
                  <span className="text-xs font-bold uppercase tracking-wider">No Logs Available</span>
                  <p className="text-xs text-zinc-500 mt-1 font-sans">Exported tracks from the current session will be recorded here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map(item => (
                    <div key={item.id} className="p-4 bg-zinc-950/50 border border-zinc-850 rounded-lg flex flex-col gap-1.5 relative">
                      <span className="text-sm font-bold text-zinc-200 truncate pr-4">{item.name}</span>
                      <div className="flex justify-between items-center mt-2 border-t border-zinc-900/40 pt-2 text-[10px] text-zinc-400 font-mono">
                        <span>Format: <strong className="text-zinc-300">{item.format}</strong></span>
                        <span>SR: <strong className="text-zinc-300">{item.sampleRate}Hz</strong></span>
                        <span className="text-zinc-500">{item.timestamp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-800 flex justify-between items-center">
              {history.length > 0 ? (
                <button 
                  onClick={() => setHistory([])}
                  className="px-4 py-2 text-xs font-bold text-red-400 hover:text-red-300 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 rounded transition-all"
                >
                  Clear Logs
                </button>
              ) : <div />}
              <button onClick={() => setShowLogsModal(false)} className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded border border-zinc-700/50 transition-all">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Console Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <HelpCircle size={20} className="text-amber-500" />
                Console Help Center
              </h2>
              <button onClick={() => setShowHelpModal(false)} className="text-zinc-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto">
              {/* Dial Controls card */}
              <div className="p-4 bg-zinc-950/50 border border-zinc-850 rounded-lg flex flex-col gap-2">
                <div className="flex items-center gap-2 font-bold text-zinc-200 text-xs">
                  <Sliders size={14} className="text-amber-500" />
                  <span>DIAL KNOB INTERACTION</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-xs text-zinc-400">
                  <li><strong className="text-zinc-300">Mouse Drag</strong>: Click and slide mouse vertically to rotate dials.</li>
                  <li><strong className="text-zinc-300">Scroll Wheel</strong>: Hover dial and scroll to adjust values.</li>
                  <li><strong className="text-zinc-300">Double Click</strong>: Instantly resets dial to its safety default.</li>
                </ul>
              </div>

              {/* Keyboard nav card */}
              <div className="p-4 bg-zinc-950/50 border border-zinc-850 rounded-lg flex flex-col gap-2">
                <div className="flex items-center gap-2 font-bold text-zinc-200 text-xs font-sans">
                  <Keyboard size={14} className="text-amber-500" />
                  <span>KEYBOARD NAVIGATION</span>
                </div>
                <p className="text-xs text-zinc-400 font-sans">
                  Click a dial knob to focus it. Focused controls display a glowing outer ring:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-zinc-400 font-sans">
                  <li><strong className="text-zinc-300">ArrowUp / ArrowRight</strong>: Rotate clockwise to increase values.</li>
                  <li><strong className="text-zinc-300">ArrowDown / ArrowLeft</strong>: Rotate counter-clockwise to decrease.</li>
                  <li><strong className="text-zinc-300">Shift + Arrow</strong>: Activate micro-tuning adjustments for exact values.</li>
                </ul>
              </div>

              {/* Console card */}
              <div className="p-4 bg-zinc-950/50 border border-zinc-850 rounded-lg flex flex-col gap-2 font-sans">
                <div className="flex items-center gap-2 font-bold text-zinc-200 text-xs">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>SIGNAL FLOW CONTROLS</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-xs text-zinc-400">
                  <li><strong className="text-zinc-300">Bypass Power Switches</strong>: Use switches to clean-route signals past selected channels.</li>
                  <li><strong className="text-zinc-300">Fader Decibel Ticks</strong>: Visual references to level fader sculpts precisely.</li>
                </ul>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-800 flex justify-end">
              <button onClick={() => setShowHelpModal(false)} className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded border border-zinc-700/50 transition-all font-sans">
                Close Help
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

interface SliderGroupProps {
  title: string;
  children: React.ReactNode;
  isBypassed?: boolean;
  onBypassToggle?: () => void;
  onReset?: () => void;
  showBypass?: boolean;
}

function SliderGroup({ 
  title, 
  children, 
  isBypassed = false, 
  onBypassToggle, 
  onReset, 
  showBypass = true 
}: SliderGroupProps) {
  const [isSpinning, setIsSpinning] = useState(false);
  
  const handleResetClick = () => {
    if (onReset) {
      setIsSpinning(true);
      onReset();
      setTimeout(() => setIsSpinning(false), 500); // 500ms spin duration
    }
  };

  return (
    <div className="flex flex-col items-center h-full group relative">
      <div className={`flex gap-4 items-end flex-1 pb-2 transition-opacity duration-300 ${
        isBypassed ? 'opacity-40 pointer-events-none' : ''
      }`}>
        {children}
      </div>
      
      {/* Footer Area with Title and Controls */}
      <div className="flex items-center gap-1.5 mt-2 h-5">
        {showBypass && onBypassToggle && (
          <button 
            onClick={onBypassToggle}
            className={`p-1 rounded-full transition-all cursor-pointer ${
              isBypassed 
                ? 'text-zinc-600 hover:text-zinc-500' 
                : 'text-amber-500 drop-shadow-[0_0_3px_rgba(245,158,11,0.5)] hover:text-amber-400'
            }`}
            title={isBypassed ? "Engage Section" : "Bypass Section"}
          >
            <Power size={10} />
          </button>
        )}
        
        <span className={`text-[10px] font-bold tracking-widest uppercase transition-colors select-none ${
          isBypassed ? 'text-zinc-600' : 'text-zinc-500'
        }`}>
          {title}
        </span>

        {onReset && (
          <button 
            onClick={handleResetClick}
            className={`p-1 text-zinc-600 hover:text-zinc-300 transition-all cursor-pointer opacity-0 group-hover:opacity-100 ${
              isSpinning ? 'animate-spin' : ''
            }`}
            title="Reset Parameters"
            style={{ animationDuration: '0.5s' }}
          >
            <RotateCcw size={10} />
          </button>
        )}
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
    <div className="w-full h-[180px] flex-shrink-0 bg-zinc-950 rounded-lg overflow-hidden shadow-[inset_0_0_10px_rgba(0,0,0,0.8)] border border-zinc-800/50">
      <canvas ref={canvasRef} className="w-full h-full" width={1024} height={360}></canvas>
    </div>
  );
}
