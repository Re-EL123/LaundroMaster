import { api } from './api-client.js';

const KEY = 'lm_notify_prefs';
const DEFAULTS = { sound: true, desktop: false, volume: 0.7, soundUrl: '', soundName: '', soundId: null };

export function getPrefs() {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setPrefs(patch) {
  const next = { ...getPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

let ctx = null;
function audioContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Synthesised two-tone chime — always available, even offline or without Freesound.
export function playChime() {
  const ac = audioContext();
  if (!ac) return;
  const now = ac.currentTime;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(getPrefs().volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  gain.connect(ac.destination);
  [880, 1320].forEach((freq, i) => {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(now + i * 0.12);
    osc.stop(now + 0.6);
  });
}

let player = null;
export function playUrl(url) {
  if (!url) return playChime();
  try {
    player = player || new Audio();
    player.src = url;
    player.volume = Math.min(1, Math.max(0, getPrefs().volume));
    player.currentTime = 0;
    return player.play().catch(() => playChime());
  } catch {
    return playChime();
  }
}

export function playNotification() {
  if (!getPrefs().sound) return;
  if (getPrefs().soundUrl) return playUrl(getPrefs().soundUrl);
  return playChime();
}

export async function testSound(urlOverride) {
  const prefs = getPrefs();
  const url = urlOverride || prefs.soundUrl;
  if (url) return playUrl(url);
  return playChime();
}

export async function searchSounds(query) {
  const { data } = await api.get(`/notifications?action=sound&q=${encodeURIComponent(query || 'notification')}`);
  return data;
}
