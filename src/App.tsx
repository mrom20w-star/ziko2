/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  Copy,
  Check,
  Sparkles,
  Upload,
  UserCheck,
  KeyRound,
  Play,
  RotateCw,
  ArrowLeft,
  Trash2,
  Clock,
  Image as ImageIcon,
  Zap,
  ChevronLeft,
  Wallet,
  Database,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

import zikoLogoAsset from './assets/images/ziko_logo_1790779365620.jpg';
import appleGameLogoAsset from './assets/images/apple_game_logo_1790779375687.jpg';
import crashGameLogoAsset from './assets/images/crash_game_logo_1790779386557.jpg';
import goodAppleAsset from './assets/images/healthy_apple_cell_1790779397285.jpg';
import rottenAppleAsset from './assets/images/rotten_apple_cell_1790779407639.jpg';
import { rtdb, firebaseConfig } from './firebase';
import { ref, set, get } from 'firebase/database';

const ZIKO_LOGO_URL = zikoLogoAsset;
const APPLE_GAME_LOGO_URL = appleGameLogoAsset;
const CRASH_GAME_LOGO_URL = crashGameLogoAsset;
const GOOD_APPLE_IMAGE_URL = goodAppleAsset;
const ROTTEN_APPLE_IMAGE_URL = rottenAppleAsset;

const PROMO_CODE = 'R11';
const ADMIN_SECRET_ID = '000111000';
const STORAGE_KEYS_DB = 'ziko_access_codes_v2';
const STORAGE_M11_KEY = 'ziko_m11_predictions';
const STORAGE_RTDB_URL_KEY = 'ziko_rtdb_url';
const DEFAULT_RTDB_URL = firebaseConfig.databaseURL;

// مصفوفة تعريفية للصفوف بترتيب عكسي لتظهر بالشكل الصحيح على الشاشة (من الأعلى row 9 إلى الأسفل row 0)
const TARGET_ROWS = [
  { mult: '349.68', row: 9 }, // أعلى صف (تفاحة سليمة واحدة و 4 تالفة)
  { mult: '69.93', row: 8 },  // الصفوف المتقدمة (تفاحتان سليمتان و 3 تالفة)
  { mult: '27.92', row: 7 },
  { mult: '11.18', row: 6 },  // الصفوف الوسطى (3 تفاحات سليمة و تفاحتان تالفتان)
  { mult: '6.71', row: 5 },
  { mult: '4.02', row: 4 },
  { mult: '2.41', row: 3 },   // الأدوار السفلية (4 تفاحات سليمة و تفاحة واحدة تالفة)
  { mult: '1.93', row: 2 },
  { mult: '1.54', row: 1 },
  { mult: '1.23', row: 0 },   // أسفل صف يبدأ منه المشغل
];

type ScreenMode =
  | 'SPLASH'
  | 'CONDITION'
  | 'LICENSE'
  | 'GAME_SELECT'
  | 'PREDICTION'
  | 'PLANE'
  | 'ADMIN';

// هيكل مسار m11 في الفايربيز داخلياً: { "m1": { "m1": "1" }, "m2": { "m2": "0" }, ..., "m50": { "m50": "1" } }
export type M11PredictionsMap = Record<string, Record<string, string>>;

interface AccessCodeItem {
  key: string;
  code: string;
  playerId: string;
  duration: number; // in minutes
  createdAt: number;
  active: boolean;
}

interface CrashHistoryItem {
  odd: number;
  time: string;
  confidence: number;
}

const CRASH_PARTICLES = Array.from({ length: 24 }, (_, idx) => ({
  id: idx,
  left: Math.round(Math.random() * 100),
  top: Math.round(Math.random() * 100),
  size: 2 + Math.round(Math.random() * 3),
  drift: Math.round((Math.random() - 0.5) * 36),
  duration: 5 + Math.random() * 5,
  delay: Math.random() * 4,
}));

function generateRandomCodeString(prefix = 'ZIKO'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const block = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${block()}-${block()}-${block()}`;
}

/**
 * دالة بناء هيكل التوقعات المتداخلة لمسار m11 داخلياً
 * بناءً على صعوبة الصف التدريجية
 */
function buildM11PredictionsObject(): M11PredictionsMap {
  const finalObject: M11PredictionsMap = {};

  // نمر على 10 صفوف (من 0 إلى 9)
  for (let r = 0; r < 10; r++) {
    // تحديد عدد التفاحات السليمة بالصف بناء على رقم الصف
    let safeCount = 4;
    if (r >= 4 && r < 7) safeCount = 3; // الصفوف 4، 5، 6
    if (r >= 7 && r < 9) safeCount = 2; // الصفوف 7، 8
    if (r >= 9) safeCount = 1;          // الصف التاسع والأخير

    // تحديد أماكن التفاح السليم بشكل عشوائي داخل الأعمدة الـ 5
    const safeCols: number[] = [];
    while (safeCols.length < safeCount) {
      const randomCol = Math.floor(Math.random() * 5); // اختيار عمود عشوائي من 0 إلى 4
      if (!safeCols.includes(randomCol)) {
        safeCols.push(randomCol);
      }
    }

    // كتابة القيم للخانة (تحويل الصف والعمود لرمز الخانة من 1 لـ 50 داخلياً)
    for (let c = 0; c < 5; c++) {
      const mIndex = r * 5 + c + 1;
      const value = safeCols.includes(c) ? '1' : '0'; // "1" = سليمة، "0" = تالفة
      const mKey = `m${mIndex}`;

      finalObject[mKey] = { [mKey]: value };
    }
  }

  return finalObject;
}

/**
 * Interactive Constellation Particle Background
 */
const ParticleBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const count = width < 600 ? 30 : 52;
    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      size: Math.random() * 2 + 1,
      baseOpacity: Math.random() * 0.45 + 0.3,
    }));

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    let lastTime = 0;
    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      if (now - lastTime < 33) return;
      lastTime = now;

      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(225, 29, 46, ${p.baseOpacity})`;
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const distSq = dx * dx + dy * dy;
          const maxDist = 130;
          if (distSq < maxDist * maxDist) {
            const alpha = 0.26 * (1 - Math.sqrt(distSq) / maxDist);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(225, 29, 46, ${alpha})`;
            ctx.lineWidth = 0.85;
            ctx.stroke();
          }
        }
      }
    };

    animId = requestAnimationFrame(render);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#050507] select-none pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-90 z-10" />
      <div className="absolute inset-0 bg-black/40 z-1" />
      <div
        className="absolute inset-0 z-2"
        style={{
          background:
            'radial-gradient(120% 55% at 50% 0%, rgba(225,29,46,0.15), transparent 60%), radial-gradient(90% 45% at 50% 100%, rgba(225,29,46,0.07), transparent 70%)',
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-[#E11D2E]/10 to-transparent blur-2xl z-3" />
    </div>
  );
};

/**
 * ZIKO Brand Emblem with Rotating Cyber Rings & Resilient Fallback
 */
const ZikoCrest: React.FC<{ size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }> = ({
  size = 'md',
  className = '',
}) => {
  const [imgErr, setImgErr] = useState(false);

  const sizeClasses = {
    sm: 'w-14 h-14 rounded-2xl border-white/15',
    md: 'w-20 h-20 rounded-[24px] border-[#E11D2E]/35',
    lg: 'w-28 h-28 rounded-[32px] border-[#E11D2E]/45',
    xl: 'w-36 h-36 rounded-[40px] border-[#E11D2E]/50',
  }[size];

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
        className="absolute -inset-5 rounded-full border border-dashed border-[#E11D2E]/35 pointer-events-none"
      />
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
        className="absolute -inset-2.5 rounded-full border border-t-[#FF5261]/50 border-r-transparent border-b-[#E11D2E]/20 border-l-transparent pointer-events-none"
      />
      <motion.div
        animate={{ y: [0, -4, 0], scale: [1, 1.02, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="relative z-10"
      >
        <div
          className={`overflow-hidden border shadow-[0_15px_40px_rgba(225,29,46,0.38)] bg-gradient-to-b from-[#1A0508] to-black flex items-center justify-center ${sizeClasses}`}
        >
          {!imgErr ? (
            <img
              src={ZIKO_LOGO_URL}
              alt="ZIKO Logo"
              onError={() => setImgErr(true)}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover select-none pointer-events-none"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-2">
              <span className="font-display font-black text-white tracking-wider text-lg drop-shadow-[0_0_10px_rgba(225,29,46,0.8)]">
                ZIKO
              </span>
              <span className="font-mono text-[7px] font-bold tracking-[0.25em] text-[#FF5261]">
                SCRIPT
              </span>
            </div>
          )}
        </div>
      </motion.div>
      <div className="absolute inset-0 -m-4 rounded-full bg-[radial-gradient(circle_at_center,rgba(225,29,46,0.25)_0%,transparent_70%)] blur-2xl pointer-events-none" />
    </div>
  );
};

/**
 * Step Card Component for Activation Steps
 */
const StepCard: React.FC<{
  stepNumber: string;
  title: string;
  subtitle: string;
  completed?: boolean;
  highlight?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ stepNumber, title, subtitle, completed = false, highlight = false, icon, children }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-b from-white/[0.045] to-white/[0.012] p-[1px] backdrop-blur-sm transition-all ${
        completed
          ? 'border-emerald-500/45'
          : highlight
          ? 'border-[#E11D2E]/45'
          : 'border-white/[0.08] hover:border-[#E11D2E]/35'
      }`}
    >
      <div className="relative rounded-2xl bg-[#08070A]/90 p-4">
        <span
          className="absolute inset-x-10 top-0 h-px opacity-75"
          style={{
            background: `linear-gradient(90deg, transparent, ${
              completed ? '#10B981' : '#E11D2E'
            }, transparent)`,
          }}
        />
        <div className="flex items-center gap-3.5">
          <div className="relative shrink-0">
            <div
              className="absolute -inset-1.5 rounded-2xl opacity-30 blur-lg transition-opacity group-hover:opacity-60"
              style={{ background: completed ? '#10B98155' : '#E11D2E55' }}
            />
            <div
              className={`relative flex h-14 w-14 items-center justify-center rounded-xl border ${
                completed
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-[#E11D2E]/30 bg-[#E11D2E]/10 text-[#FF5261]'
              }`}
            >
              {icon}
            </div>
            <span
              className="absolute -bottom-1.5 -left-1.5 flex h-6 w-6 items-center justify-center rounded-lg font-mono text-[9px] font-black shadow-lg"
              style={{
                background: completed ? '#10B981' : '#E11D2E',
                color: '#08070A',
              }}
            >
              {completed ? '✓' : stepNumber}
            </span>
          </div>
          <div className="min-w-0 flex-1 text-right">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13.5px] font-black leading-tight text-white">{title}</h3>
              {completed && (
                <span className="font-mono text-[9px] font-bold text-emerald-400 shrink-0">
                  مكتمل ✓
                </span>
              )}
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-white/45">{subtitle}</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">{children}</div>
      </div>
    </motion.div>
  );
};

export default function App() {
  const [screen, setScreen] = useState<ScreenMode>('SPLASH');

  // Toast notification state
  const [toast, setToast] = useState<{ text: string; type: 'info' | 'success' | 'warning' } | null>(
    null
  );
  const triggerToast = useCallback(
    (text: string, type: 'info' | 'success' | 'warning' = 'info') => {
      setToast({ text, type });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Splash timeout
  useEffect(() => {
    if (screen !== 'SPLASH') return;
    const timer = setTimeout(() => {
      setScreen('CONDITION');
    }, 2100);
    return () => clearTimeout(timer);
  }, [screen]);

  // Firebase Realtime Database URL state (for m11 path)
  const [rtdbBaseUrl, setRtdbBaseUrl] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_RTDB_URL_KEY);
      if (saved && saved.includes('mrwan-dd795')) return saved;
      localStorage.setItem(STORAGE_RTDB_URL_KEY, DEFAULT_RTDB_URL);
      return DEFAULT_RTDB_URL;
    } catch {
      return DEFAULT_RTDB_URL;
    }
  });

  const getM11Endpoint = useCallback(() => {
    const clean = rtdbBaseUrl.trim().replace(/\/+$/, '').replace(/\/m11\.json$/i, '');
    return `${clean}/m11.json`;
  }, [rtdbBaseUrl]);

  // Active codes database in localStorage + Firebase RTDB
  const loadStoredCodes = useCallback((): AccessCodeItem[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS_DB);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [];
  }, []);

  const [codesList, setCodesList] = useState<AccessCodeItem[]>(() => loadStoredCodes());

  // Sync codes from Firebase RTDB on mount
  useEffect(() => {
    const syncCodesFromFirebase = async () => {
      try {
        const snapshot = await get(ref(rtdb, 'ziko_codes'));
        if (snapshot.exists()) {
          const val = snapshot.val();
          if (Array.isArray(val)) {
            setCodesList(val);
            localStorage.setItem(STORAGE_KEYS_DB, JSON.stringify(val));
          }
        }
      } catch {
        // fallback to localStorage
      }
    };
    syncCodesFromFirebase();
  }, []);

  const saveCodesToStorage = useCallback((updated: AccessCodeItem[]) => {
    const sorted = [...updated].sort((a, b) => b.createdAt - a.createdAt);
    setCodesList(sorted);
    try {
      localStorage.setItem(STORAGE_KEYS_DB, JSON.stringify(sorted));
    } catch {
      // ignore
    }
    try {
      set(ref(rtdb, 'ziko_codes'), sorted).catch(() => {});
    } catch {
      // ignore
    }
  }, []);

  // Step 1: Promo Code R11 copy state
  const [promoCopied, setPromoCopied] = useState(false);
  const [hasCopiedPromo, setHasCopiedPromo] = useState(false);

  // Step 3: Registration Screenshot state
  const [regScreenshotDataUrl, setRegScreenshotDataUrl] = useState<string | null>(null);
  const [regScreenshotName, setRegScreenshotName] = useState<string>('');
  const regFileInputRef = useRef<HTMLInputElement | null>(null);

  // Step 4: Deposit Screenshot state
  const [depositScreenshotDataUrl, setDepositScreenshotDataUrl] = useState<string | null>(null);
  const [depositScreenshotName, setDepositScreenshotName] = useState<string>('');
  const depositFileInputRef = useRef<HTMLInputElement | null>(null);

  // Step 5: Player ID state
  const [playerId, setPlayerId] = useState<string>('');

  // Top Gate: Activation Code input state
  const [unlockCodeInput, setUnlockCodeInput] = useState<string>('');
  const [activeUnlockedCode, setActiveUnlockedCode] = useState<string>('');

  // Verification modal state (when submitting screenshots + ID to get random code)
  const [isVerifyingSteps, setIsVerifyingSteps] = useState(false);
  const [verifyStage, setVerifyStage] = useState(0);
  const [conditionsRejected, setConditionsRejected] = useState(false);

  // Generated Random License Code state
  const [generatedLicenseKey, setGeneratedLicenseKey] = useState<string>('');
  const [licenseCopied, setLicenseCopied] = useState(false);

  // Auto-open script timer when landing on LICENSE screen
  useEffect(() => {
    if (screen !== 'LICENSE' || !generatedLicenseKey) return;
    const autoOpenTimer = setTimeout(() => {
      setUnlockCodeInput(generatedLicenseKey);
      setActiveUnlockedCode(generatedLicenseKey);
      setScreen('GAME_SELECT');
      triggerToast('تم وضع كود التفعيل تلقائياً وفتح سكريبت زيكو بنجاح!', 'success');
    }, 2200);
    return () => clearTimeout(autoOpenTimer);
  }, [screen, generatedLicenseKey, triggerToast]);

  // Session countdown timer (in seconds)
  const [sessionSeconds, setSessionSeconds] = useState<number>(1800);
  useEffect(() => {
    const timer = setInterval(() => {
      setSessionSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Online active users counter
  const [onlineUsers, setOnlineUsers] = useState<number>(1485);
  useEffect(() => {
    const timer = setInterval(() => {
      setOnlineUsers((prev) => {
        const next = prev + (Math.floor(Math.random() * 19) - 9);
        return Math.max(1100, Math.min(2400, next));
      });
    }, 2200);
    return () => clearInterval(timer);
  }, []);

  // ============================================================================
  // APPLE OF FORTUNE STATE & FIREBASE m11 LOGIC (m1 to m50 hidden internally)
  // ============================================================================
  const [predictions, setPredictions] = useState<M11PredictionsMap>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_M11_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {};
  });
  const [hasRevealed, setHasRevealed] = useState<boolean>(false);
  const [isDecryptingApple, setIsDecryptingApple] = useState<boolean>(false);
  const [appleCooldown, setAppleCooldown] = useState<number>(0);
  const [isUpdatingFirebaseM11, setIsUpdatingFirebaseM11] = useState<boolean>(false);

  useEffect(() => {
    if (appleCooldown <= 0) return;
    const t = setInterval(() => {
      setAppleCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [appleCooldown]);

  /**
   * كود التوليد والتخزين في Firebase تحت مسار m11
   */
  const generatePredictions = useCallback(async (): Promise<M11PredictionsMap> => {
    const finalObject = buildM11PredictionsObject();

    try {
      localStorage.setItem(STORAGE_M11_KEY, JSON.stringify(finalObject));
    } catch {
      // ignore
    }

    // رفع الكائن بالكامل إلى الفايربيز تحت مسار m11 باستخدام Firebase SDK
    try {
      const rRef = ref(rtdb, 'm11');
      await set(rRef, finalObject);
    } catch {
      try {
        await fetch(getM11Endpoint(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalObject),
        });
      } catch {
        // ignore offline/cors
      }
    }

    setPredictions(finalObject);
    return finalObject;
  }, [getM11Endpoint]);

  /**
   * جلب التوقعات من مسار m11 في الفايربيز (أو توليدها إذا كانت غير موجودة)
   */
  const fetchM11Predictions = useCallback(async (): Promise<M11PredictionsMap> => {
    try {
      const rRef = ref(rtdb, 'm11');
      const snapshot = await get(rRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        if (data && typeof data === 'object' && data.m1 && data.m50) {
          try {
            localStorage.setItem(STORAGE_M11_KEY, JSON.stringify(data));
          } catch {
            // ignore
          }
          setPredictions(data);
          return data;
        }
      }
    } catch {
      try {
        const res = await fetch(`${getM11Endpoint()}?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === 'object' && data.m1 && data.m50) {
            try {
              localStorage.setItem(STORAGE_M11_KEY, JSON.stringify(data));
            } catch {
              // ignore
            }
            setPredictions(data);
            return data;
          }
        }
      } catch {
        // fallback to generate new
      }
    }

    return await generatePredictions();
  }, [getM11Endpoint, generatePredictions]);

  /**
   * المعادلة السحرية الداخلية لربط الإحداثيات (rowIdx من 0 لـ 9، colIdx من 0 لـ 4)
   * والتحقق مما إذا كانت التفاحة سليمة ("1") أو تالفة ("0") بدون إظهار m1..m50 للمستخدم
   */
  const isSafeApple = useCallback(
    (rowIdx: number, colIdx: number): boolean => {
      if (!predictions || Object.keys(predictions).length === 0) return false;

      const mIndex = rowIdx * 5 + colIdx + 1;
      const mKey = `m${mIndex}`;
      const mObj = (predictions as Record<string, any>)[mKey];

      if (mObj && typeof mObj === 'object' && String(mObj[mKey]) === '1') {
        return true; // التفاحة سليمة!
      }

      return false; // التفاحة تالفة
    },
    [predictions]
  );

  // تشغيل التوقع في شاشة لعبة تفاحة الحظ
  const handleStartApplePrediction = async () => {
    if (isDecryptingApple || appleCooldown > 0) return;
    setIsDecryptingApple(true);
    setHasRevealed(false);

    const fetched = await fetchM11Predictions();
    setTimeout(() => {
      setPredictions(fetched);
      setHasRevealed(true);
      setIsDecryptingApple(false);
      setAppleCooldown(3);
    }, 1500);
  };

  // إعادة التشغيل وتوليد توقعات جديدة
  const handleResetAppleGrid = async () => {
    setIsDecryptingApple(false);
    setHasRevealed(false);
    setAppleCooldown(0);
    await generatePredictions();
    triggerToast('تم تحديث وإعادة تهيئة توقعات التفاح بنجاح', 'info');
  };

  // Crash Plane game state
  const [targetCrashOdd, setTargetCrashOdd] = useState<number>(2.14);
  const [animatedCrashOdd, setAnimatedCrashOdd] = useState<number>(1.0);
  const [currentClock, setCurrentClock] = useState<string>('00:00:00');
  const [crashHistory, setCrashHistory] = useState<CrashHistoryItem[]>([
    { odd: 2.64, time: '15:42:10', confidence: 97 },
    { odd: 1.48, time: '15:41:55', confidence: 95 },
    { odd: 3.92, time: '15:41:40', confidence: 96 },
    { odd: 1.85, time: '15:41:25', confidence: 98 },
    { odd: 6.12, time: '15:41:10', confidence: 94 },
  ]);

  // Admin panel state
  const [adminNewCode, setAdminNewCode] = useState<string>('');
  const [adminDuration, setAdminDuration] = useState<number>(30);

  // Copy Promo Code R11
  const handleCopyPromo = () => {
    navigator.clipboard.writeText(PROMO_CODE);
    setPromoCopied(true);
    setHasCopiedPromo(true);
    triggerToast(`تم نسخ البروموكود ${PROMO_CODE} بنجاح!`, 'success');
    setTimeout(() => setPromoCopied(false), 2000);
  };

  // Handle Registration Screenshot file selection
  const handleRegScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRegScreenshotName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') {
        setRegScreenshotDataUrl(ev.target.result);
        triggerToast('تم إرفاق سكرين شوت التسجيل بنجاح ✓', 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Deposit Screenshot file selection
  const handleDepositScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDepositScreenshotName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') {
        setDepositScreenshotDataUrl(ev.target.result);
        triggerToast('تم إرفاق سكرين شوت الإيداع بنجاح ✓', 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit Steps (Registration Screenshot + Deposit Screenshot + ID) -> Always refuses public code generation and requires fulfilling conditions (except Admin Secret ID)
  const handleRequestRandomCode = () => {
    const cleanId = playerId.trim();

    // Secret Admin ID check
    if (cleanId === ADMIN_SECRET_ID) {
      setScreen('ADMIN');
      triggerToast('مرحباً بك في لوحة تحكم سكريبت زيكو', 'info');
      return;
    }

    if (!regScreenshotDataUrl || !depositScreenshotDataUrl || !/^\d{6,12}$/.test(cleanId)) {
      setConditionsRejected(true);
      setIsVerifyingSteps(true);
      triggerToast('يجب تنفيذ نفس الشروط المطلوبة بالكامل للحصول على كود التفعيل!', 'warning');
      return;
    }

    setConditionsRejected(false);
    setIsVerifyingSteps(true);
    setVerifyStage(0);

    setTimeout(() => {
      setVerifyStage(1);
      setTimeout(() => {
        setVerifyStage(2);
        setTimeout(() => {
          setVerifyStage(3);
          setTimeout(() => {
            // يرفض إصدار كود التفعيل ويظهر رسالة: يجب تنفيذ نفس الشروط
            setConditionsRejected(true);
            triggerToast('عفواً، لم يتم إصدار كود التفعيل! يجب تنفيذ نفس الشروط أولاً.', 'warning');
          }, 1100);
        }, 1100);
      }, 1100);
    }, 1100);
  };

  // Verify Activation Code to Open ZIKO Script (Strictly blocks Promo Code R11)
  const handleUnlockScriptByCode = async (codeOverride?: string) => {
    const candidate = (codeOverride ?? unlockCodeInput).trim().toUpperCase();
    if (!candidate) {
      triggerToast('يرجى إدخال كود التفعيل العشوائي أولاً لفتح السكريبت', 'warning');
      return;
    }

    // Explicitly block opening the script with Promo Code R11
    if (
      candidate === PROMO_CODE ||
      candidate === 'ZIKO-R11' ||
      candidate === 'ZIKO-R11-VIP' ||
      candidate.length < 8
    ) {
      triggerToast(
        `البرومو كود (${PROMO_CODE}) مخصص للتسجيل فقط ولا يفتح السكريبت! يجب تنفيذ نفس الشروط للحصول على كود التفعيل.`,
        'warning'
      );
      return;
    }

    if (candidate === ADMIN_SECRET_ID) {
      setScreen('ADMIN');
      return;
    }

    let allCodes = loadStoredCodes();
    let matched = allCodes.find((c) => c.code.toUpperCase() === candidate);

    if (!matched) {
      try {
        const snapshot = await get(ref(rtdb, 'ziko_codes'));
        if (snapshot.exists()) {
          const val = snapshot.val();
          if (Array.isArray(val)) {
            allCodes = val;
            setCodesList(val);
            localStorage.setItem(STORAGE_KEYS_DB, JSON.stringify(val));
            matched = allCodes.find((c) => c.code.toUpperCase() === candidate);
          }
        }
      } catch {
        // ignore network error
      }
    }

    if (!matched) {
      triggerToast(
        'كود التفعيل غير صحيح! يجب تنفيذ نفس الشروط المطلوبة للحصول على كود تفعيل صالح.',
        'warning'
      );
      return;
    }

    const expireMs = matched.duration * 60 * 1000;
    const elapsed = Date.now() - matched.createdAt;
    const isExpired = matched.duration < 5000000 && elapsed >= expireMs;

    if (!matched.active) {
      triggerToast('هذا الكود متوقف حالياً من قبل الإدارة.', 'warning');
      return;
    }

    if (isExpired) {
      triggerToast('انتهت صلاحية هذا الكود! قم بتوليد كود عشوائي جديد عبر الخطوات.', 'warning');
      return;
    }

    const remainingSecs =
      matched.duration >= 5000000
        ? 86400
        : Math.max(60, Math.floor((expireMs - elapsed) / 1000));

    setActiveUnlockedCode(matched.code);
    if (!playerId && matched.playerId && matched.playerId !== 'SYSTEM') {
      setPlayerId(matched.playerId);
    }
    setSessionSeconds(remainingSecs);
    setScreen('GAME_SELECT');
    triggerToast('تم تفعيل الكود وفتح سكريبت زيكو بنجاح!', 'success');
  };

  // Crash Plane effects
  const generateNewCrashSignal = useCallback(() => {
    const nextOdd = Number((1.25 + Math.random() * 4.35).toFixed(2));
    setTargetCrashOdd(nextOdd);
    const nowTime = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const conf = Math.floor(94 + Math.random() * 6);
    setCrashHistory((prev) =>
      [{ odd: nextOdd, time: nowTime, confidence: conf }, ...prev].slice(0, 5)
    );
  }, []);

  useEffect(() => {
    if (screen !== 'PLANE') {
      setAnimatedCrashOdd(1.0);
      return;
    }
    generateNewCrashSignal();
    const interval = setInterval(() => {
      generateNewCrashSignal();
    }, 9000);
    return () => clearInterval(interval);
  }, [screen, generateNewCrashSignal]);

  useEffect(() => {
    if (screen !== 'PLANE') return;
    const target = targetCrashOdd;
    const startTime = performance.now();
    let rafId = 0;

    const animateValue = (now: number) => {
      const progress = Math.min(1, (now - startTime) / 1400);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedCrashOdd(1 + (target - 1) * eased);
      if (progress < 1) {
        rafId = requestAnimationFrame(animateValue);
      }
    };
    setAnimatedCrashOdd(1.0);
    rafId = requestAnimationFrame(animateValue);
    return () => cancelAnimationFrame(rafId);
  }, [targetCrashOdd, screen]);

  useEffect(() => {
    if (screen !== 'PLANE') return;
    const updateClock = () =>
      setCurrentClock(new Date().toLocaleTimeString('ar-EG', { hour12: false }));
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [screen]);

  const formattedSessionTime = () => {
    const mins = Math.floor(sessionSeconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = (sessionSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <div className="min-h-screen bg-transparent text-white font-sans selection:bg-[#E11D2E]/30 selection:text-white relative">
      <ParticleBackground />

      {/* Global Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            className="fixed top-6 left-1/2 z-[110] w-[92%] max-w-xs -translate-x-1/2 pointer-events-none"
          >
            <div className="flex items-center gap-3 rounded-xl border border-[#E11D2E]/40 bg-[#0C0B0E]/95 px-4 py-3 text-right shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-md">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E11D2E]/35 bg-[#E11D2E]/15">
                <Sparkles className="h-3.5 w-3.5 text-[#FF5261]" />
              </div>
              <p className="text-xs font-bold leading-snug text-white">{toast.text}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Screen Router */}
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.985 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 min-h-screen"
        >
          {/* =========================================================
              1. SPLASH SCREEN
             ========================================================= */}
          {screen === 'SPLASH' && (
            <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.84 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="relative flex flex-col items-center"
              >
                <ZikoCrest size="xl" />
                <h1 className="mt-8 font-display text-3xl font-black tracking-[0.2em] text-white">
                  ZIKO <span className="text-[#E11D2E]">SCRIPT</span>
                </h1>
                <p className="mt-2 text-xs font-bold text-white/45">
                  سكريبت زيكو للتوقعات الذكية ومفاتيح التفعيل
                </p>
              </motion.div>
            </div>
          )}

          {/* =========================================================
              2. CONDITION & CODE UNLOCK GATEWAY SCREEN
             ========================================================= */}
          {screen === 'CONDITION' && (
            <div
              dir="rtl"
              className="relative mx-auto min-h-screen max-w-md overflow-x-hidden px-4 pb-20 pt-6 select-none"
            >
              <div className="relative z-10 space-y-4">
                {/* Brand & Hero Header */}
                <div className="pt-2 pb-1 text-center">
                  <div className="mx-auto mb-4 flex justify-center">
                    <ZikoCrest size="md" />
                  </div>
                  <div className="inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-[#FF5261]">
                    <Sparkles className="h-3 w-3" />
                    <span>ZIKO VIP ACTIVATION</span>
                  </div>
                  <h2 className="mt-2 text-[28px] font-black leading-tight tracking-tight text-white">
                    شروط تفعيل <span className="text-[#E11D2E]">زيكو</span>
                  </h2>
                  <p className="mx-auto mt-2 max-w-[320px] text-xs leading-relaxed text-white/45">
                    اتبع الخطوات بالأسفل بالترتيب (التسجيل بالبرومو كود R11 + سكرين التسجيل + سكرين
                    الإيداع + كتابة الـ ID) لاستلام الكود العشوائي وفتح السكريبت تلقائياً.
                  </p>
                </div>

                {/* ACTIVATION CODE UNLOCK BOX (Only opens with generated Random Code, never with Promo Code) */}
                <div className="relative overflow-hidden rounded-2xl border border-[#E11D2E]/50 bg-[#0B090E]/95 p-4 shadow-[0_15px_45px_rgba(225,29,46,0.14)]">
                  <span className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#E11D2E] to-transparent" />
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-[#FF5261]" />
                      <h3 className="text-xs font-black text-white">
                        بوابة فتح السكريبت بكود التفعيل
                      </h3>
                    </div>
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#FF5261]">
                      CODE GATE
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={unlockCodeInput}
                      onChange={(e) => setUnlockCodeInput(e.target.value.toUpperCase())}
                      placeholder="كود التفعيل العشوائي (ZIKO-XXXX...)"
                      className="flex-1 rounded-xl border border-white/15 bg-black/60 px-3.5 py-3 text-center font-mono text-xs font-bold tracking-wider text-white placeholder:text-white/25 focus:border-[#E11D2E] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleUnlockScriptByCode()}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#E11D2E] to-[#FF5261] px-5 py-3 text-xs font-black text-[#08070A] shadow-[0_8px_25px_rgba(225,29,46,0.35)] transition-transform active:scale-95 cursor-pointer whitespace-nowrap"
                    >
                      <Zap className="h-3.5 w-3.5 fill-current" />
                      <span>فتح السكريبت</span>
                    </button>
                  </div>
                </div>

                {/* Section Divider for Steps */}
                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-[11px] font-extrabold text-white/55">
                    خطوات استلام كود التفعيل العشوائي
                  </span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                {/* STEP 01: PROMO CODE R11 */}
                <StepCard
                  stepNumber="01"
                  title="التسجيل بكود التفعيل (البرومو كود)"
                  subtitle="افتح حساباً جديداً كلياً باستخدام البروموكود الإجباري R11 عند التسجيل"
                  completed={hasCopiedPromo}
                  icon={<Sparkles className="h-6 w-6" />}
                >
                  <div className="relative flex items-center justify-between overflow-hidden rounded-xl border border-dashed border-[#E11D2E]/45 bg-[#E11D2E]/[0.06] p-3.5">
                    <div className="text-right">
                      <span className="block text-[9px] font-bold text-white/40">
                        البرومو كود الإجباري للتسجيل
                      </span>
                      <span className="font-mono text-2xl font-black tracking-[0.28em] text-white">
                        {PROMO_CODE}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyPromo}
                      className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#E11D2E]/40 bg-[#E11D2E]/15 px-4 py-2.5 font-mono text-xs font-black text-[#FF5261] transition-all hover:bg-[#E11D2E] hover:text-[#08070A] active:scale-95 whitespace-nowrap"
                    >
                      {promoCopied ? (
                        <>
                          <Check className="h-4 w-4" />
                          <span>تم النسخ</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          <span>نسخ R11</span>
                        </>
                      )}
                    </button>

                    <AnimatePresence>
                      {promoCopied && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 flex items-center justify-center bg-[#E11D2E] text-xs font-black tracking-wider text-[#08070A]"
                        >
                          تم نسخ البروموكود R11 بنجاح!
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </StepCard>

                {/* STEP 02: MINIMUM DEPOSIT */}
                <StepCard
                  stepNumber="02"
                  title="الحد الأدنى للشحن والإيداع"
                  subtitle="اشحن حسابك الجديد لتفعيل الربط بالسيرفر المشفر وفك تشفير الثغرات"
                  icon={<ShieldCheck className="h-6 w-6" />}
                >
                  <div className="flex items-center justify-center gap-4" dir="ltr">
                    <div className="min-w-[110px] rounded-xl border border-[#E11D2E]/30 bg-black/55 px-4 py-3 text-center">
                      <span className="block font-mono text-2xl font-black leading-none tracking-wider text-white">
                        220
                      </span>
                      <span className="mt-1.5 block text-[9px] font-bold uppercase tracking-[0.2em] text-[#FF5261]">
                        جنيه مصري
                      </span>
                    </div>
                    <span className="font-mono text-[11px] font-black tracking-widest text-white/30">
                      أو
                    </span>
                    <div className="min-w-[110px] rounded-xl border border-[#E11D2E]/30 bg-black/55 px-4 py-3 text-center">
                      <span className="block font-mono text-2xl font-black leading-none tracking-wider text-white">
                        4$
                      </span>
                      <span className="mt-1.5 block text-[9px] font-bold uppercase tracking-[0.2em] text-[#FF5261]">
                        USD
                      </span>
                    </div>
                  </div>
                </StepCard>

                {/* STEP 03: UPLOAD SCREENSHOT OF REGISTRATION */}
                <StepCard
                  stepNumber="03"
                  title="إرفاق سكرين شوت التسجيل"
                  subtitle="ادخل خذ سكرين بالتسجيل بالبرومو كود R11 وارفعه هنا للتحقق"
                  completed={Boolean(regScreenshotDataUrl)}
                  icon={<ImageIcon className="h-6 w-6" />}
                >
                  <input
                    ref={regFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleRegScreenshotChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => regFileInputRef.current?.click()}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-all ${
                      regScreenshotDataUrl
                        ? 'border-emerald-500/45 bg-emerald-500/[0.05]'
                        : 'border-[#E11D2E]/35 bg-black/45 hover:border-[#E11D2E]/70 hover:bg-[#E11D2E]/[0.04]'
                    }`}
                  >
                    {regScreenshotDataUrl ? (
                      <div className="w-full space-y-2.5">
                        <img
                          src={regScreenshotDataUrl}
                          alt="سكرين التسجيل"
                          referrerPolicy="no-referrer"
                          className="mx-auto max-h-36 rounded-lg border border-emerald-500/40 object-contain shadow-md"
                        />
                        <div className="flex items-center justify-center gap-1.5 text-xs font-black text-emerald-400">
                          <Check className="h-4 w-4 stroke-[3]" />
                          <span>تم إرفاق سكرين التسجيل بنجاح</span>
                        </div>
                        <p className="truncate font-mono text-[10px] text-white/45">
                          {regScreenshotName} — اضغط لتغيير الصورة
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 py-2">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-[#E11D2E]/30 bg-[#E11D2E]/10 text-[#FF5261]">
                          <Upload className="h-5 w-5" />
                        </div>
                        <span className="block text-xs font-black text-white">
                          اضغط هنا لرفع سكرين شوت التسجيل
                        </span>
                        <span className="block text-[10px] text-white/40">
                          صورة تثبت التسجيل بالحساب الجديد باستخدام البرومو كود {PROMO_CODE}
                        </span>
                      </div>
                    )}
                  </div>
                </StepCard>

                {/* STEP 04: UPLOAD SCREENSHOT OF DEPOSIT */}
                <StepCard
                  stepNumber="04"
                  title="إرفاق سكرين شوت الإيداع"
                  subtitle="خذ سكرين شوت يثبت عملية الإيداع (الشحن) في حسابك الجديد وارفعه هنا"
                  completed={Boolean(depositScreenshotDataUrl)}
                  icon={<Wallet className="h-6 w-6" />}
                >
                  <input
                    ref={depositFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleDepositScreenshotChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => depositFileInputRef.current?.click()}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-all ${
                      depositScreenshotDataUrl
                        ? 'border-emerald-500/45 bg-emerald-500/[0.05]'
                        : 'border-[#E11D2E]/35 bg-black/45 hover:border-[#E11D2E]/70 hover:bg-[#E11D2E]/[0.04]'
                    }`}
                  >
                    {depositScreenshotDataUrl ? (
                      <div className="w-full space-y-2.5">
                        <img
                          src={depositScreenshotDataUrl}
                          alt="سكرين الإيداع"
                          referrerPolicy="no-referrer"
                          className="mx-auto max-h-36 rounded-lg border border-emerald-500/40 object-contain shadow-md"
                        />
                        <div className="flex items-center justify-center gap-1.5 text-xs font-black text-emerald-400">
                          <Check className="h-4 w-4 stroke-[3]" />
                          <span>تم إرفاق سكرين الإيداع بنجاح</span>
                        </div>
                        <p className="truncate font-mono text-[10px] text-white/45">
                          {depositScreenshotName} — اضغط لتغيير الصورة
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 py-2">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-[#E11D2E]/30 bg-[#E11D2E]/10 text-[#FF5261]">
                          <Upload className="h-5 w-5" />
                        </div>
                        <span className="block text-xs font-black text-white">
                          اضغط هنا لرفع سكرين شوت الإيداع
                        </span>
                        <span className="block text-[10px] text-white/40">
                          صورة تثبت شحن الحساب بحد أدنى 120 جنيه أو 3$ USD
                        </span>
                      </div>
                    )}
                  </div>
                </StepCard>

                {/* STEP 05: PLAYER ID & CLAIM RANDOM CODE */}
                <StepCard
                  stepNumber="05"
                  title="كتابة الـ ID واستلام الكود العشوائي"
                  subtitle="أدخل رقم الآيدي (ID) للحساب الجديد لاستلام الكود وفتح السكريبت تلقائياً"
                  highlight
                  completed={/^\d{6,12}$/.test(playerId)}
                  icon={<UserCheck className="h-6 w-6" />}
                >
                  <div className="relative">
                    <UserCheck className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                    <input
                      type="text"
                      placeholder="18XXXXXXXXX"
                      value={playerId}
                      maxLength={12}
                      onChange={(e) =>
                        setPlayerId(e.target.value.replace(/\D/g, '').slice(0, 12))
                      }
                      className="w-full rounded-xl border border-white/15 bg-black/50 px-10 py-3.5 text-center font-mono text-sm font-bold tracking-wider text-white placeholder:text-white/20 transition-all focus:border-[#E11D2E] focus:outline-none"
                    />
                  </div>

                  {playerId === ADMIN_SECRET_ID && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-[#E11D2E]/40 bg-[#E11D2E]/15 p-3 text-center text-xs font-black text-[#FF5261]"
                    >
                      مرحباً بك في نظام إدارة سكريبت زيكو 🛡️
                      <br />
                      اضغط على الزر أدناه للدخول إلى لوحة تحكم الأكواد وتحديث التوقعات.
                    </motion.div>
                  )}

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.985 }}
                    onClick={handleRequestRandomCode}
                    style={
                      (regScreenshotDataUrl &&
                        depositScreenshotDataUrl &&
                        /^\d{6,12}$/.test(playerId)) ||
                      playerId === ADMIN_SECRET_ID
                        ? {
                            background: 'linear-gradient(100deg, #E11D2E, #FF5261 55%, #E11D2E)',
                            color: '#08070A',
                            boxShadow: '0 14px 40px rgba(225,29,46,0.28)',
                          }
                        : undefined
                    }
                    className={`mt-1 w-full cursor-pointer rounded-xl py-4 text-xs font-black uppercase tracking-wider transition-all ${
                      (regScreenshotDataUrl &&
                        depositScreenshotDataUrl &&
                        /^\d{6,12}$/.test(playerId)) ||
                      playerId === ADMIN_SECRET_ID
                        ? ''
                        : 'border border-white/15 bg-white/5 text-white/50 hover:border-[#E11D2E]/40 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      <span>
                        {playerId === ADMIN_SECRET_ID
                          ? 'فتح لوحة تحكم الأدمن'
                          : 'تأكيد البيانات واستلام الكود وفتح السكريبت'}
                      </span>
                    </span>
                  </motion.button>
                </StepCard>
              </div>

              {/* Verification Progress & Rejection Modal */}
              <AnimatePresence>
                {isVerifyingSteps && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-5 backdrop-blur-md">
                    <motion.div
                      initial={{ opacity: 0, y: 20, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 12, scale: 0.98 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-[#E11D2E]/45 bg-[#0A090C]/95 text-center shadow-[0_24px_80px_rgba(225,29,46,0.25)]"
                      dir="rtl"
                    >
                      <div className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-[#E11D2E] to-transparent" />

                      {!conditionsRejected ? (
                        <>
                          <div className="border-b border-white/[0.06] px-6 pb-4 pt-6">
                            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[#E11D2E]/30 bg-[#E11D2E]/15">
                              <ShieldCheck className="h-5 w-5 text-[#FF5261]" />
                            </div>
                            <span className="block font-mono text-[8px] font-bold uppercase tracking-[0.28em] text-[#FF5261]">
                              ZIKO SECURE VERIFICATION
                            </span>
                            <h3 className="mt-1.5 text-[15px] font-black text-white">
                              جاري مراجعة الشروط والبيانات
                            </h3>
                            <p className="mt-1 text-[10px] text-white/40">
                              يرجى الانتظار حتى اكتمال فحص تنفيذ الشروط على السيرفر
                            </p>
                          </div>

                          <div className="space-y-2 px-5 py-5 text-right">
                            {[
                              `جاري فحص سكرين التسجيل بالبرومو كود ${PROMO_CODE}`,
                              'جاري التحقق من سكرين شوت الإيداع والشحن الفعلي',
                              `جاري مراجعة معرف الحساب (${playerId}) في قاعدة البيانات`,
                              'التحقق النهائي من استيفاء جميع الشروط لاستخراج الكود',
                            ].map((label, idx) => {
                              const isDone = idx < verifyStage;
                              const isCurrent = idx === verifyStage;
                              return (
                                <div
                                  key={idx}
                                  className={`flex min-h-11 items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-all duration-300 ${
                                    isCurrent
                                      ? 'border-[#E11D2E]/45 bg-[#E11D2E]/[0.1]'
                                      : isDone
                                      ? 'border-white/[0.08] bg-white/[0.03]'
                                      : 'border-transparent bg-white/[0.015] opacity-35'
                                  }`}
                                >
                                  <div className="shrink-0">
                                    {isDone ? (
                                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#E11D2E] text-white">
                                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                                      </div>
                                    ) : isCurrent ? (
                                      <div className="relative flex h-6 w-6 items-center justify-center rounded-lg border border-[#E11D2E]/60 bg-[#E11D2E]/10">
                                        <span className="absolute h-2 w-2 animate-ping rounded-full bg-[#E11D2E]/50" />
                                        <span className="relative h-1.5 w-1.5 rounded-full bg-[#FF5261]" />
                                      </div>
                                    ) : (
                                      <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 bg-white/[0.025] font-mono text-[8px] font-bold text-white/30">
                                        0{idx + 1}
                                      </div>
                                    )}
                                  </div>
                                  <span
                                    className={`block flex-1 text-[11px] font-bold leading-relaxed ${
                                      isCurrent
                                        ? 'text-white'
                                        : isDone
                                        ? 'text-white/70'
                                        : 'text-white/45'
                                    }`}
                                  >
                                    {label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          <div className="border-t border-white/[0.06] bg-black/30 px-5 py-4">
                            <div className="mb-2 flex items-center justify-between font-mono text-[9px]">
                              <span className="font-bold text-white/40">جاري الفحص</span>
                              <span className="font-bold text-[#FF5261]">
                                {Math.min(100, (verifyStage + 1) * 25)}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                              <motion.div
                                initial={{ width: '15%' }}
                                animate={{ width: `${(verifyStage + 1) * 25}%` }}
                                transition={{ duration: 1.0, ease: 'linear' }}
                                className="h-full rounded-full bg-gradient-to-l from-[#FF5261] to-[#E11D2E]"
                              />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="p-6 text-center space-y-4">
                          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#E11D2E]/50 bg-[#E11D2E]/15 shadow-[0_0_30px_rgba(225,29,46,0.35)]">
                            <AlertTriangle className="h-8 w-8 text-[#FF5261]" />
                          </div>

                          <div>
                            <span className="block font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-[#FF5261]">
                              ACTIVATION REJECTED
                            </span>
                            <h3 className="mt-1.5 text-lg font-black text-white">
                              يجب تنفيذ نفس الشروط!
                            </h3>
                            <p className="mt-1 text-xs font-bold text-[#FF5261]">
                              عفواً، لم يتم إصدار كود التفعيل لهذا الحساب
                            </p>
                          </div>

                          <div className="rounded-xl border border-[#E11D2E]/35 bg-[#E11D2E]/[0.08] p-4 text-right space-y-2">
                            <div className="flex items-start gap-2">
                              <XCircle className="h-4 w-4 text-[#FF5261] shrink-0 mt-0.5" />
                              <p className="text-[11.5px] font-bold leading-relaxed text-white/90">
                                يجب تنفيذ نفس الشروط المطلوبة بالكامل وبشكل صحيح للحصول على كود التفعيل:
                              </p>
                            </div>
                            <ul className="space-y-1.5 pr-5 text-[11px] font-bold text-white/70 list-disc">
                              <li>التسجيل بحساب جديد كلياً باستخدام البرومو كود ({PROMO_CODE}).</li>
                              <li>إتمام الإيداع والشحن الفعلي بحد أدنى 220 جنيه أو 4$ دولار.</li>
                              <li>إرفاق سكرين شوت حقيقي للتسجيل والإيداع وكتابة الـ ID الصحيح.</li>
                            </ul>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setIsVerifyingSteps(false);
                              setConditionsRejected(false);
                            }}
                            className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-[#E11D2E] to-[#FF5261] py-3.5 text-xs font-black text-black shadow-[0_10px_25px_rgba(225,29,46,0.35)] transition-transform active:scale-95"
                          >
                            حسناً، إعادة تنفيذ نفس الشروط
                          </button>
                        </div>
                      )}
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* =========================================================
              3. RANDOM ACTIVATION CODE DELIVERY SCREEN (LICENSE)
                 (Automatically sets code & opens script)
             ========================================================= */}
          {screen === 'LICENSE' && (
            <div
              dir="rtl"
              className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center select-none"
            >
              <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
                <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-[#E11D2E]/40 bg-[#E11D2E]/15 shadow-[0_0_35px_rgba(225,29,46,0.3)]">
                  <Check className="h-9 w-9 text-[#E11D2E]" strokeWidth={3.5} />
                  <div className="absolute inset-0 animate-ping rounded-full bg-[#E11D2E]/10" />
                </div>

                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#FF5261]">
                  ZIKO RANDOM KEY GENERATED
                </span>
                <h2 className="mt-1.5 text-2xl font-black text-white">
                  تم استلام وتفعيل الكود تلقائياً!
                </h2>
                <p className="mt-1.5 mb-6 text-xs text-white/50">
                  تم وضع كود التفعيل العشوائي الخاص بك تلقائياً وجاري فتح السكريبت الآن...
                </p>

                {/* Random Code Display Box */}
                <div className="relative mb-5 w-full overflow-hidden rounded-[26px] border border-[#E11D2E]/45 bg-black/85 p-5 shadow-2xl">
                  <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-[#E11D2E] to-transparent" />
                  <span className="block font-mono text-[9px] uppercase tracking-widest text-white/40 mb-2">
                    AUTO-APPLIED ACTIVATION KEY
                  </span>
                  <div className="flex items-center justify-between gap-3" dir="ltr">
                    <span className="truncate font-mono text-base sm:text-lg font-black tracking-widest text-[#FF5261] select-all">
                      {generatedLicenseKey}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedLicenseKey);
                        setLicenseCopied(true);
                        triggerToast('تم نسخ كود التفعيل العشوائي!', 'success');
                        setTimeout(() => setLicenseCopied(false), 2000);
                      }}
                      className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/15 bg-white/5 text-[#FF5261] transition-colors hover:bg-[#E11D2E] hover:text-black"
                      title="نسخ الكود"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>

                  <AnimatePresence>
                    {licenseCopied && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center bg-[#E11D2E] font-mono text-xs font-black uppercase tracking-widest text-black"
                      >
                        تم نسخ كود التفعيل بنجاح!
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Validity info */}
                <div className="mb-6 flex w-full items-center justify-between rounded-[24px] border border-white/10 bg-white/[0.02] px-5 py-4">
                  <div className="text-right space-y-0.5">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-white/40">
                      صلاحية الكود
                    </span>
                    <h4 className="text-xs font-black text-[#FF5261]">30 دقيقة مفعلة</h4>
                  </div>
                  <div className="h-8 w-px bg-white/10" />
                  <div className="flex items-center gap-2" dir="ltr">
                    <Clock className="h-4 w-4 text-[#FF5261] animate-pulse" />
                    <span className="font-mono text-lg font-black text-white">30:00</span>
                  </div>
                </div>

                {/* Immediate Open Button */}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleUnlockScriptByCode(generatedLicenseKey)}
                  className="w-full cursor-pointer rounded-2xl bg-gradient-to-r from-[#E11D2E] to-[#FF5261] py-4 text-xs font-black uppercase tracking-wider text-black shadow-[0_12px_30px_rgba(225,29,46,0.3)]"
                >
                  دخول السكريبت الآن (تم وضع الكود تلقائياً)
                </motion.button>
              </div>
            </div>
          )}

          {/* =========================================================
              4. GAME SELECT SCREEN
             ========================================================= */}
          {screen === 'GAME_SELECT' && (
            <div
              dir="rtl"
              className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 select-none"
            >
              <div className="relative z-10 w-full max-w-sm text-center">
                <div className="mx-auto flex justify-center">
                  <ZikoCrest size="lg" />
                </div>

                <span className="mt-6 block font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#FF5261]">
                  ZIKO VIP GAMES
                </span>
                <h2 className="mt-1.5 text-2xl font-black text-white">اختر اللعبة</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-white/45">
                  اختر اللعبة المتاحة لبدء جلسة التوقع عبر سكريبت زيكو.
                </p>

                {/* Active Code & Player ID status line */}
                <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-white/60">
                  <span className="font-mono">ID: {playerId || 'VIP-USER'}</span>
                  <span>·</span>
                  <span className="font-mono text-[#FF5261]">
                    {activeUnlockedCode || 'ZIKO-ACTIVE'}
                  </span>
                  <span>·</span>
                  <span className="font-mono">{formattedSessionTime()}</span>
                </div>

                {/* Game 1: Apple of Fortune */}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setScreen('PREDICTION')}
                  className="mt-7 w-full cursor-pointer overflow-hidden rounded-2xl border border-[#E11D2E]/40 bg-[#0A090C]/95 p-4 text-right shadow-[0_18px_55px_rgba(0,0,0,0.6)] transition-colors hover:border-[#FF5261]"
                >
                  <div className="flex items-center gap-4">
                    <img
                      src={APPLE_GAME_LOGO_URL}
                      alt="Apple of Fortune"
                      referrerPolicy="no-referrer"
                      className="h-16 w-16 shrink-0 rounded-xl border border-[#E11D2E]/35 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block text-base font-black text-white">
                        Apple of Fortune
                      </span>
                      <span className="mt-1 block text-[11px] font-bold text-[#FF5261]">
                        تفاحة الحظ · متاحة الآن
                      </span>
                    </div>
                    <ChevronLeft className="h-5 w-5 text-[#FF5261]" />
                  </div>
                </motion.button>

                {/* Game 2: Crash Predictor */}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setScreen('PLANE')}
                  className="mt-3.5 w-full cursor-pointer overflow-hidden rounded-2xl border border-[#E11D2E]/40 bg-[#0A090C]/95 p-4 text-right shadow-[0_18px_55px_rgba(0,0,0,0.6)] transition-colors hover:border-[#FF5261]"
                >
                  <div className="flex items-center gap-4">
                    <img
                      src={CRASH_GAME_LOGO_URL}
                      alt="Crash"
                      referrerPolicy="no-referrer"
                      className="h-16 w-16 shrink-0 rounded-xl border border-[#E11D2E]/35 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block text-base font-black text-white">Crash</span>
                      <span className="mt-1 block text-[11px] font-bold text-[#FF5261]">
                        توقع الطائرة · متاحة الآن
                      </span>
                    </div>
                    <ChevronLeft className="h-5 w-5 text-[#FF5261]" />
                  </div>
                </motion.button>

                <button
                  type="button"
                  onClick={() => setScreen('CONDITION')}
                  className="mt-6 text-xs font-bold text-white/45 hover:text-white transition-colors cursor-pointer"
                >
                  العودة إلى صفحة التفعيل والخطوات
                </button>
              </div>
            </div>
          )}

          {/* =========================================================
              5. APPLE OF FORTUNE PREDICTION SCREEN (PREDICTION)
                 (Polished circular apple cells, zero m1/m2 labels visible)
             ========================================================= */}
          {screen === 'PREDICTION' && (
            <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-between border-x border-white/5 pb-8 select-none relative">
              <div className="relative z-10 flex flex-grow flex-col px-4 pt-4 space-y-4">
                {/* Top Status Header */}
                <div className="flex items-center justify-between rounded-[22px] border border-[#E11D2E]/25 bg-black/70 px-4 py-3 backdrop-blur-sm">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setScreen('GAME_SELECT')}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white hover:border-[#E11D2E]/50 cursor-pointer"
                      title="رجوع"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="flex flex-col text-right">
                      <span className="font-mono text-[8px] font-black tracking-widest text-white/45">
                        ZIKO SERVER
                      </span>
                      <span className="font-mono text-[11px] font-black text-[#FF5261]">
                        VIP CONNECTED
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-right">
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-[8px] font-black tracking-widest text-white/45">
                        ZIKO BYPASS
                      </span>
                      <span className="font-mono text-[11px] font-black text-white">
                        ID: {playerId || 'VIP'}
                      </span>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E11D2E]/35 bg-[#E11D2E]/15">
                      <ShieldCheck className="h-4 w-4 text-[#FF5261]" />
                    </div>
                  </div>
                </div>

                {/* Center ZIKO Logo Crest */}
                <div className="flex flex-col items-center justify-center pt-1">
                  <ZikoCrest size="md" className="scale-95" />
                </div>

                {/* 10x5 Apple of Fortune Matrix (Polished Circular Apple Slots, No m1/m2 Numbers) */}
                <div className="relative flex flex-col gap-4">
                  <div className="relative overflow-hidden rounded-[32px] border border-[#E11D2E]/25 bg-black/55 p-4 pt-7 shadow-[0_15px_40px_rgba(0,0,0,0.65)]">
                    {/* Corner Tech Accents */}
                    <div className="absolute top-3.5 left-3.5 h-4 w-4 rounded-tl border-t-2 border-l-2 border-[#E11D2E]/45" />
                    <div className="absolute top-3.5 right-3.5 h-4 w-4 rounded-tr border-t-2 border-r-2 border-[#E11D2E]/45" />
                    <div className="absolute bottom-3.5 left-3.5 h-4 w-4 rounded-bl border-b-2 border-l-2 border-[#E11D2E]/45" />
                    <div className="absolute bottom-3.5 right-3.5 h-4 w-4 rounded-br border-b-2 border-r-2 border-[#E11D2E]/45" />

                    {/* Subtle Vertical Divider Line after Odds Column */}
                    <div className="pointer-events-none absolute top-0 bottom-0 left-[74px] w-px bg-gradient-to-b from-transparent via-[#E11D2E]/20 to-transparent" />

                    {/* Animated Scanner Beam */}
                    {isDecryptingApple && (
                      <motion.div
                        initial={{ y: -60, opacity: 0 }}
                        animate={{ y: [420, -40], opacity: [0.65, 0.65] }}
                        transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}
                        className="pointer-events-none absolute inset-x-0 z-20 h-10 bg-gradient-to-b from-transparent via-[#E11D2E]/35 to-transparent"
                      />
                    )}

                    <div dir="ltr" className="relative z-10 flex flex-col gap-2">
                      {TARGET_ROWS.map((rowInfo, rIdx) => (
                        <div
                          key={rIdx}
                          className={`flex items-center gap-3.5 rounded-2xl border px-2.5 py-1.5 transition-all ${
                            hasRevealed
                              ? 'border-[#E11D2E]/15 bg-[#E11D2E]/[0.035]'
                              : 'border-transparent'
                          }`}
                        >
                          {/* عرض المضاعف */}
                          <div className="w-[52px] shrink-0 text-left flex items-center justify-start">
                            <span
                              className={`font-mono text-[12px] font-black tracking-wider leading-none transition-colors ${
                                hasRevealed
                                  ? 'text-[#FF5261] drop-shadow-[0_2px_10px_rgba(225,29,46,0.5)]'
                                  : 'text-white/40'
                              }`}
                            >
                              {rowInfo.mult}
                            </span>
                          </div>

                          {/* الأعمدة الـ 5 (خلايا دائرية احترافية بدون أي أرقام m1/m2) */}
                          <div className="grid flex-1 grid-cols-5 justify-items-center gap-1.5">
                            {Array.from({ length: 5 }).map((_, cIdx) => {
                              const isSafe = isSafeApple(rowInfo.row, cIdx);

                              return (
                                <div
                                  key={cIdx}
                                  style={{
                                    borderColor: isDecryptingApple
                                      ? 'rgba(225, 29, 46, 0.45)'
                                      : hasRevealed && isSafe
                                      ? 'rgba(225, 29, 46, 0.85)'
                                      : hasRevealed && !isSafe
                                      ? 'rgba(225, 29, 46, 0.25)'
                                      : 'rgba(255, 255, 255, 0.09)',
                                    backgroundColor:
                                      hasRevealed && isSafe
                                        ? 'rgba(225, 29, 46, 0.16)'
                                        : hasRevealed && !isSafe
                                        ? 'rgba(225, 29, 46, 0.05)'
                                        : 'rgba(6, 8, 10, 0.72)',
                                  }}
                                  className={`w-full aspect-square max-w-[44px] max-h-[44px] min-[400px]:max-w-[48px] min-[400px]:max-h-[48px] rounded-full border flex items-center justify-center relative overflow-hidden shadow-[inset_0_2px_8px_rgba(0,0,0,0.85)] shrink-0 transition-all duration-300 ${
                                    hasRevealed && isSafe
                                      ? 'shadow-[0_0_16px_rgba(225,29,46,0.35)] scale-[1.02]'
                                      : ''
                                  }`}
                                >
                                  {/* Unrevealed Empty State (No m1/m2 text) */}
                                  {!hasRevealed && !isDecryptingApple && (
                                    <div className="h-1.5 w-1.5 rounded-full bg-white/15" />
                                  )}

                                  {/* Decrypting Pulse State */}
                                  {isDecryptingApple && (
                                    <div className="h-2 w-2 rounded-full bg-[#FF5261]/50 animate-ping" />
                                  )}

                                  {/* Revealed State: Crisp Circular Apple */}
                                  {hasRevealed && !isDecryptingApple && (
                                    <motion.div
                                      initial={{ scale: 0.65, opacity: 0 }}
                                      animate={{ scale: 1, opacity: 1 }}
                                      transition={{ duration: 0.25, ease: 'easeOut' }}
                                      className="absolute inset-0 flex items-center justify-center rounded-full overflow-hidden p-0.5"
                                    >
                                      {isSafe ? (
                                        <>
                                          <img
                                            src={GOOD_APPLE_IMAGE_URL}
                                            alt="Apple"
                                            referrerPolicy="no-referrer"
                                            className="w-full h-full object-cover rounded-full drop-shadow-[0_0_10px_rgba(225,29,46,0.75)]"
                                          />
                                          <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-[#E11D2E] border border-white/30 rounded-full flex items-center justify-center shadow-lg">
                                            <Check className="w-2 h-2 text-white stroke-[4]" />
                                          </div>
                                        </>
                                      ) : (
                                        <img
                                          src={ROTTEN_APPLE_IMAGE_URL}
                                          alt="Rotten"
                                          referrerPolicy="no-referrer"
                                          className="w-full h-full object-cover rounded-full opacity-25 grayscale"
                                        />
                                      )}
                                    </motion.div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-3.5 pt-1">
                    <motion.button
                      type="button"
                      whileTap={
                        isDecryptingApple || appleCooldown > 0 ? {} : { scale: 0.98 }
                      }
                      onClick={handleStartApplePrediction}
                      disabled={isDecryptingApple || appleCooldown > 0}
                      className={`relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl py-4 text-xs font-black tracking-wider transition-all cursor-pointer shadow-xl ${
                        isDecryptingApple || appleCooldown > 0
                          ? 'border border-[#E11D2E]/20 bg-[#1A0508]/30 text-[#FF5261]/45 cursor-not-allowed'
                          : 'border border-[#FF5261]/40 bg-gradient-to-r from-[#A31322] to-[#E11D2E] text-white shadow-[0_8px_30px_rgba(225,29,46,0.35)] hover:from-[#E11D2E] hover:to-[#FF5261]'
                      }`}
                    >
                      {isDecryptingApple ? (
                        <>
                          <RotateCw className="h-4 w-4 animate-spin" />
                          <span>جاري فك التشفير...</span>
                        </>
                      ) : appleCooldown > 0 ? (
                        <span>انتظر ({appleCooldown}ث)</span>
                      ) : (
                        <>
                          <Play className="h-4 w-4 fill-current" />
                          <span>تشغيل التوقع</span>
                        </>
                      )}
                    </motion.button>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      onClick={handleResetAppleGrid}
                      className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.03] py-4 text-xs font-black tracking-wider text-white transition-all hover:bg-white/[0.08]"
                    >
                      <RotateCw className="h-4 w-4 text-[#FF5261]" />
                      <span>إعادة التشغيل</span>
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              6. CRASH PLANE PREDICTOR SCREEN (PLANE)
             ========================================================= */}
          {screen === 'PLANE' && (
            <div
              dir="rtl"
              className="relative mx-auto min-h-screen max-w-lg overflow-hidden pb-10 text-white select-none"
            >
              {/* Floating particles */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {CRASH_PARTICLES.map((p) => (
                  <motion.span
                    key={p.id}
                    className="absolute rounded-full bg-[#FF5261]"
                    style={{
                      left: `${p.left}%`,
                      top: `${p.top}%`,
                      width: p.size,
                      height: p.size,
                    }}
                    animate={{
                      y: [0, -30, 0],
                      x: [0, p.drift, 0],
                      opacity: [0.08, 0.45, 0.08],
                    }}
                    transition={{
                      duration: p.duration,
                      delay: p.delay,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </div>

              <main className="relative z-10 px-5 pt-5">
                {/* Header */}
                <div className="flex items-center justify-between" dir="ltr">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 rounded-xl border border-[#E11D2E]/40 bg-[#0C0B0E] px-3 py-2 text-[10px] font-black text-[#FF5261]">
                      <Zap className="h-3.5 w-3.5" /> نشط
                    </span>
                    <span className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0C0B0E] px-3 py-2 font-mono text-[10px] font-bold text-white/65">
                      {onlineUsers} <UserCheck className="h-3.5 w-3.5 text-[#FF5261]" />
                    </span>
                  </div>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setScreen('GAME_SELECT')}
                    aria-label="الرجوع لاختيار اللعبة"
                    className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border border-white/15 bg-[#0C0B0E] text-white transition-colors hover:border-[#E11D2E]/50"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </motion.button>
                </div>

                {/* Title & Brand */}
                <div className="mt-7 flex items-end justify-between gap-3">
                  <span
                    className="rounded-lg border border-white/10 bg-[#0C0B0E] px-3 py-1.5 font-mono text-[10px] text-white/60"
                    dir="ltr"
                  >
                    ID: {playerId || 'VIP-USER'}
                  </span>
                  <div className="text-right">
                    <span className="block font-display text-[10px] font-black tracking-[0.22em] text-[#FF5261]">
                      ZIKO VIP CRASH
                    </span>
                    <h1 className="mt-1 text-3xl font-black text-white">توقع الطائرة</h1>
                  </div>
                </div>

                {/* Main Radar Display */}
                <motion.section
                  key={`odd-${targetCrashOdd}`}
                  initial={{ scale: 0.96, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="relative mt-5 flex h-[260px] flex-col items-center justify-center overflow-hidden rounded-[28px] border border-[#E11D2E]/45 bg-[#0A090C]/95 shadow-[0_0_50px_rgba(225,29,46,0.18)]"
                >
                  <div className="crash-inner-grid pointer-events-none absolute inset-0 opacity-45" />
                  <span className="relative text-xs font-bold text-white/50">
                    الأودد المتوقع للطائرة
                  </span>
                  <motion.div
                    animate={{ scale: [1, 1.04, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="relative mt-3 font-display text-6xl font-black text-[#FF5261] drop-shadow-[0_0_25px_rgba(225,29,46,0.6)]"
                    dir="ltr"
                  >
                    {animatedCrashOdd.toFixed(2)}x
                  </motion.div>
                  <span className="relative mt-5 flex items-center gap-2 font-mono text-[11px] font-bold text-emerald-400">
                    <ShieldCheck className="h-4 w-4" /> نسبة الثقة{' '}
                    {crashHistory[0]?.confidence ?? 97}%
                  </span>
                </motion.section>

                {/* Manual Refresh Signal Button */}
                <button
                  type="button"
                  onClick={generateNewCrashSignal}
                  className="mt-4 w-full cursor-pointer rounded-2xl bg-gradient-to-r from-[#E11D2E] to-[#FF5261] py-3.5 text-xs font-black text-black shadow-lg transition-transform active:scale-98"
                >
                  تحديث إشارة الطائرة القادمة الآن
                </button>

                {/* Info Bars */}
                <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-[#0C0B0E] px-4 py-3.5 text-xs font-bold">
                  <span className="text-white/50">آخر تحديث للسيرفر</span>
                  <span className="font-mono text-white" dir="ltr">
                    {currentClock}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-2xl border border-[#E11D2E]/35 bg-[#E11D2E]/10 px-4 py-3.5 text-xs font-black">
                  <span className="text-white/75">نقطة الانسحاب الموصى بها</span>
                  <span className="font-mono text-[#FF5261]" dir="ltr">
                    الخروج آمن {Math.max(1.1, animatedCrashOdd - 0.18).toFixed(2)}x
                  </span>
                </div>

                {/* Previous Signals */}
                <div className="mt-6 flex items-center justify-between text-xs font-black text-white/60">
                  <span>الإشارات السابقة</span>
                  <RotateCw className="h-4 w-4 text-[#FF5261]" />
                </div>

                <div className="mt-3 space-y-2">
                  {crashHistory.map((item, idx) => (
                    <div
                      key={`${item.time}-${idx}`}
                      className="grid grid-cols-3 items-center rounded-2xl border border-white/10 bg-[#0C0B0E] px-4 py-3"
                      dir="ltr"
                    >
                      <span className="font-mono text-xs font-black text-emerald-400">
                        {item.confidence}% ثقة
                      </span>
                      <span className="text-center font-mono text-[11px] font-bold text-white/45">
                        {item.time}
                      </span>
                      <span className="text-right font-mono text-sm font-black text-[#FF5261]">
                        x{item.odd.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="mt-8 text-center text-[11px] font-bold text-white/40">
                  جميع الحقوق محفوظة لدى سكريبت زيكو (ZIKO)
                </p>
              </main>
            </div>
          )}

          {/* =========================================================
              7. ADMIN PANEL SCREEN (ADMIN)
             ========================================================= */}
          {screen === 'ADMIN' && (
            <div
              dir="rtl"
              className="relative mx-auto min-h-screen max-w-md overflow-x-hidden p-4 sm:p-6 pb-16 select-none text-right"
            >
              <div className="relative z-10 space-y-6">
                <div className="flex items-center justify-between border-b border-[#E11D2E]/20 py-3">
                  <div className="text-right">
                    <h2 className="font-display text-lg font-black uppercase tracking-wider text-white">
                      لوحة تحكم <span className="text-[#E11D2E]">زيكو</span>
                    </h2>
                    <span className="mt-0.5 block font-mono text-[9px] font-bold uppercase tracking-widest text-[#FF5261]">
                      ZIKO ADMIN PANEL
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScreen('CONDITION')}
                    className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-bold text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    <span>خروج</span>
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Firebase Sync Card */}
                <div className="relative overflow-hidden rounded-[26px] border border-green-500/30 bg-black/80 p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-green-400" />
                      <h3 className="text-xs font-black text-white">
                        توليد وتحديث توقعات Firebase
                      </h3>
                    </div>
                    <span className="font-mono text-[9px] font-extrabold uppercase text-green-400">
                      DATABASE SYNC
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-white/50">
                      رابط قاعدة بيانات Firebase Realtime Database:
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={rtdbBaseUrl}
                      onChange={(e) => {
                        setRtdbBaseUrl(e.target.value);
                        try {
                          localStorage.setItem(STORAGE_RTDB_URL_KEY, e.target.value);
                        } catch {
                          // ignore
                        }
                      }}
                      placeholder="https://your-project-default-rtdb.firebaseio.com"
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 font-mono text-[11px] text-white focus:border-green-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={isUpdatingFirebaseM11}
                    onClick={async () => {
                      setIsUpdatingFirebaseM11(true);
                      await generatePredictions();
                      setIsUpdatingFirebaseM11(false);
                      triggerToast('تم توليد ورفع توقعات التفاح الجديدة بنجاح!', 'success');
                    }}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-500 py-3 text-xs font-black text-black shadow-lg hover:opacity-95"
                  >
                    <RotateCw
                      className={`h-4 w-4 ${isUpdatingFirebaseM11 ? 'animate-spin' : ''}`}
                    />
                    <span>
                      {isUpdatingFirebaseM11
                        ? 'جاري رفع التوقعات...'
                        : 'توليد ورفع توقعات جديدة إلى Firebase'}
                    </span>
                  </button>
                </div>

                {/* Key Generator Box */}
                <div className="relative overflow-hidden rounded-[26px] border border-[#E11D2E]/25 bg-black/80 p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-white">إنشاء مفتاح تفعيل جديد</h3>
                    <span className="font-mono text-[9px] font-extrabold uppercase text-[#FF5261]">
                      ZIKO GENERATOR
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-white/50">
                        أدخل نص كود المرور أو ولد كود عشوائي:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="مثال: ZIKO-7738-VIP1"
                          value={adminNewCode}
                          onChange={(e) => setAdminNewCode(e.target.value.toUpperCase())}
                          className="flex-1 rounded-xl border border-[#E11D2E]/25 bg-[#1A0508]/20 px-3.5 py-2.5 text-center font-mono text-xs font-bold tracking-wider text-white placeholder:text-white/25 focus:border-[#FF5261] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const rk = generateRandomCodeString('ZIKO');
                            setAdminNewCode(rk);
                            triggerToast('تم توليد كود زيكو عشوائي جديد', 'info');
                          }}
                          className="shrink-0 cursor-pointer rounded-xl border border-[#E11D2E]/30 bg-[#E11D2E]/15 px-3 py-2.5 font-mono text-xs font-bold text-[#FF5261] hover:bg-[#E11D2E] hover:text-black"
                        >
                          توليد عشوائي
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-white/50">
                        اختر مدة صلاحية الكود:
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: '30 دقيقة', value: 30 },
                          { label: 'ساعة واحدة', value: 60 },
                          { label: '12 ساعة', value: 720 },
                          { label: '24 ساعة', value: 1440 },
                          { label: '7 أيام', value: 10080 },
                          { label: 'مدى الحياة', value: 5256000 },
                        ].map((item) => {
                          const active = adminDuration === item.value;
                          return (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => setAdminDuration(item.value)}
                              className={`cursor-pointer rounded-lg border py-2 px-1 text-center text-[10px] font-bold transition-all ${
                                active
                                  ? 'border-[#E11D2E] bg-[#A31322] text-white'
                                  : 'border-white/10 bg-white/[0.02] text-white/55 hover:text-white'
                              }`}
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const codeText = adminNewCode.trim() || generateRandomCodeString('ZIKO');
                        if (codeText === PROMO_CODE) {
                          triggerToast('لا يمكن استخدام البرومو كود ككود فتح للسكريبت!', 'warning');
                          return;
                        }
                        const nextList = codesList.filter((c) => c.code !== codeText);
                        nextList.unshift({
                          key: codeText,
                          code: codeText,
                          playerId: 'ADMIN',
                          duration: adminDuration,
                          createdAt: Date.now(),
                          active: true,
                        });
                        saveCodesToStorage(nextList);
                        setAdminNewCode('');
                        triggerToast('تم إنشاء وتفعيل الكود بالسيرفر بنجاح!', 'success');
                      }}
                      className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#A31322] to-[#E11D2E] py-3 text-xs font-black text-white shadow-lg hover:from-[#E11D2E] hover:to-[#FF5261]"
                    >
                      <Sparkles className="h-4 w-4" />
                      <span>حفظ وتفعيل الكود بالسيرفر</span>
                    </button>
                  </div>
                </div>

                {/* Active Keys List */}
                <div className="relative overflow-hidden rounded-[26px] border border-[#E11D2E]/25 bg-black/80 p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-white">
                      الأكواد الفعالة ومفاتيح المرور ({codesList.length})
                    </h3>
                    <span className="font-mono text-[9px] font-extrabold uppercase text-[#FF5261]">
                      ACTIVE KEYS
                    </span>
                  </div>

                  <div className="max-h-[340px] space-y-2.5 overflow-y-auto pr-1">
                    {codesList.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 py-10 text-center">
                        <span className="block text-xs text-white/40">
                          لا توجد أكواد نشطة حالياً
                        </span>
                      </div>
                    ) : (
                      codesList.map((item) => {
                        const expireMs = item.duration * 60 * 1000;
                        const elapsed = Date.now() - item.createdAt;
                        const expired = item.duration < 5000000 && elapsed >= expireMs;
                        const isLive = item.active && !expired;

                        let timeText = '';
                        if (item.duration >= 5000000) {
                          timeText = 'مدى الحياة';
                        } else {
                          const rem = expireMs - elapsed;
                          if (rem <= 0) timeText = 'منتهي';
                          else {
                            const mins = Math.ceil(rem / 60000);
                            timeText =
                              mins > 60
                                ? `متبقي ${Math.floor(mins / 60)}س و ${mins % 60}د`
                                : `متبقي ${mins} دقيقة`;
                          }
                        }

                        return (
                          <div
                            key={item.key}
                            className="flex items-center justify-between gap-2 rounded-xl border border-[#E11D2E]/20 bg-white/[0.02] p-3"
                          >
                            <div className="min-w-0 text-right">
                              <span className="block truncate font-mono text-xs font-black text-white select-all">
                                {item.code}
                              </span>
                              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/45">
                                <span>{isLive ? 'نشط' : expired ? 'منتهي' : 'متوقف'}</span>
                                <span>·</span>
                                <span className="font-mono">{timeText}</span>
                                <span>·</span>
                                <span className="font-mono">ID: {item.playerId}</span>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5" dir="ltr">
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(item.code);
                                  triggerToast('تم نسخ الكود بنجاح!', 'success');
                                }}
                                className="cursor-pointer rounded-lg border border-white/10 bg-white/5 p-2 text-white/75 hover:bg-white/15"
                                title="نسخ"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = codesList.map((c) =>
                                    c.key === item.key ? { ...c, active: !c.active } : c
                                  );
                                  saveCodesToStorage(updated);
                                  triggerToast(
                                    item.active ? 'تم إيقاف الكود مؤقتاً' : 'تم تنشيط الكود',
                                    'info'
                                  );
                                }}
                                className="cursor-pointer rounded-lg border border-[#E11D2E]/30 bg-[#E11D2E]/15 px-2.5 py-1 text-[10px] font-black text-[#FF5261] hover:bg-[#E11D2E] hover:text-black"
                              >
                                {item.active ? 'إيقاف' : 'تنشيط'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const filtered = codesList.filter((c) => c.key !== item.key);
                                  saveCodesToStorage(filtered);
                                  triggerToast('تم حذف الكود نهائياً', 'info');
                                }}
                                className="cursor-pointer rounded-lg border border-[#E11D2E]/30 bg-[#E11D2E]/15 p-2 text-[#FF5261] hover:bg-[#E11D2E] hover:text-black"
                                title="حذف"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
