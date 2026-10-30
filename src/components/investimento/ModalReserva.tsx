import { useEffect, useState } from "react";
import { Icon } from "../Icon.tsx";
import { Modal } from "../Modal.tsx";
import { MoneyInput } from "../lancamento/MoneyInput.tsx";
import { confirmarAcao } from "../ModalConfirm.tsx";
import type { Reserva } from "../../data/types.ts";

export interface ModalReservaProps {
  isOpen: boolean;
  reserva: Reserva | null; // null se for nova
  empresaId: string;
  onClose: () => void;
  onSave: (dados: {
    nome: string;
    descricao?: string;
    cor?: string;
    metaCentavos?: number;
    saldoInicialCentavos?: number;
    ativa: boolean;
  }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const CORES_PALETA = [
  { id: "emerald", label: "Verde / Seguro", bg: "#10b981" },
  { id: "blue", label: "Azul / Investimento", bg: "#3b82f6" },
  { id: "violet", label: "Roxo / Sonhos", bg: "#8b5cf6" },
  { id: "amber", label: "Âmbar / Provisão", bg: "#f59e0b" },
  { id: "rose", label: "Rosa / Emergência", bg: "#f43f5e" },
  { id: "cyan", label: "Ciano / Expansão", bg: "#06b6d4" },
];

export function ModalReserva({
  isOpen,
  reserva,
  empresaId: _empresaId,
  onClose,
  onSave,
  onDelete,
}: ModalReservaProps) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cor, setCor] = useState("emerald");
  const [metaCentavos, setMetaCentavos] = useState(0);
  const [saldoInicialCentavos, setSaldoInicialCentavos] = useState(0);
  const [ativa, setAtiva] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (reserva) {
      setNome(reserva.nome || "");
      setDescricao(reserva.descricao || "");
      setCor(reserva.cor || "emerald");
      setMetaCentavos(reserva.metaCentavos || 0);
      setSaldoInicialCentavos(reserva.saldoInicialCentavos || 0);
      setAtiva(reserva.ativa !== false);
    } else {
      setNome("");
      setDescricao("");
      setCor("emerald");
      setMetaCentavos(0);
      setSaldoInicialCentavos(0);
      setAtiva(true);
    }
  }, [reserva, isOpen]);

  const handleSubmit = async (e?: Event) => {
    if (e) e.preventDefault();
    if (!nome.trim()) return;

    setSalvando(true);
    try {
      await onSave({
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        cor,
        metaCentavos: metaCentavos > 0 ? metaCentavos : undefined,
        saldoInicialCentavos: saldoInicialCentavos > 0 ? saldoInicialCentavos : undefined,
        ativa,
      });
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async () => {
    if (!reserva || !onDelete) return;
    const ok = await confirmarAcao({
      titulo: `Excluir "${reserva.nome}"?`,
      mensagem: "A reserva será desativada. As movimentações existentes continuarão salvas no histórico.",
      rotuloConfirmar: "Sim, excluir",
      tipo: "danger",
    });
    if (ok) {
      setSalvando(true);
      try {
        await onDelete(reserva.id);
        onClose();
      } finally {
        setSalvando(false);
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={reserva ? "Editar Reserva / Caixinha" : "Nova Reserva / Caixinha"}
      size="md"
      onSubmitShortcut={handleSubmit}
      footer={
        <div class="modal-footer-actions">
          {reserva && onDelete ? (
            <button
              type="button"
              class="btn btn--ghost"
              style="color: var(--out); padding: 0 10px;"
              onClick={handleExcluir}
              disabled={salvando}
            >
              <Icon name="trash" /> Excluir
            </button>
          ) : (
            <div />
          )}

          <div class="modal-footer-actions__right">
            <button type="button" class="btn btn--ghost" onClick={onClose} disabled={salvando}>
              Cancelar
            </button>
            <button
              type="button"
              class="btn btn--primary"
              onClick={() => handleSubmit()}
              disabled={salvando || !nome.trim()}
            >
              <Icon name="check" /> {salvando ? "Salvando..." : "Salvar Reserva"}
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} class="stack" style="gap: var(--sp-3);">
        <div class="form-group">
          <label class="form-label" for="reserva-nome">Nome da Reserva *</label>
          <input
            id="reserva-nome"
            type="text"
            class="input"
            placeholder="Ex: Reserva de Emergência, Expansão 2027, Provisão 13º"
            value={nome}
            onInput={(e) => setNome((e.target as HTMLInputElement).value)}
            required
            autoFocus
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="reserva-desc">Descrição / Objetivo (Opcional)</label>
          <input
            id="reserva-desc"
            type="text"
            class="input"
            placeholder="Ex: 6 meses de custos fixos da operação"
            value={descricao}
            onInput={(e) => setDescricao((e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="form-group">
          <label class="form-label">Cor de Destaque</label>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:2px;">
            {CORES_PALETA.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCor(c.id)}
                class="chip"
                style={`border-color: ${cor === c.id ? c.bg : "var(--border)"}; background: ${
                  cor === c.id ? "var(--surface-hover)" : "var(--surface-solid)"
                };`}
              >
                <span
                  style={`width:10px; height:10px; border-radius:50%; background:${c.bg}; display:inline-block; flex-shrink:0;`}
                />
                {c.label.split(" / ")[0]}
              </button>
            ))}
          </div>
        </div>

        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--sp-3);">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">
              Meta Financeira (Opcional)
              <span style="font-size:var(--fs-xs); color:var(--text-faint); margin-left:4px; text-transform:none;">
                (Alvo desejado)
              </span>
            </label>
            <MoneyInput
              variant="compact"
              valueCentavos={metaCentavos}
              onChangeCentavos={setMetaCentavos}
              placeholder="0,00 (Livre)"
            />
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">
              Saldo Inicial Preexistente
              <span style="font-size:var(--fs-xs); color:var(--text-faint); margin-left:4px; text-transform:none;">
                (Banca inicial)
              </span>
            </label>
            <MoneyInput
              variant="compact"
              valueCentavos={saldoInicialCentavos}
              onChangeCentavos={setSaldoInicialCentavos}
              placeholder="0,00"
            />
          </div>
        </div>

        <label
          style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:var(--fs-sm); font-weight:500; margin-top:var(--sp-2);"
        >
          <input
            type="checkbox"
            checked={ativa}
            onChange={(e) => setAtiva((e.target as HTMLInputElement).checked)}
          />
          <span>Reserva ativa (visível na tela e nos relatórios)</span>
        </label>
      </form>
    </Modal>
  );
}
