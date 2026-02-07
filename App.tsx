
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserTier, TTSEngine, ExportFormat, ArtStyle, PodcastSegment, AppState, ProductionHistory, LogEntry, VoiceProfile } from './types';
import { VOICES, DEFAULT_SCRIPT, LEGAL_SAMPLE_SCRIPT } from './constants';
import { gemini } from './services/geminiService';
import { pollinations } from './services/pollinationsService';
import { decodeGeminiAudio, generateBrowserSpeech, concatenateAudioBuffers, audioBufferToWav, audioBufferToMp3, ensureAudioContext, generateSRT, createWatermarkBuffer } from './services/audioEngine';
import { ModelRouter } from './services/modelRouter';
import { ApiOrchestrator } from './services/orchestrator';
import { ApiKeyManager } from './components/ApiKeyManager';
import { CostDashboard } from './components/CostDashboard';

const SidebarItem: React.FC<{ icon: string; label: string; active?: boolean; onClick?: () => void }> = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
    <i className={`fas ${icon} w-5`}></i>
    <span className="font-medium text-sm">{label}</span>
  </button>
);

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('podcast-studio-v16-state');
    const initialState = {
      tier: UserTier.FREE,
      quality: "balanced",
      exportFormat: ExportFormat.MP3,
      artStyle: ArtStyle.MINIMALIST,
      apiKeys: {},
      isGenerating: false,
      scriptType: 'exchange',
      introText: "Welcome to Podcast Studio AI.",
      outroText: "Stay curious, and thanks for listening!",
      trialEndsAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      speakerVoiceMap: { 'Host': 'pro-1', 'Guest': 'pro-2' },
      monthlyUsage: { inputTokens: 0, outputTokens: 0, totalCost: 0 }
    };
    return saved ? JSON.parse(saved) : initialState;
  });

  const [script, setScript] = useState(() => {
    const savedDraft = localStorage.getItem('podcast-studio-current-draft');
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        return parsed.script || DEFAULT_SCRIPT;
      } catch (e) { return DEFAULT_SCRIPT; }
    }
    return DEFAULT_SCRIPT;
  });

  const [topic, setTopic] = useState(() => {
    const savedDraft = localStorage.getItem('podcast-studio-current-draft');
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        return parsed.topic || "";
      } catch (e) { return ""; }
    }
    return "";
  });

  const [segments, setSegments] = useState<PodcastSegment[]>([]);
  const [activeTab, setActiveTab] = useState<'editor' | 'settings' | 'history' | 'logs' | 'billing'>('editor');
  const [fullAudioUrl, setFullAudioUrl] = useState<string | null>(null);
  const [srtUrl, setSrtUrl] = useState<string | null>(null);
  const [coverArtUrl, setCoverArtUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState({ percent: 0, status: "", stage: "" });
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isSaved, setIsSaved] = useState(true);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);

  // Playback state for seekable segments
  const [playbackState, setPlaybackState] = useState<{
    segmentId: string | null;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
  }>({
    segmentId: null,
    currentTime: 0,
    duration: 0,
    isPlaying: false
  });

  const [history, setHistory] = useState<ProductionHistory[]>(() => {
    const saved = localStorage.getItem('podcast-studio-history-v15');
    return saved ? JSON.parse(saved) : [];
  });

  const [newSpeakerName, setNewSpeakerName] = useState("");
  const scriptEditorRef = useRef<HTMLTextAreaElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioControllerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') { e.preventDefault(); handleScriptGeneration(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handlePodcastProduction(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [topic, script, state]);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audio = new Audio();
    audio.onloadedmetadata = () => {
      setPlaybackState(prev => ({ ...prev, duration: audio.duration }));
    };
    audio.ontimeupdate = () => {
      setPlaybackState(prev => ({ ...prev, currentTime: audio.currentTime }));
    };
    audio.onended = () => {
      setPlaybackState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
      setActivePreviewId(null);
    };
    audioControllerRef.current = audio;

    return () => {
      audioContextRef.current?.close();
      audio.pause();
      audio.src = "";
    };
  }, []);

  useEffect(() => { localStorage.setItem('podcast-studio-v16-state', JSON.stringify(state)); }, [state]);
  useEffect(() => { localStorage.setItem('podcast-studio-history-v15', JSON.stringify(history)); }, [history]);

  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      localStorage.setItem('podcast-studio-current-draft', JSON.stringify({ script, topic }));
      setIsSaved(true);
    }, 1000);
    setIsSaved(false);
    return () => clearTimeout(saveTimeout);
  }, [script, topic]);

  // Sync segments whenever script changes
  useEffect(() => {
    if (state.isGenerating) return;
    const lines = script.split('\n').filter(l => l.trim().length > 0);
    const parsed: PodcastSegment[] = lines.map((l, i) => {
      const match = l.match(/^([^:]+):(.*)$/);
      const speaker = match ? match[1].trim() : 'Narrator';
      const text = match ? match[2].trim() : l.trim();
      const existing = segments.find(s => s.text === text && s.speaker === speaker);
      return existing || {
        id: `seg-${i}-${Date.now()}`,
        speaker,
        text,
        status: 'pending'
      };
    });
    setSegments(parsed);
  }, [script]);

  const addLog = (level: 'info' | 'warn' | 'error', message: string) => {
    setLogs(prev => [{ timestamp: Date.now(), level, message }, ...prev].slice(0, 100));
  };

  const stopCurrentPlayback = () => {
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch (e) {}
      currentSourceRef.current = null;
    }
    if (audioControllerRef.current) {
      audioControllerRef.current.pause();
    }
    setActivePreviewId(null);
    setPlaybackState(prev => ({ ...prev, isPlaying: false, segmentId: null }));
  };

  const playVoiceSample = async (voice: VoiceProfile) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    stopCurrentPlayback();
    setActivePreviewId(voice.id);
    addLog('info', `Previewing voice: ${voice.name}`);
    
    try {
      await ensureAudioContext(ctx);
      let buffer: AudioBuffer;
      if (voice.engine === TTSEngine.BROWSER) {
        buffer = await generateBrowserSpeech(voice.sampleText || "This is a voice sample.", voice.voiceName, ctx);
      } else {
        const base64 = await gemini.generateSpeech(voice.sampleText || "Hello, I am a Gemini native voice.", voice.voiceName);
        buffer = await decodeGeminiAudio(base64, ctx);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setActivePreviewId(null);
      currentSourceRef.current = source;
      source.start();
    } catch (e: any) {
      addLog('error', `Voice preview failed: ${e.message}`);
      setActivePreviewId(null);
    }
  };

  const synthesizeSegment = async (seg: PodcastSegment) => {
    const ctx = audioContextRef.current;
    if (!ctx || state.isGenerating) return;
    
    await ensureAudioContext(ctx);
    setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, status: 'generating' } : s));
    addLog('info', `Synthesizing segment for ${seg.speaker}...`);

    try {
      const ttsDecision = ModelRouter.selectModel({ type: "audio_synthesis", quality: state.quality }, state.apiKeys);
      const isGeminiEngine = ttsDecision.model.provider === 'gemini';
      const currentEngineVoices = VOICES.filter(v => v.engine === (isGeminiEngine ? TTSEngine.GEMINI : TTSEngine.BROWSER));
      const mappedVoiceId = state.speakerVoiceMap[seg.speaker];
      let voice = VOICES.find(v => v.id === mappedVoiceId && v.engine === (isGeminiEngine ? TTSEngine.GEMINI : TTSEngine.BROWSER));
      
      if (!voice) voice = currentEngineVoices.find(v => v.name.toLowerCase().includes(seg.speaker.toLowerCase())) || currentEngineVoices[0];

      let buffer: AudioBuffer;
      if (voice.engine === TTSEngine.BROWSER) {
        buffer = await generateBrowserSpeech(seg.text, voice.voiceName, ctx);
      } else {
        const base64 = await gemini.generateSpeech(seg.text, voice.voiceName);
        buffer = await decodeGeminiAudio(base64, ctx);
      }

      const wavBlob = audioBufferToWav(buffer);
      const audioUrl = URL.createObjectURL(wavBlob);
      
      setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, status: 'completed', audioUrl, duration: buffer.duration } : s));
      addLog('info', `Segment synthesis complete for ${seg.speaker}.`);
    } catch (e: any) {
      addLog('error', `Segment synthesis failed: ${e.message}`);
      setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, status: 'error' } : s));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'text/plain' || file.name.endsWith('.txt'))) {
      const text = await file.text();
      setScript(text);
      setTopic(file.name.replace('.txt', ''));
      addLog('info', `Imported script from file: ${file.name}`);
    }
  };

  const handleApiKeySave = (provider: string, key: string) => {
    setState(prev => ({
      ...prev,
      apiKeys: {
        ...prev.apiKeys,
        [provider]: key
      }
    }));
    addLog('info', `Security credentials for ${provider} updated.`);
  };

  const handleRegenerateArt = useCallback(async () => {
    if (!topic) return;
    addLog('info', 'Refreshing episode visuals...');
    const imgDecision = ModelRouter.selectModel({ type: "image_generation", quality: state.quality }, state.apiKeys);
    const artUrl = pollinations.getCoverArtUrl(topic, imgDecision.modelId.includes('flux') ? 'flux' : 'turbo', state.artStyle);
    setCoverArtUrl(artUrl);
  }, [topic, state.quality, state.apiKeys, state.artStyle]);

  const handleScriptGeneration = async () => {
    if (!topic || isAgentThinking) return;
    setIsAgentThinking(true);
    setProgress({ percent: 10, status: "Brainstorming Narrative...", stage: "Stage 1/2: Script Drafting" });
    addLog('info', `Engaging neural engine for: ${topic}`);

    try {
      const result = await ApiOrchestrator.generateScript(topic, state);
      setScript(result.script);
      setProgress({ percent: 60, status: "Conceptualizing Visuals...", stage: "Stage 2/2: Art Direction" });

      const imgDecision = ModelRouter.selectModel({ type: "image_generation", quality: state.quality }, state.apiKeys);
      const artUrl = pollinations.getCoverArtUrl(topic, imgDecision.modelId.includes('flux') ? 'flux' : 'turbo', state.artStyle);
      
      await new Promise(resolve => setTimeout(resolve, 800));
      setCoverArtUrl(artUrl);
      
      setProgress({ percent: 100, status: "Creative Engine Ready", stage: "Production Unlocked" });
      addLog('info', `Drafting concluded. Visuals deployed.`);
      
      setTimeout(() => setProgress({ percent: 0, status: "", stage: "" }), 2500);
    } catch (e: any) {
      addLog('error', `Script drafting failed: ${e.message}`);
      setProgress({ percent: 0, status: "Engine Stalled", stage: "Error" });
    } finally {
      setIsAgentThinking(false);
    }
  };

  const handlePodcastProduction = async () => {
    if (state.isGenerating || segments.length === 0) return;
    const ctx = audioContextRef.current;
    if (!ctx) return;
    
    await ensureAudioContext(ctx);
    setState(prev => ({ ...prev, isGenerating: true }));
    setFullAudioUrl(null);
    setSrtUrl(null);
    stopCurrentPlayback();
    
    const ttsDecision = ModelRouter.selectModel({ type: "audio_synthesis", quality: state.quality }, state.apiKeys);
    addLog('info', `Production pipeline online: ${ttsDecision.model.name}.`);

    const audioBuffers: AudioBuffer[] = [];
    let currentTotalTime = 0;

    try {
      // Add intro text segment if provided in state
      const allSegments = [
        { id: 'intro', speaker: 'System', text: state.introText, status: 'pending' as any },
        ...segments,
        { id: 'outro', speaker: 'System', text: state.outroText, status: 'pending' as any }
      ];

      for (let i = 0; i < allSegments.length; i++) {
        const seg = allSegments[i];
        const synthesisProgress = Math.round((i / allSegments.length) * 90);
        
        setProgress({ 
          percent: synthesisProgress, 
          status: `Synthesizing: ${seg.speaker}`, 
          stage: `Mastering Phase [${i + 1}/${allSegments.length}]` 
        });

        const isGeminiEngine = ttsDecision.model.provider === 'gemini';
        const currentEngineVoices = VOICES.filter(v => v.engine === (isGeminiEngine ? TTSEngine.GEMINI : TTSEngine.BROWSER));
        const mappedVoiceId = state.speakerVoiceMap[seg.speaker];
        let voice = VOICES.find(v => v.id === mappedVoiceId && v.engine === (isGeminiEngine ? TTSEngine.GEMINI : TTSEngine.BROWSER));
        
        if (!voice) voice = currentEngineVoices.find(v => v.name.toLowerCase().includes(seg.speaker.toLowerCase())) || currentEngineVoices[0];

        let buffer: AudioBuffer;
        if (voice.engine === TTSEngine.BROWSER) {
          buffer = await generateBrowserSpeech(seg.text, voice.voiceName, ctx);
        } else {
          const base64 = await gemini.generateSpeech(seg.text, voice.voiceName);
          buffer = await decodeGeminiAudio(base64, ctx);
        }

        seg.startTime = currentTotalTime;
        seg.duration = buffer.duration;
        currentTotalTime += buffer.duration;
        audioBuffers.push(buffer);
      }

      setProgress({ percent: 95, status: "Mastering Final Mix...", stage: "Post-Production" });
      
      if (state.tier === UserTier.FREE) {
        const watermark = await createWatermarkBuffer(ctx);
        audioBuffers.push(watermark);
      }

      const fullBuffer = concatenateAudioBuffers(audioBuffers, ctx);
      const finalBlob = (state.exportFormat === ExportFormat.MP3 || state.exportFormat === ExportFormat.OGG) 
        ? audioBufferToMp3(fullBuffer) 
        : audioBufferToWav(fullBuffer);

      const srtContent = generateSRT(allSegments as PodcastSegment[]);
      const url = URL.createObjectURL(finalBlob);
      setFullAudioUrl(url);
      setSrtUrl(URL.createObjectURL(new Blob([srtContent], { type: 'text/plain' })));
      
      setProgress({ percent: 100, status: "Broadcast Ready!", stage: "Complete" });
      addLog('info', 'Master tape generated successfully.');

      setHistory(prev => [{
        id: crypto.randomUUID(),
        topic: topic || "Untitled Episode",
        timestamp: Date.now(),
        script: script,
        audioUrl: url,
        coverArtUrl: coverArtUrl || undefined,
        srtContent: srtContent,
        modelUsed: ttsDecision.model.name,
        tokensUsed: Math.ceil(script.length / 4)
      }, ...prev].slice(0, 20));

      setTimeout(() => setProgress({ percent: 0, status: "", stage: "" }), 3000);
    } catch (err: any) {
      addLog('error', `Production failed: ${err.message}`);
      setProgress({ percent: 0, status: "Pipeline Error", stage: "Failure" });
    } finally {
      setState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const toggleSegmentPlayback = async (seg: PodcastSegment) => {
    const audio = audioControllerRef.current;
    if (!audio || !seg.audioUrl) return;

    if (activePreviewId === seg.id) {
      if (playbackState.isPlaying) {
        audio.pause();
        setPlaybackState(prev => ({ ...prev, isPlaying: false }));
      } else {
        await audio.play();
        setPlaybackState(prev => ({ ...prev, isPlaying: true }));
      }
      return;
    }

    stopCurrentPlayback();
    setActivePreviewId(seg.id);
    setPlaybackState({
      segmentId: seg.id,
      currentTime: 0,
      duration: 0,
      isPlaying: true
    });

    audio.src = seg.audioUrl;
    await audio.play();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioControllerRef.current;
    if (!audio) return;
    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setPlaybackState(prev => ({ ...prev, currentTime: time }));
  };

  return (
    <div className="flex h-screen w-full bg-[#070b14] text-slate-200 overflow-hidden font-sans select-none">
      <aside className="w-72 bg-[#0d121f] border-r border-slate-800/50 flex flex-col p-6 shadow-2xl z-50">
        <div className="flex items-center space-x-3 mb-10 group cursor-default">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-xl shadow-indigo-600/30 group-hover:scale-110 transition-transform duration-500">
            <i className="fas fa-tower-broadcast text-white text-xl"></i>
          </div>
          <div>
            <span className="block text-lg font-black uppercase tracking-widest text-white leading-none">Studio.AI</span>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Production Deck</span>
          </div>
        </div>
        
        <nav className="space-y-1 flex-1 overflow-y-auto scrollbar-hide">
          <SidebarItem icon="fa-feather-pointed" label="Script Lab" active={activeTab === 'editor'} onClick={() => setActiveTab('editor')} />
          <SidebarItem icon="fa-archive" label="The Vault" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
          <SidebarItem icon="fa-chart-line" label="Analytics" active={activeTab === 'billing'} onClick={() => setActiveTab('billing')} />
          <SidebarItem icon="fa-terminal" label="Diagnostics" active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
          <SidebarItem icon="fa-sliders-h" label="Engine Config" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          
          {history.length > 0 && (
            <div className="pt-8 pb-4">
              <span className="text-[10px] font-black uppercase text-slate-600 tracking-widest ml-4 opacity-50">Recent Projects</span>
              <div className="mt-4 space-y-1">
                {history.slice(0, 5).map(item => (
                  <button 
                    key={item.id}
                    onClick={() => { setScript(item.script); setTopic(item.topic); setActiveTab('editor'); if(item.coverArtUrl) setCoverArtUrl(item.coverArtUrl); }}
                    className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-slate-500 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all truncate"
                  >
                    <i className="fas fa-file-audio mr-2 opacity-30"></i>
                    {item.topic}
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="mt-auto pt-6">
          <button 
            onClick={() => setShowUpgradeModal(true)}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-indigo-900/20 active:scale-95"
          >
            Upgrade Tier
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {activeTab === 'editor' && (
          <div className="flex-1 flex flex-col p-8 overflow-y-auto space-y-6">
            <div className="flex items-center space-x-4">
              <div className="flex-1 bg-slate-900/50 border border-slate-800 p-5 rounded-[2.5rem] flex items-center space-x-4 shadow-2xl backdrop-blur-3xl focus-within:border-indigo-500/50 transition-colors">
                <i className="fas fa-wand-magic-sparkles text-indigo-500 ml-2"></i>
                <input 
                  type="text" 
                  placeholder="Episode Topic (e.g. History of Space Exploration)..." 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none text-white text-lg placeholder-slate-700 font-medium"
                />
              </div>
              <button 
                onClick={handleScriptGeneration}
                disabled={isAgentThinking || !topic}
                className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 rounded-[2.5rem] font-black text-sm transition-all active:scale-95 disabled:opacity-50 shadow-2xl flex items-center space-x-3 group"
              >
                {isAgentThinking ? <i className="fas fa-cog fa-spin"></i> : <i className="fas fa-feather group-hover:-rotate-12 transition-transform"></i>}
                <span>{isAgentThinking ? "DRAFTING..." : "GENERATE DRAFT"}</span>
              </button>
            </div>

            <div className="grid grid-cols-12 gap-8 flex-1 min-h-0">
              <div className="col-span-8 flex flex-col space-y-6 overflow-hidden">
                <div 
                  className="flex-[1.5] flex flex-col bg-[#0d131f] rounded-[3rem] border border-slate-800/30 p-10 relative overflow-hidden shadow-2xl group transition-all"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <div className="flex items-center justify-between mb-6 border-b border-slate-800/20 pb-6">
                    <div className="flex items-center space-x-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em]">Master Script Editor</span>
                      {isSaved ? (
                        <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full ml-2">Synced</span>
                      ) : (
                        <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest bg-amber-500/10 px-2 py-0.5 rounded-full ml-2 animate-pulse">Drafting...</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-4">
                       <button onClick={() => setScript(LEGAL_SAMPLE_SCRIPT)} className="text-[9px] font-black uppercase text-indigo-500/70 hover:text-indigo-400 transition-colors">Load Template</button>
                       <button onClick={() => { if(confirm("Discard current draft?")) { setScript(""); setTopic(""); } }} className="text-[9px] font-black uppercase text-red-400/50 hover:text-red-400 transition-colors">Wipe Board</button>
                    </div>
                  </div>
                  <textarea 
                    ref={scriptEditorRef}
                    value={script} 
                    onChange={(e) => setScript(e.target.value)} 
                    className="flex-1 bg-transparent resize-none focus:outline-none font-mono text-base text-slate-300 leading-relaxed scrollbar-hide selection:bg-indigo-500/30"
                    placeholder="Host: Welcome to the floor. Start typing or draft a script above..."
                  />
                </div>

                {/* PERSISTENT TIMELINE PANEL */}
                <div className="flex-1 bg-[#0d131f] rounded-[3rem] border border-slate-800/30 p-8 shadow-2xl overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between mb-6 border-b border-slate-800/20 pb-6">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Production Timeline</h3>
                    <div className="flex items-center space-x-4">
                      <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{segments.length} Segments Identified</span>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto pr-4 space-y-4 scrollbar-hide">
                    {segments.length > 0 ? segments.map((seg) => {
                      const isCurrentSegment = activePreviewId === seg.id;
                      return (
                        <div key={seg.id} className={`p-4 rounded-[1.5rem] border transition-all flex flex-col space-y-3 ${
                          seg.status === 'generating' ? 'bg-indigo-600/10 border-indigo-500/50 shadow-xl' : 
                          seg.status === 'completed' ? 'bg-slate-800/40 border-emerald-500/20' : 
                          'bg-slate-900/20 border-slate-800/50 opacity-60'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4 min-w-0">
                              <div className={`w-2 h-2 rounded-full ${seg.status === 'generating' ? 'bg-indigo-500 animate-ping' : seg.status === 'completed' ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>
                              <div className="truncate">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block leading-tight">{seg.speaker}</span>
                                <p className="text-sm text-slate-300 truncate italic">"{seg.text}"</p>
                              </div>
                            </div>
                            <div className="flex items-center shrink-0 space-x-3">
                              {seg.status === 'pending' && (
                                <button 
                                  onClick={() => synthesizeSegment(seg)}
                                  className="px-4 py-2 bg-slate-800 hover:bg-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all border border-slate-700"
                                >
                                  Synthesize
                                </button>
                              )}
                              {seg.status === 'generating' && <i className="fas fa-wave-square text-indigo-500 animate-pulse"></i>}
                              {seg.status === 'completed' && seg.audioUrl && (
                                <button 
                                  onClick={() => toggleSegmentPlayback(seg)}
                                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-lg ${
                                    isCurrentSegment && playbackState.isPlaying ? 'bg-red-600/20 text-red-400 border-red-500/30' : 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-600 hover:text-white'
                                  }`}
                                >
                                  <i className={`fas ${isCurrentSegment && playbackState.isPlaying ? 'fa-pause' : 'fa-play'} text-xs ${isCurrentSegment && playbackState.isPlaying ? '' : 'ml-0.5'}`}></i>
                                </button>
                              )}
                            </div>
                          </div>
                          
                          {seg.status === 'completed' && seg.audioUrl && isCurrentSegment && (
                            <div className="flex items-center space-x-3 px-2 animate-in slide-in-from-top-2 duration-300">
                              <span className="text-[9px] font-mono text-slate-500 w-8">{new Date(playbackState.currentTime * 1000).toISOString().substr(14, 5)}</span>
                              <input 
                                type="range"
                                min="0"
                                max={playbackState.duration || 1}
                                step="0.01"
                                value={playbackState.currentTime}
                                onChange={handleSeek}
                                className="flex-1 accent-indigo-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                              />
                              <span className="text-[9px] font-mono text-slate-500 w-8">{new Date((playbackState.duration || 0) * 1000).toISOString().substr(14, 5)}</span>
                            </div>
                          )}
                        </div>
                      );
                    }) : (
                      <div className="py-12 text-center space-y-4 opacity-20">
                        <i className="fas fa-stream text-4xl text-indigo-500/50"></i>
                        <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-[10px]">Timeline awaiting script synchronization...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="col-span-4 flex flex-col space-y-6">
                <div className="bg-[#0d121f] rounded-[3rem] border border-slate-800/50 overflow-hidden shadow-2xl relative group">
                  <div className="aspect-square relative overflow-hidden">
                    {coverArtUrl ? (
                      <>
                        <img src={coverArtUrl} className="w-full h-full object-cover animate-in zoom-in-95 duration-1000" alt="Cover Art" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-8">
                           <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Visual Preview</span>
                           <h5 className="text-white font-bold text-lg leading-tight truncate">{topic || "Master Tape Art"}</h5>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center opacity-20 relative">
                        <div className="absolute inset-0 flex items-center justify-center">
                           <i className="fas fa-circle-notch text-9xl text-indigo-500/10 fa-spin"></i>
                        </div>
                        <i className="fas fa-compact-disc text-6xl mb-6 fa-spin"></i>
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Master Cover</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-6 bg-slate-900/80 border-t border-slate-800 backdrop-blur-xl">
                    <div className="flex items-center justify-between mb-4">
                      <select 
                        value={state.artStyle}
                        onChange={(e) => setState(p => ({ ...p, artStyle: e.target.value as ArtStyle }))}
                        className="bg-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-300 px-4 py-2 rounded-xl outline-none border border-slate-700 hover:border-indigo-500 transition-colors"
                      >
                        {Object.values(ArtStyle).map(style => (
                          <option key={style} value={style}>{style}</option>
                        ))}
                      </select>
                      <div className="flex space-x-2">
                        <button 
                          onClick={handleRegenerateArt}
                          disabled={!topic || isAgentThinking}
                          className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center hover:bg-indigo-500 transition-all active:scale-95 disabled:opacity-30"
                          title="Regenerate Cover"
                        >
                          <i className="fas fa-rotate text-xs"></i>
                        </button>
                        {coverArtUrl && (
                          <a 
                            href={coverArtUrl} 
                            target="_blank" 
                            download="cover-art.png"
                            className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center hover:bg-slate-700 transition-all active:scale-95 text-slate-400"
                            title="Download Art"
                          >
                            <i className="fas fa-download text-xs"></i>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#0d121f] rounded-[3rem] border border-slate-800/50 p-8 space-y-6 shadow-2xl">
                  <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-widest border-l-2 border-indigo-600 pl-4">Voice Calibration</h4>
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-2 scrollbar-hide">
                    {Object.entries(state.speakerVoiceMap).map(([name, voiceId]) => {
                      const voice = VOICES.find(v => v.id === voiceId) || VOICES[0];
                      const isPlaying = activePreviewId === voiceId;
                      return (
                        <div key={name} className="flex items-center justify-between p-4 bg-slate-900/40 rounded-2xl border border-slate-800 hover:border-indigo-500/30 transition-all">
                          <div className="flex flex-col flex-1 min-w-0 mr-3">
                            <span className="text-[9px] font-black text-indigo-400 uppercase mb-1">{name}</span>
                            <select 
                              value={voiceId}
                              onChange={e => setState(p => ({...p, speakerVoiceMap: {...p.speakerVoiceMap, [name]: e.target.value}}))}
                              className="bg-transparent text-[11px] font-bold text-slate-400 outline-none border-none cursor-pointer hover:text-white truncate"
                            >
                              {VOICES.map(v => <option key={v.id} value={v.id} className="bg-slate-900">{v.name} ({v.engine === TTSEngine.GEMINI ? 'Pro' : 'Edge'})</option>)}
                            </select>
                          </div>
                          <button 
                            onClick={() => playVoiceSample(voice)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                              isPlaying ? 'bg-red-600/20 text-red-500 border border-red-500/30 animate-pulse' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white hover:border-indigo-500'
                            }`}
                            title="Preview Voice"
                          >
                            <i className={`fas ${isPlaying ? 'fa-stop' : 'fa-play'} text-[10px]`}></i>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#0d121f] rounded-[3rem] border border-slate-800/50 p-8 space-y-6 shadow-2xl relative overflow-hidden glass">
                  <div className="flex justify-between items-center relative z-10">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Mastering Deck</span>
                    <select 
                      value={state.exportFormat}
                      onChange={(e) => setState(p => ({ ...p, exportFormat: e.target.value as ExportFormat }))}
                      className="bg-slate-800 text-[9px] font-black text-indigo-400 border border-slate-700 rounded-lg px-2 py-1 uppercase outline-none"
                    >
                      {Object.values(ExportFormat).map(fmt => <option key={fmt} value={fmt}>{fmt}</option>)}
                    </select>
                  </div>
                  
                  <button 
                    onClick={handlePodcastProduction}
                    disabled={state.isGenerating || isAgentThinking || script.length < 10}
                    className="w-full py-8 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[2rem] font-black text-white shadow-2xl shadow-indigo-900/30 hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:grayscale transition-all flex items-center justify-center relative z-10"
                  >
                    {state.isGenerating ? <i className="fas fa-compact-disc fa-spin mr-4 text-xl"></i> : <i className="fas fa-play mr-4 text-xl"></i>}
                    <span>{state.isGenerating ? "PRODUCING..." : "PRODUCE MASTER"}</span>
                  </button>
                  
                  {fullAudioUrl && (
                    <div className="space-y-4 animate-in slide-in-from-top-4 duration-700 pt-4 relative z-10">
                      <audio controls src={fullAudioUrl} className="w-full h-10 brightness-110 rounded-xl" />
                      <div className="grid grid-cols-2 gap-3">
                        <a href={fullAudioUrl} download={`podcast-master.${state.exportFormat.toLowerCase()}`} className="py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl text-[11px] font-black text-center uppercase tracking-widest shadow-xl transition-all">Download</a>
                        {srtUrl && <a href={srtUrl} download="transcript.srt" className="py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl text-[11px] font-black text-center uppercase tracking-widest shadow-xl transition-all">Subtitles</a>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LOADING OVERLAY (DRAFTING ONLY) */}
        {isAgentThinking && (
          <div className="fixed inset-0 bg-[#070b14]/90 backdrop-blur-md z-[60] flex flex-col items-center justify-center p-12 overflow-y-auto animate-in fade-in duration-500">
            <div className="max-w-xl mx-auto w-full text-center">
               <div className="flex justify-between items-end mb-4">
                  <div className="space-y-1 text-left">
                    <h3 className="text-indigo-400 font-black text-xs uppercase tracking-widest flex items-center">
                      <i className="fas fa-brain mr-2"></i>
                      {progress.stage || "Neural Engine Engaged"}
                    </h3>
                    <p className="text-2xl font-black text-white">{progress.status}</p>
                  </div>
                  <span className="text-4xl font-black text-slate-800 tracking-tighter">{progress.percent}%</span>
                </div>
                <div className="h-4 w-full bg-slate-900 rounded-full mb-12 overflow-hidden border border-white/5 p-1 shadow-inner relative">
                  <div 
                    className="h-full rounded-full transition-all duration-700 ease-out shimmer-bar relative overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.4)]" 
                    style={{ width: `${progress.percent}%` }}
                  >
                  </div>
                </div>
            </div>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="p-12 overflow-y-auto w-full max-w-6xl mx-auto pb-32">
            <CostDashboard />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-12 overflow-y-auto w-full max-w-6xl mx-auto pb-32">
            <ApiKeyManager apiKeys={state.apiKeys} onSave={handleApiKeySave} />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="p-12 overflow-y-auto w-full">
             <h2 className="text-5xl font-black mb-12 uppercase tracking-tighter text-white">The Vault</h2>
             <div className="grid grid-cols-2 gap-10">
                {history.length === 0 ? (
                  <div className="col-span-2 py-40 text-center opacity-20">
                     <i className="fas fa-box-archive text-8xl mb-6"></i>
                     <p className="text-xl font-bold uppercase tracking-widest">Vault is currently empty</p>
                  </div>
                ) : history.map(item => (
                  <div key={item.id} className="bg-[#0d121f] border border-slate-800 p-8 rounded-[3rem] flex items-center space-x-8 hover:border-indigo-500/50 transition-all shadow-2xl group">
                    <div className="w-24 h-24 rounded-[2rem] bg-slate-800 overflow-hidden shrink-0 shadow-lg group-hover:scale-105 transition-transform duration-500">
                      {item.coverArtUrl ? <img src={item.coverArtUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><i className="fas fa-podcast text-indigo-500 text-3xl opacity-30"></i></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xl truncate text-white mb-1 group-hover:text-indigo-400 transition-colors">{item.topic}</h4>
                      <p className="text-[10px] text-slate-500 uppercase font-black mb-5 tracking-widest opacity-60">{new Date(item.timestamp).toLocaleDateString()} &bull; {item.modelUsed}</p>
                      <button onClick={() => { setScript(item.script); setTopic(item.topic); setActiveTab('editor'); if(item.coverArtUrl) setCoverArtUrl(item.coverArtUrl); }} className="px-6 py-3 bg-slate-800 hover:bg-indigo-600 rounded-xl text-[10px] font-black uppercase text-indigo-400 hover:text-white transition-all">Recall Session</button>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="p-12 overflow-y-auto w-full">
            <h2 className="text-5xl font-black mb-12 uppercase tracking-tighter text-white">Diagnostics</h2>
            <div className="bg-black/40 border border-slate-800 rounded-[3rem] p-12 font-mono text-[11px] overflow-y-auto max-h-[70vh] space-y-4 shadow-2xl relative glass">
              <div className="absolute top-8 right-12">
                 <button onClick={() => setLogs([])} className="text-slate-600 hover:text-red-400 transition-colors text-xs font-black uppercase tracking-widest">Clear Logs</button>
              </div>
              {logs.map((log, i) => (
                <div key={i} className={`flex space-x-8 ${log.level === 'error' ? 'text-red-400' : 'text-slate-400'}`}>
                  <span className="text-slate-600 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  <span className={`font-black uppercase shrink-0 w-16 ${log.level === 'info' ? 'text-indigo-400' : log.level === 'warn' ? 'text-amber-500' : ''}`}>{log.level}</span>
                  <span className="flex-1 opacity-90 leading-relaxed break-all">{log.message}</span>
                </div>
              ))}
              {logs.length === 0 && <p className="text-slate-700 italic">Listening for neural traffic...</p>}
            </div>
          </div>
        )}
      </main>

      {showUpgradeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-12 bg-black/98 backdrop-blur-3xl animate-in fade-in duration-500">
          <div className="bg-[#0f172a] border border-slate-800 max-w-xl w-full rounded-[4rem] p-16 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600 shimmer-bar"></div>
            <i className="fas fa-crown text-6xl text-amber-500 mb-8 animate-bounce"></i>
            <h3 className="text-5xl font-black text-white uppercase tracking-tighter mb-4">Enterprise Edition</h3>
            <p className="text-slate-400 mb-12 leading-relaxed text-sm">Unlock the professional studio suite: Native Gemini 2.5 synthesis, reasoning-based drafts, and watermark-free exports.</p>
            <div className="text-7xl font-black text-white mb-14">$29<span className="text-xl text-slate-500 font-bold ml-2">/ month</span></div>
            <button onClick={() => { setState(p => ({...p, tier: UserTier.ENTERPRISE})); setShowUpgradeModal(false); addLog('info', 'Subscription upgraded to Enterprise.'); }} className="w-full py-8 bg-indigo-600 hover:bg-indigo-500 rounded-[2.5rem] font-black text-white shadow-2xl active:scale-95 transition-all text-xl">ACTIVATE STUDIO PRO</button>
            <button onClick={() => setShowUpgradeModal(false)} className="mt-10 text-[11px] font-black text-slate-600 uppercase tracking-[0.4em] hover:text-white transition-all underline underline-offset-8 decoration-slate-800">Return to Console</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
