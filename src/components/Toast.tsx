import { signal } from "@preact/signals";
import { Icon, type IconName } from "./Icon.tsx";

export type ToastType = "success" | "error" | "warn" | "info";

export interface ToastItem {
  id: string;
  tipo: ToastType;
  mensagem: string;
  titulo?: string;
}

export const toasts = signal<ToastItem[]>([]);

function adicionarToast(tipo: ToastType, mensagem: string, titulo?: string, duracao = 4000) {
  const id = Math.random().toString(36).substring(2, 9);
  const novoToast: ToastItem = { id, tipo, mensagem, titulo };
  toasts.value = [...toasts.value, novoToast];

  if (duracao > 0) {
    setTimeout(() => {
      removerToast(id);
    }, duracao);
  }
}

export function removerToast(id: string) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

export const toast = {
  success: (mensagem: string, titulo?: string) => adicionarToast("success", mensagem, titulo),
  error: (mensagem: string, titulo?: string) => adicionarToast("error", mensagem, titulo, 5000),
  warn: (mensagem: string, titulo?: string) => adicionarToast("warn", mensagem, titulo, 4500),
  info: (mensagem: string, titulo?: string) => adicionarToast("info", mensagem, titulo),
  remover: removerToast,
};

const iconesMap: Record<ToastType, IconName> = {
  success: "check",
  error: "alertCircle",
  warn: "alertTriangle",
  info: "info",
};

export function ToastContainer() {
  const lista = toasts.value;
  if (lista.length === 0) return null;

  return (
    <div class="toast-container" aria-live="polite" aria-atomic="true">
      {lista.map((t) => (
        <div key={t.id} class={`toast toast--${t.tipo}`} role="alert">
          <div class="toast__icon">
            <Icon name={iconesMap[t.tipo]} />
          </div>
          <div class="toast__body">
            {t.titulo && <strong class="toast__title">{t.titulo}</strong>}
            <div class="toast__message">{t.mensagem}</div>
          </div>
          <button
            type="button"
            class="toast__close"
            onClick={() => removerToast(t.id)}
            aria-label="Fechar notificação"
          >
            <Icon name="x" />
          </button>
        </div>
      ))}
    </div>
  );
}
