import { useEffect, useState } from "preact/hooks";
import { Icon } from "../Icon.tsx";
import { Modal } from "../Modal.tsx";
import { MoneyInput } from "../lancamento/MoneyInput.tsx";
import { toast } from "../Toast.tsx";
import { confirmarAcao } from "../ModalConfirm.tsx";
import { lancamentos, reservaMovimentos } from "../../data/repo.ts";
import type { Conta, Reserva, ReservaMovimento, TipoMovimentoReserva } from "../../data/types.ts";

export interface ModalMovimentoReservaProps {
  isOpen: boolean;
  reservas: Reserva[];
  contas: Conta[];
  empresaId: string;
  anoId: string;
  anoNum: number;
  initialReservaId?: string;
  initialTipo?: TipoMovimentoReserva;
  movimento?: ReservaMovimento | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ModalMovimentoReserva({
  isOpen,
  reservas,
  contas,
  empresaId,
  anoId,
  anoNum,
  initialReservaId,
  initialTipo = "aporte",
  movimento,
  onClose,
  onSuccess,
}: ModalMovimentoReservaProps) {
  const [reservaId, setReservaId] = useState<string>("");
  const [tipo, setTipo] = useState<TipoMovimentoReserva>(initialTipo);
  const [valorCentavos, setValorCentavos] = useState<number>(0);
  const [data, setData] = useState<string>("");
  const [contaId, setContaId] = useState<string>("");
  const [obs, setObs] = useState<string>("");
  const [salvando, setSalvando] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    if (movimento) {
      setReservaId(movimento.reservaId);
      setTipo(movimento.tipo);
      setValorCentavos(movimento.valor);
      setData(movimento.data);
      setContaId(movimento.contaId || "");
      setObs(movimento.obs || "");
    } else {
      const defaultReserva = initialReservaId || (reservas.length > 0 ? reservas[0].id : "");
      setReservaId(defaultReserva);
      setTipo(initialTipo);
      setValorCentavos(0);
      setContaId("");
      setObs("");

      // Data de hoje ou padrão do ano
      const hoje = new Date();
      const mesStr = String(hoje.getMonth() + 1).padStart(2, "0");
      const diaStr = String(hoje.getDate()).padStart(2, "0");
      const dataSugerida = `${anoNum}-${mesStr}-${diaStr}`;
      setData(dataSugerida);
    }
  }, [isOpen, movimento, initialReservaId, initialTipo, reservas, anoNum]);

  const handleSubmit = async (e?: Event) => {
    if (e) e.preventDefault();
    if (!reservaId || valorCentavos <= 0 || !data) {
      toast({ tipo: "erro", texto: "Preencha o valor e a data da movimentação." });
      return;
    }

    const mes = parseInt(data.split("-")[1], 10) - 1;
    const reservaSelecionada = reservas.find((r) => r.id === reservaId);
    const nomeReserva = reservaSelecionada ? reservaSelecionada.nome : "Reserva";

    setSalvando(true);
    try {
      if (movimento) {
        // Atualização de movimento existente
        await reservaMovimentos.update(movimento.id, {
          reservaId,
          tipo,
          valor: valorCentavos,
          data,
          mes,
          contaId: contaId || undefined,
          obs: obs.trim() || undefined,
        });

        // Sincroniza lançamento operacional vinculado, se houver
        if (movimento.lancamentoId) {
          if (contaId && (tipo === "aporte" || tipo === "resgate")) {
            await lancamentos.update(movimento.lancamentoId, {
              contaId,
              mes,
              data,
              valor: valorCentavos,
              obs: tipo === "aporte" ? `Aplicação na Reserva: ${nomeReserva}` : `Resgate da Reserva: ${nomeReserva}`,
              tipoReserva: tipo,
            });
          } else {
            // Conta operacional foi desmarcada -> remove lançamento vinculado
            await lancamentos.delete(movimento.lancamentoId);
            await reservaMovimentos.update(movimento.id, { lancamentoId: undefined });
          }
        } else if (contaId && (tipo === "aporte" || tipo === "resgate")) {
          // Não tinha vínculo antes, mas o usuário agora selecionou uma conta operacional
          const lancId = await lancamentos.create({
            anoId,
            contaId,
            mes,
            data,
            valor: valorCentavos,
            obs: tipo === "aporte" ? `Aplicação na Reserva: ${nomeReserva}` : `Resgate da Reserva: ${nomeReserva}`,
            reservaId,
            tipoReserva: tipo,
          });
          await reservaMovimentos.update(movimento.id, { lancamentoId: lancId });
        }

        toast({ tipo: "sucesso", texto: "Movimentação atualizada com sucesso!" });
      } else {
        // Criação de novo movimento
        let lancId: string | undefined = undefined;

        if (contaId && (tipo === "aporte" || tipo === "resgate")) {
          lancId = await lancamentos.create({
            anoId,
            contaId,
            mes,
            data,
            valor: valorCentavos,
            obs: tipo === "aporte" ? `Aplicação na Reserva: ${nomeReserva}` : `Resgate da Reserva: ${nomeReserva}`,
            reservaId,
            tipoReserva: tipo,
          });
        }

        await reservaMovimentos.create({
          empresaId,
          anoId,
          reservaId,
          tipo,
          valor: valorCentavos,
          data,
          mes,
          contaId: contaId || undefined,
          obs: obs.trim() || undefined,
          lancamentoId: lancId,
        });

        toast({ tipo: "sucesso", texto: "Movimentação registrada com sucesso!" });
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast({ tipo: "erro", texto: "Erro ao registrar movimentação." });
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async () => {
    if (!movimento) return;
    const ok = await confirmarAcao({
      titulo: "Excluir movimentação?",
      mensagem: "O registro será excluído da carteira de investimentos e do caixa operacional.",
      rotuloConfirmar: "Sim, excluir",
      tipo: "danger",
    });
    if (ok) {
      setSalvando(true);
      try {
        if (movimento.lancamentoId) {
          await lancamentos.delete(movimento.lancamentoId);
        }
        await reservaMovimentos.delete(movimento.id);
        toast({ tipo: "sucesso", texto: "Movimentação excluída." });
        onSuccess();
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
      title={movimento ? "Editar Movimentação" : "Nova Movimentação na Carteira"}
      size="md"
      onSubmitShortcut={handleSubmit}
      footer={
        <div class="modal-footer-actions">
          {movimento ? (
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
              disabled={salvando || valorCentavos <= 0 || !reservaId}
            >
              <Icon name="check" /> {salvando ? "Salvando..." : "Confirmar Lançamento"}
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} class="stack" style="gap: var(--sp-4);">
        {/* Seletor de Tipo de Movimento */}
        <div class="field">
          <span class="field__label">Tipo de Movimentação</span>
          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
            <button
              type="button"
              onClick={() => setTipo("aporte")}
              class={`btn ${tipo === "aporte" ? "btn--primary" : "btn--ghost"}`}
              style={tipo === "aporte" ? "background: var(--in); color: #fff;" : "border: 1px solid var(--border);"}
            >
              <Icon name="arrowDown" /> Guardar / Aplicar
            </button>
            <button
              type="button"
              onClick={() => setTipo("resgate")}
              class={`btn ${tipo === "resgate" ? "btn--primary" : "btn--ghost"}`}
              style={tipo === "resgate" ? "background: var(--aporte); color: #fff;" : "border: 1px solid var(--border);"}
            >
              <Icon name="arrowUp" /> Retirar / Resgatar
            </button>
            <button
              type="button"
              onClick={() => {
                setTipo("rendimento");
                setContaId(""); // Rendimento não afeta caixa operacional
              }}
              class={`btn ${tipo === "rendimento" ? "btn--primary" : "btn--ghost"}`}
              style={tipo === "rendimento" ? "background: #8b5cf6; color: #fff;" : "border: 1px solid var(--border);"}
            >
              <Icon name="sparkle" /> Rendimento
            </button>
          </div>
        </div>

        {/* Valor em destaque */}
        <div class="field">
          <span class="field__label">Valor da Operação *</span>
          <MoneyInput
            variant="hero"
            valueCentavos={valorCentavos}
            onChangeCentavos={setValorCentavos}
            autoFocus
          />
        </div>

        {/* Reserva & Data */}
        <div class="grid grid--2" style="gap: var(--sp-3);">
          <label class="field">
            <span class="field__label">Reserva / Caixinha *</span>
            <select
              class="input"
              value={reservaId}
              onChange={(e) => setReservaId((e.target as HTMLSelectElement).value)}
              required
            >
              {reservas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </label>

          <label class="field">
            <span class="field__label">Data da Operação *</span>
            <input
              type="date"
              class="input"
              value={data}
              onChange={(e) => setData((e.target as HTMLInputElement).value)}
              required
            />
          </label>
        </div>

        {/* Movimentar Caixa Operacional (Apenas Aporte e Resgate) */}
        {tipo !== "rendimento" && (
          <div
            style="background: var(--surface-soft); padding: var(--sp-3); border-radius: var(--r-md); border: 1px solid var(--border);"
          >
            <label class="field" style="margin-bottom: 0;">
              <span class="field__label" style="display:flex; align-items:center; justify-content:space-between;">
                <span>
                  {tipo === "aporte" ? "Debitar de qual Conta Operacional?" : "Creditar em qual Conta Operacional?"}
                </span>
                <span style="font-size: var(--fs-xs); color: var(--text-faint);">
                  (Opcional)
                </span>
              </span>
              <select
                class="input"
                value={contaId}
                onChange={(e) => setContaId((e.target as HTMLSelectElement).value)}
              >
                <option value="">Nenhuma / Ajuste Direto na Reserva (Não mexe no Caixa Diário)</option>
                {contas
                  .filter((c) => c.ativa !== false)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({c.natureza})
                    </option>
                  ))}
              </select>
              <span style="font-size: var(--fs-xs); color: var(--text-muted); margin-top: 4px; display: block;">
                {contaId
                  ? tipo === "aporte"
                    ? "✓ O valor sairá do caixa operacional e entrará na reserva patrimonial."
                    : "✓ O valor sairá da reserva e entrará como recurso disponível no caixa operacional."
                  : "ℹ️ Operação direta: atualiza o saldo da reserva sem criar lançamentos no fluxo de caixa diário."}
              </span>
            </label>
          </div>
        )}

        {/* Observações */}
        <label class="field">
          <span class="field__label">Observações / Motivo (Opcional)</span>
          <input
            type="text"
            class="input"
            placeholder="Ex: Aporte mensal recorrente, Rendimento do CDI de Maio..."
            value={obs}
            onInput={(e) => setObs((e.target as HTMLInputElement).value)}
          />
        </label>
      </form>
    </Modal>
  );
}
