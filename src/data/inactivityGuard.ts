import { signal } from "@preact/signals";
import { cloudSyncStatus, cloudUser, sincronizarInteligente } from "./cloudSync.ts";

export const isScreenLocked = signal<boolean>(false);
export const inactivityTimeoutSignal = signal<number>(900);

const STORAGE_KEY = "finansys_inactivity_timeout_seconds";

export function getInactivityTimeout(): number {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) {
    const parsed = parseInt(saved, 10);
    // Migra valor anterior restritivo de 10s para 15 minutos (900s)
    if (parsed === 10) {
      localStorage.setItem(STORAGE_KEY, "900");
      return 900;
    }
    if (!isNaN(parsed)) return parsed;
  }
  return 900; // Padrão: 15 minutos (900s)
}

export function setInactivityTimeout(seconds: number) {
  localStorage.setItem(STORAGE_KEY, String(seconds));
  inactivityTimeoutSignal.value = seconds;
}

let lastActivity = Date.now();
let guardStarted = false;

export function resetInactivityTimer() {
  lastActivity = Date.now();
}

function onUserActivity() {
  if (!isScreenLocked.value) {
    lastActivity = Date.now();
  }
}

export function initInactivityGuard() {
  if (guardStarted) return;
  guardStarted = true;

  inactivityTimeoutSignal.value = getInactivityTimeout();
  lastActivity = Date.now();

  // Escuta interações do usuário abrangentes
  const events = [
    "mousedown",
    "mousemove",
    "keydown",
    "touchstart",
    "scroll",
    "pointerdown",
    "click",
    "input",
    "focus",
    "change",
  ];
  for (const ev of events) {
    window.addEventListener(ev, onUserActivity, { passive: true });
  }

  // Intervalo de verificação a cada 1 segundo
  setInterval(() => {
    // Só bloqueia se houver conta conectada e a tela não estiver bloqueada
    if (!cloudUser.value || isScreenLocked.value) {
      return;
    }

    const timeoutSec = getInactivityTimeout();
    if (timeoutSec <= 0) return; // 0 = Desativado

    const elapsed = Date.now() - lastActivity;
    if (elapsed >= timeoutSec * 1000) {
      // 1. Sincroniza dados com a nuvem antes de bloquear APENAS se houver alterações pendentes
      if (cloudSyncStatus.value === "pendente") {
        void sincronizarInteligente();
      }

      // 2. Trava a tela com o modal de bloqueio
      isScreenLocked.value = true;
    }
  }, 1000);
}

export function lockScreenNow() {
  if (!cloudUser.value) return;
  if (cloudSyncStatus.value === "pendente") {
    void sincronizarInteligente();
  }
  isScreenLocked.value = true;
}

export function unlockScreen() {
  isScreenLocked.value = false;
  lastActivity = Date.now();
}
