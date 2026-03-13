import React, { useState, useEffect, useRef } from 'react';

// ─── ANALYTICS (PostHog) ──────────────────────────────────────────────────────
(function() {
  try {
    const ph = (window as any).posthog;
    if (ph) return; // already loaded
    const script = document.createElement('script');
    script.src = 'https://eu-assets.i.posthog.com/static/array.js';
    script.async = true;
    script.onload = () => {
      (window as any).posthog.init('phc_o8Cp2yne3aQW2CEGLMovUm4p2bMwMJjNKhHjBkUytr9', {
        api_host: 'https://eu.i.posthog.com',
        person_profiles: 'identified_only',
        autocapture: false, // manual events only — we control what's tracked
        capture_pageview: true,
      });
    };
    document.head.appendChild(script);
  } catch {}
})();

function track(event: string, props?: Record<string, any>) {
  try {
    const ph = (window as any).posthog;
    if (ph?.capture) ph.capture(event, props || {});
  } catch {}
}

function identifyUser(userId: string, username: string) {
  try {
    const ph = (window as any).posthog;
    if (ph?.identify) {
      ph.identify(userId, { username });
    }
  } catch {}
}

// ─── AUDIO ENGINE ──────────────────────────────────────────────────────────────
let _audioCtx: AudioContext | null = null;
let _bgGain: GainNode | null = null;
let _bgPlaying = false;
let _musicMuted = true; // starts muted — user must activate

function getAudioCtx(): AudioContext {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

// Tamagotchi-style looping melody using oscillators
function startBgMusic() {
  if (_bgPlaying || _musicMuted) return;
  try {
    const ctx = getAudioCtx();
    _bgGain = ctx.createGain();
    _bgGain.gain.setValueAtTime(0, ctx.currentTime);
    _bgGain.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 1.5);
    _bgGain.connect(ctx.destination);

    // Simple pentatonic melody — gentle & looping
    const notes = [523, 659, 784, 659, 523, 392, 440, 523, 659, 784, 880, 784, 659, 523, 440, 392];
    const dur = 0.35;
    let t = ctx.currentTime + 0.5;

    function scheduleMelody() {
      if (!_bgGain || _musicMuted) return;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t + i * dur);
        g.gain.linearRampToValueAtTime(1, t + i * dur + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * dur + dur * 0.85);
        osc.connect(g); g.connect(_bgGain!);
        osc.start(t + i * dur);
        osc.stop(t + i * dur + dur);
      });
      // Schedule next loop
      const loopDuration = notes.length * dur;
      setTimeout(scheduleMelody, (loopDuration - 0.5) * 1000);
      t += loopDuration;
    }
    scheduleMelody();
    _bgPlaying = true;
  } catch {}
}

function stopBgMusic() {
  if (!_bgGain) return;
  try {
    const ctx = getAudioCtx();
    _bgGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
    _bgPlaying = false;
  } catch {}
}

function toggleMusic(): boolean {
  _musicMuted = !_musicMuted;
  if (_musicMuted) stopBgMusic();
  else startBgMusic();
  return !_musicMuted;
}

// Sound effects
function playSfx(type: 'feed_good' | 'feed_bad' | 'tap' | 'sleep' | 'wake' | 'achievement' | 'blocked') {
  // tap always plays; other sfx only when not muted
  if (_musicMuted && type !== 'tap') return;
  try {
    const ctx = getAudioCtx();
    const sequences: Record<string, {f:number,d:number,t:number,type?:OscillatorType}[]> = {
      feed_good: [
        {f:523,d:0.1,t:0},{f:659,d:0.1,t:0.1},{f:784,d:0.15,t:0.2},{f:1047,d:0.2,t:0.35}
      ],
      feed_bad: [
        {f:300,d:0.15,t:0,type:'sawtooth'},{f:200,d:0.2,t:0.15,type:'sawtooth'}
      ],
      tap: [
        {f:880,d:0.06,t:0},{f:1100,d:0.08,t:0.06}
      ],
      sleep: [
        {f:440,d:0.2,t:0},{f:330,d:0.25,t:0.2},{f:220,d:0.3,t:0.45}
      ],
      wake: [
        {f:330,d:0.1,t:0},{f:440,d:0.1,t:0.1},{f:550,d:0.15,t:0.2}
      ],
      achievement: [
        {f:523,d:0.08,t:0},{f:659,d:0.08,t:0.08},{f:784,d:0.08,t:0.16},
        {f:1047,d:0.08,t:0.24},{f:1319,d:0.25,t:0.32}
      ],
      blocked: [
        {f:250,d:0.1,t:0,type:'square'},{f:200,d:0.15,t:0.1,type:'square'}
      ],
    };
    const seq = sequences[type] || [];
    seq.forEach(({f,d,t,type:oscType}) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = oscType || 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.18, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + d);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + d + 0.05);
    });
  } catch {}
}

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SUPA_URL = 'https://qalhzbfbvbcnriatzgtn.supabase.co';
const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhbGh6YmZidmJjbnJpYXR6Z3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NDg4MjMsImV4cCI6MjA4ODMyNDgyM30.KC-ZwGBviHBKuu0xWqvyDIUZGIJj8aa9E9gT_7yv5TQ';

// Current session user_id — set on login, cleared on logout
let _currentUserId: string | null = null;

const db = {
  // Dynamic headers — includes app.user_id for RLS
  get headers() {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
    };
    if (_currentUserId) {
      // Passes user_id to Supabase so RLS policies can use current_user_id()
      h['x-set-config-app-user-id'] = _currentUserId;
    }
    return h;
  },

  async findUser(username) {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/users?username=eq.${encodeURIComponent(
        username.toLowerCase()
      )}&limit=1`,
      { headers: db.headers }
    );
    const data = await res.json();
    return data[0] || null;
  },

  async createUser(username, password, emoji) {
    const res = await fetch(`${SUPA_URL}/rest/v1/users`, {
      method: 'POST',
      headers: { ...db.headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        username: username.toLowerCase(),
        password,
        emoji,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      // Supabase devuelve código 23505 cuando el username ya existe (UNIQUE constraint)
      if (err?.code === '23505' || res.status === 409)
        throw new Error('USERNAME_TAKEN');
      throw new Error('CREATE_FAILED');
    }
    const data = await res.json();
    return data[0];
  },

  async getPet(userId) {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/pets?user_id=eq.${userId}&limit=1`,
      { headers: db.headers }
    );
    const data = await res.json();
    return data[0] || null;
  },

  async createPet(userId) {
    const res = await fetch(`${SUPA_URL}/rest/v1/pets`, {
      method: 'POST',
      headers: { ...db.headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: userId,
        health: 85,
        hunger: 70,
        energy: 80,
        sleeping: false,
        mood: 'happy',
        total_feedings: 0,
        good_feedings: 0,
      }),
    });
    const data = await res.json();
    return data[0];
  },

  async savePet(userId, petData) {
    await fetch(`${SUPA_URL}/rest/v1/pets?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: { ...db.headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        ...petData,
        updated_at: new Date().toISOString(),
      }),
    });
  },

  async getFoodLog(userId) {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/food_log?user_id=eq.${userId}&order=eaten_at.desc&limit=10`,
      { headers: db.headers }
    );
    if (!res.ok) return [];
    return await res.json();
  },

  async addFoodLog(userId, product) {
    await fetch(`${SUPA_URL}/rest/v1/food_log`, {
      method: 'POST',
      headers: db.headers,
      body: JSON.stringify({
        user_id: userId,
        product_name: product.name,
        brand: product.brand,
        score: product.score || 'unknown',
        barcode: product.barcode,
      }),
    });
  },

  async getAchievements(userId) {
    const res = await fetch(`${SUPA_URL}/rest/v1/achievements?user_id=eq.${userId}`, { headers: db.headers });
    if (!res.ok) return [];
    return await res.json();
  },

  async unlockAchievement(userId, achievementId) {
    await fetch(`${SUPA_URL}/rest/v1/achievements`, {
      method: 'POST',
      headers: { ...db.headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId, achievement_id: achievementId }),
    }).catch(() => {});
  },

  async getAccessories(userId) {
    const res = await fetch(`${SUPA_URL}/rest/v1/accessories?user_id=eq.${userId}&limit=1`, { headers: db.headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data[0] || null;
  },

  async saveAccessories(userId, equipped: string[], unlocked: string[]) {
    await fetch(`${SUPA_URL}/rest/v1/accessories?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: { ...db.headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ equipped, unlocked, updated_at: new Date().toISOString() }),
    });
  },

  async createAccessories(userId) {
    await fetch(`${SUPA_URL}/rest/v1/accessories`, {
      method: 'POST',
      headers: db.headers,
      body: JSON.stringify({ user_id: userId, equipped: [], unlocked: [] }),
    }).catch(() => {});
  },
};

// ─── STORE ────────────────────────────────────────────────────────────────────
function createStore(init) {
  let state = { ...init };
  const ls = new Set();
  return {
    getState: () => state,
    setState: (p) => {
      state = { ...state, ...(typeof p === 'function' ? p(state) : p) };
      ls.forEach((l) => l(state));
    },
    subscribe: (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
  };
}

// Restore session from localStorage if available
const _savedSession = (() => {
  try {
    const raw = localStorage.getItem('nutripet_session');
    if (!raw) return null;
    const s = JSON.parse(raw);
    // Expire session after 30 days of no activity
    const MAX_AGE = 30 * 24 * 3600 * 1000;
    if (s.savedAt && Date.now() - s.savedAt > MAX_AGE) {
      localStorage.removeItem('nutripet_session');
    localStorage.removeItem('nutripet_state');
      localStorage.removeItem('nutripet_state');
      return null;
    }
    return s;
  } catch { return null; }
})();

// Expose db for global decay interval
if (typeof window !== 'undefined') (window as any).__nutriDB = db;

const petStore = createStore({
  loggedIn: false,
  userId: _savedSession?.userId || null,
  username: _savedSession?.username || '',
  emoji: _savedSession?.emoji || '🐱',
  health: 85,
  hunger: 70,
  energy: 80,
  weight: 50,  // 0=skinny 50=normal 100=chubby
  strength: 0, // 0=normal 100=super muscular — grows with protein (score A/B)
  training: false, // training mode — builds strength, burns hunger+energy
  sleeping: false,
  mood: 'happy',
  lastFood: null,
  feedAnim: false,
  totalFeedings: 0,
  goodFeedings: 0,
  // flag to trigger auto-login on mount
  _pendingRestore: !!_savedSession?.userId,
});

function usePetStore() {
  const [s, set] = useState(petStore.getState());
  useEffect(() => petStore.subscribe(set), []);
  return s;
}

// ─── GLOBAL DECAY (runs outside React, never recreated) ───────────────────────
let _saveTimer: any = null;
let _isTraining = false; // module-level flag, never lost between renders
setInterval(() => {
  const s = petStore.getState();
  if (!s.loggedIn || !s.userId) return;
  let next: any;
  if (s.sleeping) {
    _isTraining = false; // can't train while sleeping
    next = {
      energy: Math.min(100, s.energy + 0.3),
      health: Math.min(100, s.health + 0.04),
      hunger: Math.max(0, s.hunger - 0.02),
    };
  } else {
    let h, u, e, w, st;
    if (_isTraining) {
      // Training mode: burns hunger+energy fast, builds strength, reduces weight
      h = Math.max(0, s.health - 0.01);
      u = Math.max(0, s.hunger - 0.12);   // hungry faster
      e = Math.max(0, s.energy - 0.09);   // tired faster
      w = Math.max(0, (s.weight ?? 50) - 0.015); // loses weight
      st = Math.min(100, (s.strength ?? 0) + 0.02); // gains strength
    } else {
      h = Math.max(0, s.health - 0.025);
      u = Math.max(0, s.hunger - 0.05);
      e = Math.max(0, s.energy - 0.03);
      w = Math.max(0, (s.weight ?? 50) - 0.004);
      st = Math.max(0, (s.strength ?? 0) - 0.003);
    }
    let mood = 'happy';
    if (h < 20) mood = 'sick';
    else if (e < 25 || u < 20) mood = 'tired';
    // Auto-stop training if too hungry or too tired
    const shouldStopTraining = _isTraining && (u < 10 || e < 10);
    if (shouldStopTraining) _isTraining = false;
    next = { health: h, hunger: u, energy: e, weight: w, strength: st, mood,
      training: _isTraining };
  }
  const merged = { ...s, ...next };
  try {
    localStorage.setItem('nutripet_state', JSON.stringify({
      userId: merged.userId,
      health: merged.health, hunger: merged.hunger, energy: merged.energy,
      weight: merged.weight ?? 50,
      strength: merged.strength ?? 0,
      training: merged.training ?? false,
      sleeping: merged.sleeping, mood: merged.mood, lastFood: merged.lastFood,
      totalFeedings: merged.totalFeedings, goodFeedings: merged.goodFeedings,
      savedAt: Date.now(),
    }));
  } catch {}
  // Debounce Supabase
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    if (!merged.userId) return;
    const db2 = (window as any).__nutriDB;
    if (db2) db2.savePet(merged.userId, {
      health: merged.health, hunger: merged.hunger, energy: merged.energy,
      sleeping: merged.sleeping, mood: merged.mood, last_food: merged.lastFood,
      total_feedings: merged.totalFeedings, good_feedings: merged.goodFeedings,
    }).catch(() => {});
  }, 10000);
  petStore.setState(next);
}, 1000);

// ─── NUTRI CONFIG ─────────────────────────────────────────────────────────────
const NC = {
  a: {
    color: '#1a9641',
    bg: '#d4edda',
    label: 'A',
    msg: '¡Ñam! ¡Esto me da superpoderes!',
    healthDelta: +14,
    hungerDelta: +22,
    energyDelta: +8,
  },
  b: {
    color: '#a6d96a',
    bg: '#e8f5d0',
    label: 'B',
    msg: '¡Mmm, muy rico y sano!',
    healthDelta: +8,
    hungerDelta: +18,
    energyDelta: +5,
  },
  c: {
    color: '#ccb800',
    bg: '#fffde0',
    label: 'C',
    msg: 'Está bien, no pasa nada.',
    healthDelta: +1,
    hungerDelta: +14,
    energyDelta: +2,
  },
  d: {
    color: '#fdae61',
    bg: '#fef3e0',
    label: 'D',
    msg: 'Hmm… mi barriguita se siente rara.',
    healthDelta: -6,
    hungerDelta: +10,
    energyDelta: -2,
  },
  e: {
    color: '#d7191c',
    bg: '#fde8e8',
    label: 'E',
    msg: '¡Oh no! Mi barriguita me duele.',
    healthDelta: -16,
    hungerDelta: +6,
    energyDelta: -5,
  },
  unknown: {
    color: '#9b9b9b',
    bg: '#f0f0f0',
    label: '?',
    msg: 'No sé qué es, ¡pero me lo comí!',
    healthDelta: 0,
    hungerDelta: +10,
    energyDelta: 0,
  },
};
const getNC = (s) => NC[(s || '').toLowerCase()] || NC.unknown;

// ─── PET FACE ─────────────────────────────────────────────────────────────────
function PetFace({ mood, sleeping, health, feedAnim, equipped = [], weight = 50, strength = 0, training = false }: { mood:string, sleeping:boolean, health:number, feedAnim:boolean, equipped?:string[], weight?:number, strength?:number, training?:boolean }) {
  const sick = mood === 'sick' || health < 20;
  const tired = mood === 'tired' || health < 40;
  const chubby = weight > 65;
  const skinny = weight < 30;
  // Muscle levels: 0=none, 1=small, 2=medium, 3=big
  const muscleLevel = strength > 70 ? 3 : strength > 40 ? 2 : strength > 15 ? 1 : 0;
  const hasMuscles = muscleLevel > 0;
  const body = sick ? '#c0c0c0' : health > 60 ? '#FFB3C6' : '#f0c0a0';
  const cheek = sick ? '#b0b0b0' : '#ff8fab';
  // Body scale
  const bodyRx = chubby ? 68 : skinny ? 48 : 55;
  const bodyRy = chubby ? 58 : skinny ? 44 : 50;
  const headRx = chubby ? 52 : skinny ? 40 : 45;
  const headRy = chubby ? 48 : skinny ? 38 : 42;
  const bellyRx = chubby ? 42 : skinny ? 24 : 32;
  const bellyRy = chubby ? 34 : skinny ? 20 : 26;
  const cheekRx = chubby ? 14 : 10;
  const cheekRy = chubby ? 10 : 7;
  // Arm sizes grow with muscle level
  const armW = [0, 10, 14, 18][muscleLevel];
  const bicepR = [0, 10, 14, 18][muscleLevel];
  const forearmW = [0, 7, 10, 13][muscleLevel];
  const [tapAnim, setTapAnim] = useState(false);
  const [tapEmoji, setTapEmoji] = useState('💕');
  const [hearts, setHearts] = useState<{id:number, emoji:string, x:number}[]>([]);
  const tapCooldown = useRef(false);
  function handleTap() {
    if (tapCooldown.current) return;
    tapCooldown.current = true;
    setTimeout(() => { tapCooldown.current = false; }, 400);
    playSfx('tap');
    // Different reaction based on state
    let emoji = '💕';
    if (sleeping) { emoji = '💤'; }
    else if (sick) { emoji = '🤒'; }
    else if (tired) { emoji = '😴'; }
    else {
      const options = ['💕','⭐','✨','💖','🌟','😻'];
      emoji = options[Math.floor(Math.random() * options.length)];
    }
    setTapAnim(true);
    const id = Date.now();
    const x = 30 + Math.random() * 100; // random horizontal position
    setHearts(h => [...h, { id, emoji, x }]);
    setTimeout(() => setTapAnim(false), 600);
    setTimeout(() => setHearts(h => h.filter(p => p.id !== id)), 1000);
  }
  return (
    <div
      style={{ position: 'relative', width: 160, height: 160, cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none' } as any}
      onPointerDown={e => { e.preventDefault(); handleTap(); }}
    >
      {hearts.map(({ id, emoji, x }) => (
        <div key={id} style={{ position:'absolute', top:-10, left: x, fontSize:22, animation:'heartFloat 0.9s ease-out forwards', pointerEvents:'none', zIndex:10 }}>{emoji}</div>
      ))}
      {!sick && (
        <div
          style={{
            position: 'absolute',
            inset: -10,
            borderRadius: '50%',
            background: `radial-gradient(circle,${body}44 0%,transparent 70%)`,
            animation: feedAnim ? 'none' : 'pulse 2s ease-in-out infinite',
          }}
        />
      )}
      <svg
        viewBox="0 0 160 160"
        width="160"
        height="160"
        style={{
          filter: sick ? 'saturate(0.3)' : 'none',
          transition: 'filter 0.5s',
          animation: feedAnim
            ? 'bounce 0.4s ease'
            : tapAnim
            ? 'tapBounce 0.6s cubic-bezier(.34,1.56,.64,1)'
            : sleeping
            ? 'none'
            : 'float 3s ease-in-out infinite',
        }}
      >
        {/* ── MUSCLE ARMS (behind body) ── */}
        {hasMuscles && (
          <>
            {/* Left arm — upper arm + bicep + fist */}
            <rect x={80 - bodyRx - armW * 1.8} y="88" width={armW} height={armW * 2.2} rx={armW / 2} fill={body} />
            <ellipse cx={80 - bodyRx - armW * 1.3} cy="86" rx={bicepR} ry={bicepR * 0.85} fill={body} />
            <rect x={80 - bodyRx - armW * 1.8} y={88 + armW * 2} width={forearmW} height={armW * 1.6} rx={forearmW / 2} fill={body} />
            {/* Left fist — round paw */}
            <ellipse cx={80 - bodyRx - armW * 1.4} cy={88 + armW * 3.8} rx={forearmW * 0.9} ry={forearmW * 0.75} fill={body} />
            {/* Right arm — mirrored */}
            <rect x={80 + bodyRx + armW * 0.8} y="88" width={armW} height={armW * 2.2} rx={armW / 2} fill={body} />
            <ellipse cx={80 + bodyRx + armW * 1.3} cy="86" rx={bicepR} ry={bicepR * 0.85} fill={body} />
            <rect x={80 + bodyRx + armW * 0.8} y={88 + armW * 2} width={forearmW} height={armW * 1.6} rx={forearmW / 2} fill={body} />
            {/* Right fist */}
            <ellipse cx={80 + bodyRx + armW * 1.4} cy={88 + armW * 3.8} rx={forearmW * 0.9} ry={forearmW * 0.75} fill={body} />
            {/* Muscle line on bicep — cute detail */}
            {muscleLevel >= 2 && <>
              <path d={`M${80 - bodyRx - armW * 1.7} 90 Q${80 - bodyRx - armW * 0.9} 84 ${80 - bodyRx - armW * 0.2} 90`} stroke="#e8759a" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6"/>
              <path d={`M${80 + bodyRx + armW * 0.3} 90 Q${80 + bodyRx + armW * 1.1} 84 ${80 + bodyRx + armW * 1.8} 90`} stroke="#e8759a" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6"/>
            </>}
          </>
        )}
        <ellipse cx="40" cy="38" rx="18" ry="22" fill={body} />
        <ellipse cx="120" cy="38" rx="18" ry="22" fill={body} />
        <ellipse cx="40" cy="38" rx="10" ry="14" fill="#ffccd5" />
        <ellipse cx="120" cy="38" rx="10" ry="14" fill="#ffccd5" />
        <ellipse cx="80" cy="100" rx={bodyRx} ry={bodyRy} fill={body} />
        <ellipse cx="80" cy="108" rx={bellyRx} ry={bellyRy} fill="#ffe4ec" />
        <ellipse cx="80" cy="75" rx={headRx} ry={headRy} fill={body} />
        {sleeping ? (
          <>
            <path
              d="M58 72 Q65 68 72 72"
              stroke="#555"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M88 72 Q95 68 102 72"
              stroke="#555"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          </>
        ) : sick ? (
          <>
            <ellipse cx="65" cy="72" rx="7" ry="6" fill="#555" />
            <ellipse cx="95" cy="72" rx="7" ry="6" fill="#555" />
            <ellipse cx="63" cy="70" rx="3" ry="2" fill="white" />
            <ellipse cx="93" cy="70" rx="3" ry="2" fill="white" />
            <path
              d="M57 62 Q65 66 73 62"
              stroke="#555"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M87 62 Q95 66 103 62"
              stroke="#555"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
          </>
        ) : tired ? (
          <>
            <ellipse cx="65" cy="73" rx="7" ry="5" fill="#555" />
            <ellipse cx="95" cy="73" rx="7" ry="5" fill="#555" />
            <ellipse cx="63" cy="71" rx="3" ry="2" fill="white" />
            <ellipse cx="93" cy="71" rx="3" ry="2" fill="white" />
            <rect x="58" y="68" width="14" height="5" rx="2" fill={body} />
            <rect x="88" y="68" width="14" height="5" rx="2" fill={body} />
          </>
        ) : (
          <>
            <ellipse cx="65" cy="72" rx="8" ry="8" fill="#333" />
            <ellipse cx="95" cy="72" rx="8" ry="8" fill="#333" />
            <ellipse cx="62" cy="69" rx="3" ry="3" fill="white" />
            <ellipse cx="92" cy="69" rx="3" ry="3" fill="white" />
            <ellipse cx="68" cy="75" rx="2" ry="2" fill="white" />
            <ellipse cx="98" cy="75" rx="2" ry="2" fill="white" />
          </>
        )}
        {!sick && !sleeping && (
          <>
            <ellipse
              cx="50"
              cy="84"
              rx={cheekRx}
              ry={cheekRy}
              fill={cheek}
              opacity="0.5"
            />
            <ellipse
              cx="110"
              cy="84"
              rx={cheekRx}
              ry={cheekRy}
              fill={cheek}
              opacity="0.5"
            />
          </>
        )}
        {feedAnim ? (
          <ellipse cx="80" cy="92" rx="12" ry="10" fill="#333" />
        ) : sick ? (
          <path
            d="M68 95 Q80 90 92 95"
            stroke="#555"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        ) : sleeping ? (
          <path
            d="M72 92 Q80 95 88 92"
            stroke="#888"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M68 92 Q80 100 92 92"
            stroke="#555"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        )}
        <ellipse cx="80" cy="85" rx="5" ry="3" fill="#e8759a" />
        <path
          d="M128 115 Q155 95 148 75 Q142 60 130 70"
          stroke={body}
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          style={{
            animation: sleeping ? 'none' : 'wag 1.5s ease-in-out infinite',
          }}
        />
        {/* Sweat drops when training */}
        {training && <>
          <ellipse cx="22" cy="55" rx="4" ry="6" fill="#7ed4f7" opacity="0.8"/>
          <ellipse cx="18" cy="70" rx="3" ry="4.5" fill="#7ed4f7" opacity="0.6"/>
          <ellipse cx="138" cy="50" rx="3.5" ry="5.5" fill="#7ed4f7" opacity="0.7"/>
          <ellipse cx="142" cy="65" rx="2.5" ry="4" fill="#7ed4f7" opacity="0.5"/>
        </>}
        {/* ── SVG ACCESSORIES ── */}
        {equipped.includes('hat_star') && <>
          <ellipse cx="80" cy="32" rx="28" ry="8" fill="#4a90d9" opacity="0.9"/>
          <polygon points="80,0 88,24 72,24" fill="#FFD700"/>
          <polygon points="65,10 70,28 60,28" fill="#FFD700"/>
          <polygon points="95,10 100,28 90,28" fill="#FFD700"/>
        </>}
        {equipped.includes('hat_crown') && <>
          <ellipse cx="80" cy="35" rx="30" ry="7" fill="#8B4513"/>
          <rect x="52" y="10" width="56" height="26" rx="4" fill="#DAA520"/>
          <polygon points="52,10 62,0 72,10" fill="#DAA520"/>
          <polygon points="74,10 80,0 86,10" fill="#DAA520"/>
          <polygon points="96,10 106,0 116,10" fill="#DAA520"/>
          <ellipse cx="62" cy="16" rx="4" ry="4" fill="#ff4444"/>
          <ellipse cx="80" cy="14" rx="4" ry="4" fill="#44aaff"/>
          <ellipse cx="98" cy="16" rx="4" ry="4" fill="#44ff44"/>
        </>}
        {equipped.includes('hat_party') && <>
          <ellipse cx="80" cy="35" rx="26" ry="7" fill="#FF6B9D" opacity="0.8"/>
          <polygon points="80,2 96,36 64,36" fill="#FF6B9D"/>
          <polygon points="80,2 90,36 70,36" fill="#A855F7"/>
          <circle cx="80" cy="2" r="4" fill="#FFD700"/>
          <circle cx="68" cy="15" r="2" fill="#FFD700"/>
          <circle cx="92" cy="15" r="2" fill="#FFD700"/>
          <circle cx="75" cy="25" r="2" fill="white"/>
          <circle cx="85" cy="20" r="2" fill="white"/>
        </>}
        {equipped.includes('hat_wizard') && <>
          <ellipse cx="80" cy="36" rx="30" ry="8" fill="#4a0080" opacity="0.9"/>
          <polygon points="80,0 98,38 62,38" fill="#6600cc"/>
          <ellipse cx="72" cy="20" rx="4" ry="4" fill="#FFD700" opacity="0.7"/>
          <ellipse cx="85" cy="28" rx="3" ry="3" fill="#FFD700" opacity="0.7"/>
          <text x="76" y="26" fontSize="10" fill="#FFD700">✦</text>
        </>}
        {equipped.includes('glasses_cool') && <>
          <rect x="50" y="67" width="22" height="14" rx="7" fill="#1a1a1a" opacity="0.85"/>
          <rect x="88" y="67" width="22" height="14" rx="7" fill="#1a1a1a" opacity="0.85"/>
          <line x1="72" y1="74" x2="88" y2="74" stroke="#1a1a1a" strokeWidth="2.5"/>
          <line x1="38" y1="74" x2="50" y2="74" stroke="#1a1a1a" strokeWidth="2"/>
          <line x1="110" y1="74" x2="122" y2="74" stroke="#1a1a1a" strokeWidth="2"/>
          <ellipse cx="61" cy="74" rx="8" ry="5" fill="#3399ff" opacity="0.4"/>
          <ellipse cx="99" cy="74" rx="8" ry="5" fill="#3399ff" opacity="0.4"/>
        </>}
        {equipped.includes('glasses_heart') && <>
          <path d="M50 74 Q50 66 58 66 Q65 66 65 72 Q65 66 72 66 Q80 66 80 74 Q80 82 65 88 Q50 82 50 74 Z" fill="#ff6699" opacity="0.85"/>
          <path d="M88 74 Q88 66 96 66 Q103 66 103 72 Q103 66 110 66 Q118 66 118 74 Q118 82 103 88 Q88 82 88 74 Z" fill="#ff6699" opacity="0.85"/>
          <line x1="80" y1="74" x2="88" y2="74" stroke="#ff6699" strokeWidth="2.5"/>
          <line x1="38" y1="74" x2="50" y2="74" stroke="#ff6699" strokeWidth="2"/>
          <line x1="118" y1="74" x2="130" y2="74" stroke="#ff6699" strokeWidth="2"/>
        </>}
        {equipped.includes('cape_hero') && <>
          <path d="M30 100 Q20 130 35 150 Q80 160 125 150 Q140 130 130 100" fill="#cc0000" opacity="0.85"/>
          <path d="M30 100 Q50 120 80 115 Q110 120 130 100" fill="#ff3333" opacity="0.6"/>
          <text x="68" y="138" fontSize="18" fill="#FFD700">★</text>
        </>}
        {equipped.includes('cape_rainbow') && <>
          <path d="M30 100 Q20 135 35 155 Q80 165 125 155 Q140 135 130 100" fill="url(#rainbowGrad)" opacity="0.8"/>
          <defs><linearGradient id="rainbowGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#ff0000"/><stop offset="25%" stopColor="#ffff00"/><stop offset="50%" stopColor="#00ff00"/><stop offset="75%" stopColor="#0000ff"/><stop offset="100%" stopColor="#ff00ff"/></linearGradient></defs>
        </>}
        {equipped.includes('badge_fire') && <>
          <circle cx="118" cy="105" r="12" fill="#ff6600"/>
          <text x="111" y="110" fontSize="14">🔥</text>
        </>}
        {equipped.includes('badge_moon') && <>
          <circle cx="118" cy="105" r="12" fill="#1a1a3e"/>
          <path d="M113 100 Q110 106 113 112 Q120 115 125 110 Q118 112 116 106 Q118 100 113 100 Z" fill="#FFD700"/>
          <circle cx="122" cy="102" r="1.5" fill="white"/>
          <circle cx="120" cy="108" r="1" fill="white"/>
        </>}
        {equipped.includes('hat_chef') && <>
          <ellipse cx="80" cy="36" rx="28" ry="7" fill="#ddd" opacity="0.95"/>
          <ellipse cx="80" cy="22" rx="20" ry="18" fill="white" opacity="0.95"/>
          <ellipse cx="63" cy="28" rx="10" ry="14" fill="white" opacity="0.9"/>
          <ellipse cx="97" cy="28" rx="10" ry="14" fill="white" opacity="0.9"/>
          <line x1="66" y1="30" x2="66" y2="38" stroke="#ddd" strokeWidth="1.5"/>
          <line x1="94" y1="30" x2="94" y2="38" stroke="#ddd" strokeWidth="1.5"/>
        </>}
        {equipped.includes('hat_santa') && <>
          <ellipse cx="80" cy="37" rx="30" ry="7" fill="white" opacity="0.95"/>
          <polygon points="80,2 100,38 60,38" fill="#cc0000"/>
          <circle cx="80" cy="2" r="6" fill="white"/>
          <ellipse cx="80" cy="37" rx="30" ry="7" fill="white" opacity="0.9"/>
        </>}
        {equipped.includes('glasses_star') && <>
          <path d="M61,68 L57,62 L53,68 L59,72 L53,76 L57,82 L61,76 L65,82 L69,76 L63,72 L69,68 L65,62 Z" fill="#FFD700" opacity="0.9"/>
          <path d="M99,68 L95,62 L91,68 L97,72 L91,76 L95,82 L99,76 L103,82 L107,76 L101,72 L107,68 L103,62 Z" fill="#FFD700" opacity="0.9"/>
          <line x1="69" y1="72" x2="91" y2="72" stroke="#FFD700" strokeWidth="2.5"/>
          <line x1="38" y1="72" x2="53" y2="72" stroke="#FFD700" strokeWidth="2"/>
          <line x1="107" y1="72" x2="122" y2="72" stroke="#FFD700" strokeWidth="2"/>
        </>}
        {equipped.includes('glasses_3d') && <>
          <rect x="48" y="66" width="24" height="15" rx="4" fill="#cc0000" opacity="0.85"/>
          <rect x="88" y="66" width="24" height="15" rx="4" fill="#0044cc" opacity="0.85"/>
          <line x1="72" y1="73" x2="88" y2="73" stroke="#555" strokeWidth="2.5"/>
          <line x1="36" y1="73" x2="48" y2="73" stroke="#555" strokeWidth="2"/>
          <line x1="112" y1="73" x2="124" y2="73" stroke="#555" strokeWidth="2"/>
        </>}
        {equipped.includes('cape_space') && <>
          <path d="M30 100 Q20 135 35 155 Q80 165 125 155 Q140 135 130 100" fill="#0d0d2b" opacity="0.9"/>
          <circle cx="55" cy="125" r="2" fill="white" opacity="0.8"/>
          <circle cx="80" cy="118" r="1.5" fill="white" opacity="0.7"/>
          <circle cx="105" cy="130" r="2" fill="white" opacity="0.8"/>
          <circle cx="68" cy="145" r="1.5" fill="white" opacity="0.6"/>
          <circle cx="95" cy="142" r="2" fill="white" opacity="0.7"/>
          <circle cx="45" cy="142" r="1" fill="#FFD700" opacity="0.9"/>
          <circle cx="115" cy="118" r="1" fill="#FFD700" opacity="0.9"/>
          <text x="68" y="138" fontSize="14" fill="#aad4ff">🚀</text>
        </>}
        {equipped.includes('badge_shield') && <>
          <path d="M106 95 L130 102 L130 118 Q130 128 118 133 L106 137 L94 133 Q82 128 82 118 L82 102 Z" fill="#3a86ff" opacity="0.9"/>
          <path d="M106 100 L124 106 L124 119 Q124 126 114 130 L106 133 L98 130 Q88 126 88 119 L88 106 Z" fill="#5ba4ff" opacity="0.7"/>
          <text x="99" y="122" fontSize="14" fill="white">★</text>
        </>}
        {equipped.includes('badge_leaf') && <>
          <circle cx="25" cy="105" r="13" fill="#2d6a2d" opacity="0.9"/>
          <path d="M18 105 Q25 92 32 105 Q25 118 18 105 Z" fill="#4caf50"/>
          <line x1="25" y1="105" x2="25" y2="115" stroke="#2d6a2d" strokeWidth="2"/>
        </>}
        {equipped.includes('hat_flower') && <>
          <ellipse cx="80" cy="36" rx="28" ry="7" fill="#ffb347" opacity="0.85"/>
          <circle cx="80" cy="20" r="8" fill="#FFD700"/>
          <ellipse cx="68" cy="14" rx="7" ry="5" fill="#FF6B9D" opacity="0.9" transform="rotate(-30 68 14)"/>
          <ellipse cx="92" cy="14" rx="7" ry="5" fill="#FF6B9D" opacity="0.9" transform="rotate(30 92 14)"/>
          <ellipse cx="62" cy="24" rx="7" ry="5" fill="#a855f7" opacity="0.9" transform="rotate(-60 62 24)"/>
          <ellipse cx="98" cy="24" rx="7" ry="5" fill="#a855f7" opacity="0.9" transform="rotate(60 98 24)"/>
          <circle cx="80" cy="20" r="4" fill="#ff9f00"/>
        </>}
      </svg>
      {sleeping && (
        <div style={{ position: 'absolute', top: 0, right: -10 }}>
          {['Z', 'z', 'Z'].map((z, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: i * -18,
                right: i * -10,
                fontSize: 20 - i * 4,
                color: '#7ec8e3',
                fontWeight: 'bold',
                fontFamily: 'Georgia,serif',
                animation: `zzz ${1.5 + i * 0.3}s ease-in-out infinite`,
                animationDelay: `${i * 0.4}s`,
                opacity: 0,
              }}
            >
              {z}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── STAT BAR ─────────────────────────────────────────────────────────────────
function StatBar({ label, value, icon, color, invertColor = false }: { label:string, value:number, icon:string, color:string, invertColor?:boolean }) {
  const pct = Math.round(Math.max(0, Math.min(100, value)));
  const isLow = pct < 25;
  const isMid = pct >= 25 && pct < 50;
  const barColor = isLow ? '#e74c3c' : isMid ? '#f39c12' : color;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4, fontWeight:600, color:'#555' }}>
        <span>{icon} {label}</span>
        <span style={{ color: barColor, fontWeight: 800 }}>
          {pct}%
          {isLow && <span style={{ marginLeft:4, animation:'pulse 1s ease-in-out infinite' }}>⚠️</span>}
        </span>
      </div>
      <div style={{ height:14, background:'#eee', borderRadius:99, overflow:'hidden' }}>
        <div style={{
          height:'100%',
          width:`${pct}%`,
          background: isLow
            ? 'linear-gradient(90deg,#c0392b,#e74c3c)'
            : isMid
            ? 'linear-gradient(90deg,#e67e22,#f39c12)'
            : `linear-gradient(90deg,${color}cc,${color})`,
          borderRadius:99,
          transition:'width 0.8s cubic-bezier(.34,1.56,.64,1), background 0.5s',
        }}/>
      </div>
    </div>
  );
}

// ─── NUTRI BADGE ──────────────────────────────────────────────────────────────
function NutriScoreBadge({ score, size = 'large' }) {
  const letters = ['a', 'b', 'c', 'd', 'e'];
  const idx = letters.indexOf((score || '').toLowerCase());
  return (
    <div
      style={{
        display: 'flex',
        gap: size === 'large' ? 8 : 4,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {letters.map((l, i) => {
        const c = NC[l];
        const active = i === idx;
        return (
          <div
            key={l}
            style={{
              width: size === 'large' ? 44 : 26,
              height: size === 'large' ? 52 : 30,
              borderRadius: size === 'large' ? 10 : 6,
              background: active ? c.color : '#ddd',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: size === 'large' ? 22 : 12,
              color: active ? 'white' : '#aaa',
              transform: active ? 'scale(1.25)' : 'scale(1)',
              transition: 'all 0.3s cubic-bezier(.34,1.56,.64,1)',
              boxShadow: active ? `0 4px 12px ${c.color}88` : 'none',
            }}
          >
            {l.toUpperCase()}
          </div>
        );
      })}
    </div>
  );
}

// ─── CAMERA SCANNER ───────────────────────────────────────────────────────────
// Strategy: try BarcodeDetector (native, works great on Android Chrome) first.
// If not supported, fall back to QuaggaJS (works on iOS Safari).
function CameraScanner({ onDetected, onClose }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading'|'live'|'detected'|'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [mode, setMode] = useState<'native'|'quagga'|null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const streamRef = useRef<MediaStream|null>(null);
  const trackRef = useRef<MediaStreamTrack|null>(null);
  const rafRef = useRef<number>(0);
  const quaggaStarted = useRef(false);
  const lastCode = useRef('');
  const codeCount = useRef(0);
  const detectedRef = useRef(false);

  function fireDetected(code: string) {
    if (detectedRef.current) return;
    detectedRef.current = true;
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    try {
      const actx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.connect(gain); gain.connect(actx.destination);
      osc.frequency.setValueAtTime(1200, actx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, actx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, actx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.25);
      osc.start(); osc.stop(actx.currentTime + 0.25);
    } catch {}
    setStatus('detected');
    setTimeout(() => onDetected(code), 450);
  }

  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const newVal = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: newVal } as any] });
      setTorchOn(newVal);
    } catch {
      // Some devices need the constraint at stream level
      try {
        const stream = streamRef.current;
        if (stream) {
          const t = stream.getVideoTracks()[0];
          await t.applyConstraints({ advanced: [{ torch: newVal } as any] });
          setTorchOn(newVal);
        }
      } catch {}
    }
  }

  function validateEAN(code: string): boolean {
    if (code.length !== 13 && code.length !== 8) return true; // non-EAN, accept
    const digits = code.split('').map(Number);
    if (code.length === 13) {
      const sum = digits.slice(0,12).reduce((s,d,i) => s + d*(i%2===0?1:3), 0);
      return (10-(sum%10))%10 === digits[12];
    }
    // EAN-8
    const sum = digits.slice(0,7).reduce((s,d,i) => s + d*(i%2===0?3:1), 0);
    return (10-(sum%10))%10 === digits[7];
  }

  function confirmCode(code: string) {
    if (!code || code.length < 8) return;
    // EAN checksum is the quality gate — if it passes, the read is reliable
    if (!validateEAN(code)) return;
    // For native BarcodeDetector: single confirmed read is enough (high accuracy)
    // For Quagga on iPhone: require 2 consecutive same-code reads to reduce false positives
    if (mode === 'native') {
      fireDetected(code);
      return;
    }
    if (code === lastCode.current) { codeCount.current++; }
    else { lastCode.current = code; codeCount.current = 1; }
    if (codeCount.current >= 2) fireDetected(code);
  }

  // ── Native BarcodeDetector (Android Chrome, Samsung Internet, etc.) ──
  async function startNative() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus('live');
      setMode('native');
      // Save track ref and check torch support
      const track = stream.getVideoTracks()[0];
      if (track) {
        trackRef.current = track;
        // Check torch support with multiple fallbacks
        setTimeout(async () => {
          try {
            // Method 1: getCapabilities
            const caps = (track.getCapabilities as any)?.() as any;
            if (caps?.torch) { setTorchAvailable(true); return; }
          } catch {}
          try {
            // Method 2: try applying torch constraint — if it doesn't throw, it's supported
            await track.applyConstraints({ advanced: [{ torch: false } as any] });
            setTorchAvailable(true);
          } catch {}
        }, 500);
      }
      const detector = new (window as any).BarcodeDetector({
        formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code']
      });
      async function scan() {
        if (detectedRef.current || !videoRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) confirmCode(barcodes[0].rawValue);
        } catch {}
        rafRef.current = requestAnimationFrame(scan);
      }
      // Small delay to let video stabilize
      setTimeout(() => { rafRef.current = requestAnimationFrame(scan); }, 500);
    } catch {
      // Native failed (no permission or not supported) - try Quagga
      startQuagga();
    }
  }

  // ── QuaggaJS fallback (iOS Safari, Firefox) ──
  function startQuagga() {
    setMode('quagga');
    function init() {
      const Q = (window as any).Quagga;
      if (!Q || !containerRef.current || quaggaStarted.current) return;
      quaggaStarted.current = true;
      Q.init({
        inputStream: {
          name: 'Live', type: 'LiveStream', target: containerRef.current,
          constraints: {
            facingMode: 'environment',
            // Resolución moderada — iPhone Safari se atraganta con resoluciones altas en Quagga
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 },
          },
          // Sin área recortada — analiza toda la imagen para máxima tolerancia
          // El recuadro visual es solo orientativo, no restringe el análisis
        },
        locator: {
          patchSize: 'medium',  // 'medium' es más rápido que 'large' en CPU limitada
          halfSample: true,     // true = más rápido, suficiente para EAN en buenas condiciones
        },
        numOfWorkers: 0,
        frequency: 8,           // reducir a 8fps — iPhone Safari no aguanta 10 bien
        decoder: {
          readers: [
            'ean_reader',       // EAN-13 (supermercado europeo) — prioridad máxima
            'ean_8_reader',     // EAN-8
            'upc_reader',       // UPC-A (productos americanos)
            'upc_e_reader',     // UPC-E
          ],
          // Sin code_128 ni code_39 — añaden falsos positivos en etiquetas
        },
        locate: true,
      }, (err: any) => {
        if (err) { setStatus('error'); setErrMsg('No se pudo acceder a la cámara. Permite el acceso en Ajustes → Safari → Cámara.'); return; }
        Q.start(); setStatus('live');
        // In Quagga mode, get the active video track via the video element
        setTimeout(() => {
          try {
            const videoEl = containerRef.current?.querySelector('video') as HTMLVideoElement;
            if (videoEl?.srcObject) {
              const stream = videoEl.srcObject as MediaStream;
              const track = stream.getVideoTracks()[0];
              if (track) {
                trackRef.current = track;
                setTimeout(async () => {
                  try {
                    const caps = (track.getCapabilities as any)?.() as any;
                    if (caps?.torch) { setTorchAvailable(true); return; }
                  } catch {}
                  try {
                    await track.applyConstraints({ advanced: [{ torch: false } as any] });
                    setTorchAvailable(true);
                  } catch {}
                }, 500);
              }
            }
          } catch {}
        }, 800);
      });
      Q.onDetected((result: any) => { confirmCode(result?.codeResult?.code); });
    }
    if ((window as any).Quagga) { init(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js';
    s.onload = init;
    s.onerror = () => { setStatus('error'); setErrMsg('No se pudo cargar el escáner. Comprueba tu conexión.'); };
    document.head.appendChild(s);
  }

  useEffect(() => {
    // Use native BarcodeDetector if available, else Quagga
    if (typeof (window as any).BarcodeDetector !== 'undefined') {
      (window as any).BarcodeDetector.getSupportedFormats().then((fmts: string[]) => {
        if (fmts.includes('ean_13') || fmts.includes('code_128')) startNative();
        else startQuagga();
      }).catch(() => startNative());
    } else {
      startQuagga();
    }
    return () => {
      detectedRef.current = true; // stop scan loop
      cancelAnimationFrame(rafRef.current);
      // Turn off torch before stopping
      if (trackRef.current) {
        try { trackRef.current.applyConstraints({ advanced: [{ torch: false } as any] }); } catch {}
        trackRef.current = null;
      }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (quaggaStarted.current && (window as any).Quagga) {
        try { (window as any).Quagga.stop(); } catch {}
        quaggaStarted.current = false;
      }
    };
  }, []);

  function handleClose() {
    detectedRef.current = true;
    cancelAnimationFrame(rafRef.current);
    if (trackRef.current) {
      try { trackRef.current.applyConstraints({ advanced: [{ torch: false } as any] }); } catch {}
      trackRef.current = null;
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (quaggaStarted.current && (window as any).Quagga) {
      try { (window as any).Quagga.stop(); } catch {}
    }
    onClose();
  }

  const isLive = status === 'live' || status === 'detected';

  return (
    <div style={{ position:'fixed', inset:0, background:'#000', zIndex:200, display:'flex', flexDirection:'column' }}>
      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>

        {/* Native mode: our own <video> */}
        {mode === 'native' && (
          <video ref={videoRef} playsInline muted autoPlay
            style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/>
        )}

        {/* Quagga mode: it mounts its own video inside containerRef */}
        <div ref={containerRef} id="quagga-container"
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', display: mode==='quagga' ? 'block' : 'none' }}/>
        <style>{`
          #quagga-container video { position:absolute!important; top:0; left:0; width:100%!important; height:100%!important; object-fit:cover; }
          #quagga-container canvas.drawingBuffer { display:none; }
        `}</style>

        {/* Green flash on detection */}
        {status === 'detected' && (
          <div style={{ position:'absolute', inset:0, background:'rgba(40,220,100,0.4)', zIndex:10,
            display:'flex', alignItems:'center', justifyContent:'center', animation:'flashGreen 0.45s ease' }}>
            <div style={{ fontSize:80 }}>✅</div>
          </div>
        )}

        {/* Aiming box */}
        {isLive && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
            <div style={{ position:'relative', width:'84%', height:130,
              border: `3px solid ${status==='detected'?'#28dc64':'#FF6B9D'}`,
              borderRadius:14, boxShadow:'0 0 0 9999px rgba(0,0,0,0.52)', transition:'border-color 0.2s' }}>
              {([{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}] as any[]).map((s,i) => (
                <div key={i} style={{ position:'absolute', width:24, height:24, ...s,
                  borderTop: (i<2)?`4px solid #FF6B9D`:undefined,
                  borderBottom: (i>=2)?`4px solid #FF6B9D`:undefined,
                  borderLeft: (i%2===0)?`4px solid #FF6B9D`:undefined,
                  borderRight: (i%2===1)?`4px solid #FF6B9D`:undefined }}/>
              ))}
              {status === 'live' && (
                <div style={{ position:'absolute', left:6, right:6, height:2,
                  background:'linear-gradient(90deg,transparent,#FF6B9D,transparent)',
                  top:'50%', animation:'scanLine 1.8s ease-in-out infinite' }}/>
              )}
            </div>
          </div>
        )}

        {/* Loading */}
        {status === 'loading' && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#000' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:44 }}>📷</div>
              <p style={{ color:'#aaa', fontSize:14, marginTop:10 }}>Iniciando cámara...</p>
            </div>
          </div>
        )}

        {/* Top bar */}
        <div style={{ position:'absolute', top:0, left:0, right:0, padding:'16px 20px',
          background:'linear-gradient(to bottom,rgba(0,0,0,0.7),transparent)', pointerEvents:'none' }}>
          <span style={{ color:'white', fontWeight:800, fontSize:15 }}>
            {status==='live' ? '🔍 Buscando código...' : status==='loading' ? '⏳ Cargando...' : status==='detected' ? '✅ ¡Detectado!' : '❌ Error'}
          </span>
          {mode && <span style={{ color:'rgba(255,255,255,0.4)', fontSize:10, marginLeft:8 }}>({mode})</span>}
        </div>

        {/* Hint */}
        {status === 'live' && (
          <div style={{ position:'absolute', bottom:16, left:20, right:20, textAlign:'center', pointerEvents:'none' }}>
            <p style={{ color:'rgba(255,255,255,0.85)', fontSize:13, margin:0, textShadow:'0 1px 4px rgba(0,0,0,0.9)', fontWeight:600 }}>
              Acerca el código · mantén el móvil quieto
            </p>
            <p style={{ color:'rgba(255,255,255,0.5)', fontSize:11, margin:'4px 0 0', textShadow:'0 1px 4px rgba(0,0,0,0.8)' }}>
              Las barras deben ocupar el ancho del recuadro
            </p>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ background:'#111', padding:'18px 24px 36px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        {status === 'error' ? (
          <div style={{ width:'100%', textAlign:'center' }}>
            <p style={{ color:'#ff6b6b', fontSize:13, margin:'0 0 12px', lineHeight:1.5 }}>{errMsg}</p>
            <button onClick={handleClose} style={{ padding:'12px 28px', borderRadius:16, border:'none', background:'#FF6B9D', color:'white', fontWeight:800, cursor:'pointer' }}>Cerrar</button>
          </div>
        ) : (
          <>
            <p style={{ color:'#555', fontSize:12, margin:0, flex:1 }}>Detección automática</p>
            {torchAvailable && (
              <button onClick={toggleTorch} style={{
                width:44, height:44, borderRadius:'50%', border:'2px solid #333',
                background: torchOn ? '#FFD700' : 'transparent',
                color: torchOn ? '#333' : '#aaa', fontSize:20, cursor:'pointer',
                marginRight:10, transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center'
              }}>🔦</button>
            )}
            <button onClick={handleClose} style={{ padding:'12px 20px', borderRadius:16, border:'2px solid #333', background:'transparent', color:'#aaa', fontWeight:700, cursor:'pointer', fontSize:14 }}>Cancelar</button>
          </>
        )}
      </div>

      <style>{`
        @keyframes scanLine { 0%,100%{transform:translateY(-50px);opacity:0.3} 50%{transform:translateY(50px);opacity:1} }
        @keyframes flashGreen { 0%{opacity:0} 30%{opacity:1} 100%{opacity:0} }
      `}</style>
    </div>
  );
}

// ─── SCANNER PANEL ────────────────────────────────────────────────────────────
function ScannerPanel({ onClose, onProduct }) {
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  async function fetchProduct(code) {
    setLoading(true);
    setError('');
    const endpoints = [
      `https://world.openfoodfacts.net/api/v2/product/${code}?fields=product_name,product_name_es,brands,nutrition_grades,nutriscore_grade,image_thumb_url`,
      `https://corsproxy.io/?${encodeURIComponent(
        `https://world.openfoodfacts.org/api/v0/product/${code}.json`
      )}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(
        `https://world.openfoodfacts.org/api/v0/product/${code}.json`
      )}`,
    ];
    for (const url of endpoints) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const p = data.product;
        if (p) {
          onProduct({
            name: p.product_name_es || p.product_name || 'Producto desconocido',
            brand: p.brands || '',
            score: p.nutrition_grades || p.nutriscore_grade || null,
            image: p.image_thumb_url || null,
            barcode: code,
          });
          setLoading(false);
          return;
        }
      } catch {
        continue;
      }
    }
    setError(`Producto no encontrado (${code}).`);
    setLoading(false);
  }

  const demos = [
    { label: '🥤 Coca-Cola Zero', code: '5449000131843' },
    { label: '🍫 Nutella', code: '3017620422003' },
    { label: '🥛 Leche Pascual', code: '8410036030084' },
    { label: '🍪 Oreo', code: '7622210449283' },
  ];

  return (
    <>
      {camera && (
        <CameraScanner
          onDetected={(c) => {
            setCamera(false);
            setBarcode(c);
            fetchProduct(c);
          }}
          onClose={() => setCamera(false)}
        />
      )}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: 20,
        }}
      >
        <div
          style={{
            background: 'white',
            borderRadius: 28,
            padding: 28,
            width: '100%',
            maxWidth: 380,
            boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
            animation: 'slideUp 0.3s cubic-bezier(.34,1.56,.64,1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                color: '#333',
              }}
            >
              🛒 Alimentar
            </h2>
            <button
              onClick={onClose}
              style={{
                background: '#f0f0f0',
                border: 'none',
                borderRadius: '50%',
                width: 36,
                height: 36,
                cursor: 'pointer',
                fontSize: 18,
              }}
            >
              ✕
            </button>
          </div>
          <button
            onClick={() => setCamera(true)}
            style={{
              width: '100%',
              padding: '14px 0',
              borderRadius: 16,
              border: 'none',
              background: 'linear-gradient(135deg,#667eea,#764ba2)',
              color: 'white',
              fontSize: 16,
              fontWeight: 800,
              cursor: 'pointer',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              boxShadow: '0 6px 20px rgba(102,126,234,0.4)',
            }}
          >
            📷 Abrir cámara y escanear
          </button>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div style={{ flex: 1, height: 1, background: '#eee' }} />
            <span style={{ fontSize: 13, color: '#bbb', whiteSpace: 'nowrap' }}>
              o introduce el código
            </span>
            <div style={{ flex: 1, height: 1, background: '#eee' }} />
          </div>
          <div
            style={{ display: 'flex', gap: 8, marginBottom: error ? 8 : 16 }}
          >
            <input
              ref={inputRef}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) =>
                e.key === 'Enter' && barcode.length > 5 && fetchProduct(barcode)
              }
              placeholder="Ej: 5449000131843"
              type="number"
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 12,
                border: '2px solid #e0e0e0',
                fontSize: 16,
                outline: 'none',
                fontFamily: 'monospace',
              }}
            />
            <button
              onClick={() => barcode.length > 5 && fetchProduct(barcode)}
              disabled={loading || barcode.length < 5}
              style={{
                padding: '10px 16px',
                borderRadius: 12,
                border: 'none',
                background: barcode.length > 5 ? '#FF6B9D' : '#ddd',
                color: 'white',
                fontWeight: 700,
                cursor: barcode.length > 5 ? 'pointer' : 'default',
                fontSize: 18,
              }}
            >
              {loading ? '⏳' : '🔍'}
            </button>
          </div>
          {error && (
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#e05' }}>
              {error}
            </p>
          )}
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 13,
              color: '#888',
              fontWeight: 700,
            }}
          >
            🎮 Prueba rápida:
          </p>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
          >
            {demos.map((p) => (
              <button
                key={p.code}
                onClick={() => fetchProduct(p.code)}
                style={{
                  padding: '10px 8px',
                  borderRadius: 12,
                  border: '2px solid #f0e8ff',
                  background: '#faf5ff',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#6b4fa0',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p
            style={{
              margin: '14px 0 0',
              fontSize: 11,
              color: '#bbb',
              textAlign: 'center',
            }}
          >
            Powered by Open Food Facts 🌍
          </p>
        </div>
      </div>
    </>
  );
}

// ─── PRODUCT RESULT ───────────────────────────────────────────────────────────
function ProductResult({ product, onFeed, onCancel }) {
  const cfg = getNC(product.score);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 110,
        padding: 20,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 28,
          padding: 28,
          width: '100%',
          maxWidth: 360,
          boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
          animation: 'slideUp 0.4s cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          {product.image && (
            <img
              src={product.image}
              alt={product.name}
              style={{
                height: 80,
                objectFit: 'contain',
                borderRadius: 12,
                marginBottom: 8,
              }}
            />
          )}
          <h3
            style={{
              margin: '0 0 4px',
              fontSize: 18,
              fontWeight: 800,
              color: '#333',
            }}
          >
            {product.name}
          </h3>
          {product.brand && (
            <p style={{ margin: 0, fontSize: 13, color: '#999' }}>
              {product.brand}
            </p>
          )}
        </div>
        <div
          style={{
            background: cfg.bg,
            borderRadius: 20,
            padding: 20,
            marginBottom: 20,
            textAlign: 'center',
          }}
        >
          <p
            style={{
              margin: '0 0 14px',
              fontSize: 13,
              fontWeight: 600,
              color: '#555',
            }}
          >
            Nutri-Score
          </p>
          <NutriScoreBadge score={product.score} size="large" />
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              justifyContent: 'center',
              gap: 14,
              fontSize: 13,
              fontWeight: 700,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: cfg.healthDelta >= 0 ? '#2d8a4e' : '#e05' }}>
              💖 {cfg.healthDelta >= 0 ? '+' : ''}
              {cfg.healthDelta} salud
            </span>
            <span style={{ color: '#FF9F43' }}>
              🍽️ +{cfg.hungerDelta} hambre
            </span>
            <span style={{ color: cfg.energyDelta >= 0 ? '#A855F7' : '#e05' }}>
              ⚡ {cfg.energyDelta >= 0 ? '+' : ''}
              {cfg.energyDelta} energía
            </span>
          </div>
          <p
            style={{
              margin: '12px 0 0',
              fontSize: 15,
              fontWeight: 700,
              color: cfg.color,
            }}
          >
            {cfg.msg}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 14,
              border: '2px solid #eee',
              background: 'white',
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 700,
              color: '#999',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onFeed(product)}
            style={{
              flex: 2,
              padding: '12px 0',
              borderRadius: 14,
              border: 'none',
              background: `linear-gradient(135deg,${cfg.color},${cfg.color}bb)`,
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 800,
              color: 'white',
              boxShadow: `0 6px 20px ${cfg.color}55`,
            }}
          >
            ¡Dárselo! 🍽️
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
const EMOJIS = [
  '🐱',
  '🐶',
  '🐰',
  '🦊',
  '🐼',
  '🦁',
  '🐨',
  '🐸',
  '🦄',
  '🐺',
  '🐻',
  '🐮',
];
const EMOJI_PWD = ['⭐', '🌈', '🎮', '🍕', '🎵', '🏆', '💎', '🚀', '🌺', '⚡'];

function LoginScreen() {
  const [mode, setMode] = useState('welcome');
  const [username, setUsername] = useState('');
  const [emoji, setEmoji] = useState('🐱');
  const [pwd, setPwd] = useState([]);
  const [step, setStep] = useState(1);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  function addPwd(e) {
    if (pwd.length < 3) setPwd((p) => [...p, e]);
  }
  function reset() {
    setPwd([]);
    setErr('');
  }

  async function doLogin() {
    setErr('');
    setLoading(true);
    if (!username.trim()) {
      setErr('Escribe tu nombre de usuario.');
      setLoading(false);
      return;
    }
    if (pwd.length < 3) {
      setErr('Completa tu contraseña emoji.');
      setLoading(false);
      return;
    }
    try {
      const user = await db.findUser(username.trim());
      if (!user) {
        setErr('Usuario no encontrado. ¿Quieres registrarte?');
        setLoading(false);
        return;
      }
      if (user.password !== pwd.join('')) {
        setErr('Contraseña incorrecta. ¡Inténtalo de nuevo!');
        setLoading(false);
        return;
      }
      // Apply offline time decay
      let pet = await db.getPet(user.id);
      console.log('[LOGIN] Datos de Supabase:', JSON.stringify(pet));
      if (!pet) pet = await db.createPet(user.id);
      const elapsed = Math.min(
        Math.floor((Date.now() - new Date(pet.updated_at).getTime()) / 1000),
        7200
      );
      if (!pet.sleeping) {
        pet.health = Math.max(0, pet.health - elapsed * 0.015);
        pet.hunger = Math.max(0, pet.hunger - elapsed * 0.02);
        pet.energy = Math.max(0, pet.energy - elapsed * 0.012);
      } else {
        pet.energy = Math.min(100, pet.energy + elapsed * 0.025);
        pet.health = Math.min(100, pet.health + elapsed * 0.005);
        pet.hunger = Math.max(0, pet.hunger - elapsed * 0.008);
      }
      localStorage.setItem('nutripet_session', JSON.stringify({ userId: user.id, username: user.username, emoji: user.emoji, savedAt: Date.now() }));

      // Prefer localStorage state if it's newer than Supabase
      let fH = pet.health, fU = pet.hunger, fE = pet.energy;
      let fSleep = pet.sleeping, fMood = pet.mood, fFood = pet.last_food;
      let fTotal = pet.total_feedings, fGood = pet.good_feedings;
      try {
        const rawState = localStorage.getItem('nutripet_state');
        console.log('[LOGIN] nutripet_state en localStorage:', rawState);
        console.log('[LOGIN] userId del usuario:', user.id);
        if (rawState) {
          const ls = JSON.parse(rawState);
          console.log('[LOGIN] userId en localStorage:', ls.userId);
          console.log('[LOGIN] userId coincide:', ls.userId === user.id);
          // Only use localStorage if it belongs to THIS user
          if (ls.userId === user.id) {
            // Use localStorage — it's always more up-to-date than Supabase
            // Apply decay since last save
            const el = Math.min(Math.floor((Date.now() - ls.savedAt) / 1000), 7200);
            console.log('[LOGIN] Segundos desde logout:', el);
            console.log('[LOGIN] Valores en LS — health:', ls.health, 'hunger:', ls.hunger, 'energy:', ls.energy);
            fH = ls.sleeping ? Math.min(100, ls.health + el*0.005) : Math.max(0, ls.health - el*0.015);
            fU = ls.sleeping ? Math.max(0, ls.hunger - el*0.008) : Math.max(0, ls.hunger - el*0.05);
            fE = ls.sleeping ? Math.min(100, ls.energy + el*0.025) : Math.max(0, ls.energy - el*0.03);
            fSleep = ls.sleeping; fMood = ls.mood; fFood = ls.lastFood;
            fTotal = ls.totalFeedings; fGood = ls.goodFeedings;
            console.log('[LOGIN] Valores finales — health:', fH, 'hunger:', fU, 'energy:', fE);
          } else {
            console.warn('[LOGIN] userId no coincide, usando Supabase. LS userId:', ls.userId, 'user.id:', user.id);
          }
        } else {
          console.warn('[LOGIN] No hay nutripet_state en localStorage, usando Supabase');
        }
      } catch {}

      petStore.setState({
        loggedIn: true, userId: user.id, username: user.username, emoji: user.emoji,
        health: fH, hunger: fU, energy: fE, sleeping: fSleep,
        weight: ls?.weight ?? 50,
        strength: ls?.strength ?? 0,
        training: false, // always start not training — also reset module flag
        mood: fMood, lastFood: fFood, totalFeedings: fTotal, goodFeedings: fGood,
        _pendingRestore: false,
      });
      _isTraining = false; // reset training on login
      // Music stays muted until user taps 🔇 button
      _currentUserId = user.id; // enable RLS
      identifyUser(user.id, user.username);
      track('login', { username: user.username });
    } catch (e) {
      setErr('Error de conexión. Comprueba tu internet.');
    }
    setLoading(false);
  }

  async function doRegister() {
    setErr('');
    setLoading(true);
    if (!username.trim()) {
      setErr('Escribe un nombre de usuario.');
      setLoading(false);
      return;
    }
    if (pwd.length < 3) {
      setErr('Crea tu contraseña emoji (3 emojis).');
      setLoading(false);
      return;
    }
    try {
      const user = await db.createUser(username.trim(), pwd.join(''), emoji);
      const pet = await db.createPet(user.id);
      localStorage.setItem('nutripet_session', JSON.stringify({ userId: user.id, username: user.username, emoji: user.emoji, savedAt: Date.now() }));
      petStore.setState({
        loggedIn: true,
        userId: user.id,
        username: user.username,
        emoji: user.emoji,
        health: pet.health,
        hunger: pet.hunger,
        energy: pet.energy,
        sleeping: false,
        mood: 'happy',
        lastFood: null,
        totalFeedings: 0,
        goodFeedings: 0,
        _pendingRestore: false,
      });
    } catch (e) {
      if (e.message === 'USERNAME_TAKEN')
        setErr('Ese nombre ya existe. ¡Elige otro!');
      else setErr('Error al crear la cuenta. Comprueba tu conexión.');
    }
    setLoading(false);
  }

  const font = (
    <link
      key="f"
      href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap"
      rel="stylesheet"
    />
  );
  const wrap = (children) => (
    <div
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(135deg,#FFE0EC 0%,#F0E8FF 50%,#E8F5FF 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: "'Nunito',sans-serif",
      }}
    >
      {font}
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div
        style={{
          background: 'white',
          borderRadius: 32,
          padding: 28,
          width: '100%',
          maxWidth: 380,
          boxShadow: '0 20px 60px rgba(255,107,157,0.2)',
          animation: 'slideUp 0.4s cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        {children}
      </div>
    </div>
  );

  const backBtn = (to) => (
    <button
      onClick={() => {
        setMode(to);
        setStep(1);
        reset();
        setUsername('');
      }}
      style={{
        background: '#f5f5f5',
        border: 'none',
        borderRadius: 12,
        width: 36,
        height: 36,
        cursor: 'pointer',
        fontSize: 16,
      }}
    >
      ←
    </button>
  );

  const pwdPad = (onConfirm, label) => (
    <>
      <div
        style={{
          background: '#f8f8f8',
          borderRadius: 16,
          padding: 12,
          marginBottom: 12,
          minHeight: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {pwd.length === 0 ? (
          <span style={{ color: '#ccc', fontSize: 14 }}>Pulsa 3 emojis...</span>
        ) : (
          pwd.map((e, i) => (
            <span key={i} style={{ fontSize: 32 }}>
              {e}
            </span>
          ))
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5,1fr)',
          gap: 8,
          marginBottom: 14,
        }}
      >
        {EMOJI_PWD.map((e) => (
          <button
            key={e}
            onClick={() => addPwd(e)}
            style={{
              fontSize: 26,
              padding: '8px 0',
              borderRadius: 12,
              border: '2px solid #f0e8ff',
              background: '#faf5ff',
              cursor: 'pointer',
            }}
          >
            {e}
          </button>
        ))}
      </div>
      {err && (
        <p
          style={{
            color: '#e05',
            fontSize: 13,
            margin: '0 0 10px',
            textAlign: 'center',
          }}
        >
          {err}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={reset}
          style={{
            flex: 1,
            padding: '12px 0',
            borderRadius: 14,
            border: '2px solid #eee',
            background: 'white',
            cursor: 'pointer',
            fontWeight: 700,
            color: '#999',
          }}
        >
          Borrar
        </button>
        <button
          onClick={onConfirm}
          disabled={pwd.length < 3 || loading}
          style={{
            flex: 2,
            padding: '12px 0',
            borderRadius: 14,
            border: 'none',
            background:
              pwd.length >= 3 && !loading
                ? 'linear-gradient(135deg,#FF6B9D,#A855F7)'
                : '#ddd',
            color: 'white',
            fontSize: 16,
            fontWeight: 800,
            cursor: pwd.length >= 3 && !loading ? 'pointer' : 'default',
          }}
        >
          {loading ? '⏳ Cargando...' : label}
        </button>
      </div>
    </>
  );

  if (mode === 'welcome')
    return wrap(
      <>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 72, marginBottom: 8 }}>🐾</div>
          <h1
            style={{
              margin: '0 0 6px',
              fontSize: 36,
              fontWeight: 900,
              background: 'linear-gradient(135deg,#FF6B9D,#A855F7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            NutriPet
          </h1>
          <p style={{ color: '#aaa', fontSize: 14, margin: 0 }}>
            ¡Tu mascota come lo que tú escaneas!
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={() => {
              setMode('register');
              setStep(1);
              reset();
            }}
            style={{
              padding: '14px 0',
              borderRadius: 16,
              border: 'none',
              background: 'linear-gradient(135deg,#FF6B9D,#A855F7)',
              color: 'white',
              fontSize: 16,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(255,107,157,0.4)',
            }}
          >
            🐣 Crear nueva cuenta
          </button>
          <button
            onClick={() => {
              setMode('login');
              reset();
            }}
            style={{
              padding: '14px 0',
              borderRadius: 16,
              border: '2px solid #f0e8ff',
              background: 'white',
              color: '#A855F7',
              fontSize: 16,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            🔑 Ya tengo cuenta
          </button>
        </div>
      </>
    );

  if (mode === 'register')
    return wrap(
      <>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 20,
          }}
        >
          {backBtn('welcome')}
          <h2
            style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#333' }}
          >
            Nueva cuenta 🐣
          </h2>
        </div>
        {step === 1 ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: '0 0 8px', fontWeight: 800, color: '#555' }}>
                Elige un nombre de usuario:
              </p>
              <input
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErr('');
                }}
                placeholder="Nombre único..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 16px',
                  borderRadius: 14,
                  border: '2px solid #f0e8ff',
                  fontSize: 16,
                  fontFamily: "'Nunito',sans-serif",
                  outline: 'none',
                }}
              />
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#bbb' }}>
                Este nombre no puede repetirse — es único en el juego.
              </p>
            </div>
            <div style={{ marginBottom: 24 }}>
              <p style={{ margin: '0 0 10px', fontWeight: 800, color: '#555' }}>
                Elige tu mascota:
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6,1fr)',
                  gap: 8,
                }}
              >
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEmoji(e)}
                    style={{
                      fontSize: 28,
                      padding: '8px 0',
                      borderRadius: 12,
                      border:
                        emoji === e
                          ? '3px solid #FF6B9D'
                          : '3px solid transparent',
                      background: emoji === e ? '#fff0f5' : '#f8f8f8',
                      cursor: 'pointer',
                      transform: emoji === e ? 'scale(1.15)' : 'scale(1)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            {err && (
              <p
                style={{
                  color: '#e05',
                  fontSize: 13,
                  margin: '0 0 10px',
                  textAlign: 'center',
                }}
              >
                {err}
              </p>
            )}
            <button
              onClick={() => username.trim() && setStep(2)}
              style={{
                width: '100%',
                padding: '14px 0',
                borderRadius: 16,
                border: 'none',
                background: username.trim()
                  ? 'linear-gradient(135deg,#FF6B9D,#A855F7)'
                  : '#ddd',
                color: 'white',
                fontSize: 17,
                fontWeight: 800,
                cursor: username.trim() ? 'pointer' : 'default',
              }}
            >
              Siguiente →
            </button>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 48, marginBottom: 4 }}>{emoji}</div>
              <p
                style={{
                  margin: 0,
                  fontWeight: 800,
                  fontSize: 18,
                  color: '#333',
                }}
              >
                ¡Hola, {username}!
              </p>
              <p style={{ margin: '4px 0 0', color: '#999', fontSize: 13 }}>
                Crea tu contraseña emoji (3 emojis):
              </p>
            </div>
            {pwdPad(doRegister, '¡Empezar! 🐾')}
            <button
              onClick={() => setStep(1)}
              style={{
                marginTop: 12,
                background: 'none',
                border: 'none',
                color: '#bbb',
                fontSize: 13,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              ← Cambiar nombre o mascota
            </button>
          </>
        )}
      </>
    );

  // LOGIN
  return wrap(
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {backBtn('welcome')}
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#333' }}>
          Bienvenido/a 🔑
        </h2>
      </div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: '0 0 8px', fontWeight: 800, color: '#555' }}>
          Tu nombre de usuario:
        </p>
        <input
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setErr('');
          }}
          placeholder="Nombre de usuario..."
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px 16px',
            borderRadius: 14,
            border: '2px solid #f0e8ff',
            fontSize: 16,
            fontFamily: "'Nunito',sans-serif",
            outline: 'none',
          }}
        />
      </div>
      <p style={{ margin: '0 0 8px', fontWeight: 800, color: '#555' }}>
        Tu contraseña emoji:
      </p>
      {pwdPad(doLogin, 'Entrar →')}
      <button
        onClick={() => {
          setMode('register');
          setStep(1);
          reset();
        }}
        style={{
          marginTop: 14,
          background: 'none',
          border: 'none',
          color: '#A855F7',
          fontSize: 13,
          cursor: 'pointer',
          width: '100%',
          fontWeight: 700,
        }}
      >
        ¿No tienes cuenta? Crear una →
      </button>
    </>
  );
}

// ─── FOOD LOG ─────────────────────────────────────────────────────────────────
function FoodLog({ log, dark }: { log: any[], dark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!log.length) return null;
  const shown = expanded ? log : log.slice(0, 3);
  const scoreCount = { a:0, b:0, c:0, d:0, e:0, unknown:0 };
  log.forEach(item => { const k = (item.score||'unknown').toLowerCase(); if (k in scoreCount) scoreCount[k as keyof typeof scoreCount]++; });
  const healthy = (scoreCount.a + scoreCount.b);
  const total = log.length;
  const pct = total > 0 ? Math.round(healthy/total*100) : 0;

  return (
    <div style={{ marginTop: 16 }}>
      {/* Header with summary */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <p style={{ margin:0, fontSize:13, fontWeight:800, color: dark ? '#5a7a9a' : '#aaa' }}>
          🍽️ Historial reciente
        </p>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ background: pct >= 60 ? '#d4edda' : pct >= 30 ? '#fffde0' : '#fde8e8', borderRadius:99, padding:'3px 10px', fontSize:11, fontWeight:800, color: pct >= 60 ? '#1a9641' : pct >= 30 ? '#ccb800' : '#d7191c' }}>
            {pct}% sano
          </div>
          <span style={{ fontSize:11, color:'#bbb' }}>{total} comidas</span>
        </div>
      </div>

      {/* Score summary bar */}
      <div style={{ display:'flex', gap:4, marginBottom:10, height:6, borderRadius:99, overflow:'hidden' }}>
        {(['a','b','c','d','e'] as const).map(k => {
          const w = total > 0 ? (scoreCount[k]/total)*100 : 0;
          return w > 0 ? <div key={k} style={{ width:`${w}%`, background:NC[k].color, transition:'width 0.5s' }}/> : null;
        })}
      </div>

      {/* Items */}
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {shown.map((item, i) => {
          const cfg = getNC(item.score);
          const isNew = i === 0;
          return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:14, background: dark ? 'rgba(255,255,255,0.05)' : cfg.bg, border: isNew ? `2px solid ${cfg.color}44` : '2px solid transparent', animation: isNew ? 'slideUp 0.3s ease' : 'none' }}>
              <div style={{ width:32, height:32, borderRadius:10, background:cfg.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:900, color:'white', flexShrink:0, boxShadow:`0 2px 8px ${cfg.color}55` }}>
                {cfg.label}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontSize:12, fontWeight:700, color: dark ? '#ccc' : '#333', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {item.product_name || item.name}
                </p>
                {item.brand && <p style={{ margin:'2px 0 0', fontSize:10, color:'#aaa', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.brand}</p>}
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <p style={{ margin:0, fontSize:10, color:'#bbb' }}>
                  {new Date(item.eaten_at || item.time).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}
                </p>
                {isNew && <p style={{ margin:'2px 0 0', fontSize:9, fontWeight:800, color:cfg.color }}>NUEVO</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more / less */}
      {log.length > 3 && (
        <button onClick={() => setExpanded(e => !e)} style={{ width:'100%', marginTop:8, padding:'8px 0', borderRadius:12, border:`1px solid ${dark ? '#333' : '#eee'}`, background:'transparent', color: dark ? '#5a7a9a' : '#aaa', fontSize:12, fontWeight:700, cursor:'pointer' }}>
          {expanded ? '▲ Ver menos' : `▼ Ver ${log.length - 3} más`}
        </button>
      )}
    </div>
  );
}

// ─── ACHIEVEMENTS CONFIG ──────────────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id:'first_scan',     icon:'🔍', title:'¡Primer escaneo!',      desc:'Escaneaste tu primer producto',         secret:false },
  { id:'first_healthy',  icon:'🥦', title:'¡Comecocos sano!',       desc:'Primera comida con Nutri-Score A',      secret:false },
  { id:'scan_10',        icon:'🌟', title:'10 escaneos',            desc:'Escaneaste 10 productos',               secret:false },
  { id:'scan_50',        icon:'🏅', title:'50 escaneos',            desc:'Escaneaste 50 productos',               secret:false },
  { id:'healthy_5',      icon:'💚', title:'Rachas de salud x5',     desc:'5 comidas A o B seguidas',              secret:false },
  { id:'healthy_streak', icon:'🔥', title:'¡En racha!',             desc:'7 días consecutivos comiendo bien',     secret:false },
  { id:'perfect_day',    icon:'⭐', title:'Día perfecto',           desc:'Solo Nutri-Score A en un día',          secret:false },
  { id:'explorer',       icon:'🗺️', title:'Explorador',             desc:'Escaneaste 5 productos diferentes',     secret:false },
  { id:'night_owl',      icon:'🦉', title:'Búho nocturno',          desc:'Escaneaste algo después de las 9pm',    secret:true  },
  { id:'speed_scan',     icon:'⚡', title:'¡Velocidad!',            desc:'3 escaneos en menos de 1 minuto',       secret:true  },
  { id:'all_scores',     icon:'🌈', title:'Coleccionista',          desc:'Probaste todos los Nutri-Scores A-E',   secret:true  },
  { id:'pet_max',        icon:'💖', title:'Mascota feliz',          desc:'Salud, hambre y energía al 100%',       secret:false },
];

// ─── ACCESSORIES CONFIG ────────────────────────────────────────────────────────
const ACCESSORIES: Record<string, { icon:string, label:string, unlockId:string, type:'hat'|'glasses'|'cape' }> = {
  'hat_star':     { icon:'⭐', label:'Gorro estrella',   unlockId:'first_healthy',  type:'hat'     },
  'hat_crown':    { icon:'👑', label:'Corona',           unlockId:'scan_50',        type:'hat'     },
  'hat_party':    { icon:'🎉', label:'Gorro fiesta',     unlockId:'perfect_day',    type:'hat'     },
  'hat_wizard':   { icon:'🧙', label:'Sombrero mago',    unlockId:'healthy_streak', type:'hat'     },
  'glasses_cool': { icon:'😎', label:'Gafas cool',       unlockId:'scan_10',        type:'glasses' },
  'glasses_heart':{ icon:'🥰', label:'Gafas corazón',    unlockId:'healthy_5',      type:'glasses' },
  'cape_hero':    { icon:'🦸', label:'Capa héroe',       unlockId:'explorer',       type:'cape'    },
  'cape_rainbow': { icon:'🌈', label:'Capa arcoíris',    unlockId:'all_scores',     type:'cape'    },
  'badge_fire':   { icon:'🔥', label:'Placa de fuego',   unlockId:'speed_scan',     type:'cape'    },
  'badge_moon':   { icon:'🌙', label:'Placa lunar',      unlockId:'night_owl',      type:'cape'    },
  // New accessories
  'hat_chef':     { icon:'👨‍🍳', label:'Gorro chef',       unlockId:'first_scan',     type:'hat'     },
  'hat_santa':    { icon:'🎅', label:'Gorro Navidad',     unlockId:'scan_10',        type:'hat'     },
  'glasses_star': { icon:'🤩', label:'Gafas estrella',    unlockId:'perfect_day',    type:'glasses' },
  'glasses_3d':   { icon:'🎬', label:'Gafas 3D',          unlockId:'explorer',       type:'glasses' },
  'cape_space':   { icon:'🚀', label:'Capa espacial',     unlockId:'scan_50',        type:'cape'    },
  'badge_shield': { icon:'🛡️', label:'Escudo protector', unlockId:'pet_max',        type:'cape'    },
  'badge_leaf':   { icon:'🌿', label:'Placa eco',         unlockId:'healthy_streak', type:'cape'    },
  'hat_flower':   { icon:'🌸', label:'Gorro flores',      unlockId:'healthy_5',      type:'hat'     },
};

// ─── ACHIEVEMENT TOAST ─────────────────────────────────────────────────────────
function AchievementToast({ achievement, onDone }: { achievement: any, onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position:'fixed', top:20, left:'50%', transform:'translateX(-50%)', zIndex:999, animation:'achievementPop 0.5s cubic-bezier(.34,1.56,.64,1)', maxWidth:320, width:'calc(100% - 40px)' }}>
      <div style={{ background:'linear-gradient(135deg,#FFD700,#FFA500)', borderRadius:20, padding:'14px 20px', display:'flex', alignItems:'center', gap:14, boxShadow:'0 8px 32px rgba(255,165,0,0.5)' }}>
        <div style={{ fontSize:44, lineHeight:1 }}>{achievement.icon}</div>
        <div>
          <p style={{ margin:0, fontSize:11, fontWeight:800, color:'rgba(0,0,0,0.5)', textTransform:'uppercase', letterSpacing:1 }}>🏆 Logro desbloqueado</p>
          <p style={{ margin:'2px 0 0', fontSize:16, fontWeight:900, color:'#1a1a1a' }}>{achievement.title}</p>
          <p style={{ margin:'2px 0 0', fontSize:12, color:'rgba(0,0,0,0.6)' }}>{achievement.desc}</p>
        </div>
      </div>
    </div>
  );
}

// ─── ACHIEVEMENTS SCREEN ───────────────────────────────────────────────────────
function AchievementsScreen({ unlocked, onClose, dark }: { unlocked: string[], onClose: () => void, dark: boolean }) {
  const done = unlocked.length;
  const total = ACHIEVEMENTS.length;
  return (
    <div style={{ position:'fixed', inset:0, background: dark ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.97)', zIndex:150, overflowY:'auto', padding:'20px 16px 40px', fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ maxWidth:400, margin:'0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <h2 style={{ margin:0, fontSize:24, fontWeight:900, color: dark ? 'white' : '#333' }}>🏆 Logros</h2>
            <p style={{ margin:'4px 0 0', fontSize:13, color: dark ? '#5a7a9a' : '#aaa' }}>{done} de {total} desbloqueados</p>
          </div>
          <button onClick={onClose} style={{ background: dark ? 'rgba(255,255,255,0.1)' : '#f0f0f0', border:'none', borderRadius:'50%', width:38, height:38, cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        {/* Progress bar */}
        <div style={{ height:10, background: dark ? '#222' : '#eee', borderRadius:99, marginBottom:24, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${(done/total)*100}%`, background:'linear-gradient(90deg,#FFD700,#FFA500)', borderRadius:99, transition:'width 0.8s cubic-bezier(.34,1.56,.64,1)' }}/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {ACHIEVEMENTS.map(a => {
            const isUnlocked = unlocked.includes(a.id);
            const isSecret = a.secret && !isUnlocked;
            return (
              <div key={a.id} style={{ background: isUnlocked ? 'linear-gradient(135deg,#FFF9E6,#FFF0C0)' : dark ? 'rgba(255,255,255,0.05)' : '#f8f8f8', borderRadius:16, padding:14, border: isUnlocked ? '2px solid #FFD700' : '2px solid transparent', opacity: isUnlocked ? 1 : 0.5, transition:'all 0.3s' }}>
                <div style={{ fontSize:32, marginBottom:6, filter: isUnlocked ? 'none' : 'grayscale(1)' }}>{isSecret ? '❓' : a.icon}</div>
                <p style={{ margin:0, fontSize:12, fontWeight:800, color: isUnlocked ? '#b8860b' : dark ? '#555' : '#aaa' }}>{isSecret ? '???' : a.title}</p>
                {!isSecret && <p style={{ margin:'3px 0 0', fontSize:10, color: isUnlocked ? '#8B6914' : dark ? '#444' : '#ccc', lineHeight:1.3 }}>{a.desc}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── ACCESSORIES SCREEN ────────────────────────────────────────────────────────
function AccessoriesScreen({ unlocked, equipped, onEquip, onClose, dark }: { unlocked: string[], equipped: string[], onEquip: (id: string) => void, onClose: () => void, dark: boolean }) {
  const byType = (type: string) => Object.entries(ACCESSORIES).filter(([,v]) => v.type === type);
  return (
    <div style={{ position:'fixed', inset:0, background: dark ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.97)', zIndex:150, overflowY:'auto', padding:'20px 16px 40px', fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ maxWidth:400, margin:'0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:24, fontWeight:900, color: dark ? 'white' : '#333' }}>🎨 Accesorios</h2>
          <button onClick={onClose} style={{ background: dark ? 'rgba(255,255,255,0.1)' : '#f0f0f0', border:'none', borderRadius:'50%', width:38, height:38, cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        <p style={{ margin:'0 0 16px', fontSize:13, color: dark ? '#5a7a9a' : '#999' }}>Desbloquea accesorios consiguiendo logros 🏆</p>
        {[['hat','🎩 Gorros'],['glasses','👓 Gafas'],['cape','🦸 Capas y placas']].map(([type, label]) => (
          <div key={type} style={{ marginBottom:20 }}>
            <p style={{ margin:'0 0 10px', fontSize:13, fontWeight:800, color: dark ? '#7ec8e3' : '#888', textTransform:'uppercase', letterSpacing:1 }}>{label}</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
              {byType(type as string).map(([id, acc]) => {
                const isUnlocked = unlocked.includes(id);
                const isEquipped = equipped.includes(id);
                const unlockAch = ACHIEVEMENTS.find(a => a.id === acc.unlockId);
                return (
                  <button key={id} onClick={() => isUnlocked && onEquip(id)} style={{ background: isEquipped ? 'linear-gradient(135deg,#FF6B9D22,#A855F722)' : dark ? 'rgba(255,255,255,0.05)' : '#f8f8f8', border: isEquipped ? '2px solid #FF6B9D' : '2px solid transparent', borderRadius:16, padding:'10px 4px', cursor: isUnlocked ? 'pointer' : 'default', opacity: isUnlocked ? 1 : 0.35, transition:'all 0.2s', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <span style={{ fontSize:28, filter: isUnlocked ? 'none' : 'grayscale(1)' }}>{acc.icon}</span>
                    <span style={{ fontSize:9, fontWeight:700, color: dark ? '#aaa' : '#666', textAlign:'center', lineHeight:1.2 }}>{acc.label}</span>
                    {!isUnlocked && <span style={{ fontSize:8, color:'#aaa', textAlign:'center' }}>{unlockAch?.title}</span>}
                    {isEquipped && <span style={{ fontSize:8, fontWeight:900, color:'#FF6B9D' }}>✓ Puesto</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── STATS SCREEN ─────────────────────────────────────────────────────────────
function StatsScreen({ userId, username, totalFeedings, goodFeedings, onClose, dark }: {
  userId: string, username: string, totalFeedings: number, goodFeedings: number, onClose: () => void, dark: boolean
}) {
  const [weekData, setWeekData] = useState<any[]>([]);
  const [healthHistory, setHealthHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const res = await fetch(
          `${SUPA_URL}/rest/v1/food_log?user_id=eq.${userId}&eaten_at=gte.${since}&order=eaten_at.asc`,
          { headers: db.headers }
        );
        const data = await res.json();

        // Group by day label
        const days: Record<string, any[]> = {};
        data.forEach((item: any) => {
          const d = new Date(item.eaten_at);
          const label = d.toLocaleDateString('es-ES', { weekday:'short', day:'numeric' });
          if (!days[label]) days[label] = [];
          days[label].push(item);
        });
        setWeekData(Object.entries(days).map(([day, items]) => ({ day, items })));

        // Simulate health history from food log: each scan shifts health by score delta
        const NC_DELTA: Record<string, number> = { a:14, b:8, c:1, d:-6, e:-16, unknown:-2 };
        let h = 80;
        const hist: any[] = [{ label: 'Inicio', value: h }];
        data.forEach((item: any) => {
          const s = (item.score || 'unknown').toLowerCase();
          h = Math.max(0, Math.min(100, h + (NC_DELTA[s] || 0)));
          const label = new Date(item.eaten_at).toLocaleDateString('es-ES', { day:'numeric', month:'short' });
          hist.push({ label, value: Math.round(h) });
        });
        // Keep max 14 points for readability
        const step = Math.max(1, Math.floor(hist.length / 14));
        setHealthHistory(hist.filter((_, i) => i % step === 0 || i === hist.length - 1));
      } catch {}
      setLoading(false);
    }
    load();
  }, [userId]);

  const pct = totalFeedings > 0 ? Math.round(goodFeedings / totalFeedings * 100) : 0;
  const scoreColors: Record<string, string> = { a:'#1a9641', b:'#a6d96a', c:'#ccb800', d:'#fdae61', e:'#d7191c', unknown:'#ddd' };
  const bg = dark ? '#0f0c29' : '#f4f4f8';
  const card = dark ? 'rgba(255,255,255,0.06)' : 'white';
  const txt = dark ? '#eee' : '#333';
  const sub = dark ? '#5a7a9a' : '#aaa';

  const maxBarItems = Math.max(...weekData.map(d => d.items.length), 1);
  const maxHealth = 100;

  return (
    <div style={{ position:'fixed', inset:0, background:bg, zIndex:160, overflowY:'auto', padding:'20px 16px 48px', fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ maxWidth:420, margin:'0 auto' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <h2 style={{ margin:0, fontSize:22, fontWeight:900, color:txt }}>📊 Estadísticas</h2>
            <p style={{ margin:'2px 0 0', fontSize:13, color:sub }}>{username} · {totalFeedings} escaneos totales</p>
          </div>
          <button onClick={onClose} style={{ background: dark ? 'rgba(255,255,255,0.1)' : '#f0f0f0', border:'none', borderRadius:'50%', width:38, height:38, cursor:'pointer', fontSize:18 }}>✕</button>
        </div>

        {/* Summary pills */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:20 }}>
          {[
            { icon:'🍽️', label:'Total', value: totalFeedings, color:'#667eea' },
            { icon:'💚', label:'Sanas', value: goodFeedings, color:'#1a9641' },
            { icon:'🌟', label:'% Sano', value:`${pct}%`, color: pct>=60?'#1a9641':pct>=30?'#ccb800':'#d7191c' },
          ].map(c => (
            <div key={c.label} style={{ background:card, borderRadius:16, padding:'12px 8px', textAlign:'center', boxShadow: dark?'none':'0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ margin:0, fontSize:20 }}>{c.icon}</p>
              <p style={{ margin:'4px 0 0', fontSize:20, fontWeight:900, color:c.color }}>{c.value}</p>
              <p style={{ margin:0, fontSize:11, color:sub }}>{c.label}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign:'center', color:sub, fontSize:13, marginTop:40 }}>Cargando datos...</p>
        ) : (<>

          {/* ── Chart 1: Barras por día ── */}
          <div style={{ background:card, borderRadius:20, padding:20, marginBottom:16, boxShadow: dark?'none':'0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ margin:'0 0 4px', fontSize:14, fontWeight:800, color:txt }}>🗓️ Escaneos por día</p>
            <p style={{ margin:'0 0 16px', fontSize:11, color:sub }}>Últimos 7 días · colores por Nutri-Score</p>
            {weekData.length === 0 ? (
              <p style={{ color:sub, fontSize:13, textAlign:'center' }}>Sin datos esta semana</p>
            ) : (
              <div style={{ display:'flex', gap:6, alignItems:'flex-end', height:140 }}>
                {weekData.map(({ day, items }) => {
                  const barH = Math.max((items.length / maxBarItems) * 120, 6);
                  const scoreCounts: Record<string, number> = {};
                  items.forEach((i: any) => { const s = (i.score||'unknown').toLowerCase(); scoreCounts[s] = (scoreCounts[s]||0)+1; });
                  return (
                    <div key={day} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                      <div style={{ width:'100%', height:barH, borderRadius:8, overflow:'hidden', display:'flex', flexDirection:'column-reverse' }}>
                        {(['a','b','c','d','e','unknown'] as const).map(s => {
                          const cnt = scoreCounts[s] || 0;
                          if (!cnt) return null;
                          return <div key={s} style={{ width:'100%', flex:cnt, background:scoreColors[s] }}/>;
                        })}
                      </div>
                      <p style={{ margin:0, fontSize:9, color:sub, textAlign:'center', lineHeight:1.2 }}>{day}</p>
                      <p style={{ margin:0, fontSize:10, fontWeight:800, color:txt }}>{items.length}</p>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Legend */}
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:14 }}>
              {(['a','b','c','d','e'] as const).map(s => (
                <div key={s} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:scoreColors[s] }}/>
                  <span style={{ fontSize:10, color:sub }}>Nutri-{s.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Chart 2: Evolución de salud ── */}
          <div style={{ background:card, borderRadius:20, padding:20, marginBottom:16, boxShadow: dark?'none':'0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ margin:'0 0 4px', fontSize:14, fontWeight:800, color:txt }}>💖 Evolución de salud</p>
            <p style={{ margin:'0 0 16px', fontSize:11, color:sub }}>Estimación basada en lo que comió la mascota</p>
            {healthHistory.length < 2 ? (
              <p style={{ color:sub, fontSize:13, textAlign:'center' }}>Necesitas más escaneos para ver la evolución</p>
            ) : (() => {
              const W = 360, H = 120, PAD = 20;
              const xs = healthHistory.map((_, i) => PAD + (i / (healthHistory.length - 1)) * (W - PAD * 2));
              const ys = healthHistory.map(p => PAD + ((maxHealth - p.value) / maxHealth) * (H - PAD * 2));
              const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ');
              const area = `${line} L${xs[xs.length-1]},${H} L${xs[0]},${H} Z`;
              const lastVal = healthHistory[healthHistory.length-1].value;
              const lineColor = lastVal >= 60 ? '#1a9641' : lastVal >= 30 ? '#ccb800' : '#d7191c';
              return (
                <div style={{ overflowX:'auto' }}>
                  <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth:260 }}>
                    <defs>
                      <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={lineColor} stopOpacity="0.3"/>
                        <stop offset="100%" stopColor={lineColor} stopOpacity="0.02"/>
                      </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    {[25, 50, 75, 100].map(v => {
                      const y = PAD + ((maxHealth - v) / maxHealth) * (H - PAD * 2);
                      return <g key={v}>
                        <line x1={PAD} y1={y} x2={W-PAD} y2={y} stroke={dark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.06)'} strokeWidth="1"/>
                        <text x={PAD-4} y={y+4} fontSize="8" fill={sub} textAnchor="end">{v}</text>
                      </g>;
                    })}
                    {/* Area */}
                    <path d={area} fill="url(#healthGrad)"/>
                    {/* Line */}
                    <path d={line} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    {/* Dots */}
                    {xs.map((x, i) => (
                      <circle key={i} cx={x} cy={ys[i]} r="3.5" fill={lineColor} stroke={dark?'#1a1a2e':'white'} strokeWidth="1.5"/>
                    ))}
                    {/* Last value label */}
                    <text x={xs[xs.length-1]} y={ys[ys.length-1]-8} fontSize="10" fill={lineColor} textAnchor="middle" fontWeight="800">{lastVal}%</text>
                  </svg>
                </div>
              );
            })()}
          </div>

          {/* Health tip */}
          <div style={{ background: pct>=60 ? (dark?'rgba(26,150,65,0.15)':'#f0fff4') : pct>=30 ? (dark?'rgba(204,184,0,0.1)':'#fffde0') : (dark?'rgba(215,25,28,0.1)':'#fde8e8'), borderRadius:16, padding:16 }}>
            <p style={{ margin:0, fontSize:13, fontWeight:700, color: pct>=60?'#1a9641':pct>=30?'#a07800':'#c0392b', lineHeight:1.6 }}>
              {pct >= 60
                ? `✅ ¡${username} tiene muy buenos hábitos! Más del 60% de sus comidas son saludables.`
                : pct >= 30
                ? `⚠️ ${username} puede mejorar. Intenta escanear más productos con Nutri-Score A o B.`
                : `❌ La alimentación de ${username} necesita atención. ¡Dale alimentos más sanos a la mascota!`}
            </p>
          </div>

        </>)}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function NutriPet() {
  const pet = usePetStore();
  const [showScanner, setShowScanner] = useState(false);
  const [pending, setPending] = useState(null);
  const [notif, setNotif] = useState(null);
  const [blockedProduct, setBlockedProduct] = useState<{name:string, minutes:number} | null>(null);
  const [blockedTraining, setBlockedTraining] = useState<{reason:'hunger'|'energy'|'health'|'sleeping'} | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [foodLog, setFoodLog] = useState([]);
  const [unlockedAch, setUnlockedAch] = useState<string[]>([]);
  const [newAch, setNewAch] = useState<any>(null);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showAccessories, setShowAccessories] = useState(false);
  const [showStatsScreen, setShowStatsScreen] = useState(false);
  const [equippedAcc, setEquippedAcc] = useState<string[]>([]);
  const [unlockedAcc, setUnlockedAcc] = useState<string[]>([]);
  const saveTimer = useRef(null);
  const recentScans = useRef<{barcode: string, time: number}[]>([]);
  const [musicOn, setMusicOn] = useState(false); // starts muted
  const scanTimes = useRef<number[]>([]);

  // Auto-restore session on page reload
  useEffect(() => {
    if (!pet._pendingRestore || !pet.userId) return;
    async function restore() {
      try {
        // Step 1: restore from localStorage immediately (no network needed)
        let localState: any = null;
        try {
          const raw = localStorage.getItem('nutripet_state');
          if (raw) {
            const parsed = JSON.parse(raw);
            // Only use if it belongs to this user
            if (!parsed.userId || parsed.userId === pet.userId) localState = parsed;
          }
        } catch {}

        if (localState) {
          // Apply decay since last localStorage save
          const elapsed = Math.min(Math.floor((Date.now() - localState.savedAt) / 1000), 7200);
          let { health, hunger, energy, sleeping, mood, lastFood, totalFeedings, goodFeedings } = localState;
          if (!sleeping) {
            health = Math.max(0, health - elapsed * 0.015);
            hunger = Math.max(0, hunger - elapsed * 0.05);
            energy = Math.max(0, energy - elapsed * 0.03);
            if (health < 20) mood = 'sick';
            else if (energy < 25 || hunger < 20) mood = 'tired';
            else mood = 'happy';
          } else {
            energy = Math.min(100, energy + elapsed * 0.025);
            health = Math.min(100, health + elapsed * 0.005);
            hunger = Math.max(0, hunger - elapsed * 0.008);
          }
          petStore.setState({ loggedIn: true, health, hunger, energy, sleeping, mood, lastFood, totalFeedings, goodFeedings, _pendingRestore: false });
          // Step 2: sync Supabase in background to catch any cross-device changes
          db.getPet(pet.userId).then(petData => {
            if (!petData) return;
            // Only use Supabase if it's more recent than localStorage
            const supabaseTs = new Date(petData.updated_at).getTime();
            if (supabaseTs > localState.savedAt) {
              const elapsed2 = Math.min(Math.floor((Date.now() - supabaseTs) / 1000), 7200);
              let h = petData.health, u = petData.hunger, e = petData.energy;
              if (!petData.sleeping) {
                h = Math.max(0, h - elapsed2 * 0.015);
                u = Math.max(0, u - elapsed2 * 0.05);
                e = Math.max(0, e - elapsed2 * 0.03);
              }
              petStore.setState({ health: h, hunger: u, energy: e, sleeping: petData.sleeping, mood: petData.mood, lastFood: petData.last_food, totalFeedings: petData.total_feedings, goodFeedings: petData.good_feedings });
            }
          }).catch(() => {});
        } else {
          // No localStorage - fetch from Supabase
          let petData = await db.getPet(pet.userId);
          if (!petData) petData = await db.createPet(pet.userId);
          const elapsed = Math.min(Math.floor((Date.now() - new Date(petData.updated_at).getTime()) / 1000), 7200);
          let h = petData.health, u = petData.hunger, e = petData.energy;
          if (!petData.sleeping) {
            h = Math.max(0, h - elapsed * 0.015);
            u = Math.max(0, u - elapsed * 0.05);
            e = Math.max(0, e - elapsed * 0.03);
          } else {
            e = Math.min(100, e + elapsed * 0.025);
            h = Math.min(100, h + elapsed * 0.005);
            u = Math.max(0, u - elapsed * 0.008);
          }
          petStore.setState({ loggedIn: true, health: h, hunger: u, energy: e, sleeping: petData.sleeping, mood: petData.mood, lastFood: petData.last_food, totalFeedings: petData.total_feedings, goodFeedings: petData.good_feedings, _pendingRestore: false });
        }
      } catch {
        localStorage.removeItem('nutripet_session');
        petStore.setState({ _pendingRestore: false, userId: null, username: '', loggedIn: false });
      }
    }
    restore();
  }, [pet._pendingRestore, pet.userId]);

  // Load food log, achievements and accessories on login
  useEffect(() => {
    if (pet.loggedIn && pet.userId) {
      db.getFoodLog(pet.userId).then(setFoodLog).catch(() => {});
      db.getAchievements(pet.userId).then(data => {
        setUnlockedAch(data.map((a: any) => a.achievement_id));
      }).catch(() => {});
      db.getAccessories(pet.userId).then(data => {
        if (data) { setEquippedAcc(data.equipped || []); setUnlockedAcc(data.unlocked || []); }
        else db.createAccessories(pet.userId);
      }).catch(() => {});
    }
  }, [pet.loggedIn, pet.userId]);

  // Check and unlock achievements
  async function checkAchievements(log: any[], state: any, newScore: string) {
    if (!pet.userId) return;
    const already = new Set(unlockedAch);
    const toUnlock: string[] = [];
    // scores ordered newest-first (log comes from DB ordered desc)
    const scores = log.map((i: any) => (i.score || 'unknown').toLowerCase());
    const ns = newScore.toLowerCase(); // the score just scanned RIGHT NOW

    // ── Basados en el escaneo actual ──────────────────────────────
    if (!already.has('first_scan'))
      toUnlock.push('first_scan'); // siempre se cumple en el primer escaneo

    if (!already.has('first_healthy') && ns === 'a')
      toUnlock.push('first_healthy'); // solo si ESTE escaneo es A

    if (!already.has('night_owl') && new Date().getHours() >= 21)
      toUnlock.push('night_owl');

    // Speed scan: 3 scans in 60s
    const now = Date.now();
    scanTimes.current = [...scanTimes.current.filter(t => now - t < 60000), now];
    if (!already.has('speed_scan') && scanTimes.current.length >= 3)
      toUnlock.push('speed_scan');

    // ── Basados en el historial acumulado ─────────────────────────
    if (!already.has('scan_10') && log.length >= 10)
      toUnlock.push('scan_10');
    if (!already.has('scan_50') && log.length >= 50)
      toUnlock.push('scan_50');

    if (!already.has('explorer') && new Set(log.map((i: any) => i.barcode).filter(Boolean)).size >= 5)
      toUnlock.push('explorer');

    if (!already.has('all_scores') && ['a','b','c','d','e'].every(s => scores.includes(s)))
      toUnlock.push('all_scores');

    // 5 comidas sanas CONSECUTIVAS (las 5 más recientes)
    if (!already.has('healthy_5') && scores.length >= 5 &&
        scores.slice(0, 5).every(s => s === 'a' || s === 'b'))
      toUnlock.push('healthy_5');

    // Día perfecto: mínimo 3 escaneos hoy y TODOS son A
    const today = new Date().toDateString();
    const todayScores = log
      .filter((i: any) => new Date(i.eaten_at).toDateString() === today)
      .map((i: any) => (i.score || 'unknown').toLowerCase());
    if (!already.has('perfect_day') && todayScores.length >= 3 &&
        todayScores.every(s => s === 'a'))
      toUnlock.push('perfect_day');

    // Mascota al máximo (tras aplicar el efecto del alimento)
    if (!already.has('pet_max') &&
        state.health >= 99 && state.hunger >= 99 && state.energy >= 99)
      toUnlock.push('pet_max');

    // ── Procesar desbloqueos ──────────────────────────────────────
    // Acumulamos unlocked locales para no depender del state async
    let localUnlocked = [...unlockedAch];
    for (const id of toUnlock) {
      if (localUnlocked.includes(id)) continue; // ya tenemos este
      await db.unlockAchievement(pet.userId, id).catch(() => {});
      localUnlocked = [...localUnlocked, id];
      setUnlockedAch(localUnlocked);

      // Desbloquear accesorio asociado
      const accToUnlock = Object.entries(ACCESSORIES)
        .filter(([, v]) => v.unlockId === id)
        .map(([k]) => k);
      if (accToUnlock.length > 0) {
        const newUnlocked = [...unlockedAcc, ...accToUnlock.filter(a => !unlockedAcc.includes(a))];
        setUnlockedAcc(newUnlocked);
        await db.saveAccessories(pet.userId, equippedAcc, newUnlocked).catch(() => {});
      }

      const ach = ACHIEVEMENTS.find(a => a.id === id);
      if (ach) { playSfx('achievement'); setNewAch(ach); track('achievement_unlocked', { achievement: ach.id, label: ach.label }); break; } // mostrar uno a la vez
    }
  }

  // Debounced save to Supabase
  function scheduleSave(state) {
    if (!state.userId) return;
    // Debounce Supabase save to max once every 10s
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!state.userId) return;
      db.savePet(state.userId, {
        health: state.health,
        hunger: state.hunger,
        energy: state.energy,
        sleeping: state.sleeping,
        mood: state.mood,
        last_food: state.lastFood,
        total_feedings: state.totalFeedings,
        good_feedings: state.goodFeedings,
      }).catch(() => {});
    }, 10000);
  }

  // Time decay runs in global interval (outside React) — see top of file

  // Warnings
  useEffect(() => {
    if (!pet.loggedIn || pet.sleeping) return;
    if (pet.hunger < 15) showN('😿 ¡Tengo mucha hambre! ¡Escanea algo!');
    else if (pet.energy < 15) showN('😴 Estoy muy cansado... ¡ponme a dormir!');
    else if (pet.health < 20)
      showN('🤒 Estoy muy malito... ¡dame comida sana!');
  }, [
    Math.floor(pet.hunger / 10),
    Math.floor(pet.energy / 10),
    Math.floor(pet.health / 10),
  ]);

  function showN(msg) {
    setNotif(msg);
    setTimeout(() => setNotif(null), 3500);
  }

  async function handleFeed(product) {
    // Block same product more than 2x in 5 minutes
    const now = Date.now();
    const WINDOW = 5 * 60 * 1000; // 5 min
    const barcode = product.barcode || product.name;
    recentScans.current = recentScans.current.filter(s => now - s.time < WINDOW);
    const timesInWindow = recentScans.current.filter(s => s.barcode === barcode).length;
    if (timesInWindow >= 2) {
      playSfx('blocked');
      // Close ProductResult first, then show blocked modal on top
      setPending(null);
      const oldest = recentScans.current.filter(s => s.barcode === barcode)[0];
      const remainingMs = WINDOW - (now - oldest.time);
      const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));
      setBlockedProduct({ name: product.name, minutes: remainingMin });
      return;
    }
    recentScans.current.push({ barcode, time: now });
    const cfg = getNC(product.score);
    // Play sound based on score
    const _sc = (product.score || '').toLowerCase();
    if (['a','b'].includes(_sc)) playSfx('feed_good');
    else playSfx('feed_bad');
    track('feed', {
      product_name: product.name,
      brand: product.brand,
      score: product.score,
      barcode: product.barcode,
    });
    petStore.setState((s) => {
      const sc = (product.score || '').toLowerCase();
      // Weight: bad food adds weight, good food reduces it faster
      const weightDelta = sc === 'e' ? +4 : sc === 'd' ? +2.5 : sc === 'c' ? +0.5 : sc === 'b' ? -1 : -2;
      const newWeight = Math.max(0, Math.min(100, (s.weight ?? 50) + weightDelta));
      // Strength: grows with protein-rich foods (score A/B) — detect by name keywords or category
      const productNameLower = (product.name || '').toLowerCase();
      const isProtein = sc === 'a' || sc === 'b'
        ? ['pollo','pechuga','atún','salmón','huevo','lentejas','garbanzo','judía',
           'tofu','yogur','queso','leche','proteína','protein','chicken','tuna',
           'salmon','egg','lentil','bean','yogurt','cheese','milk','whey',
           'almendra','nuez','cacahuete','almond','nut','peanut'].some(k => productNameLower.includes(k))
        : false;
      const strengthDelta = isProtein ? (sc === 'a' ? +8 : +5) : sc === 'a' ? +1 : sc === 'b' ? +0.5 : 0;
      const newStrength = Math.max(0, Math.min(100, (s.strength ?? 0) + strengthDelta));
      const next = {
        health: Math.max(0, Math.min(100, s.health + cfg.healthDelta)),
        hunger: Math.min(100, s.hunger + cfg.hungerDelta),
        energy: Math.max(0, Math.min(100, s.energy + cfg.energyDelta)),
        weight: newWeight,
        strength: newStrength,
        feedAnim: true,
        lastFood: product,
        totalFeedings: s.totalFeedings + 1,
        goodFeedings:
          s.goodFeedings +
          (['a', 'b'].includes(sc) ? 1 : 0),
        mood: cfg.healthDelta < 0 ? 'sick' : 'happy',
      };
      scheduleSave({ ...s, ...next });
      return next;
    });
    setTimeout(() => petStore.setState({ feedAnim: false }), 800);
    showN(cfg.msg);
    // Show weight change message if significant
    const curWeight = petStore.getState().weight ?? 50;
    const curStrength = petStore.getState().strength ?? 0;
    if (curWeight > 75) setTimeout(() => showN('🐷 ¡Uf, me noto un poco pesadito! Prueba con algo más sano...'), 2000);
    else if (curWeight < 25) setTimeout(() => showN('💪 ¡Me siento ligero y ágil! ¡Sigue así!'), 2000);
    if (curStrength > 70) setTimeout(() => showN('💪 ¡Me siento fortísimo! ¡Mira estos músculos!'), 2500);
    else if (curStrength > 40 && strengthDelta > 0) setTimeout(() => showN('🏋️ ¡La proteína me hace más fuerte!'), 2500);
    setPending(null);
    // Save food log to Supabase
    try {
      await db.addFoodLog(pet.userId, product);
      const updated = await db.getFoodLog(pet.userId);
      setFoodLog(updated);
      // Check achievements with updated log
      const currentState = petStore.getState();
      await checkAchievements(updated, currentState, product.score || 'unknown');
    } catch {}
  }

  function handleLogout() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const s = petStore.getState();
    if (s.userId) {
      // Save final state to localStorage BEFORE clearing session
      // so it survives logout and can be restored on next login
      try {
        const stateToSave = {
          userId: s.userId,
          health: s.health, hunger: s.hunger, energy: s.energy,
          sleeping: s.sleeping, mood: s.mood, lastFood: s.lastFood,
          totalFeedings: s.totalFeedings, goodFeedings: s.goodFeedings,
          savedAt: Date.now(),
        };
        console.log('[LOGOUT] Guardando estado:', JSON.stringify(stateToSave));
        localStorage.setItem('nutripet_state', JSON.stringify(stateToSave));
        const verify = localStorage.getItem('nutripet_state');
        console.log('[LOGOUT] Verificacion localStorage:', verify);
      } catch (err) { console.error('[LOGOUT] Error al guardar:', err); }
      // Also save to Supabase (fire and forget)
      db.savePet(s.userId, {
        health: s.health, hunger: s.hunger, energy: s.energy,
        sleeping: s.sleeping, mood: s.mood, last_food: s.lastFood,
        total_feedings: s.totalFeedings, good_feedings: s.goodFeedings,
      }).catch(() => {});
    }
    // Clear session but NOT nutripet_state — it has userId so it's safe
    track('logout');
    _currentUserId = null; // clear RLS user
    _isTraining = false;
    stopBgMusic();
    localStorage.removeItem('nutripet_session');
    petStore.setState({
      loggedIn: false, userId: null, username: '', emoji: '🐱',
      health: 85, hunger: 70, energy: 80, weight: 50, strength: 0, sleeping: false, training: false,
      mood: 'happy', lastFood: null, feedAnim: false, totalFeedings: 0, goodFeedings: 0,
      _pendingRestore: false,
    });
    setFoodLog([]); setUnlockedAch([]); setEquippedAcc([]); setUnlockedAcc([]); setShowStatsScreen(false);
  }

  async function handleEquipAccessory(id: string) {
    // Toggle equipped - only one per type
    const acc = ACCESSORIES[id];
    const sameType = Object.entries(ACCESSORIES).filter(([,v]) => v.type === acc.type).map(([k]) => k);
    const alreadyEquipped = equippedAcc.includes(id);
    const newEquipped = alreadyEquipped
      ? equippedAcc.filter(e => e !== id)
      : [...equippedAcc.filter(e => !sameType.includes(e)), id];
    setEquippedAcc(newEquipped);
    await db.saveAccessories(pet.userId, newEquipped, unlockedAcc).catch(() => {});
  }

  if (pet._pendingRestore) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#fff0f5,#f0f4ff)', fontFamily:"'Nunito',sans-serif" }}>
      <div style={{ fontSize:72, animation:'float 1.5s ease-in-out infinite' }}>🐱</div>
      <p style={{ marginTop:16, fontSize:16, fontWeight:700, color:'#FF6B9D' }}>Cargando tu mascota...</p>
    </div>
  );
  if (!pet.loggedIn) return <LoginScreen />;

  const dark = pet.sleeping;
  const cardBg = dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)';
  const txtCol = dark ? '#7ec8e3' : '#333';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: dark
          ? 'linear-gradient(135deg,#0f0c29,#1a1a3e,#24243e)'
          : 'linear-gradient(135deg,#FFE0EC,#F0E8FF,#E8F5FF)',
        fontFamily: "'Nunito',sans-serif",
        transition: 'background 0.8s',
        padding: '20px 0 100px',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap"
        rel="stylesheet"
      />
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
        @keyframes tapBounce{0%{transform:scale(1) rotate(0deg)}25%{transform:scale(1.18) rotate(-8deg)}50%{transform:scale(1.22) rotate(8deg)}75%{transform:scale(1.1) rotate(-4deg)}100%{transform:scale(1) rotate(0deg)}}
        @keyframes heartFloat{0%{opacity:1;transform:translateX(-50%) translateY(0) scale(0.5)}50%{opacity:1;transform:translateX(-50%) translateY(-30px) scale(1.2)}100%{opacity:0;transform:translateX(-50%) translateY(-60px) scale(0.8)}}
        @keyframes pulse{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}
        @keyframes wag{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        @keyframes zzz{0%{opacity:0;transform:translateY(0)scale(.5)}50%{opacity:1}100%{opacity:0;transform:translateY(-20px)scale(1)}}
        @keyframes notif{0%{opacity:0;transform:translateY(-10px)}10%{opacity:1;transform:translateY(0)}80%{opacity:1}100%{opacity:0}}
      `}</style>
      <div style={{ maxWidth: 400, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 26,
                fontWeight: 900,
                background: dark
                  ? 'none'
                  : 'linear-gradient(135deg,#FF6B9D,#A855F7)',
                WebkitBackgroundClip: dark ? 'unset' : 'text',
                WebkitTextFillColor: dark ? '#7ec8e3' : 'transparent',
                color: dark ? '#7ec8e3' : 'inherit',
              }}
            >
              🐾 NutriPet
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: dark ? '#5a7a9a' : '#aaa',
              }}
            >
              {pet.emoji}{' '}
              <strong style={{ color: txtCol }}>{pet.username}</strong>
            </p>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            {[
              { icon:'🏆', onClick:() => setShowAchievements(true), title:'Logros', badge: unlockedAch.length },
              { icon:'🎨', onClick:() => setShowAccessories(true), title:'Accesorios' },
              { icon:'📊', onClick:() => setShowStatsScreen(true), title:'Estadísticas' },
              { icon: musicOn ? '🔊' : '🔇', onClick:() => { const on = toggleMusic(); setMusicOn(on); }, title: musicOn ? 'Silenciar música' : 'Activar música' },
              { icon:'🚪', onClick:handleLogout, title:'Salir' },
            ].map(btn => (
              <button key={btn.icon} onClick={btn.onClick} title={btn.title} style={{ position:'relative', width:38, height:38, borderRadius:12, background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.7)', border:'none', cursor:'pointer', fontSize:16, backdropFilter:'blur(10px)' }}>
                {btn.icon}
                {btn.badge != null && btn.badge > 0 && (
                  <span style={{ position:'absolute', top:-4, right:-4, background:'#FFD700', color:'#333', fontSize:9, fontWeight:900, borderRadius:99, minWidth:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>{btn.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Notification */}
        {notif && (
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              padding: '12px 18px',
              marginBottom: 12,
              fontSize: 14,
              fontWeight: 700,
              color: '#444',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              animation: 'notif 3.5s ease forwards',
            }}
          >
            {notif}
          </div>
        )}

        {/* Stats */}
        {showStats && (
          <div
            style={{
              background: cardBg,
              backdropFilter: 'blur(20px)',
              borderRadius: 24,
              padding: 20,
              marginBottom: 16,
              animation: 'slideUp 0.3s ease',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: txtCol }}>
              📈 Stats de {pet.username}
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              {[
                {
                  label: 'Total comidas',
                  value: pet.totalFeedings,
                  icon: '🍽️',
                },
                { label: 'Comidas sanas', value: pet.goodFeedings, icon: '💚' },
                {
                  label: '% Saludable',
                  value:
                    pet.totalFeedings > 0
                      ? `${Math.round(
                          (pet.goodFeedings / pet.totalFeedings) * 100
                        )}%`
                      : '—',
                  icon: '🌟',
                },
                {
                  label: 'Estado',
                  value:
                    pet.health > 70
                      ? 'Excelente'
                      : pet.health > 40
                      ? 'Bien'
                      : 'Malito',
                  icon: '💖',
                },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: dark
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(255,255,255,0.8)',
                    borderRadius: 14,
                    padding: '10px 12px',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 20 }}>{s.icon}</p>
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: 20,
                      fontWeight: 900,
                      color: txtCol,
                    }}
                  >
                    {s.value}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11,
                      color: dark ? '#5a7a9a' : '#aaa',
                    }}
                  >
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pet card */}
        <div
          style={{
            background: cardBg,
            backdropFilter: 'blur(20px)',
            borderRadius: 32,
            padding: '28px 24px',
            boxShadow: dark
              ? '0 20px 60px rgba(0,0,0,0.4)'
              : '0 20px 60px rgba(255,107,157,0.15)',
            marginBottom: 16,
            transition: 'all 0.8s',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <PetFace mood={pet.mood} sleeping={pet.sleeping} health={pet.health} feedAnim={pet.feedAnim} weight={pet.weight ?? 50} strength={pet.strength ?? 0} training={pet.training ?? false} equipped={equippedAcc}/>
          </div>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <span
              style={{
                display: 'inline-block',
                padding: '6px 16px',
                borderRadius: 99,
                fontSize: 13,
                fontWeight: 800,
                background: dark
                  ? 'rgba(126,200,227,0.15)'
                  : pet.health < 20
                  ? '#fde8e8'
                  : pet.mood === 'tired'
                  ? '#fff3e0'
                  : '#f0fff4',
                color: dark
                  ? '#7ec8e3'
                  : pet.health < 20
                  ? '#e05'
                  : pet.mood === 'tired'
                  ? '#e67e00'
                  : '#2d8a4e',
              }}
            >
              {pet.sleeping
                ? '😴 Durmiendo...'
                : pet.health < 20
                ? '🤒 ¡Necesita comida sana!'
                : pet.mood === 'tired'
                ? '😴 ¡Cansado y con hambre!'
                : '😊 ¡Me siento bien!'}
            </span>
          </div>
          <StatBar label="Salud" value={pet.health} icon="💖" color="#FF6B9D" />
          <StatBar label="Peso" value={pet.weight ?? 50} icon={((pet.weight ?? 50) > 65) ? '🐷' : ((pet.weight ?? 50) < 30) ? '🏃' : '⚖️'} color={(pet.weight ?? 50) > 75 ? '#FF9F43' : (pet.weight ?? 50) > 65 ? '#fecb02' : '#6BCB77'} invertColor />
          <StatBar
            label="Hambre"
            value={pet.hunger}
            icon="🍽️"
            color="#FF9F43"
          />
          <StatBar
            label="Energía"
            value={pet.energy}
            icon="⚡"
            color="#A855F7"
          />
        </div>

        {/* Sleep toggle */}
        <div
          style={{
            background: cardBg,
            backdropFilter: 'blur(20px)',
            borderRadius: 20,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontWeight: 800,
                fontSize: 15,
                color: dark ? '#7ec8e3' : '#444',
              }}
            >
              {pet.sleeping ? '💤 Modo Descanso' : '☀️ Modo Activo'}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: dark ? '#5a7a9a' : '#999',
              }}
            >
              {pet.sleeping ? 'Recuperando energía...' : '¡Listo para comer!'}
            </p>
          </div>
          <button
            onClick={() => {
              const isSleeping = petStore.getState().sleeping;
              playSfx(isSleeping ? 'wake' : 'sleep');
              track(isSleeping ? 'pet_wake' : 'pet_sleep');
              petStore.setState((s) => ({ sleeping: !s.sleeping }));
            }}
            style={{
              width: 56,
              height: 30,
              borderRadius: 99,
              background: dark ? '#7ec8e3' : '#ddd',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.3s',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 3,
                left: dark ? 'calc(100% - 27px)' : 3,
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: 'white',
                transition: 'left 0.3s cubic-bezier(.34,1.56,.64,1)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              }}
            />
          </button>
        </div>

        {/* Training card */}
        <div
          style={{
            background: pet.training
              ? (dark ? 'rgba(255,165,0,0.15)' : 'rgba(255,165,0,0.08)')
              : cardBg,
            backdropFilter: 'blur(20px)',
            borderRadius: 20,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
            border: pet.training ? '1.5px solid rgba(255,165,0,0.4)' : '1.5px solid transparent',
            transition: 'all 0.3s',
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 15,
              color: pet.training ? '#e07b00' : (dark ? '#e0a060' : '#444') }}>
              {pet.training ? '🏋️ Entrenando...' : '🏋️ Modo Entrenamiento'}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: dark ? '#8a6a3a' : '#999' }}>
              {pet.training
                ? `Fuerza: ${Math.round(pet.strength ?? 0)}% · ¡Quema calorías!`
                : 'Gana fuerza y pierde peso'}
            </p>
          </div>
          <button
            onClick={() => {
              if (_isTraining) {
                // Stop training — always allowed
                _isTraining = false;
                playSfx('wake');
                track('pet_stop_training');
                petStore.setState({ training: false });
                return;
              }
              // Check blocks before starting
              if (pet.health < 15) { setBlockedTraining({ reason: 'health' }); return; }
              if (pet.sleeping)    { setBlockedTraining({ reason: 'sleeping' }); return; }
              if (pet.hunger < 15) { setBlockedTraining({ reason: 'hunger' }); return; }
              if (pet.energy < 15) { setBlockedTraining({ reason: 'energy' }); return; }
              // All good — start training
              _isTraining = true;
              playSfx('feed_good');
              track('pet_start_training');
              petStore.setState({ training: true });
            }}
            style={{
              width: 56, height: 30, borderRadius: 99,
              background: pet.training ? '#e07b00' : (dark ? '#555' : '#ddd'),
              border: 'none', cursor: 'pointer',
              position: 'relative', transition: 'background 0.3s',
            }}
          >
            <div style={{
              position: 'absolute', top: 3,
              left: pet.training ? 'calc(100% - 27px)' : 3,
              width: 24, height: 24, borderRadius: '50%',
              background: 'white',
              transition: 'left 0.3s cubic-bezier(.34,1.56,.64,1)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12,
            }}>
              🏋️
            </div>
          </button>
        </div>

        {/* Last food */}
        {pet.lastFood && (
          <div
            style={{
              background: cardBg,
              backdropFilter: 'blur(20px)',
              borderRadius: 16,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, color: dark ? '#5a7a9a' : '#aaa' }}>
              Última:
            </span>
            <span
              style={{
                fontWeight: 700,
                fontSize: 13,
                color: txtCol,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {pet.lastFood.name}
            </span>
            <NutriScoreBadge score={pet.lastFood.score} size="small" />
          </div>
        )}

        <FoodLog log={foodLog} dark={dark} />
      </div>

      {/* FAB */}
      {!pet.sleeping && (
        <button
          onClick={() => {
            if (_isTraining) { showN('🏋️ ¡Estoy entrenando! Para primero para poder comer.'); return; }
            setShowScanner(true); track('scanner_opened');
          }}
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '16px 32px',
            borderRadius: 99,
            border: 'none',
            background: 'linear-gradient(135deg,#FF6B9D,#A855F7)',
            color: 'white',
            fontSize: 17,
            fontWeight: 900,
            cursor: 'pointer',
            boxShadow: '0 8px 30px rgba(255,107,157,0.5)',
            animation: 'pulse 2s ease-in-out infinite',
            zIndex: 50,
            whiteSpace: 'nowrap',
          }}
        >
          📷 ¡Escanear comida!
        </button>
      )}

      {showScanner && (
        <ScannerPanel
          onClose={() => setShowScanner(false)}
          onProduct={(p) => {
            setShowScanner(false);
            setPending(p);
          }}
        />
      )}
      {pending && (
        <ProductResult
          product={pending}
          onFeed={handleFeed}
          onCancel={() => setPending(null)}
        />
      )}
      {newAch && <AchievementToast achievement={newAch} onDone={() => setNewAch(null)} />}

      {/* Blocked training modal */}
      {blockedTraining && (() => {
        const cfg = {
          health:   { emoji: '🤒', title: '¡Estoy muy malito!',      body: 'No puedo entrenar cuando estoy tan enfermo. Dame alimentos con Nutri-Score A o B para recuperarme primero.', cta: '¡Voy a comer sano!' },
          hunger:   { emoji: '😫', title: '¡Tengo mucha hambre!',    body: 'Necesito energía antes de entrenar. Escanéame algo rico y nutritivo primero.', cta: '¡A comer!' },
          energy:   { emoji: '😴', title: '¡Estoy agotado!',         body: 'No tengo fuerzas para entrenar. Ponme a dormir un rato para recuperar energía.', cta: '¡A dormir!' },
          sleeping: { emoji: '💤', title: '¡Estoy durmiendo!',       body: 'Despiértame primero antes de ponerme a entrenar. ¡No se puede entrenar dormido!', cta: '¡Despertarme!' },
        }[blockedTraining.reason];
        return (
          <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.5)',
            display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
            onClick={() => setBlockedTraining(null)}>
            <div style={{ background:'white', borderRadius:28, padding:'32px 28px',
              maxWidth:320, width:'100%', textAlign:'center',
              boxShadow:'0 20px 60px rgba(0,0,0,0.25)',
              animation:'achievementPop 0.4s cubic-bezier(.34,1.56,.64,1)' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize:60, marginBottom:12 }}>{cfg.emoji}</div>
              <h3 style={{ fontSize:20, fontWeight:900, color:'#333', marginBottom:10 }}>{cfg.title}</h3>
              <p style={{ fontSize:14, color:'#666', lineHeight:1.6, marginBottom:24 }}>{cfg.body}</p>
              <button onClick={() => {
                  if (blockedTraining.reason === 'sleeping') {
                    _isTraining = false;
                    petStore.setState({ sleeping: false, training: false });
                  }
                  setBlockedTraining(null);
                }}
                style={{ background:'linear-gradient(135deg,#FF6B9D,#ff8fab)', color:'white',
                  border:'none', padding:'14px 32px', borderRadius:50, fontSize:15,
                  fontWeight:800, cursor:'pointer', width:'100%',
                  boxShadow:'0 4px 16px rgba(255,107,157,0.4)' }}>
                {cfg.cta}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Blocked food modal */}
      {blockedProduct && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
          animation: 'fadeIn 0.2s ease',
        }} onClick={() => { setBlockedProduct(null); setPending(null); }}>
          <div style={{
            background: 'white', borderRadius: 28, padding: '32px 28px',
            maxWidth: 320, width: '100%', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            animation: 'achievementPop 0.4s cubic-bezier(.34,1.56,.64,1)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🚫</div>
            <h3 style={{ fontSize: 20, fontWeight: 900, color: '#333', marginBottom: 10 }}>
              ¡Demasiado de lo mismo!
            </h3>
            <p style={{ fontSize: 15, color: '#666', lineHeight: 1.6, marginBottom: 8 }}>
              Ya le diste <strong>{blockedProduct.name}</strong> dos veces seguidas.
            </p>
            <p style={{ fontSize: 14, color: '#999', lineHeight: 1.6, marginBottom: 24 }}>
              Espera <strong style={{ color: '#FF6B9D' }}>~{blockedProduct.minutes} min</strong> o prueba con otro alimento. ¡La variedad es importante para una dieta sana! 🥗
            </p>
            <button
              onClick={() => { setBlockedProduct(null); setPending(null); }}
              style={{
                background: 'linear-gradient(135deg,#FF6B9D,#ff8fab)',
                color: 'white', border: 'none',
                padding: '14px 32px', borderRadius: 50,
                fontSize: 15, fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(255,107,157,0.4)',
                width: '100%',
              }}
            >
              ¡Entendido! 👍
            </button>
          </div>
        </div>
      )}
      {showAchievements && <AchievementsScreen unlocked={unlockedAch} onClose={() => setShowAchievements(false)} dark={dark} />}
      {showAccessories && <AccessoriesScreen unlocked={unlockedAcc} equipped={equippedAcc} onEquip={handleEquipAccessory} onClose={() => setShowAccessories(false)} dark={dark} />}
      {showStatsScreen && <StatsScreen userId={pet.userId} username={pet.username} totalFeedings={pet.totalFeedings} goodFeedings={pet.goodFeedings} onClose={() => setShowStatsScreen(false)} dark={dark} />}
      <style>{`@keyframes achievementPop{from{opacity:0;transform:translateX(-50%) translateY(-20px) scale(0.8)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}`}</style>
    </div>
  );
}
