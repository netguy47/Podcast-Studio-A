
import { VoiceProfile, TTSEngine, ModelConfig } from './types';

export const VOICES: VoiceProfile[] = [
  { id: 'pro-1', name: 'Alex', voiceName: 'Kore', gender: 'Male', description: 'Authoritative', engine: TTSEngine.GEMINI, sampleText: "Welcome to the future of podcasting." },
  { id: 'pro-2', name: 'Jordan', voiceName: 'Puck', gender: 'Female', description: 'Bright', engine: TTSEngine.GEMINI, sampleText: "It's a beautiful day to explore new ideas." },
  { id: 'pro-3', name: 'Sam', voiceName: 'Charon', gender: 'Male', description: 'Intellectual', engine: TTSEngine.GEMINI, sampleText: "Deep dives into the mysteries of the universe." },
  
  { id: 'free-1', name: 'Andrew', voiceName: 'en-US-AndrewNeural', gender: 'Male', description: 'Edge Male', engine: TTSEngine.BROWSER, sampleText: "Streaming from the edge of technology." },
  { id: 'free-2', name: 'Emma', voiceName: 'en-US-EmmaNeural', gender: 'Female', description: 'Edge Female', engine: TTSEngine.BROWSER, sampleText: "Let's talk about the world today." },
  { id: 'free-3', name: 'Sonia', voiceName: 'en-GB-SoniaNeural', gender: 'Female', description: 'British', engine: TTSEngine.BROWSER, sampleText: "Fancy a bit of intelligent conversation?" },
];

export const DEFAULT_SCRIPT = `Host: Welcome to AI Horizons. I'm Alex.
Guest: And I'm Jordan. Today we explore the edge of technology.
Host: Let's get started.`;

export const LEGAL_SAMPLE_SCRIPT = `Host: Welcome to 'The Legal Brief'. I'm your host, Mark.
Guest: And I'm Sarah, a senior partner at Justice Associates.
Host: Today we're discussing the implications of the new digital privacy act.
Guest: It's a landmark piece of legislation, Mark. For the first time, users have explicit ownership of their behavioral metadata.
Host: How will this affect small businesses?
Guest: There's a 24-month grace period, but compliance starts with transparency.`;

export const MODEL_REGISTRY: Record<string, ModelConfig> = {
  // TEXT GENERATION
  "gemini-3-pro-preview": {
    id: "gemini-3-pro-preview",
    provider: "gemini",
    name: "Gemini 3 Pro (Reasoning)",
    capabilities: ["text", "audio"],
    costPerMtok: 3.5,
    rateLimit: 100,
    isActive: true,
    requiresAuth: "user",
  },
  "gemini-3-flash-preview": {
    id: "gemini-3-flash-preview",
    provider: "gemini",
    name: "Gemini 3 Flash (Fast)",
    capabilities: ["text", "audio"],
    costPerMtok: 0.075,
    rateLimit: 1000,
    isActive: true,
    requiresAuth: "user",
  },
  
  // POLLINATIONS
  "pollinations-script-paid": {
    id: "pollinations-script-paid",
    provider: "pollinations",
    name: "Pollinations (Paid - GPT-4o)",
    capabilities: ["text"],
    costPerRequest: 0.002,
    rateLimit: 500,
    isActive: true,
    requiresAuth: "user",
  },
  "pollinations-script-free": {
    id: "pollinations-script-free",
    provider: "pollinations",
    name: "Pollinations (Free)",
    capabilities: ["text"],
    costPerRequest: 0,
    rateLimit: 30,
    isActive: true,
    requiresAuth: "none",
  },

  // IMAGE GENERATION
  "pollinations-image-flux": {
    id: "pollinations-image-flux",
    provider: "pollinations",
    name: "Flux Pro (High Quality)",
    capabilities: ["image"],
    costPerRequest: 0.03,
    rateLimit: 100,
    isActive: true,
    requiresAuth: "user",
  },
  "pollinations-image-free": {
    id: "pollinations-image-free",
    provider: "pollinations",
    name: "Pollinations Free (Turbo)",
    capabilities: ["image"],
    costPerRequest: 0,
    rateLimit: 50,
    isActive: true,
    requiresAuth: "none",
  },

  // TTS
  "gemini-native-audio": {
    id: "gemini-native-audio",
    provider: "gemini",
    name: "Gemini Native Audio (Premium)",
    capabilities: ["audio"],
    costPerRequest: 0.00001,
    rateLimit: 200,
    isActive: true,
    requiresAuth: "user",
  },
  "edge-neural-voices": {
    id: "edge-neural-voices",
    provider: "openai",
    name: "Microsoft Edge Neural (Free)",
    capabilities: ["audio"],
    costPerRequest: 0,
    rateLimit: 1000,
    isActive: true,
    requiresAuth: "none",
  },
};
