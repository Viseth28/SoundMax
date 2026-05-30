import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, Settings, X, Download, Sparkles, Video, Volume2, VolumeX, Music, RotateCcw, Power, ChevronDown, HelpCircle } from 'lucide-react';
import { AudioGraph, type AudioParameters, defaultParams, presets } from './audioEngine';
import { encodeWAV } from './wavEncoder';
import { encodeMP3 } from './mp3Encoder';
import { encodeFLAC } from './flacEncoder';
import { calculateAutoMaster } from './autoMaster';
import { exportIndividualVideo, exportAlbumVideo, isWebCodecsSupported } from './videoExport';
import Knob from './components/Knob';
import Equalizer10Band, { eq10Presets } from './components/Equalizer10Band';
import LeftSidebar from './components/LeftSidebar';

const translations = {
  en: {
    title: "SoundMax Studio Console",
    bypassAll: "Bypass All",
    active: "Active",
    videoStudio: "Video Studio",
    exportConfig: "Export Config",
    spectrumAnalyzer: "SPECTRUM ANALYZER",
    graphicEq: "10-BAND GRAPHIC EQUALIZER",
    masteringConsole: "MASTERING CONSOLE",
    presetLabel: "Preset:",
    masterPreset: "Mastering Preset",
    channelRouting: "Active Channel Routing",
    bypassChannel: "BYPASS CHANNEL",
    gainDb: "Gain dB",
    eqTone: "EQ / TONE",
    dynamics: "DYNAMICS",
    colorTone: "COLOR / TONE",
    spaceMono: "SPACE / MONO",
    masterOutput: "MASTER OUTPUT",
    dialBass: "BASS",
    dialDeep: "DEEP",
    dialMid: "MID",
    dialComp: "COMP",
    dialRatio: "RATIO",
    dialLimit: "LIMIT",
    dialDrive: "DRIVE",
    dialWidth: "WIDTH",
    dialVerb: "VERB",
    dialEcho: "ECHO",
    dialGain: "GAIN",
    // Queue section
    queueTitle: "Batch Mastering Queue",
    dropArea: "Drop audio tracks here, or click to browse",
    supportedFormats: "Supported: WAV, MP3, FLAC",
    clearQueue: "Clear Queue",
    processAll: "Process All Tracks",
    outFormat: "Output Format",
    sampleRate: "Sample Rate",
    statusIdle: "Queued",
    statusProcessing: "Processing...",
    statusCompleted: "Completed",
    statusFailed: "Failed",
    // Settings
    settingsTitle: "Console Settings",
    languageLabel: "Interface Language",
    themeLabel: "Visual Console Theme",
    langEn: "English",
    langKh: "ភាសាខ្មែរ",
    themeDark: "Dark Theme",
    themeLight: "Light Theme",
    closeBtn: "Close Settings",
    flatPreset: "Flat",
    bassBoost: "Bass Boost",
    vocalClarity: "Vocal Clarity",
    loudnessSmile: "Loudness",
    midScoop: "Mid Scoop",
    classicRock: "Classic Rock",
    customPreset: "Custom",
    defaultPreset: "Default",
    edmPunch: "EDM Punch",
    sunoPolisher: "Suno Polisher",
    streamingSafe: "Streaming Safe",
    vintageWarm: "Vintage Warmth",
    spaciousVerb: "Spacious Room",
  },
  kh: {
    title: "ផ្ទាំងបញ្ជាស្ទូឌីយោ SoundMax",
    bypassAll: "រំលងទាំងអស់",
    active: "ដំណើរការ",
    videoStudio: "ស្ទូឌីយោវីដេអូ",
    exportConfig: "នាំចេញឯកសារកំណត់",
    spectrumAnalyzer: "ម៉ាស៊ីនវិភាគរលកសំឡេង",
    graphicEq: "អេក្វាឡឺហ្សឺក្រាហ្វិក ១០-ប៊ែន",
    masteringConsole: "ផ្ទាំងបញ្ជាម៉ាស្ទ័ររីង",
    presetLabel: "កំណត់ស្រាប់៖",
    masterPreset: "កំណត់ស្រាប់ម៉ាស្ទ័រ",
    channelRouting: "ផ្លូវបញ្ជូនសញ្ញាសកម្ម",
    bypassChannel: "រំលងប៉ុស្តិ៍នេះ",
    gainDb: "កម្រិតសម្លេង (dB)",
    eqTone: "សម្លេង / ថូន (EQ / Tone)",
    dynamics: "ឌីណាមិក (Dynamics)",
    colorTone: "ពណ៌សម្លេង (Color / Tone)",
    spaceMono: "លំហ / ម៉ូណូ (Space / Mono)",
    masterOutput: "ម៉ាស្ទ័រចេញ (Master Out)",
    dialBass: "បាស (Bass)",
    dialDeep: "ជ្រៅ (Deep)",
    dialMid: "កណ្តាល (Mid)",
    dialComp: "កុំប្រេសឺ (Comp)",
    dialRatio: "ផលធៀប (Ratio)",
    dialLimit: "លីមីត (Limit)",
    dialDrive: "ដ្រាយវ៍ (Drive)",
    dialWidth: "ទទឹង (Width)",
    dialVerb: "វើប (Verb)",
    dialEcho: "អេកូ (Echo)",
    dialGain: "ហ្គេន (Gain)",
    // Queue section
    queueTitle: "ជួរម៉ាស្ទ័រច្រើនឯកសារ",
    dropArea: "អូសឯកសារសំឡេងដាក់ទីនេះ ឬចុចដើម្បីស្វែងរក",
    supportedFormats: "គាំទ្រ៖ WAV, MP3, FLAC",
    clearQueue: "សម្អាតជួរ",
    processAll: "ដំណើរការឯកសារទាំងអស់",
    outFormat: "ទម្រង់ចេញ",
    sampleRate: "កម្រិតគំរូ",
    statusIdle: "នៅក្នុងជួរ",
    statusProcessing: "កំពុងដំណើរការ...",
    statusCompleted: "បានបញ្ចប់",
    statusFailed: "បរាជ័យ",
    // Settings
    settingsTitle: "ការកំណត់ផ្ទាំងបញ្ជា",
    languageLabel: "ភាសានៃផ្ទាំងបញ្ជា",
    themeLabel: "ស្បែកពណ៌របស់ផ្ទាំងបញ្ជា",
    langEn: "English",
    langKh: "ភាសាខ្មែរ",
    themeDark: "ស្បែកពណ៌ងងឹត",
    themeLight: "ស្បែកពណ៌ភ្លឺ",
    closeBtn: "បិទការកំណត់",
    flatPreset: "ធម្មតា",
    bassBoost: "បង្កើនបាស",
    vocalClarity: "សំឡេងច្បាស់",
    loudnessSmile: "សំឡេងខ្លាំង",
    midScoop: "បន្ថយសំឡេងកណ្តាល",
    classicRock: "រ៉ក់ក្លាសិក",
    customPreset: "ផ្ទាល់ខ្លួន",
    defaultPreset: "លំនាំដើម",
    edmPunch: "EDM ខ្លាំង",
    sunoPolisher: "Suno កែសម្រួល",
    streamingSafe: "សុវត្ថិភាពស្ទ្រីមីង",
    vintageWarm: "កំដៅបែបបុរាណ",
    spaciousVerb: "បន្ទប់ធំទូលាយ",
  }
};

const getPresetNameTrans = (pName: string, lang: 'en' | 'kh') => {
  const t = translations[lang];
  switch (pName) {
    case 'Default': return t.defaultPreset;
    case 'Flat': return t.flatPreset;
    case 'Bass Boost': return t.bassBoost;
    case 'Vocal Clarity': return t.vocalClarity;
    case 'Loudness (Smile)': return t.loudnessSmile;
    case 'Mid Scoop': return t.midScoop;
    case 'Classic Rock': return t.classicRock;
    case 'EDM Punch': return t.edmPunch;
    case 'Suno Polisher': return t.sunoPolisher;
    case 'Streaming Safe': return t.streamingSafe;
    case 'Vintage Warmth': return t.vintageWarm;
    case 'Spacious Room': return t.spaciousVerb;
    case 'Custom': return t.customPreset;
    default: return pName;
  }
};

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
  const [isPlaying, setIsPlaying] = useState(false);
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
  // Workspace switching states
  const [activePanel, setActivePanel] = useState<'eq' | 'master' | 'queue'>('master');

  // Settings & Theme preferences
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [language, setLanguage] = useState<'en' | 'kh'>(() => (localStorage.getItem('soundmax_lang') as 'en' | 'kh') || 'en');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('soundmax_theme') as 'dark' | 'light') || 'dark');

  useEffect(() => {
    localStorage.setItem('soundmax_theme', theme);
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('soundmax_lang', language);
  }, [language]);

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

      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'Completed' } : f));
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert(`Export failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      setFiles(prev => prev.map(f => f.status === 'Processing' ? { ...f, status: 'Idle' } : f));
    }
  };

  const t = translations[language];

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white font-sans overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center px-4 md:px-6 py-4 bg-zinc-900 border-b border-zinc-800 shadow-md flex-shrink-0 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center font-bold text-lg shadow-[0_0_15px_rgba(245,158,11,0.6)] animate-pulse">
            SM
          </div>
          <h1 className="text-lg md:text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300 font-sans uppercase">
            {t.title}
          </h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4 ml-auto md:ml-0">
          <button onClick={() => setShowVideoModal(true)} className="px-3 py-1.5 md:px-4 md:py-2 bg-zinc-800 hover:bg-zinc-700 text-xs md:text-sm font-semibold rounded transition-all flex items-center gap-2 text-zinc-200 cursor-pointer">
            <Video size={14} /> {t.videoStudio}
          </button>
          <button onClick={() => setShowExportModal(true)} className="px-3 py-1.5 md:px-4 md:py-2 bg-amber-600 hover:bg-amber-500 text-xs md:text-sm font-semibold rounded transition-all shadow-[0_0_10px_rgba(245,158,11,0.4)] flex items-center gap-2 cursor-pointer">
            <Download size={14} /> {t.exportConfig}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        
        <LeftSidebar 
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          onOpenSettings={() => setShowSettingsModal(true)}
          onOpenHelp={() => setShowHelpModal(true)}
          language={language}
        />

        {/* Dashboard Content Columns */}
        <div className="flex-1 flex flex-col lg:flex-row p-4 md:p-6 overflow-y-auto lg:overflow-y-hidden lg:overflow-x-hidden gap-4 md:gap-6 h-full min-w-0 pb-36 md:pb-6">
          
          {/* Left Column: Visualizer & Mastering Console */}
          <div className={`flex-grow lg:flex-1 flex flex-col gap-6 h-auto lg:h-full min-w-0 ${activePanel === 'queue' ? 'hidden lg:flex' : 'flex'}`}>
          
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
              language={language}
            />
          ) : (
             /* Settings Console (Bottom Panel) - Now flex-grow to occupy all vertical space beautifully */
            <div className="flex-grow flex-1 flex flex-col bg-zinc-900 rounded-xl border border-zinc-800 p-3 sm:p-5 shadow-[inset_0_2px_20px_rgba(0,0,0,0.2)] select-none min-h-[360px]">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 shrink-0 font-sans">
                <h2 className="text-xs sm:text-sm font-semibold text-zinc-400 tracking-wider flex items-center gap-2 shrink-0">
                  <Settings size={15} /> {t.masteringConsole}
                </h2>
                <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto flex-wrap">
                  <button 
                    onClick={handleAutoMaster} 
                    className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-[10px] sm:text-xs font-bold tracking-wider rounded shadow-[0_0_10px_rgba(245,158,11,0.5)] flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer"
                  >
                    <Sparkles size={12} className="shrink-0" /> {language === 'kh' ? 'អូតូ-ម៉ាស្ទ័រ' : 'AUTO-MASTER'}
                  </button>
                  <div className="hidden sm:block w-px h-6 bg-zinc-800 mx-1"></div>
                  <label className="hidden sm:inline text-xs text-zinc-500 font-bold uppercase tracking-wider mr-1">{t.presetLabel}</label>
                  
                  {/* Styled Custom Preset Selector */}
                  <div className="relative" ref={presetRef}>
                    <button 
                      onClick={() => setPresetOpen(!presetOpen)}
                      className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 text-[10px] sm:text-xs font-semibold text-zinc-200 rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-1.5 outline-none hover:border-amber-500/50 hover:text-white transition-all shadow-sm min-w-[110px] sm:min-w-[130px] justify-between cursor-pointer focus:ring-1 focus:ring-amber-500"
                    >
                      <span className="flex items-center gap-1.5 font-sans">
                        <Music size={12} className="text-amber-500" />
                        <span className={presetName === "AI Mastered" ? "text-amber-400 font-bold" : ""}>
                          {getPresetNameTrans(presetName, language)}
                        </span>
                      </span>
                      <ChevronDown size={12} className={`text-zinc-500 transition-transform duration-200 ${presetOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {presetOpen && (
                      <div className="absolute right-0 mt-1.5 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-[0_10px_25px_rgba(0,0,0,0.5)] py-1.5 z-[100] animate-in fade-in slide-in-from-top-2 duration-150 font-sans">
                        <div className="px-2.5 py-1 text-[9px] font-bold text-zinc-500 tracking-wider uppercase border-b border-zinc-800/50 mb-1">
                          {language === 'kh' ? 'ជ្រើសរើសទិន្នន័យស្រាប់' : 'Select Preset'}
                        </div>
                        <button
                          onClick={() => {
                            setPresetName("Custom");
                            setPresetOpen(false);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 italic cursor-pointer"
                        >
                          {t.customPreset}
                        </button>
                        <button
                          disabled
                          className="w-full text-left px-3 py-1.5 text-xs text-amber-400/50 font-bold flex items-center gap-1 opacity-70 cursor-not-allowed"
                        >
                          {language === 'kh' ? 'AI ម៉ាស្ទ័ររួច ✦' : 'AI Mastered ✦'}
                        </button>
                        {Object.keys(presets).map(p => (
                          <button
                            key={p}
                            onClick={() => {
                              handlePresetSelect(p);
                              setPresetOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between cursor-pointer ${
                              presetName === p 
                                ? 'bg-amber-500/10 text-amber-400 font-semibold' 
                                : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                            }`}
                          >
                            {getPresetNameTrans(p, language)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-grow flex-1 flex flex-col justify-around py-2 min-h-0 gap-4">
                {/* ROW 1: EQ & Dynamics */}
                <div className="flex flex-col md:flex-row justify-around items-center w-full gap-6 md:gap-0">
                  {/* EQ Section */}
                  <div className="flex-1 flex justify-center w-full">
                    <SliderGroup 
                      title={t.eqTone} 
                      isBypassed={bypassState.eq} 
                      onBypassToggle={() => toggleBypass('eq')} 
                      onReset={() => resetSection('eq')}
                      language={language}
                    >
                      <Knob label={t.dialBass} value={params.eqBass} min={-24} max={24} defaultValue={0} color="orange" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'eqBass')} />
                      <Knob label={t.dialDeep} value={params.eqDeep} min={-24} max={24} defaultValue={0} color="purple" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'eqDeep')} />
                      <Knob label={t.dialMid} value={params.eqMid} min={-24} max={24} defaultValue={0} color="cyan" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'eqMid')} />
                    </SliderGroup>
                  </div>

                  <div className="hidden md:block w-px h-28 bg-zinc-800/60 mx-4"></div>

                  {/* Dynamics Section */}
                  <div className="flex-1 flex justify-center w-full">
                    <SliderGroup 
                      title={t.dynamics} 
                      isBypassed={bypassState.dynamics} 
                      onBypassToggle={() => toggleBypass('dynamics')} 
                      onReset={() => resetSection('dynamics')}
                      language={language}
                    >
                      <Knob label={t.dialComp} value={params.compThreshold} min={-60} max={0} defaultValue={-24} unit="dB" color="emerald" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'compThreshold')} />
                      <Knob label={t.dialRatio} value={params.compRatio} min={1} max={20} step={0.1} defaultValue={3} color="emerald" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'compRatio')} />
                      <Knob label={t.dialLimit} value={params.limitCeiling} min={-24} max={0} step={0.1} defaultValue={-0.1} unit="dB" color="emerald" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'limitCeiling')} />
                    </SliderGroup>
                  </div>
                </div>

                <div className="hidden md:block h-px w-full bg-zinc-800/40 my-1"></div>

                {/* ROW 2: Color, Space & Master */}
                <div className="grid grid-cols-2 md:flex md:flex-row justify-around items-center w-full gap-6 md:gap-0">
                  {/* Saturation Color Section */}
                  <div className="col-span-1 flex-1 flex justify-center w-full order-2 md:order-none">
                    <SliderGroup 
                      title={t.colorTone} 
                      isBypassed={bypassState.color} 
                      onBypassToggle={() => toggleBypass('color')} 
                      onReset={() => resetSection('color')}
                      language={language}
                    >
                      <Knob label={t.dialDrive} value={params.saturation} min={0} max={100} defaultValue={0} unit="%" color="gold" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'saturation')} />
                    </SliderGroup>
                  </div>

                  <div className="hidden md:block w-px h-28 bg-zinc-800/60 mx-4"></div>

                  {/* Space / Mono Section */}
                  <div className="col-span-2 flex-1 flex justify-center w-full order-1 md:order-none">
                    <SliderGroup 
                      title={t.spaceMono} 
                      isBypassed={bypassState.space} 
                      onBypassToggle={() => toggleBypass('space')} 
                      onReset={() => resetSection('space')}
                      language={language}
                    >
                      <Knob label={t.dialWidth} value={params.stereoWidth} min={0} max={200} defaultValue={100} unit="%" color="cyan" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'stereoWidth')} />
                      <Knob label={t.dialVerb} value={params.reverb} min={0} max={100} defaultValue={0} unit="%" color="purple" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'reverb')} />
                      <Knob label={t.dialEcho} value={params.echo} min={0} max={100} defaultValue={0} unit="%" color="purple" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'echo')} />
                    </SliderGroup>
                  </div>

                  <div className="hidden md:block w-px h-28 bg-zinc-800/60 mx-4"></div>
                  
                  {/* Master */}
                  <div className="col-span-1 flex-1 flex justify-center w-full order-3 md:order-none">
                    <SliderGroup 
                      title={t.masterOutput} 
                      showBypass={false} 
                      onReset={() => resetSection('master')}
                      language={language}
                    >
                      <Knob label={t.dialGain} value={params.gain} min={-24} max={24} defaultValue={0} unit="dB" color="rose" onChange={v => handleSliderChange({ target: { value: String(v) } } as any, 'gain')} />
                    </SliderGroup>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Batch Queue Panel */}
        <div 
          className={`w-full lg:w-[400px] xl:w-[450px] rounded-xl border flex flex-col overflow-hidden shadow-lg relative transition-colors shrink-0 h-[calc(100vh-12rem)] lg:h-full ${isDragging ? 'bg-zinc-800 border-amber-500' : 'bg-zinc-900 border-zinc-800'} ${activePanel === 'queue' ? 'flex' : 'hidden lg:flex'}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="px-4 py-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/80 backdrop-blur-sm z-10">
            <h2 className="text-sm font-semibold text-zinc-300 tracking-wider">{t.queueTitle}</h2>
            <label className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-slate-600 rounded text-xs font-bold text-zinc-200 transition-colors">
              <Upload size={14} /> {language === 'kh' ? 'បន្ថែមឯកសារ' : 'Add Files'}
              <input type="file" multiple accept="audio/*" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {files.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 border-2 border-dashed border-zinc-800 rounded-lg">
                <Upload size={32} className="mb-2 opacity-50" />
                <p className="text-xs text-center px-4">{t.dropArea}</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="text-zinc-400 border-b border-zinc-800">
                    <th className="pb-2 font-medium">{language === 'kh' ? 'ឈ្មោះឯកសារ' : 'Filename'}</th>
                    <th className="pb-2 font-medium w-14">{language === 'kh' ? 'ថេរវេលា' : 'Dur.'}</th>
                    <th className="pb-2 font-medium w-14">{language === 'kh' ? 'ប្រភេទ' : 'Type'}</th>
                    <th className="pb-2 font-medium w-24">{language === 'kh' ? 'ស្ថានភាព' : 'Status'}</th>
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
                          {f.status === 'Completed' ? t.statusCompleted : f.status === 'Processing' ? t.statusProcessing : t.statusIdle}
                        </span>
                      </td>
                      <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => removeFile(f.id)} title="Remove" className="p-1 bg-zinc-800 hover:bg-red-500 rounded-full transition-colors opacity-50 hover:opacity-100 group-hover:opacity-100 cursor-pointer">
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



      {/* Console Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 font-sans uppercase">
                <Settings size={20} className="text-amber-500 animate-spin-slow" />
                {t.settingsTitle}
              </h2>
              <button onClick={() => setShowSettingsModal(false)} className="text-zinc-400 hover:text-white transition-colors cursor-pointer">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Language Section */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                  {t.languageLabel}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setLanguage('en')}
                    className={`p-4 rounded-lg border flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                      language === 'en' 
                        ? 'bg-amber-500/10 border-amber-500 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.1)]' 
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <span className="text-2xl font-bold font-mono">🇬🇧</span>
                    <span className="text-xs font-bold font-sans">English</span>
                  </button>
                  <button 
                    onClick={() => setLanguage('kh')}
                    className={`p-4 rounded-lg border flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                      language === 'kh' 
                        ? 'bg-amber-500/10 border-amber-500 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.1)]' 
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <span className="text-2xl font-bold font-mono">🇰🇭</span>
                    <span className="text-xs font-bold font-sans">ភាសាខ្មែរ</span>
                  </button>
                </div>
              </div>

              {/* Theme Section */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                  {t.themeLabel}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setTheme('dark')}
                    className={`p-4 rounded-lg border flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                      theme === 'dark' 
                        ? 'bg-amber-500/10 border-amber-500 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.1)]' 
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <span className="text-xl">🌙</span>
                    <span className="text-xs font-bold font-sans">{t.themeDark}</span>
                  </button>
                  <button 
                    onClick={() => setTheme('light')}
                    className={`p-4 rounded-lg border flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                      theme === 'light' 
                        ? 'bg-amber-500/10 border-amber-500 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.1)]' 
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <span className="text-xl">☀️</span>
                    <span className="text-xs font-bold font-sans">{t.themeLight}</span>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-800 flex justify-end">
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded border border-zinc-700/50 transition-all cursor-pointer font-sans"
              >
                {t.closeBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help / Guide Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 shrink-0">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 font-sans uppercase">
                <HelpCircle size={20} className="text-amber-500" />
                {language === 'kh' ? 'សេចក្តីណែនាំអំពីការប្រើប្រាស់' : 'How to Use SoundMax'}
              </h2>
              <div className="flex items-center gap-3">
                {/* Quick Language Toggle Button inside Modal Header */}
                <button 
                  onClick={() => setLanguage(language === 'en' ? 'kh' : 'en')}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] font-bold text-amber-500 rounded border border-zinc-700 transition-all cursor-pointer"
                >
                  {language === 'en' ? 'KH 🇰🇭' : 'EN 🇺🇸'}
                </button>
                <button onClick={() => setShowHelpModal(false)} className="text-zinc-400 hover:text-white transition-colors cursor-pointer">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-zinc-300 text-sm leading-relaxed">
              {/* General Intro */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-500 font-sans">
                  {language === 'kh' ? 'អំពីកម្មវិធី (About SoundMax)' : 'About SoundMax'}
                </h3>
                <p className="text-xs sm:text-sm text-zinc-400">
                  {language === 'kh' 
                    ? 'SoundMax គឺជាប្រព័ន្ធម៉ាស្ទ័រសំឡេងឌីជីថលកម្រិតអាជីព ដែលជួយបង្កើនគុណភាពបទចម្រៀងឱ្យណែន ច្បាស់ លាន់ ពីរោះស្មើគ្នាល្អ និងពង្រីកសម្លេង stereo ឱ្យទូលាយទាក់ទាញ ត្រៀមជាស្រេចសម្រាប់ចែកចាយលើប្រព័ន្ធ streaming និងបណ្តាញសង្គមផ្សេងៗ។'
                    : 'SoundMax is a professional digital audio mastering suite designed to enhance the presence, punch, warmth, and stereo imaging of your tracks—fully optimized for commercial streaming platforms, clubs, and social distribution.'
                  }
                </p>
              </div>

              {/* 1. Mastering Console Section */}
              <div className="space-y-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-500 font-sans">
                  {language === 'kh' ? '១. ផ្ទាំងបញ្ជាម៉ាស្ទ័រ (1. Mastering Console)' : '1. Mastering Console'}
                </h3>
                
                <div className="space-y-3.5 pl-2 sm:pl-4 border-l border-zinc-800">
                  {/* EQ / Tone */}
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
                      {language === 'kh' ? '• ផ្នែកបាសនិងប្លង់សម្លេង (EQ / TONE)' : '• EQ / TONE'}
                    </h4>
                    <p className="text-[11px] sm:text-xs text-zinc-400 mt-1">
                      <strong>{language === 'kh' ? 'BASS' : 'BASS'}:</strong> {language === 'kh' ? 'បង្កើនឬបន្ថយកម្លាំងបុក និងទម្ងន់នៃប្រេកង់បាសទាប។' : 'Boosts or cuts low-frequency punch and weight.'} <br/>
                      <strong>{language === 'kh' ? 'DEEP' : 'DEEP'}:</strong> {language === 'kh' ? 'បង្កើនកម្រិតរំញ័រ sub-bass បាតក្រោម ធ្វើឱ្យបាសរងំពីរោះជ្រៅ។' : 'Targets extreme sub-bass rumble and depth.'} <br/>
                      <strong>{language === 'kh' ? 'MID' : 'MID'}:</strong> {language === 'kh' ? 'គ្រប់គ្រងភាពកក់ក្តៅ និងភាពច្បាស់លេចធ្លោនៃសម្លេងច្រៀង ឬឧបករណ៍ភ្លេងកណ្តាល។' : 'Shapes the presence and warmth of vocals and mid-range instruments.'}
                    </p>
                  </div>

                  {/* Dynamics */}
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
                      {language === 'kh' ? '• ផ្នែកថាមវន្តសម្លេង (DYNAMICS / COMPRESSION)' : '• DYNAMICS'}
                    </h4>
                    <p className="text-[11px] sm:text-xs text-zinc-400 mt-1">
                      <strong>{language === 'kh' ? 'COMP' : 'COMP (Threshold)'}:</strong> {language === 'kh' ? 'កំណត់កម្រិតកាត់បង្រួមដើម្បីគ្រប់គ្រងភាពខ្លាំង-ខ្សោយឱ្យស្មើល្អ និងសម្លេងណែនណាប់។' : 'Sets the threshold. Tames wild peaks and glues the dynamic elements together.'} <br/>
                      <strong>{language === 'kh' ? 'RATIO' : 'RATIO'}:</strong> {language === 'kh' ? 'កម្រិតកម្លាំងនៃការកាត់សម្លេង។ កាន់តែខ្ពស់ សម្លេងកាន់តែណែននិងបុកបន្តិច។' : 'The compression strength. Higher ratios yield a tighter, punchier master.'} <br/>
                      <strong>{language === 'kh' ? 'LIMIT' : 'LIMIT (Ceiling)'}:</strong> {language === 'kh' ? 'កំណត់ពិដានកម្រិតសម្លេងចេញខ្ពស់បំផុត ការពារមិនឱ្យបែករ៉ែ ឬបាក់សម្លេង។' : 'Controls the output ceiling. Clips and brickwalls peaks to prevent digital distortion.'}
                    </p>
                  </div>

                  {/* Color / Saturation */}
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
                      {language === 'kh' ? '• ផ្នែកបន្ថែមពណ៌សម្លេង (COLOR / TONE)' : '• COLOR / TONE'}
                    </h4>
                    <p className="text-[11px] sm:text-xs text-zinc-400 mt-1">
                      <strong>{language === 'kh' ? 'DRIVE' : 'DRIVE (Saturation)'}:</strong> {language === 'kh' ? 'បន្ថែមសម្លេងសង្កៀតបែបអានឡូក (Analogue Saturation) បង្កើនភាពកក់ក្តៅ និងភាពណែននៃបទភ្លេង។' : 'Adds subtle analogue saturation. Enriches the master with warm harmonics and analog glue.'}
                    </p>
                  </div>

                  {/* Space / Mono */}
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
                      {language === 'kh' ? '• ផ្នែកលំហសម្លេង (SPACE / MONO)' : '• SPACE / MONO'}
                    </h4>
                    <p className="text-[11px] sm:text-xs text-zinc-400 mt-1">
                      <strong>{language === 'kh' ? 'WIDTH' : 'WIDTH (Stereo Width)'}:</strong> {language === 'kh' ? 'ពង្រីកទំហំសម្លេងឆ្វេង-ស្តាំឱ្យកាន់តែលាន់ធំទូលាយ ឬបង្រួមមកកណ្តាល (Mono)។' : 'Expands the stereo image for wider ambient width or centers it close to mono.'} <br/>
                      <strong>{language === 'kh' ? 'VERB' : 'VERB (Reverb Mix)'}:</strong> {language === 'kh' ? 'បន្ថែមសម្លេងរលករំញ័រក្នុងលំហបន្ទប់ ធ្វើឱ្យបទភ្លេងមានជម្រៅបីវិមាត្រ។' : 'Blends in three-dimensional room reverb space and depth.'} <br/>
                      <strong>{language === 'kh' ? 'ECHO' : 'ECHO (Tape Delay)'}:</strong> {language === 'kh' ? 'បង្កើតសម្លេងឆ្លុះបញ្ចាំងរត់ឆ្វេងស្តាំច្រំដែលៗ បែបម៉ាស៊ីនខ្សែអាត់បុរាណ។' : 'Generates rhythmic, warm stereo delay echo repetitions.'}
                    </p>
                  </div>

                  {/* Master Output */}
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
                      {language === 'kh' ? '• កម្រិតសម្លេងចេញចុងក្រោយ (MASTER OUTPUT)' : '• MASTER OUTPUT'}
                    </h4>
                    <p className="text-[11px] sm:text-xs text-zinc-400 mt-1">
                      <strong>{language === 'kh' ? 'GAIN' : 'GAIN'}:</strong> {language === 'kh' ? 'កម្រិតសម្លេងចេញចុងក្រោយសម្រាប់ម៉ាស្ទ័រទាំងមូល។' : 'Adjusts the final digital output volume/loudness level.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. 10-Band EQ Section */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-500 font-sans">
                  {language === 'kh' ? '២. អេក្វាឡឺហ្សឺ ១០ ប៊ែន (2. 10-Band Graphic EQ)' : '2. 10-Band Graphic EQ'}
                </h3>
                <p className="text-xs text-zinc-400 pl-2 sm:pl-4">
                  {language === 'kh'
                    ? 'អនុញ្ញាតឱ្យអ្នកកែប្រែប្រេកង់សំឡេងលម្អិតទាំង ១០ ក្រុមពី ៣១Hz (បាសជ្រៅបំផុត) ដល់ ១៦kHz (សម្លេងខ្យល់មុតស្រួច)។ ទាញប៊ូតុងឡើងលើដើម្បីបង្កើន (Boost) និងចុះក្រោមដើម្បីបន្ថយ (Cut)។ អ្នកអាចអូសវាទៅឆ្វេងនិងស្តាំលើទូរស័ព្ទដៃដើម្បីមើលគ្រប់ក្រុម fader ទាំងអស់។'
                    : 'Provides precision frequency-shaping across 10 distinct octave bands from 31Hz (deep sub-bass rumble) to 16kHz (crisp air brilliance). Slide up to boost, and down to cut frequencies. Swipe horizontally on mobile to access all faders comfortably.'
                  }
                </p>
              </div>

              {/* 3. General Workflow / Tips */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-500 font-sans">
                  {language === 'kh' ? '៣. របៀបដំណើរការរហ័ស (Quick Workflow)' : '3. Quick Workflow'}
                </h3>
                <ol className="list-decimal list-inside text-[11px] sm:text-xs text-zinc-400 pl-2 sm:pl-4 space-y-1">
                  <li>{language === 'kh' ? 'ទាញទម្លាក់ ឬបន្ថែមឯកសារសំឡេងរបស់អ្នកទៅក្នុងផ្នែក "Queue" (បញ្ជី)' : 'Upload your tracks into the "Queue" tab.'}</li>
                  <li>{language === 'kh' ? 'ចុចលើចម្រៀងក្នុងបញ្ជីដើម្បីចាក់ស្តាប់ និងសារ៉េប៉ារ៉ាម៉ែត្រម៉ាស្ទ័រភ្លាមៗ' : 'Select a track to play and start turning the dials.'}</li>
                  <li>{language === 'kh' ? 'ប្រើប្រាស់មុខងារ "AUTO-MASTER" ដើម្បីឱ្យប្រព័ន្ធ AI គណនាលៃលកប៉ារ៉ាម៉ែត្រស្វ័យប្រវត្តិតែមួយវិនាទី' : 'Use "AUTO-MASTER" for instantaneous, AI-calculated automatic settings.'}</li>
                  <li>{language === 'kh' ? 'ចុចប៊ូតុង "Export Config" ពណ៌លឿងនៅផ្នែកខាងលើដើម្បីទាញយកឯកសារមេដែលរួចរាល់' : 'Click the yellow "Export Config" button at the top to download your mastered track.'}</li>
                </ol>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-800 flex justify-end shrink-0">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded shadow-[0_0_15px_rgba(245,158,11,0.4)] transition-all cursor-pointer font-sans"
              >
                {language === 'kh' ? 'យល់ព្រម' : 'Got it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Controller Bar */}
      <div className="fixed bottom-16 left-0 right-0 md:relative md:bottom-auto h-16 md:h-20 bg-zinc-900/95 md:bg-zinc-900 border-t border-zinc-800 px-4 md:px-6 flex flex-row items-center justify-between shadow-2xl z-40 select-none backdrop-blur-md md:backdrop-blur-none flex-shrink-0">
        {/* Absolute Top Progress Line - Mobile only */}
        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-zinc-800 md:hidden overflow-hidden">
          <div 
            className="h-full bg-amber-500 transition-all duration-75 shadow-[0_0_8px_#f59e0b]"
            style={{
              width: `${playingId ? (currentPlaybackTime / (files.find(f => f.id === playingId)?.duration || 1)) * 100 : 0}%`
            }}
          />
        </div>

        {/* Left: Track Info */}
        <div className="flex items-center gap-3 w-2/3 md:w-1/3 min-w-0 md:min-w-[240px] justify-start">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-500 shadow-inner shrink-0 relative overflow-hidden group">
            {exportConfig.coverImageFile && playingId ? (
              <img src={URL.createObjectURL(exportConfig.coverImageFile)} className="w-full h-full object-cover" alt="Cover" />
            ) : (
              <Music size={18} className="text-zinc-400 group-hover:text-amber-500 transition-colors" />
            )}
          </div>
          <div className="flex flex-col truncate text-left md:text-left min-w-0">
            <span className="text-xs md:text-sm font-semibold text-zinc-100 truncate">
              {playingId ? (files.find(f => f.id === playingId)?.name || 'Unknown Track') : 'No Track Playing'}
            </span>
            <span className="text-[10px] md:text-xs text-zinc-400 truncate flex items-center gap-1">
              {playingId ? (
                <>
                  <span className="truncate">{exportConfig.artistName || 'Unknown Artist'}</span>
                  <span className="w-1 h-1 rounded-full bg-zinc-600 shrink-0"></span> 
                  <span className="text-amber-500 font-bold uppercase text-[8px] md:text-[9px] tracking-wider bg-amber-500/10 px-1 rounded shrink-0">{presetName}</span>
                </>
              ) : 'Select a track to play'}
            </span>
          </div>
        </div>

        {/* Center: Controls & Seek */}
        <div className="flex items-center justify-end md:justify-center md:flex-col gap-1.5 w-1/3 md:flex-1 md:max-w-xl">
          {/* Controls */}
          <div className="flex items-center gap-5 shrink-0">
            <button 
              onClick={() => playingId && togglePlayback(playingId)} 
              disabled={!playingId} 
              className="w-8 h-8 rounded-full bg-white text-zinc-950 flex items-center justify-center hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)] cursor-pointer"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} className="ml-0.5" fill="currentColor" />}
            </button>
          </div>

          {/* Seekbar - Desktop only */}
          <div className="hidden md:flex items-center gap-3 w-full">
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

        {/* Right: Volume & Format Info (Hidden on mobile) */}
        <div className="hidden md:flex items-center justify-end gap-4 w-1/3 min-w-[240px]">
          <div className="hidden sm:flex items-center gap-1 bg-zinc-950/60 border border-zinc-800/80 px-2.5 py-1 rounded text-[10px] font-bold tracking-wider text-zinc-400 font-mono">
            <Sparkles size={11} className="text-amber-500" />
            {exportConfig.format}
          </div>

          <div className="flex items-center gap-2 w-32 group/vol">
            <button 
              onClick={() => setIsMuted(!isMuted)} 
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
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
  language?: 'en' | 'kh';
}

function SliderGroup({ 
  title, 
  children, 
  isBypassed = false, 
  onBypassToggle, 
  onReset, 
  showBypass = true,
  language = 'en'
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
      <div className={`flex gap-2 sm:gap-4 items-end flex-1 pb-2 transition-opacity duration-300 ${
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
            title={isBypassed 
              ? (language === 'kh' ? 'បើកផ្នែកនេះ' : 'Engage Section') 
              : (language === 'kh' ? 'រំលងផ្នែកនេះ' : 'Bypass Section')
            }
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
            title={language === 'kh' ? 'កំណត់ឡើងវិញទិន្នន័យទាំងអស់' : 'Reset Parameters'}
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

      const isLight = document.body.classList.contains('light-mode');

      // Draw background
      ctx.fillStyle = isLight ? 'rgba(244, 244, 245, 1)' : 'rgba(9, 9, 11, 1)'; 
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
      ctx.fillStyle = isLight ? '#e4e4e7' : '#18181b'; 
      ctx.fillRect(specWidth, 0, 150, height);
      ctx.fillStyle = isLight ? '#f4f4f5' : '#09090b'; 
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

        ctx.fillStyle = isLight ? '#27272a' : '#a1a1aa';
        ctx.font = '8px sans-serif';
        ctx.fillText(title, xOffset + 4, height - 12);
        ctx.fillText(`${Math.round(dbVal)}`, xOffset + 4, 18);
      };

      drawMeterBar(specWidth + 10, rmsDb, 'RMS');
      drawMeterBar(specWidth + 50, lufsEst, 'LUFS');

      // Draw guidelines
      ctx.strokeStyle = isLight ? 'rgba(9,9,11,0.15)' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.font = '7px sans-serif';
      ctx.fillStyle = isLight ? '#3f3f46' : '#a1a1aa';

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
