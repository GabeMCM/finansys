import { useState } from "react";
import { Icon } from "../Icon.tsx";
import { Modal } from "../Modal.tsx";
import { money } from "../../lib/format.ts";

export interface ModalIgnorarProjecaoProps {
  isOpen: boolean;
  onClose: () => void;
  contaNome: string;
  mesNome: string;
  valorCentavos: number;
  mesProximoNome?: string;
  onConfirmar: (modo: "somar_proximo" | "apenas_ignorar") => Promise<void>;
}

export function ModalIgnorarProjecao({
  isOpen,
  onClose,
  contaNome,
  mesNome,
  valorCentavos,
  mesProximoNome,
  onConfirmar,
}: ModalIgnorarProjecaoProps) {
  const [modo, setModo] = useState<"somar_proximo" | "apenas_ignorar">("somar_proximo");
  const [salvando, setSalvando] = useState(false);

  if (!isOpen) return null;

  const handleConfirmar = async () => {
    setSalvando(true);
    try {
      await onConfirmar(modo);
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      title={`Ignorar Projeção: ${contaNome}`}
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      footer={
        <div class="modal-footer-actions">
          <div class="modal-footer-actions__right" style="width:100%;">
            <div class="modal-footer-actions__secondary-row" style="grid-template-columns:1fr 1fr;width:100%;">
              <button type="button" class="btn btn--ghost" onClick={onClose} disabled={salvando}>
                Cancelar
              </button>
              <button
                type="button"
                class="btn btn--primary"
                onClick={handleConfirmar}
                disabled={salvando}
                style="font-weight:700;"
              >
                {salvando ? "Salvando..." : "Confirmar Decisão"}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="padding:10px 14px;background:var(--surface-soft);border:1px solid var(--border);border-radius:var(--r-md);font-size:var(--fs-sm);line-height:1.4;">
          A conta <strong>{contaNome}</strong> possui uma projeção de{" "}
          <strong class="num" style="color:var(--text);">{money(valorCentavos)}</strong> em{" "}
          <strong>{mesNome}</strong> que ainda não foi realizada no real.
        </div>

        <div style="font-size:var(--fs-xs);font-weight:700;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em;">
          Como deseja proceder com este valor?
        </div>

        {/* Opção 1: Somar ao próximo mês */}
        {mesProximoNome ? (
          <label
            style={`display:flex;align-items:flex-start;gap:12px;padding:12px;border-radius:var(--r-md);border:1px solid ${
              modo === "somar_proximo" ? "var(--primary)" : "var(--border)"
            };background:${
              modo === "somar_proximo" ? "rgba(16, 185, 129, 0.08)" : "var(--surface)"
            };cursor:pointer;transition:all var(--t-fast);`}
          >
            <input
              type="radio"
              name="modo-ignorar"
              value="somar_proximo"
              checked={modo === "somar_proximo"}
              onChange={() => setModo("somar_proximo")}
              style="margin-top:2px;"
            />
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:var(--fs-sm);color:var(--text);">
                <Icon name="arrowRight" style="width:14px;height:14px;color:var(--primary);" />
                <span>Somar ao próximo mês ({mesProximoNome})</span>
              </div>
              <p style="margin:4px 0 0 0;font-size:var(--fs-xs);color:var(--text-muted);line-height:1.4;">
                O valor de <strong>{money(valorCentavos)}</strong> será somado à projeção de{" "}
                <strong>{mesProximoNome}</strong>, e a projeção de {mesNome} será zerada.
                Recomendado para contas adiadas ou acumuladas.
              </p>
            </div>
          </label>
        ) : (
          <div style="padding:8px 12px;background:rgba(245, 158, 11, 0.1);border:1px solid rgba(245, 158, 11, 0.3);border-radius:var(--r-md);font-size:var(--fs-xs);color:#f59e0b;">
            Dezembro é o último mês do ano fiscal. A opção de transferência direta para o próximo mês não se aplica aqui.
          </div>
        )}

        {/* Opção 2: Apenas ignorar */}
        <label
          style={`display:flex;align-items:flex-start;gap:12px;padding:12px;border-radius:var(--r-md);border:1px solid ${
            modo === "apenas_ignorar" ? "var(--primary)" : "var(--border)"
          };background:${
            modo === "apenas_ignorar" ? "rgba(16, 185, 129, 0.08)" : "var(--surface)"
          };cursor:pointer;transition:all var(--t-fast);`}
        >
          <input
            type="radio"
            name="modo-ignorar"
            value="apenas_ignorar"
            checked={modo === "apenas_ignorar" || !mesProximoNome}
            onChange={() => setModo("apenas_ignorar")}
            style="margin-top:2px;"
          />
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:var(--fs-sm);color:var(--text);">
              <Icon name="x" style="width:14px;height:14px;color:var(--text-muted);" />
              <span>Apenas ignorar este mês</span>
            </div>
            <p style="margin:4px 0 0 0;font-size:var(--fs-xs);color:var(--text-muted);line-height:1.4;">
              A projeção de <strong>{mesNome}</strong> será zerada sem transferir saldo para os meses futuros.
              Recomendado para despesas canceladas, isentas ou não aplicáveis.
            </p>
          </div>
        </label>
      </div>
    </Modal>
  );
}
