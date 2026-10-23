import { useEffect, useState } from "preact/hooks";
import { Icon } from "../Icon.tsx";
import { Modal } from "../Modal.tsx";
import { MoneyInput } from "../lancamento/MoneyInput.tsx";
import { toast } from "../Toast.tsx";
import { reservaProjecoes } from "../../data/repo.ts";
import { MONTHS } from "../../lib/format.ts";
import type { Reserva, ReservaProjecao } from "../../data/types.ts";

export interface ModalProjecaoReservaProps {
  isOpen: boolean;
  reserva: Reserva;
  empresaId: string;
  anoId: string;
  projecoes: ReservaProjecao[];
  onClose: () => void;
  onSuccess: () => void;
}

interface LinhaMes {
  mes: number;
  valorAporte: number;
  valorResgate: number;
  valorRendimento: number;
}

export function ModalProjecaoReserva({
  isOpen,
  reserva,
  empresaId,
  anoId,
  projecoes,
  onClose,
  onSuccess,
}: ModalProjecaoReservaProps) {
  const [linhas, setLinhas] = useState<LinhaMes[]>([]);
  const [rapidoAporte, setRapidoAporte] = useState<number>(0);
  const [rapidoResgate, setRapidoResgate] = useState<number>(0);
  const [rapidoRendimento, setRapidoRendimento] = useState<number>(0);
  const [salvando, setSalvando] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    const projsDaReserva = projecoes.filter((p) => p.reservaId === reserva.id);
    const inicial: LinhaMes[] = Array.from({ length: 12 }, (_, m) => {
      const p = projsDaReserva.find((item) => item.mes === m);
      return {
        mes: m,
        valorAporte: p?.valorAporte || 0,
        valorResgate: p?.valorResgate || 0,
        valorRendimento: p?.valorRendimento || 0,
      };
    });
    setLinhas(inicial);
  }, [isOpen, reserva, projecoes]);

  const aplicarRapido = () => {
    setLinhas((prev) =>
      prev.map((l) => ({
        ...l,
        valorAporte: rapidoAporte > 0 ? rapidoAporte : l.valorAporte,
        valorResgate: rapidoResgate > 0 ? rapidoResgate : l.valorResgate,
        valorRendimento: rapidoRendimento > 0 ? rapidoRendimento : l.valorRendimento,
      }))
    );
    toast.success("Valores aplicados para os 12 meses!");
  };

  const atualizarLinha = (mes: number, campo: "valorAporte" | "valorResgate" | "valorRendimento", valor: number) => {
    setLinhas((prev) =>
      prev.map((l) => (l.mes === mes ? { ...l, [campo]: valor } : l))
    );
  };

  const handleSubmit = async (e?: Event) => {
    if (e) e.preventDefault();
    setSalvando(true);
    try {
      for (const linha of linhas) {
        await reservaProjecoes.set(empresaId, anoId, reserva.id, linha.mes, {
          valorAporte: linha.valorAporte,
          valorResgate: linha.valorResgate,
          valorRendimento: linha.valorRendimento,
        });
      }
      toast.success(`Projeções de "${reserva.nome}" salvas!`);
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar projeções.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Projetar: ${reserva.nome}`}
      size="lg"
      onSubmitShortcut={handleSubmit}
      footer={
        <div class="modal-footer-actions">
          <div />
          <div class="modal-footer-actions__right">
            <button type="button" class="btn btn--ghost" onClick={onClose} disabled={salvando}>
              Cancelar
            </button>
            <button
              type="button"
              class="btn btn--primary"
              onClick={() => handleSubmit()}
              disabled={salvando}
            >
              <Icon name="check" /> {salvando ? "Salvando..." : "Salvar Projeções"}
            </button>
          </div>
        </div>
      }
    >
      <div class="stack" style="gap: var(--sp-4);">
        {/* Preenchimento Rápido */}
        <div
          style="background: var(--surface-soft); padding: var(--sp-3); border-radius: var(--r-md); border: 1px solid var(--border);"
        >
          <span style="font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint); display: block; margin-bottom: 8px;">
            Preenchimento Rápido (Replicar para os 12 meses)
          </span>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; align-items: end;">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size: 0.72rem;">Aporte Mensal</label>
              <MoneyInput variant="compact" valueCentavos={rapidoAporte} onChangeCentavos={setRapidoAporte} />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size: 0.72rem;">Resgate Mensal</label>
              <MoneyInput variant="compact" valueCentavos={rapidoResgate} onChangeCentavos={setRapidoResgate} />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size: 0.72rem;">Rendimento Mensal</label>
              <MoneyInput variant="compact" valueCentavos={rapidoRendimento} onChangeCentavos={setRapidoRendimento} />
            </div>
            <button type="button" class="btn btn--primary" style="height: 38px;" onClick={aplicarRapido}>
              <Icon name="copy" /> Replicar nos 12 meses
            </button>
          </div>
        </div>

        {/* Grade Mês a Mês */}
        <div style="max-height: 420px; overflow-y: auto; overflow-x: auto; padding-right: 4px;">
          <div style="display: flex; flex-direction: column; gap: 8px; min-width: 440px;">
            {linhas.map((linha) => (
              <div
                key={linha.mes}
                style="display: grid; grid-template-columns: 80px repeat(3, 1fr); gap: 8px; align-items: center; background: var(--surface-solid); padding: 8px 12px; border-radius: var(--r-md); border: 1px solid var(--border);"
              >
                <div style="font-weight: 700; font-size: var(--fs-sm); color: var(--text);">
                  {MONTHS[linha.mes]}
                </div>
                <div>
                  <span style="font-size: 0.7rem; color: var(--in); font-weight: 600; display: block; margin-bottom: 2px;">
                    (+) Aporte
                  </span>
                  <MoneyInput
                    variant="compact"
                    valueCentavos={linha.valorAporte}
                    onChangeCentavos={(v) => atualizarLinha(linha.mes, "valorAporte", v)}
                  />
                </div>
                <div>
                  <span style="font-size: 0.7rem; color: var(--aporte); font-weight: 600; display: block; margin-bottom: 2px;">
                    (−) Resgate
                  </span>
                  <MoneyInput
                    variant="compact"
                    valueCentavos={linha.valorResgate}
                    onChangeCentavos={(v) => atualizarLinha(linha.mes, "valorResgate", v)}
                  />
                </div>
                <div>
                  <span style="font-size: 0.7rem; color: var(--rendimento); font-weight: 600; display: block; margin-bottom: 2px;">
                    (+) Rendimento
                  </span>
                  <MoneyInput
                    variant="compact"
                    valueCentavos={linha.valorRendimento}
                    onChangeCentavos={(v) => atualizarLinha(linha.mes, "valorRendimento", v)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
