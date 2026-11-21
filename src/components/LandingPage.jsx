import React, { useState, useEffect } from 'react';

const FEATURES = [
  { icon: '🌍', title: 'Realistic Earth & Sun', desc: 'Earth and Sun positioned using actual orbital geometry. See real day/night lighting changes.' },
  { icon: '🚀', title: '4-Phase Landing Sim', desc: 'Rough Braking → Fine Braking → Terminal Descent → Touchdown with live thruster effects.' },
  { icon: '🌙', title: 'Day / Night Modes', desc: 'Switch between daytime, twilight, and nighttime conditions with accurate surface temperatures.' },
  { icon: '📡', title: 'Live Telemetry', desc: 'Monitor altitude, velocity, fuel, thrust, and environmental parameters throughout descent.' },
  { icon: '🎥', title: '5 Camera Views', desc: 'Chase, side view, ground-level, cockpit, or free orbit — each with smooth transitions.' },
  { icon: '🛰️', title: 'Site Evaluator', desc: 'Analyze Sun & Earth visibility windows, satellite relays, and launch slip calendars.' },
];

const SPECS = [
  { num: '1,749', unit: 'kg', label: 'Total Mass' },
  { num: '800', unit: 'N', label: 'Engine Thrust' },
  { num: '4', unit: 'phases', label: 'Descent Stages' },
  { num: '15', unit: 'km', label: 'Initial Altitude' },
  { num: '69.37°', unit: 'South', label: 'Landing Latitude' },
  { num: '2', unit: 'm/s', label: 'Touchdown Speed' },
];

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
    <div className="min-h-screen bg-[#04080f] text-gray-100 overflow-x-hidden relative">
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
        @keyframes bob { 0%,100%{transform:rotate(45deg) translateY(0)} 50%{transform:rotate(45deg) translateY(5px)} }
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
          <a href="#mission" className="hidden sm:block text-xs text-gray-400 hover:text-white transition-colors tracking-wider">Mission</a>
          <a href="#specs" className="hidden sm:block text-xs text-gray-400 hover:text-white transition-colors tracking-wider">Specs</a>
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
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-6 pt-20 pb-16">
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
          <a href="#mission"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl cursor-pointer
              bg-white/[0.03] border border-white/10 text-gray-300 text-sm
              hover:bg-white/[0.06] hover:border-white/20 transition-all">
            Learn More
          </a>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 flex flex-col items-center gap-2 text-gray-600 opacity-60"
          style={{ animation: 'fadeUp 1s ease-out 1s both' }}>
          <span className="text-[9px] tracking-[2px] uppercase">Scroll to explore</span>
          <div className="w-4 h-4 border-r-[1.5px] border-b-[1.5px] border-gray-600"
            style={{ transform: 'rotate(45deg)', animation: 'bob 2s ease-in-out infinite' }} />
        </div>
      </section>

      {/* ═══ MISSION OVERVIEW ═══ */}
      <section id="mission" className="relative z-10 max-w-6xl mx-auto px-6 py-24">
        <p className="text-[10px] tracking-[3px] uppercase text-blue-400 mb-3">Mission Overview</p>
        <h3 className="text-3xl font-semibold text-white mb-3" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          Precision Lunar Descent
        </h3>
        <p className="text-sm text-gray-400 max-w-lg leading-relaxed">
          The ASTRA 2026 mission targets a soft landing near the Moon's South Pole —
          a region of immense scientific interest for water ice deposits and permanently shadowed craters.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
          {FEATURES.map((f, i) => (
            <div key={i} className="bg-[#0a1628]/70 border border-blue-500/10 rounded-xl p-6
              hover:border-blue-500/25 hover:-translate-y-1 transition-all duration-300
              backdrop-blur-sm">
              <div className="w-11 h-11 rounded-lg bg-blue-500/8 border border-blue-500/15
                flex items-center justify-center text-xl mb-4">
                {f.icon}
              </div>
              <h4 className="text-sm font-semibold text-white mb-2">{f.title}</h4>
              <p className="text-xs text-gray-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ SPECS ═══ */}
      <section id="specs" className="relative z-10 max-w-6xl mx-auto px-6 py-24">
        <p className="text-[10px] tracking-[3px] uppercase text-blue-400 mb-3">Lander Specifications</p>
        <h3 className="text-3xl font-semibold text-white mb-12" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          Technical Parameters
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {SPECS.map((s, i) => (
            <div key={i} className="bg-[#0a1628]/70 border border-blue-500/10 rounded-xl p-5 text-center
              hover:border-blue-500/20 transition-colors">
              <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-blue-300"
                style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                {s.num}
              </div>
              <div className="text-[11px] text-gray-400 mt-1">{s.unit}</div>
              <div className="text-[10px] text-gray-500 mt-2 tracking-wider uppercase">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="rounded-2xl p-12 bg-gradient-to-br from-blue-500/5 to-emerald-500/3 border border-blue-500/10">
          <button onClick={onEnter}
            className="inline-flex items-center gap-3 px-12 py-4 rounded-xl cursor-pointer
              bg-gradient-to-br from-blue-600 to-blue-500 text-white font-semibold text-base tracking-wider uppercase
              shadow-[0_6px_35px_rgba(26,138,255,0.3)] hover:shadow-[0_10px_45px_rgba(26,138,255,0.4)]
              hover:-translate-y-1 transition-all">
            <span className="text-xl">🚀</span>
            Launch Mission Control
          </button>
          <p className="text-xs text-gray-500 mt-4">Opens the interactive dashboard with 3D simulation & site evaluator</p>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="relative z-10 text-center py-8 border-t border-blue-500/8 text-xs text-gray-600">
        ASTRA 2026 Lunar Landing Simulation · Built for educational and demonstration purposes
      </footer>
    </div>
  );
}
