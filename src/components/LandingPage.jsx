import React, { useState, useEffect } from 'react';

export default function LandingPage({ onEnter }) {
  const [stars, setStars] = useState([]);

  useEffect(() => {
    const s = [];
    for (let i = 0; i < 200; i++) {
      s.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        r: Math.random() * 1.5 + 0.3,
        a: Math.random(),
        s: 0.3 + Math.random() * 1.5,
      });
    }
    setStars(s);
  }, []);

  return (
    <div className="min-h-screen bg-[#04080f] text-gray-100 overflow-x-hidden relative flex flex-col justify-between">
      {/* Ambient glows */}
      <div className="fixed top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full pointer-events-none z-0"
        style={{ background: 'radial-gradient(circle, rgba(74,158,255,0.06) 0%, transparent 70%)' }} />
      <div className="fixed bottom-[-300px] left-[-200px] w-[700px] h-[700px] rounded-full pointer-events-none z-0"
        style={{ background: 'radial-gradient(circle, rgba(58,232,176,0.04) 0%, transparent 70%)' }} />

      {/* Star dots (CSS) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {stars.map((s, i) => (
          <div key={i} className="absolute rounded-full"
            style={{
              left: `${s.x}%`, top: `${s.y}%`,
              width: `${s.r * 2}px`, height: `${s.r * 2}px`,
              background: `rgba(180,210,255,${s.a * 0.6})`,
              animation: `starTwinkle ${2 + s.s}s ease-in-out infinite`,
              animationDelay: `${s.s}s`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes starTwinkle { 0%,100%{opacity:0.3} 50%{opacity:1} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ═══ NAV ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-10 py-4 bg-[#04080fcc] backdrop-blur-xl border-b border-blue-500/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full border-[1.5px] border-blue-500/40 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full border border-blue-500/60" />
          </div>
          <h1 className="text-lg font-semibold tracking-[5px] text-white" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>ASTRA</h1>
          <span className="text-[9px] px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 tracking-wider">2026</span>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={onEnter}
            className="px-5 py-2 rounded-lg text-xs tracking-wider uppercase cursor-pointer
              bg-gradient-to-r from-blue-500/20 to-emerald-500/10 border border-blue-500/30
              text-blue-200 hover:from-blue-500/30 hover:border-blue-400/50 hover:text-white transition-all
              shadow-[0_0_20px_rgba(74,158,255,0.1)]">
            Launch App →
          </button>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 pt-24 pb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/8 border border-blue-500/15 mb-6"
          style={{ animation: 'fadeUp 0.8s ease-out' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] tracking-[2px] uppercase text-blue-400">Mission Active — South Pole Landing</span>
        </div>

        <h2 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-tight max-w-3xl"
          style={{
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            background: 'linear-gradient(135deg, #fff 0%, #8cc5ff 50%, #3ae8b0 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            animation: 'fadeUp 0.8s ease-out 0.1s both',
          }}>
          Lunar Landing Simulation
        </h2>

        <p className="text-base sm:text-lg text-gray-400 max-w-xl leading-relaxed mt-5"
          style={{ animation: 'fadeUp 0.8s ease-out 0.2s both' }}>
          Experience a real-time 3D simulation of a precision lunar landing.
          Configure descent parameters, observe realistic Sun & Earth positioning,
          and analyze landing site viability.
        </p>

        <div className="flex gap-4 mt-10" style={{ animation: 'fadeUp 0.8s ease-out 0.3s both' }}>
          <button onClick={onEnter}
            className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl cursor-pointer
              bg-gradient-to-br from-blue-600 to-blue-500 text-white font-medium text-sm tracking-wide
              shadow-[0_4px_25px_rgba(26,138,255,0.3)] hover:shadow-[0_8px_35px_rgba(26,138,255,0.4)]
              hover:-translate-y-0.5 transition-all">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none"/>
            </svg>
            Enter Mission Control
          </button>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="relative z-10 text-center py-6 border-t border-blue-500/8 text-xs text-gray-600">
        ASTRA 2026 Lunar Landing Simulation · Built for educational and demonstration purposes
      </footer>
    </div>
  );
}
