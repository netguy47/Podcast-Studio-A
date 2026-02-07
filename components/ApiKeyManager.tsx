
import { UserApiKeys } from "../types";
import React, { useState } from "react";

const PROVIDERS = [
  {
    id: "pollinationsKey",
    name: "Pollinations AI",
    icon: "fas fa-leaf",
    description: "Token-based access for Flux and GPT-4o models",
    docs: "https://pollinations.ai/",
  },
  {
    id: "openaiKey",
    name: "OpenAI",
    icon: "fab fa-openai",
    description: "Used for transcription and secondary LLM logic",
    docs: "https://platform.openai.com/api-keys",
  },
  {
    id: "mistralKey",
    name: "Mistral AI",
    icon: "fas fa-wind",
    description: "Access to Mistral Small/Large for script drafting",
    docs: "https://console.mistral.ai/",
  },
];

interface ApiKeyManagerProps {
  apiKeys: UserApiKeys;
  onSave: (provider: string, key: string) => void;
}

export function ApiKeyManager({ apiKeys, onSave }: ApiKeyManagerProps) {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [tempKeys, setTempKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const handleSave = (providerId: string) => {
    onSave(providerId, tempKeys[providerId] || "");
    setSaved({ ...saved, [providerId]: true });
    setTimeout(() => setSaved({ ...saved, [providerId]: false }), 3000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="mb-8 ml-2">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest border-l-4 border-indigo-600 pl-4">Credential Vault</h3>
        <p className="text-slate-500 text-sm mt-3 font-medium">Configure your production pipeline. Your keys are utilized only for secure requests. Google Gemini keys are managed automatically via the environment.</p>
      </div>

      <div className="grid gap-6">
        {PROVIDERS.map((provider) => (
          <div
            key={provider.id}
            className={`bg-[#111827] border rounded-[2.5rem] transition-all duration-300 ${
              expandedProvider === provider.id ? 'border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.1)]' : 'border-slate-800'
            }`}
          >
            <button
              onClick={() => setExpandedProvider(expandedProvider === provider.id ? null : provider.id)}
              className="w-full flex items-center justify-between p-8 text-left group"
            >
              <div className="flex items-center space-x-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl shadow-lg transition-all ${
                  expandedProvider === provider.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'
                }`}>
                  <i className={provider.icon}></i>
                </div>
                <div>
                  <h4 className="font-bold text-white text-lg">{provider.name}</h4>
                  <p className="text-xs text-slate-500 font-medium">{provider.description}</p>
                </div>
              </div>
              <div className={`transition-transform duration-300 ${expandedProvider === provider.id ? 'rotate-180' : ''}`}>
                <i className="fas fa-chevron-down text-slate-600"></i>
              </div>
            </button>

            {expandedProvider === provider.id && (
              <div className="px-8 pb-8 animate-in slide-in-from-top-4">
                <div className="h-px bg-slate-800 mb-8"></div>
                
                <div className="space-y-6">
                  <div className="relative">
                    <input
                      type="password"
                      placeholder={`Enter ${provider.name} Secret Key...`}
                      value={tempKeys[provider.id] || (apiKeys as any)[provider.id] || ""}
                      onChange={(e) => setTempKeys({ ...tempKeys, [provider.id]: e.target.value })}
                      className="w-full bg-slate-800 p-5 rounded-2xl text-xs border border-slate-700 outline-none focus:border-indigo-500 transition-all placeholder:text-slate-700"
                    />
                    {saved[provider.id] && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 text-xs font-black uppercase tracking-widest">
                        <i className="fas fa-check mr-2"></i> Encrypted
                      </div>
                    )}
                  </div>

                  <div className="flex space-x-4">
                    <button
                      onClick={() => handleSave(provider.id)}
                      className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl transition-all"
                    >
                      Update Key
                    </button>
                    <a
                      href={provider.docs}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all"
                    >
                      Docs
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
