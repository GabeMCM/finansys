import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { Icon } from "./Icon.tsx";

export interface ModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  subtela?: boolean;
}

export function Modal({ title, isOpen, onClose, children, footer, subtela = false }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      class={`modal-backdrop ${subtela ? "has-subscreen" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        class={`modal ${subtela ? "modal--subscreen" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div class="modal__head">
          <div style="display:flex;align-items:center;gap:8px;">
            {subtela && (
              <button
                type="button"
                class="btn btn--ghost btn--icon only-mobile"
                onClick={onClose}
                aria-label="Voltar"
                style="margin-left:-6px;"
              >
                <Icon name="arrowLeft" />
              </button>
            )}
            <h2 id="modal-title" class="modal__title">{title}</h2>
          </div>
          <button type="button" class="btn btn--ghost btn--icon" onClick={onClose} aria-label="Fechar">
            <Icon name="x" />
          </button>
        </div>
        <div class="modal__body">{children}</div>
        {footer && <div class="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
