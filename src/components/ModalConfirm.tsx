import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { Icon, type IconName } from "./Icon.tsx";

export interface ConfirmOptions {
  titulo: string;
  mensagem: string;
  rotuloConfirmar?: string;
  rotuloCancelar?: string;
  tipo?: "danger" | "warning" | "info" | "primary";
}

interface DialogState extends ConfirmOptions {
  resolver: (value: boolean) => void;
}

export const dialogConfirmState = signal<DialogState | null>(null);

/**
 * Abre um diálogo de confirmação moderno e estilizado.
 * Retorna uma Promise que resolve em true (confirmado) ou false (cancelado).
 */
export function confirmarAcao(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    dialogConfirmState.value = {
      ...options,
      resolver: resolve,
    };
  });
}

const tipoIconeMap: Record<string, { icon: IconName; cls: string }> = {
  danger: { icon: "trash", cls: "dialog-icon--danger" },
  warning: { icon: "alertTriangle", cls: "dialog-icon--warn" },
  info: { icon: "info", cls: "dialog-icon--info" },
  primary: { icon: "sparkle", cls: "dialog-icon--primary" },
};

export function ModalConfirm() {
  const dialog = dialogConfirmState.value;
  if (!dialog) return null;

  const fechar = (confirmado: boolean) => {
    const resolver = dialog.resolver;
    dialogConfirmState.value = null;
    resolver(confirmado);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const metaIcone = tipoIconeMap[dialog.tipo || "primary"] || tipoIconeMap.primary;
  const isDanger = dialog.tipo === "danger";

  return (
    <div
      class="modal-backdrop"
      style="align-items:center;justify-content:center;padding:16px;z-index:200;"
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar(false);
      }}
    >
      <div
        class="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <div class="confirm-card__header">
          <div class={`confirm-card__icon ${metaIcone.cls}`}>
            <Icon name={metaIcone.icon} />
          </div>
          <div>
            <h3 id="confirm-dialog-title" class="confirm-card__title">
              {dialog.titulo}
            </h3>
            <p id="confirm-dialog-desc" class="confirm-card__desc">
              {dialog.mensagem}
            </p>
          </div>
        </div>

        <div class="confirm-card__actions">
          <button
            type="button"
            class="btn btn--secondary"
            onClick={() => fechar(false)}
            autoFocus
          >
            {dialog.rotuloCancelar || "Cancelar"}
          </button>
          <button
            type="button"
            class={`btn ${isDanger ? "btn--danger" : "btn--primary"}`}
            onClick={() => fechar(true)}
          >
            {dialog.rotuloConfirmar || (isDanger ? "Excluir" : "Confirmar")}
          </button>
        </div>
      </div>
    </div>
  );
}
