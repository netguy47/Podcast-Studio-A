
export enum UserTier {
  FREE = 'FREE',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE'
}

export enum TTSEngine {
  BROWSER = 'BROWSER',
  GEMINI = 'GEMINI'
}

export enum ExportFormat {
  WAV = 'WAV',
  MP3 = 'MP3',
  OGG = 'OGG'
}

export enum ArtStyle {
  MINIMALIST = 'Minimalist',
  CYBERPUNK = 'Cyberpunk',
  CINEMATIC = 'Cinematic',
  RETRO = 'Retro',
  VIBRANT = 'Vibrant'
}

export type Provider = "gemini" | "pollinations" | "openai" | "mistral";

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface VoiceProfile {
  id: string;
  name: string;
  voiceName: string;
  gender: 'Male' | 'Female' | 'Neutral';
  description: string;
  engine: TTSEngine;
  sampleText?: string;
}

export interface PodcastSegment {
  id: string;
  speaker: string;
  text: string;
  audioUrl?: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  duration?: number;
  startTime?: number;
}

export interface ModelConfig {
  id: string;
  provider: Provider;
  name: string;
  capabilities: ("text" | "image" | "audio" | "video")[];
  costPerMtok?: number;
  costPerRequest?: number;
  rateLimit: number;
  isActive: boolean;
  requiresAuth: "user" | "app" | "none";
}

export interface UserApiKeys {
  pollinationsKey?: string;
  openaiKey?: string;
  mistralKey?: string;
}

export interface AppState {
  tier: UserTier;
  quality: "fast" | "balanced" | "premium";
  exportFormat: ExportFormat;
  artStyle: ArtStyle;
  apiKeys: UserApiKeys;
  isGenerating: boolean;
  scriptType: 'solo' | 'exchange';
  introText: string;
  outroText: string;
  trialEndsAt?: number;
  licenseKey?: string;
  speakerVoiceMap: Record<string, string>;
  monthlyUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
}

export interface ProductionHistory {
  id: string;
  topic: string;
  timestamp: number;
  script: string;
  audioUrl?: string;
  coverArtUrl?: string;
  srtContent?: string;
  modelUsed?: string;
  tokensUsed?: number;
}
