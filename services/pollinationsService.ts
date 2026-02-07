
import { ArtStyle } from "../types";

export class PollinationsService {
  async generateScript(topic: string, model: string, type: 'solo' | 'exchange', apiKey?: string): Promise<string> {
    const prompt = type === 'exchange' 
      ? `Create a natural 2-person podcast exchange about "${topic}". Use 'Host:' and 'Guest:' markers. Make it conversational.`
      : `Create a natural solo podcast presentation about "${topic}". Use 'Host:' marker.`;

    const baseUrl = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`;
    const params = new URLSearchParams({
      model: model,
      seed: Math.floor(Math.random() * 100000).toString(),
      json: 'false'
    });

    const url = `${baseUrl}?${params.toString()}`;
    const headers: Record<string, string> = {};
    
    if (apiKey && apiKey.trim() !== '') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Pollinations API failed: ${response.status} ${errorText}`);
    }
    return await response.text();
  }

  getCoverArtUrl(topic: string, model: string, style: ArtStyle = ArtStyle.MINIMALIST): string {
    const seed = Math.floor(Math.random() * 100000);
    const cleanTopic = encodeURIComponent(topic.slice(0, 100));
    
    let stylePrompt = "";
    switch (style) {
      case ArtStyle.CYBERPUNK:
        stylePrompt = "cyberpunk aesthetic, neon lights, futuristic digital art, sharp detail";
        break;
      case ArtStyle.CINEMATIC:
        stylePrompt = "cinematic photography, dramatic lighting, high contrast, movie poster style";
        break;
      case ArtStyle.RETRO:
        stylePrompt = "retro 80s synthwave style, vintage textures, analog grain, classic logo";
        break;
      case ArtStyle.VIBRANT:
        stylePrompt = "abstract vibrant colors, organic shapes, modern graphic design, pop art";
        break;
      case ArtStyle.MINIMALIST:
      default:
        stylePrompt = "professional minimalist podcast cover art, clean typography, whitespace, elegant design";
        break;
    }

    const prompt = `Professional podcast cover art for ${cleanTopic}, ${stylePrompt}`;
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${model}&seed=${seed}&width=1024&height=1024&nologo=true`;
  }
}

export const pollinations = new PollinationsService();
