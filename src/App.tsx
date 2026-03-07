import { useState, useEffect, useRef } from 'react';

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SUPA_URL = 'https://qalhzbfbvbcnriatzgtn.supabase.co';
const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhbGh6YmZidmJjbnJpYXR6Z3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NDg4MjMsImV4cCI6MjA4ODMyNDgyM30.KC-ZwGBviHBKuu0xWqvyDIUZGIJj8aa9E9gT_7yv5TQ';

const db = {
  headers: {
    'Content-Type': 'application/json',
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
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

const petStore = createStore({
  loggedIn: false,
  userId: null,
  username: '',
  emoji: '🐱',
  health: 85,
  hunger: 70,
  energy: 80,
  sleeping: false,
  mood: 'happy',
  lastFood: null,
  feedAnim: false,
  totalFeedings: 0,
  goodFeedings: 0,
});

function usePetStore() {
  const [s, set] = useState(petStore.getState());
  useEffect(() => petStore.subscribe(set), []);
  return s;
}

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
function PetFace({ mood, sleeping, health, feedAnim }) {
  const sick = mood === 'sick' || health < 20;
  const tired = mood === 'tired' || health < 40;
  const body = sick ? '#c0c0c0' : health > 60 ? '#FFB3C6' : '#f0c0a0';
  const cheek = sick ? '#b0b0b0' : '#ff8fab';
  return (
    <div style={{ position: 'relative', width: 160, height: 160 }}>
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
            : sleeping
            ? 'none'
            : 'float 3s ease-in-out infinite',
        }}
      >
        <ellipse cx="40" cy="38" rx="18" ry="22" fill={body} />
        <ellipse cx="120" cy="38" rx="18" ry="22" fill={body} />
        <ellipse cx="40" cy="38" rx="10" ry="14" fill="#ffccd5" />
        <ellipse cx="120" cy="38" rx="10" ry="14" fill="#ffccd5" />
        <ellipse cx="80" cy="100" rx="55" ry="50" fill={body} />
        <ellipse cx="80" cy="108" rx="32" ry="26" fill="#ffe4ec" />
        <ellipse cx="80" cy="75" rx="45" ry="42" fill={body} />
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
              rx="10"
              ry="7"
              fill={cheek}
              opacity="0.5"
            />
            <ellipse
              cx="110"
              cy="84"
              rx="10"
              ry="7"
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
function StatBar({ label, value, icon, color }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 13,
          marginBottom: 4,
          fontWeight: 600,
          color: '#555',
        }}
      >
        <span>
          {icon} {label}
        </span>
        <span style={{ color }}>{Math.round(value)}%</span>
      </div>
      <div
        style={{
          height: 14,
          background: '#eee',
          borderRadius: 99,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${value}%`,
            background: `linear-gradient(90deg,${color}cc,${color})`,
            borderRadius: 99,
            transition: 'width 0.6s cubic-bezier(.34,1.56,.64,1)',
          }}
        />
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
function CameraScanner({ onDetected, onClose }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [status, setStatus] = useState<'idle'|'processing'|'error'|'success'>('idle');
  const [preview, setPreview] = useState<string|null>(null);
  const [errMsg, setErrMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Load ZXing on mount
  useEffect(() => {
    if (!(window as any).ZXing) {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/@zxing/library@0.19.1/umd/index.min.js';
      document.head.appendChild(s);
    }
  }, []);

  async function processImage(file: File) {
    setStatus('processing');
    setErrMsg('');

    // Show preview
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);

    // Give time for ZXing to load and image to render
    await new Promise(r => setTimeout(r, 600));

    // Method 1: Native BarcodeDetector (iOS 17+, Chrome)
    try {
      if ((window as any).BarcodeDetector) {
        const formats = ['ean_13','ean_8','code_128','code_39','upc_a','upc_e','itf','pdf417','qr_code'];
        const detector = new (window as any).BarcodeDetector({ formats });
        const img = imgRef.current;
        if (img) {
          const barcodes = await detector.detect(img);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            setStatus('success');
            onDetected(barcodes[0].rawValue);
            return;
          }
        }
      }
    } catch { /* try next method */ }

    // Method 2: ZXing on canvas
    try {
      const ZXing = (window as any).ZXing;
      if (ZXing) {
        const img = new Image();
        img.src = previewUrl;
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

        const canvas = canvasRef.current as HTMLCanvasElement;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
          ZXing.BarcodeFormat.EAN_13,
          ZXing.BarcodeFormat.EAN_8,
          ZXing.BarcodeFormat.CODE_128,
          ZXing.BarcodeFormat.CODE_39,
          ZXing.BarcodeFormat.UPC_A,
          ZXing.BarcodeFormat.UPC_E,
        ]);
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

        const reader = new ZXing.MultiFormatReader();
        reader.setHints(hints);
        const luminance = new ZXing.RGBLuminanceSource(imageData.data, canvas.width, canvas.height);
        const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminance));
        const result = reader.decode(bitmap);
        if (result && result.getText()) {
          setStatus('success');
          onDetected(result.getText());
          return;
        }
      }
    } catch { /* not found */ }

    // Nothing found
    setStatus('error');
    setErrMsg('No se detectó ningún código. Intenta acercarte más o con mejor luz.');
    setPreview(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processImage(file);
    // Reset input so same photo can be retried
    e.target.value = '';
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <canvas ref={canvasRef} style={{ display:'none' }} />
      <div style={{ width:'100%', maxWidth:380, background:'#111', borderRadius:28, overflow:'hidden' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 20px', background:'#1a1a1a' }}>
          <span style={{ color:'white', fontWeight:800, fontSize:16 }}>📷 Escanear código</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'white', borderRadius:'50%', width:34, height:34, cursor:'pointer', fontSize:16 }}>✕</button>
        </div>

        <div style={{ padding:24 }}>
          {/* Preview */}
          {preview && (
            <div style={{ marginBottom:16, borderRadius:16, overflow:'hidden', background:'#000', textAlign:'center' }}>
              <img
                ref={imgRef}
                src={preview}
                crossOrigin="anonymous"
                style={{ maxWidth:'100%', maxHeight:200, objectFit:'contain', display:'block', margin:'0 auto' }}
                alt="preview"
              />
            </div>
          )}

          {/* Status message */}
          {status === 'processing' && (
            <div style={{ textAlign:'center', padding:'12px 0', marginBottom:16 }}>
              <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
              <p style={{ color:'#aaa', fontSize:14, margin:0 }}>Analizando imagen...</p>
            </div>
          )}
          {status === 'error' && (
            <div style={{ background:'#2a1515', borderRadius:14, padding:14, marginBottom:16, textAlign:'center' }}>
              <p style={{ color:'#ff6b6b', fontSize:13, margin:0, lineHeight:1.5 }}>⚠️ {errMsg}</p>
            </div>
          )}

          {/* Main button - opens camera on iPhone */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            style={{ display:'none' }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={status === 'processing'}
            style={{
              width:'100%', padding:'16px 0', borderRadius:18, border:'none',
              background: status === 'processing' ? '#333' : 'linear-gradient(135deg,#FF6B9D,#A855F7)',
              color:'white', fontSize:17, fontWeight:900, cursor: status === 'processing' ? 'default' : 'pointer',
              boxShadow: status === 'processing' ? 'none' : '0 6px 20px rgba(255,107,157,0.4)',
              marginBottom:12,
            }}
          >
            {status === 'processing' ? '⏳ Procesando...' : status === 'error' ? '📷 Intentar otra vez' : '📷 Abrir cámara'}
          </button>

          {/* Instructions */}
          <div style={{ background:'#1a1a1a', borderRadius:14, padding:14 }}>
            <p style={{ color:'#666', fontSize:12, margin:'0 0 8px', fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>Cómo hacerlo</p>
            {[
              '📷 Pulsa "Abrir cámara"',
              '🎯 Enfoca el código de barras',
              '📸 Haz la foto',
              '✅ ¡Listo! Se detecta solo',
            ].map((tip, i) => (
              <p key={i} style={{ color:'#888', fontSize:13, margin: i < 3 ? '0 0 6px' : 0 }}>{tip}</p>
            ))}
          </div>
        </div>
      </div>
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
      petStore.setState({
        loggedIn: true,
        userId: user.id,
        username: user.username,
        emoji: user.emoji,
        health: pet.health,
        hunger: pet.hunger,
        energy: pet.energy,
        sleeping: pet.sleeping,
        mood: pet.mood,
        lastFood: pet.last_food,
        totalFeedings: pet.total_feedings,
        goodFeedings: pet.good_feedings,
      });
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
function FoodLog({ log }) {
  if (!log.length) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <p
        style={{
          margin: '0 0 8px',
          fontSize: 13,
          fontWeight: 700,
          color: '#aaa',
        }}
      >
        Historial reciente
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {log.map((item, i) => {
          const cfg = getNC(item.score);
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 12,
                background: cfg.bg,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: cfg.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                  color: 'white',
                }}
              >
                {cfg.label}
              </div>
              <p
                style={{
                  margin: 0,
                  flex: 1,
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#444',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.product_name || item.name}
              </p>
              <span style={{ fontSize: 11, color: '#aaa' }}>
                {new Date(item.eaten_at || item.time).toLocaleTimeString(
                  'es-ES',
                  { hour: '2-digit', minute: '2-digit' }
                )}
              </span>
            </div>
          );
        })}
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
  const [showStats, setShowStats] = useState(false);
  const [foodLog, setFoodLog] = useState([]);
  const saveTimer = useRef(null);

  // Load food log on login
  useEffect(() => {
    if (pet.loggedIn && pet.userId) {
      db.getFoodLog(pet.userId)
        .then(setFoodLog)
        .catch(() => {});
    }
  }, [pet.loggedIn, pet.userId]);

  // Debounced save to Supabase
  function scheduleSave(state) {
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
    }, 3000); // save every 3 seconds max
  }

  // Time decay
  useEffect(() => {
    if (!pet.loggedIn) return;
    const id = setInterval(() => {
      petStore.setState((s) => {
        if (!s.loggedIn) return s;
        let next;
        if (s.sleeping) {
          next = {
            energy: Math.min(100, s.energy + 0.3),
            health: Math.min(100, s.health + 0.04),
            hunger: Math.max(0, s.hunger - 0.02),
          };
        } else {
          const h = Math.max(0, s.health - 0.025);
          const u = Math.max(0, s.hunger - 0.05);
          const e = Math.max(0, s.energy - 0.03);
          let mood = 'happy';
          if (h < 20) mood = 'sick';
          else if (e < 25 || u < 20) mood = 'tired';
          next = { health: h, hunger: u, energy: e, mood };
        }
        scheduleSave({ ...s, ...next });
        return next;
      });
    }, 1000);
    return () => {
      clearInterval(id);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [pet.loggedIn]);

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
    const cfg = getNC(product.score);
    petStore.setState((s) => {
      const next = {
        health: Math.max(0, Math.min(100, s.health + cfg.healthDelta)),
        hunger: Math.min(100, s.hunger + cfg.hungerDelta),
        energy: Math.max(0, Math.min(100, s.energy + cfg.energyDelta)),
        feedAnim: true,
        lastFood: product,
        totalFeedings: s.totalFeedings + 1,
        goodFeedings:
          s.goodFeedings +
          (['a', 'b'].includes((product.score || '').toLowerCase()) ? 1 : 0),
        mood: cfg.healthDelta < 0 ? 'sick' : 'happy',
      };
      scheduleSave({ ...s, ...next });
      return next;
    });
    setTimeout(() => petStore.setState({ feedAnim: false }), 800);
    showN(cfg.msg);
    setPending(null);
    // Save food log to Supabase
    try {
      await db.addFoodLog(pet.userId, product);
      const updated = await db.getFoodLog(pet.userId);
      setFoodLog(updated);
    } catch {}
  }

  function handleLogout() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    petStore.setState({
      loggedIn: false,
      userId: null,
      username: '',
      emoji: '🐱',
      health: 85,
      hunger: 70,
      energy: 80,
      sleeping: false,
      mood: 'happy',
      lastFood: null,
      feedAnim: false,
      totalFeedings: 0,
      goodFeedings: 0,
    });
    setFoodLog([]);
  }

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
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowStats((s) => !s)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: dark
                  ? 'rgba(255,255,255,0.1)'
                  : 'rgba(255,255,255,0.7)',
                border: 'none',
                cursor: 'pointer',
                fontSize: 18,
                backdropFilter: 'blur(10px)',
              }}
            >
              📊
            </button>
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: dark
                  ? 'rgba(255,255,255,0.1)'
                  : 'rgba(255,255,255,0.7)',
                border: 'none',
                cursor: 'pointer',
                fontSize: 18,
                backdropFilter: 'blur(10px)',
              }}
            >
              🚪
            </button>
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
            <PetFace
              mood={pet.mood}
              sleeping={pet.sleeping}
              health={pet.health}
              feedAnim={pet.feedAnim}
            />
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
              {dark
                ? '😴 Durmiendo...'
                : pet.health < 20
                ? '🤒 ¡Necesita comida sana!'
                : pet.mood === 'tired'
                ? '😴 ¡Cansado y con hambre!'
                : '😊 ¡Me siento bien!'}
            </span>
          </div>
          <StatBar label="Salud" value={pet.health} icon="💖" color="#FF6B9D" />
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
              {dark ? '💤 Modo Descanso' : '☀️ Modo Activo'}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: dark ? '#5a7a9a' : '#999',
              }}
            >
              {dark ? 'Recuperando energía...' : '¡Listo para comer!'}
            </p>
          </div>
          <button
            onClick={() =>
              petStore.setState((s) => ({ sleeping: !s.sleeping }))
            }
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

        <FoodLog log={foodLog} />
      </div>

      {/* FAB */}
      {!pet.sleeping && (
        <button
          onClick={() => setShowScanner(true)}
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
    </div>
  );
}
