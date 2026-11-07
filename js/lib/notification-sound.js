const preferenceKey = "vezz:site-alert-sound";
let audioContext = null;
let soundEnabled = null;

export function isSiteAlertSoundEnabled() {
  if (typeof soundEnabled === "boolean") return soundEnabled;
  try {
    soundEnabled = localStorage.getItem(preferenceKey) !== "off";
  } catch {
    soundEnabled = true;
  }
  return soundEnabled;
}

export function setSiteAlertSoundEnabled(enabled) {
  soundEnabled = Boolean(enabled);
  try {
    localStorage.setItem(preferenceKey, soundEnabled ? "on" : "off");
  } catch {
    // Sound preferences remain available for this page even if storage is blocked.
  }
}

function getAudioContext() {
  if (audioContext) return audioContext;
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  try {
    audioContext = new AudioContextConstructor();
    return audioContext;
  } catch {
    return null;
  }
}

export function primeSiteAlertSound() {
  if (!isSiteAlertSoundEnabled()) return Promise.resolve(false);
  const context = getAudioContext();
  if (!context) return Promise.resolve(false);
  try {
    const resumed = context.state === "suspended" ? context.resume() : Promise.resolve();
    return resumed.then(() => context.state === "running").catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

export async function playSiteAlertSound() {
  if (!isSiteAlertSoundEnabled()) return false;
  const context = getAudioContext();
  if (!context) return false;
  try {
    if (context.state !== "running") await context.resume();
    if (context.state !== "running") return false;
    const now = context.currentTime;
    [784, 988].forEach((frequency, index) => {
      const start = now + index * 0.14;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.07, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    });
    return true;
  } catch {
    return false;
  }
}
