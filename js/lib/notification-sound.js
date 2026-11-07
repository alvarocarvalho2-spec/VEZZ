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

export function isSiteAlertSoundReady() {
  return audioContext?.state === "running";
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
  const reportReady = () => {
    const ready = context.state === "running";
    if (ready) window.dispatchEvent(new Event("vezz:alert-sound-ready"));
    return ready;
  };
  try {
    if (context.state === "running") return Promise.resolve(reportReady());
    return context.resume().then(reportReady).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

export function playSiteAlertSound() {
  if (!isSiteAlertSoundEnabled()) return false;
  const context = getAudioContext();
  if (!context || context.state !== "running") return false;
  try {
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
