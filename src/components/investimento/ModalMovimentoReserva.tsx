import { useEffect, useState } from "preact/hooks";
import { CustomSelect } from "../CustomSelect.tsx";
import { Icon } from "../Icon.tsx";
import { Modal } from "../Modal.tsx";
import { MoneyInput } from "../lancamento/MoneyInput.tsx";
import { toast } from "../Toast.tsx";
import { confirmarAcao } from "../ModalConfirm.tsx";
import { lancamentos, reservaMovimentos } from "../../data/repo.ts";
import type { Conta, ContaBancaria, Reserva, ReservaMovimento, TipoMovimentoReserva } from "../../data/types.ts";
import { money } from "../../lib/format.ts";

export interface ModalMovimentoReservaProps {
  isOpen: boolean;
  reservas: Reserva[];
  contas?: Conta[];
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
  const [bancoId, setBancoId] = useState<string>(""); // Origem (de onde sai)
  const [bancoDestinoId, setBancoDestinoId] = useState<string>(""); // Destino (para onde vai)
  const [obs, setObs] = useState<string>("");
  const [salvando, setSalvando] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    if (movimento) {
      setReservaId(movimento.reservaId);
      setTipo(movimento.tipo);
      setValorCentavos(movimento.valor);
      setData(movimento.data);
      setBancoId(movimento.bancoId || "");
      setBancoDestinoId(movimento.bancoDestinoId || "");
      setObs(movimento.obs || "");
    } else {
      const defaultReservaId = initialReservaId || (reservas.length > 0 ? reservas[0].id : "");
      setReservaId(defaultReservaId);
      setTipo(initialTipo);
      setValorCentavos(0);
      setObs("");

      // Se a reserva tem conta bancária vinculada, sugere de forma inteligente
      const resObj = reservas.find((r) => r.id === defaultReservaId);
      const bancoVinculado = contasBancarias.find(
        (b) => (resObj?.contaBancariaId && b.id === resObj.contaBancariaId) || (b.reservaVinculadaId === defaultReservaId),
      );

      const bancosValidos = contasBancarias.filter((b) => b.ativa !== false);

      if (initialTipo === "aporte") {
        setBancoId(""); // Saída opcional (vazio = entrada livre / presente / aporte externo)
        setBancoDestinoId(bancoVinculado ? bancoVinculado.id : "");
      } else if (initialTipo === "resgate") {
        setBancoId(bancoVinculado ? bancoVinculado.id : ""); // Origem do resgate
        // Destino onde cai o resgate: primeira conta corrente disponível ou primeira ativa
        const destinoSugerido = bancosValidos.find((b) => b.id !== bancoVinculado?.id) || bancosValidos[0];
        setBancoDestinoId(destinoSugerido ? destinoSugerido.id : "");
      } else {
        setBancoId("");
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

    // Regra Contábil / Bancária: Em resgate, é obrigatório informar a conta de destino onde o dinheiro cai
    if (tipo === "resgate" && !bancoDestinoId && !bancoId) {
      toast.error("Informe a conta bancária onde o valor resgatado será depositado.");
      return;
    }
    if (tipo === "resgate" && !bancoDestinoId) {
      toast.error("Informe a conta bancária de destino onde o valor resgatado será depositado.");
      return;
    }

    const mes = parseInt(data.split("-")[1], 10) - 1;

    setSalvando(true);
    try {
      // Limpeza de lançamento operacional legado (se houver) para evitar duplicidade ou distorção no DRE
      if (movimento?.lancamentoId) {
        try {
          await lancamentos.delete(movimento.lancamentoId);
        } catch (_err) {
          // Ignora se já tiver sido removido
        }
      }

      if (movimento) {
        // Atualização de movimento existente
        await reservaMovimentos.update(movimento.id, {
          reservaId,
          tipo,
          valor: valorCentavos,
          data,
          mes,
          contaId: undefined, // Movimentações de reserva são exclusivamente patrimoniais/bancárias
          bancoId: tipo === "rendimento" ? undefined : (bancoId || undefined),
          bancoDestinoId: tipo === "rendimento" ? undefined : (bancoDestinoId || undefined),
          obs: obs.trim() || undefined,
          lancamentoId: undefined,
        });

        toast.success("Movimentação atualizada com sucesso!");
      } else {
        // Criação de novo movimento
        await reservaMovimentos.create({
          empresaId,
          anoId,
          reservaId,
          tipo,
          valor: valorCentavos,
          data,
          mes,
          bancoId: tipo === "rendimento" ? undefined : (bancoId || undefined),
          bancoDestinoId: tipo === "rendimento" ? undefined : (bancoDestinoId || undefined),
          obs: obs.trim() || undefined,
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
      mensagem: "O registro será excluído da carteira de investimentos e das contas bancárias vinculadas.",
      rotuloConfirmar: "Sim, excluir",
      tipo: "danger",
    });
    if (ok) {
      setSalvando(true);
      try {
        if (movimento.lancamentoId) {
          try {
            await lancamentos.delete(movimento.lancamentoId);
          } catch (_e) {
            // ignora
          }
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

  const bancosAtivos = contasBancarias.filter((b) => b.ativa !== false);

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
              disabled={salvando || valorCentavos <= 0 || !reservaId || (tipo === "resgate" && !bancoDestinoId)}
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
              onClick={() => {
                setTipo("aporte");
                // Sugere destino vinculado à reserva se existir
                const rSel = reservas.find((item) => item.id === reservaId);
                if (rSel?.contaBancariaId) {
                  setBancoDestinoId(rSel.contaBancariaId);
                }
              }}
              class={`tab ${tipo === "aporte" ? "is-active" : ""}`}
              style={tipo === "aporte" ? "background: var(--in); color: #fff; font-weight:700;" : ""}
            >
              <Icon name="arrowDown" /> Guardar / Aplicar
            </button>
            <button
              type="button"
              onClick={() => {
                setTipo("resgate");
                const rSel = reservas.find((item) => item.id === reservaId);
                if (rSel?.contaBancariaId) {
                  setBancoId(rSel.contaBancariaId); // Origem de onde sai
                }
                if (!bancoDestinoId && bancosAtivos.length > 0) {
                  const dest = bancosAtivos.find((b) => b.id !== rSel?.contaBancariaId) || bancosAtivos[0];
                  setBancoDestinoId(dest.id);
                }
              }}
              class={`tab ${tipo === "resgate" ? "is-active" : ""}`}
              style={tipo === "resgate" ? "background: var(--aporte); color: #fff; font-weight:700;" : ""}
            >
              <Icon name="arrowUp" /> Retirar / Resgatar
            </button>
            <button
              type="button"
              onClick={() => {
                setTipo("rendimento");
                setBancoId("");
                setBancoDestinoId("");
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
              onChange={(val) => {
                setReservaId(val);
                const rSel = reservas.find((item) => item.id === val);
                if (rSel?.contaBancariaId) {
                  if (tipo === "aporte") {
                    setBancoDestinoId(rSel.contaBancariaId);
                  } else if (tipo === "resgate") {
                    setBancoId(rSel.contaBancariaId);
                  }
                }
              }}
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

        {/* Bloco de Instituições Bancárias: Aporte / Aplicação (Origem e Destino em duas linhas) */}
        {tipo === "aporte" && (
          <div class="stack" style="gap:var(--sp-3);background:var(--surface-soft);padding:var(--sp-3);border-radius:var(--r-md);border:1px solid var(--border);">
            <div style="font-size:var(--fs-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;display:flex;align-items:center;gap:6px;">
              <Icon name="bank" style="width:13px;height:13px;color:var(--primary);" />
              <span>Instituições Bancárias (Origem & Destino da Aplicação)</span>
            </div>

            {/* Linha 1: Conta de Saída (Origem) */}
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="mov-banco-origem">
                Conta de Saída (Origem do Dinheiro)
              </label>
              <CustomSelect
                id="mov-banco-origem"
                value={bancoId}
                options={[
                  { value: "", label: "Nenhuma (Entrada Livre / Presente / Aporte Externo)" },
                  ...bancosAtivos.map((b) => ({
                    value: b.id,
                    label: `${b.nome} (${b.tipo === "investimento" ? "Investimento" : b.tipo === "poupanca" ? "Poupança" : "Conta Corrente"})`,
                    icon: "bank" as const,
                  })),
                ]}
                onChange={(val) => setBancoId(val)}
                placeholder="De onde saiu o dinheiro..."
              />
              <span class="muted" style="font-size:11px;margin-top:4px;display:block;">
                {bancoId
                  ? `Saída de ${valorCentavos > 0 ? money(valorCentavos) : "R$ 0,00"} será debitada do saldo desta conta.`
                  : "Entrada livre: recurso externo ou presente (não debita de nenhum banco cadastrado)."}
              </span>
            </div>

            {/* Linha 2: Conta de Destino (Onde aplica) */}
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="mov-banco-destino">
                Conta de Destino (Onde a reserva é aplicada / alocada)
              </label>
              <CustomSelect
                id="mov-banco-destino"
                value={bancoDestinoId}
                options={[
                  { value: "", label: "Nenhuma (Custódia Direta na Reserva)" },
                  ...bancosAtivos.map((b) => ({
                    value: b.id,
                    label: `${b.nome} (${b.tipo === "investimento" ? "Investimento" : b.tipo === "poupanca" ? "Poupança" : "Conta Corrente"})`,
                    icon: "bank" as const,
                  })),
                ]}
                onChange={(val) => setBancoDestinoId(val)}
                placeholder="Onde fica aplicado..."
              />
              <span class="muted" style="font-size:11px;margin-top:4px;display:block;">
                {bancoDestinoId
                  ? "O valor aplicado entrará na posição desta conta/corretora."
                  : "Registrado diretamente na caixinha patrimonial."}
              </span>
            </div>
          </div>
        )}

        {/* Bloco de Instituições Bancárias: Resgate / Retirada (Origem e Destino em duas linhas) */}
        {tipo === "resgate" && (
          <div class="stack" style="gap:var(--sp-3);background:var(--surface-soft);padding:var(--sp-3);border-radius:var(--r-md);border:1px solid var(--border);">
            <div style="font-size:var(--fs-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;display:flex;align-items:center;gap:6px;">
              <Icon name="bank" style="width:13px;height:13px;color:var(--aporte);" />
              <span>Instituições Bancárias (Origem do Resgate & Destino)</span>
            </div>

            {/* Linha 1: Conta de Origem (De onde sai o resgate) */}
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="mov-banco-origem-resg">
                Conta de Origem (De onde o resgate sai)
              </label>
              <CustomSelect
                id="mov-banco-origem-resg"
                value={bancoId}
                options={[
                  { value: "", label: "Nenhuma (Resgate Direto da Reserva)" },
                  ...bancosAtivos.map((b) => ({
                    value: b.id,
                    label: `${b.nome} (${b.tipo === "investimento" ? "Investimento" : b.tipo === "poupanca" ? "Poupança" : "Conta Corrente"})`,
                    icon: "bank" as const,
                  })),
                ]}
                onChange={(val) => setBancoId(val)}
                placeholder="De onde o resgate sai..."
              />
              <span class="muted" style="font-size:11px;margin-top:4px;display:block;">
                {bancoId
                  ? "Sairá da custódia desta conta/corretora."
                  : "Sai direto do saldo da reserva patrimonial."}
              </span>
            </div>

            {/* Linha 2: Conta de Destino (Onde cai o resgate) */}
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="mov-banco-destino-resg">
                Conta de Destino (Onde cai o resgate no banco) *
              </label>
              <CustomSelect
                id="mov-banco-destino-resg"
                value={bancoDestinoId}
                options={[
                  ...(bancosAtivos.length === 0 ? [{ value: "", label: "Nenhuma conta bancária cadastrada" }] : []),
                  ...bancosAtivos.map((b) => ({
                    value: b.id,
                    label: `${b.nome} (${b.tipo === "investimento" ? "Investimento" : b.tipo === "poupanca" ? "Poupança" : "Conta Corrente"})`,
                    icon: "bank" as const,
                  })),
                ]}
                onChange={(val) => setBancoDestinoId(val)}
                placeholder="Selecione onde o resgate cai..."
              />
              <span class="muted" style="font-size:11px;margin-top:4px;display:block;">
                {bancoDestinoId
                  ? `Entrada de ${valorCentavos > 0 ? money(valorCentavos) : "R$ 0,00"} será creditada nesta conta bancária.`
                  : "Obrigatório: indique a conta bancária que receberá o valor resgatado."}
              </span>
            </div>
          </div>
        )}

        {tipo === "rendimento" && (
          <div class="card" style="padding:var(--sp-3);background:var(--surface-soft);border:1px solid var(--border);display:flex;gap:var(--sp-2);align-items:flex-start;">
            <Icon name="sparkle" style="width:18px;height:18px;color:var(--rendimento);flex-shrink:0;margin-top:2px;" />
            <div style="font-size:var(--fs-xs);color:var(--text-muted);line-height:1.4;">
              <b style="color:var(--text);">Rendimento Intrínseco da Reserva:</b> O valor apurado será adicionado diretamente ao saldo acumulado desta caixinha (ex: juros do CDI, dividendos reinvestidos), sem alterar contas correntes bancárias.
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
