
import React, { useEffect, useState } from "react";

export function CostDashboard() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const historyStr = localStorage.getItem('studio-master-history') || '[]';
    const history = JSON.parse(historyStr);
    
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    
    const thisMonthHistory = history.filter((item: any) => item.timestamp >= firstDayOfMonth);
    const thisMonthCost = thisMonthHistory.reduce((acc: number, item: any) => acc + (item.cost || 0), 0);
    const thisMonthTokens = thisMonthHistory.reduce((acc: number, item: any) => acc + (item.tokensUsed || 0), 0);
    
    const savedByFreeTier = history.reduce((acc: number, item: any) => {
      if (item.cost === 0) return acc + 0.005; 
      return acc;
    }, 0);

    const modelCounts: Record<string, any> = {};
    history.forEach((item: any) => {
      if (!modelCounts[item.model]) {
        modelCounts[item.model] = { modelId: item.model, modelName: item.modelName || item.model, requestCount: 0, cost: 0 };
      }
      modelCounts[item.model].requestCount++;
      modelCounts[item.model].cost += (item.cost || 0);
    });

    const byModel = Object.values(modelCounts).sort((a: any, b: any) => b.cost - a.cost);

    setStats({
      thisMonth: thisMonthCost,
      thisMonthTokens,
      savedByFreeTier,
      totalRequests: history.length,
      byModel,
      recommendations: ["Your production pipeline is healthy.", "Tokens are being tracked via local production vault."]
    });
  }, []);

  if (!stats) return <div className="p-8 text-slate-500 animate-pulse text-center">Reading production telemetry...</div>;

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-32">
      <h2 className="text-5xl font-black uppercase tracking-tighter text-white">Production Analytics</h2>

      <div className="grid grid-cols-4 gap-6">
        <div className="p-8 bg-slate-900/50 rounded-[3rem] border border-slate-800">
          <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-2">Spend</p>
          <p className="text-4xl font-black text-white">${stats.thisMonth.toFixed(3)}</p>
        </div>
        <div className="p-8 bg-slate-900/50 rounded-[3rem] border border-slate-800">
          <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-2">Tokens</p>
          <p className="text-4xl font-black text-indigo-400">{(stats.thisMonthTokens / 1000).toFixed(1)}k</p>
        </div>
        <div className="p-8 bg-slate-900/50 rounded-[3rem] border border-slate-800">
          <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-2">Saved</p>
          <p className="text-4xl font-black text-emerald-400">${stats.savedByFreeTier.toFixed(2)}</p>
        </div>
        <div className="p-8 bg-slate-900/50 rounded-[3rem] border border-slate-800">
          <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-2">Requests</p>
          <p className="text-4xl font-black text-white">{stats.totalRequests}</p>
        </div>
      </div>

      <div className="bg-[#111827] rounded-[3.5rem] border border-slate-800 p-10">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-8">Model Efficiency Breakdown</h3>
        <div className="space-y-4">
          {stats.byModel.map((model: any) => (
            <div key={model.modelId} className="flex items-center justify-between p-6 bg-slate-800/20 rounded-3xl border border-slate-700/50">
              <div className="flex-1">
                <p className="font-bold text-white text-lg">{model.modelName}</p>
                <p className="text-[10px] font-black uppercase text-slate-500">{model.requestCount} Masterings</p>
              </div>
              <p className="font-black text-white text-xl">${model.cost.toFixed(4)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
