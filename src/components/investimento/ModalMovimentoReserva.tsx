import { useEffect, useState } from "preact/hooks";
import { CustomSelect } from "../CustomSelect.tsx";
import { Icon } from "../Icon.tsx";
import { Modal } from "../Modal.tsx";
import { MoneyInput } from "../lancamento/MoneyInput.tsx";
import { toast } from "../Toast.tsx";
import { confirmarAcao } from "../ModalConfirm.tsx";
import { lancamentos, reservaMovimentos } from "../../data/repo.ts";
import type { Conta, ContaBancaria, Reserva, ReservaMovimento, TipoMovimentoReserva } from "../../data/types.ts";

export interface ModalMovimentoReservaProps {
  isOpen: boolean;
  reservas: Reserva[];
  contas: Conta[];
  contasBancarias?: ContaBancaria[];
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
  contasBancarias = [],
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
  const [bancoId, setBancoId] = useState<string>("");
  const [bancoDestinoId, setBancoDestinoId] = useState<string>("");
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
      setBancoId(movimento.bancoId || "");
      setBancoDestinoId(movimento.bancoDestinoId || "");
      setObs(movimento.obs || "");
    } else {
      const defaultReservaId = initialReservaId || (reservas.length > 0 ? reservas[0].id : "");
      setReservaId(defaultReservaId);
      setTipo(initialTipo);
      setValorCentavos(0);
      setContaId("");
      setObs("");

      // Se a reserva tem conta bancária vinculada, busca ela
      const resObj = reservas.find((r) => r.id === defaultReservaId);
      const bancoVinculado = contasBancarias.find(
        (b) => (resObj?.contaBancariaId && b.id === resObj.contaBancariaId) || (b.reservaVinculadaId === defaultReservaId)
      );

      if (initialTipo === "aporte") {
        setBancoId("");
        setBancoDestinoId(bancoVinculado ? bancoVinculado.id : "");
      } else if (initialTipo === "resgate") {
        setBancoId(bancoVinculado ? bancoVinculado.id : "");
        setBancoDestinoId("");
      } else {
        setBancoId(bancoVinculado ? bancoVinculado.id : "");
        setBancoDestinoId("");
      }

      // Data de hoje ou padrão do ano
      const hoje = new Date();
      const mesStr = String(hoje.getMonth() + 1).padStart(2, "0");
      const diaStr = String(hoje.getDate()).padStart(2, "0");
      const dataSugerida = `${anoNum}-${mesStr}-${diaStr}`;
      setData(dataSugerida);
    }
  }, [isOpen, movimento, initialReservaId, initialTipo, reservas, contasBancarias, anoNum]);

  const handleSubmit = async (e?: Event) => {
    if (e) e.preventDefault();
    if (!reservaId || valorCentavos <= 0 || !data) {
      toast.error("Preencha o valor e a data da movimentação.");
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
          bancoId: bancoId || undefined,
          bancoDestinoId: bancoDestinoId || undefined,
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
              bancoId: bancoId || undefined,
              bancoDestinoId: bancoDestinoId || undefined,
            });
          } else {
            // Conta operacional foi desmarcada -> remove lançamento vinculado
            await lancamentos.delete(movimento.lancamentoId);
            await reservaMovimentos.update(movimento.id, { lancamentoId: undefined });
          }
        } else if (contaId && (tipo === "aporte" || tipo === "resgate")) {
          // Não tinha vínculo antes, mas o usuário agora selecionou uma conta operacional
          const novoLanc = await lancamentos.create({
            anoId,
            contaId,
            mes,
            data,
            valor: valorCentavos,
            obs: tipo === "aporte" ? `Aplicação na Reserva: ${nomeReserva}` : `Resgate da Reserva: ${nomeReserva}`,
            reservaId,
            tipoReserva: tipo,
            bancoId: bancoId || undefined,
            bancoDestinoId: bancoDestinoId || undefined,
          });
          await reservaMovimentos.update(movimento.id, { lancamentoId: novoLanc.id });
        }

        toast.success("Movimentação atualizada com sucesso!");
      } else {
        // Criação de novo movimento
        let lancId: string | undefined = undefined;

        if (contaId && (tipo === "aporte" || tipo === "resgate")) {
          const novoLanc = await lancamentos.create({
            anoId,
            contaId,
            mes,
            data,
            valor: valorCentavos,
            obs: tipo === "aporte" ? `Aplicação na Reserva: ${nomeReserva}` : `Resgate da Reserva: ${nomeReserva}`,
            reservaId,
            tipoReserva: tipo,
            bancoId: bancoId || undefined,
            bancoDestinoId: bancoDestinoId || undefined,
          });
          lancId = novoLanc.id;
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
          bancoId: bancoId || undefined,
          bancoDestinoId: bancoDestinoId || undefined,
          obs: obs.trim() || undefined,
          lancamentoId: lancId,
        });

        toast.success("Movimentação registrada com sucesso!");
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao registrar movimentação.");
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
        toast.success("Movimentação excluída.");
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
      <form onSubmit={handleSubmit} class="stack" style="gap: var(--sp-3);">
        {/* Seletor de Tipo de Movimento */}
        <div class="form-group">
          <label class="form-label">Tipo de Movimentação</label>
          <div class="tabs tabs--sm" style="display:flex; width:100%; margin:0;">
            <button
              type="button"
              onClick={() => setTipo("aporte")}
              class={`tab ${tipo === "aporte" ? "is-active" : ""}`}
              style={tipo === "aporte" ? "background: var(--in); color: #fff; font-weight:700;" : ""}
            >
              <Icon name="arrowDown" /> Guardar / Aplicar
            </button>
            <button
              type="button"
              onClick={() => setTipo("resgate")}
              class={`tab ${tipo === "resgate" ? "is-active" : ""}`}
              style={tipo === "resgate" ? "background: var(--aporte); color: #fff; font-weight:700;" : ""}
            >
              <Icon name="arrowUp" /> Retirar / Resgatar
            </button>
            <button
              type="button"
              onClick={() => {
                setTipo("rendimento");
                setContaId(""); // Rendimento não afeta caixa operacional
                setBancoId("");
              }}
              class={`tab ${tipo === "rendimento" ? "is-active" : ""}`}
              style={tipo === "rendimento" ? "background: var(--rendimento); color: #fff; font-weight:700;" : ""}
            >
              <Icon name="sparkle" /> Rendimento
            </button>
          </div>
        </div>

        {/* Valor em destaque */}
        <div class="form-group">
          <label class="form-label">Valor da Operação *</label>
          <MoneyInput
            variant="hero"
            valueCentavos={valorCentavos}
            onChangeCentavos={setValorCentavos}
            autoFocus
          />
        </div>

        {/* Reserva & Data */}
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--sp-3);">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="mov-reserva">Reserva / Caixinha *</label>
            <CustomSelect
              id="mov-reserva"
              value={reservaId}
              options={reservas.map((r) => ({
                value: r.id,
                label: r.nome,
                icon: "wallet",
              }))}
              onChange={(val) => setReservaId(val)}
              placeholder="Selecione a reserva..."
            />
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="mov-data">Data da Operação *</label>
            <input
              id="mov-data"
              type="date"
              class="input"
              value={data}
              onChange={(e) => setData((e.target as HTMLInputElement).value)}
              required
            />
          </div>
        </div>

        {/* Contas Bancárias (Origem e Destino para Troca de Instituição) */}
        {contasBancarias.length > 0 && tipo !== "rendimento" && (
          <div class="stack" style="gap:var(--sp-2);background:var(--surface-soft);padding:var(--sp-3);border-radius:var(--r-md);border:1px solid var(--border);">
            <div style="font-size:var(--fs-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;display:flex;align-items:center;gap:6px;">
              <Icon name="bank" style="width:13px;height:13px;color:var(--primary);" />
              <span>Instituições Bancárias & Troca de Conta</span>
            </div>

            <div class="form-row form-row--2">
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" for="mov-banco-origem">
                  {tipo === "aporte" ? "Conta de Saída (Origem)" : "Conta de Onde Resgata"}
                </label>
                <CustomSelect
                  id="mov-banco-origem"
                  value={bancoId}
                  options={[
                    { value: "", label: "Nenhum (Livre)" },
                    ...contasBancarias
                      .filter((b) => b.ativa !== false)
                      .map((b) => ({
                        value: b.id,
                        label: `${b.nome} (${b.tipo === "investimento" ? "Invest." : b.tipo === "poupanca" ? "Poupança" : "Corrente"})`,
                        icon: "bank" as const,
                      })),
                  ]}
                  onChange={(val) => setBancoId(val)}
                  placeholder="Selecione a conta..."
                />
              </div>

              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" for="mov-banco-destino">
                  {tipo === "aporte" ? "Conta de Entrada (Destino)" : "Conta Onde Cai o Resgate"}
                </label>
                <CustomSelect
                  id="mov-banco-destino"
                  value={bancoDestinoId}
                  options={[
                    { value: "", label: "Nenhum (Mesma instituição)" },
                    ...contasBancarias
                      .filter((b) => b.ativa !== false && b.id !== bancoId)
                      .map((b) => ({
                        value: b.id,
                        label: `${b.nome} (${b.tipo === "investimento" ? "Invest." : b.tipo === "poupanca" ? "Poupança" : "Corrente"})`,
                        icon: "bank" as const,
                      })),
                  ]}
                  onChange={(val) => setBancoDestinoId(val)}
                  placeholder="Troca de instituição..."
                />
              </div>
            </div>

            {bancoId && bancoDestinoId && bancoId !== bancoDestinoId && (
              <div class="muted" style="font-size:11px;display:flex;align-items:center;gap:4px;">
                <Icon name="refresh" style="width:11px;height:11px;color:var(--primary);" />
                <span>Troca de instituição ativa: o valor sairá de uma conta e entrará na outra automaticamente.</span>
              </div>
            )}
          </div>
        )}

        {/* Movimentar Caixa Operacional (Apenas Aporte e Resgate) */}
        {tipo !== "rendimento" && (
          <div
            style="background: var(--surface-soft); padding: var(--sp-3); border-radius: var(--r-md); border: 1px solid var(--border);"
          >
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="mov-conta">
                <span style="display:flex; align-items:center; justify-content:space-between;">
                  <span>
                    {tipo === "aporte" ? "Debitar de qual Conta Operacional?" : "Creditar em qual Conta Operacional?"}
                  </span>
                  <span style="font-size: var(--fs-xs); color: var(--text-faint); font-weight: normal; text-transform: none;">
                    (Opcional)
                  </span>
                </span>
              </label>
              <CustomSelect
                id="mov-conta"
                value={contaId}
                options={[
                  { value: "", label: "Nenhuma (Ajuste Direto na Reserva)" },
                  ...contas
                    .filter((c) => c.ativa !== false)
                    .map((c) => ({
                      value: c.id,
                      label: `${c.nome} (${c.natureza})`,
                      icon: "grid" as const,
                    })),
                ]}
                onChange={(val) => setContaId(val)}
                placeholder="Selecione a conta operacional..."
              />
              <span style="font-size: var(--fs-xs); color: var(--text-muted); margin-top: 6px; display: block;">
                {contaId
                  ? tipo === "aporte"
                    ? "O valor sairá do plano de contas operacional e entrará na reserva patrimonial."
                    : "O valor sairá da reserva e entrará como recurso disponível no plano de contas operacional."
                  : "Operação direta: atualiza o saldo da reserva sem duplicar lançamentos no fluxo de caixa diário."}
              </span>
            </div>
          </div>
        )}

        {/* Observações */}
        <div class="form-group">
          <label class="form-label" for="mov-obs">Observações / Motivo (Opcional)</label>
          <input
            id="mov-obs"
            type="text"
            class="input"
            placeholder="Ex: Aporte mensal recorrente, Rendimento do CDI de Maio..."
            value={obs}
            onInput={(e) => setObs((e.target as HTMLInputElement).value)}
          />
        </div>
      </form>
    </Modal>
  );
}
