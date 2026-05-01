import React from 'react';
import { Search, Zap, ChevronDown, CheckCircle2, ChevronRight, Lock } from 'lucide-react';
import './_group.css';

export default function FaithfulNeon() {
  return (
    <div className="faithful-neon-root min-h-screen w-full text-slate-200 font-sans p-6 overflow-y-auto">
      {/* 1. Top nav */}
      <nav className="flex items-center justify-between mb-12">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center border border-slate-700 font-bold text-white tracking-tighter">
            HA
          </div>
          <div className="text-xl font-bold tracking-tight">
            <span className="text-white">Hobby</span>
            <span className="brand-alpha-gradient">Alpha</span>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm font-medium text-slate-400">
          <a href="#" className="hover:text-white transition-colors">Dashboard</a>
          <a href="#" className="flex items-center gap-2 text-white transition-colors">
            Alpha
            <span className="bg-[#FF7A1A]/20 text-[#FF7A1A] text-[10px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider">New</span>
          </a>
          <a href="#" className="hover:text-white transition-colors">Pricing</a>
          <a href="#" className="hover:text-white transition-colors">Portfolio</a>
          <a href="#" className="hover:text-white transition-colors">Market</a>
          <a href="#" className="hover:text-white transition-colors">Players</a>
          <a href="#" className="hover:text-white transition-colors">Explore</a>
          <a href="#" className="hover:text-white transition-colors">Leaderboards</a>
        </div>

        <button className="flex items-center gap-2 bg-[#FF7A1A] hover:bg-[#FF7A1A]/90 text-white px-4 py-2 rounded-full text-sm font-bold transition-all faithful-neon-bar-glow">
          <Zap className="w-4 h-4 fill-current" />
          Upgrade to Pro
        </button>
      </nav>

      <div className="max-w-4xl mx-auto space-y-8">
        {/* 2. Page header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-white tracking-tight">Player Outlook</h1>
          <p className="text-slate-400 text-lg">Analyze any player as a stock. Get investment verdicts and real market data.</p>
        </div>

        {/* 3. Search row */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              defaultValue="Shedeur Sanders"
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-4 pl-12 pr-4 text-white text-lg focus:outline-none focus:border-[#FF7A1A]/50 focus:ring-1 focus:ring-[#FF7A1A]/50 transition-all faithful-neon-card"
            />
          </div>
          <div className="relative w-48">
            <select className="w-full appearance-none bg-slate-900/50 border border-slate-700/50 rounded-xl py-4 px-4 pr-10 text-white text-lg focus:outline-none faithful-neon-card">
              <option>Football</option>
              <option>Basketball</option>
              <option>Baseball</option>
            </select>
            <ChevronDown className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
          <button className="bg-[#FF7A1A] hover:bg-[#FF7A1A]/90 text-white px-8 py-4 rounded-xl text-lg font-bold transition-all faithful-neon-bar-glow">
            Analyze
          </button>
        </div>

        {/* 4. Player header card */}
        <div className="faithful-neon-card rounded-2xl p-8 flex flex-col gap-6">
          <div className="flex items-start justify-between">
            <div className="flex gap-6">
              <span className="faithful-holo-ring">
                <img 
                  src="https://i.pravatar.cc/200?img=12" 
                  alt="Shedeur Sanders" 
                  className="w-24 h-24 object-cover"
                />
              </span>
              <div className="space-y-2">
                <h2 className="text-4xl font-bold text-white tracking-tight">Shedeur Sanders</h2>
                <div className="flex items-center gap-3 text-sm font-bold tracking-wider text-slate-400">
                  <span className="text-slate-300">FOOTBALL</span>
                  <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                  <span>QB</span>
                  <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                  <span>CLEVELAND BROWNS</span>
                  <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                  <span className="text-[#FF7A1A]">ROOKIE</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-4">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-soft"></span>
                  Data as of Mar 29, 2026 — refreshing in background…
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end max-w-[300px]">
              <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-700/50 px-3 py-1.5 rounded-full text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span> Decline
              </div>
              <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-700/50 px-3 py-1.5 rounded-full text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span> Warm
              </div>
              <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-700/50 px-3 py-1.5 rounded-full text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Low Vol
              </div>
              <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-700/50 px-3 py-1.5 rounded-full text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span> Medium Risk
              </div>
              <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-700/50 px-3 py-1.5 rounded-full text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span> Short Term
              </div>
            </div>
          </div>
        </div>

        {/* 5. Speculative profile callout & 6. Narrative */}
        <div className="faithful-neon-card rounded-2xl p-8 faithful-neon-glow-amber">
          <div className="flex items-center gap-3 mb-6">
            <div className="text-sm font-bold uppercase tracking-wider text-[#FF7A1A]">Low Conviction · Speculative</div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-5">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">If you own</div>
              <div className="text-2xl font-bold mb-2"><span className="verdict-hold">HOLD</span> <span className="text-white/70 text-xl font-semibold">(small only)</span></div>
              <div className="text-sm text-slate-400">Mixed signals — composite 55, conflicting (4/6), phase decline</div>
            </div>
            <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-5">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">If you want exposure</div>
              <div className="text-2xl font-bold mb-2"><span className="verdict-wait">WAIT</span></div>
              <div className="text-sm text-slate-400">Low conviction — no clear edge. Small speculative position only.</div>
            </div>
          </div>

          <p className="text-slate-300 text-lg leading-relaxed">
            Speculative profile in decline phase with strong demand ($15 avg, 2,500 sold/30d, −25%). Key drivers: demand +22, anti-hype +12. The upside runway exists but there's not enough data for a high-conviction call.
          </p>
        </div>

        {/* 7. Market Signals panel */}
        <div className="faithful-neon-card rounded-2xl p-8">
          <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-700/50">
            <div className="flex items-center gap-4">
              <h3 className="text-xl font-bold text-white tracking-tight">MARKET SIGNALS</h3>
              <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Decline Phase</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-slate-400 uppercase tracking-wider">Composite</div>
              <div className="text-4xl font-bold text-white">63<span className="text-xl text-slate-500">/100</span></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-8 mb-8">
            {/* Demand */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <div className="font-bold text-white text-lg">Demand</div>
                  <div className="text-xs signal-caption">Sales velocity across marketplaces</div>
                </div>
                <div className="text-xl font-bold text-emerald-400">100</div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 w-[100%] shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
              </div>
            </div>

            {/* Liquidity */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <div className="font-bold text-white text-lg">Liquidity</div>
                  <div className="text-xs signal-caption">Sell-through rate and volume</div>
                </div>
                <div className="text-xl font-bold text-emerald-400">71</div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 w-[71%] shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
              </div>
            </div>

            {/* Volatility */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <div className="font-bold text-white text-lg">Volatility</div>
                  <div className="text-xs signal-caption">Price stability (higher = more stable)</div>
                </div>
                <div className="text-xl font-bold text-yellow-400">62</div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 w-[62%] shadow-[0_0_10px_rgba(250,204,21,0.5)]"></div>
              </div>
            </div>

            {/* Momentum */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <div className="font-bold text-white text-lg">Momentum</div>
                  <div className="text-xs signal-caption">Price trend vs prior period</div>
                </div>
                <div className="text-xl font-bold text-rose-400">20</div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-rose-600 to-rose-400 w-[20%] shadow-[0_0_10px_rgba(251,113,133,0.5)]"></div>
              </div>
            </div>

            {/* Supply */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <div className="font-bold text-white text-lg">Supply</div>
                  <div className="text-xs signal-caption">Listings-to-sales pressure (higher = less pressure)</div>
                </div>
                <div className="text-xl font-bold text-orange-400">40</div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-orange-600 to-orange-400 w-[40%] shadow-[0_0_10px_rgba(251,146,60,0.5)]"></div>
              </div>
            </div>

            {/* Hype */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <div className="font-bold text-white text-lg">Hype</div>
                  <div className="text-xs signal-caption">Price vs participation divergence (high = warning)</div>
                </div>
                <div className="text-xl font-bold text-rose-400">25</div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-rose-600 to-rose-400 w-[25%] shadow-[0_0_10px_rgba(251,113,133,0.5)]"></div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-slate-700/50">
            <div className="flex items-center gap-2 bg-slate-800/50 text-slate-300 text-xs font-bold px-3 py-1.5 rounded border border-slate-700">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              4/6 signals aligned
            </div>
            <div className="text-sm font-bold text-slate-500 tracking-wider">
              hobbyalpha.com
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
