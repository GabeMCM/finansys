import { signal } from "@preact/signals";
import { cloudUser, desconectarConta, sincronizarInteligente } from "./cloudSync.ts";

export const isScreenLocked = signal<boolean>(false);
export const inactivityTimeoutSignal = signal<number>(10);

const STORAGE_KEY = "finansys_inactivity_timeout_seconds";

export function getInactivityTimeout(): number {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 10; // Padrão: 10 segundos conforme solicitado
}

export function setInactivityTimeout(seconds: number) {
  localStorage.setItem(STORAGE_KEY, String(seconds));
  inactivityTimeoutSignal.value = seconds;
}

let lastActivity = Date.now();
let guardStarted = false;

function onUserActivity() {
  if (!isScreenLocked.value) {
    lastActivity = Date.now();
  }
}

export function initInactivityGuard() {
  if (guardStarted) return;
  guardStarted = true;

  inactivityTimeoutSignal.value = getInactivityTimeout();

  // Escuta interações do usuário
  const events = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "pointerdown"];
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
      // 1. Sincroniza dados pendentes com a nuvem antes de bloquear
      void sincronizarInteligente();

      // 2. Trava a tela com o modal de bloqueio
      isScreenLocked.value = true;
    }
  }, 1000);
}

export function lockScreenNow() {
  if (!cloudUser.value) return;
  void sincronizarInteligente();
  isScreenLocked.value = true;
}

export function unlockScreen() {
  isScreenLocked.value = false;
  lastActivity = Date.now();
}
