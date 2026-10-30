import { useState } from "preact/hooks";
import { Icon } from "../../components/Icon.tsx";
import { toast } from "../../components/Toast.tsx";
import { calcularCarteiraReservas } from "../../data/calc.ts";
import { anos, contasBancarias, empresas, reservaMovimentos, reservas } from "../../data/repo.ts";
import type { Reserva, TipoMovimentoReserva } from "../../data/types.ts";
import { useLive } from "../../data/useLive.ts";
import { moneyPrivacidade } from "../../lib/format.ts";
import { anoAtivo, empresaAtiva } from "../../state.ts";

export function MobileCaixinhas() {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  // Estado da movimentação (Guardar ou Resgatar)
  const [movimentoModal, setMovimentoModal] = useState<{
    reserva: Reserva;
    tipo: "aporte" | "resgate";
    valorStr: string;
    bancoId: string;
  } | null>(null);

  // Estado de criação de nova caixinha
  const [modalNovaCaixinha, setModalNovaCaixinha] = useState<boolean>(false);
  const [novoNome, setNovoNome] = useState<string>("");
  const [novaMetaStr, setNovaMetaStr] = useState<string>("");
  const [novoSaldoInicialStr, setNovoSaldoInicialStr] = useState<string>("");

  const dados = useLive(async () => {
    if (!empId) return null;
    const [emp, ano] = await Promise.all([empresas.get(empId), anos.find(empId, anoNum)]);
    if (!emp || !ano) return null;

    const [resList, movList, bancos] = await Promise.all([
      reservas.byEmpresa(empId),
      reservaMovimentos.byAno(ano.id),
      contasBancarias.byEmpresa(empId),
    ]);

    return { emp, ano, resList, movList, bancos };
  }, [empId, anoNum], null);

  const resList = dados?.resList || [];
  const movList = dados?.movList || [];
  const bancos = dados?.bancos || [];
  const ano = dados?.ano;

  const mesAtual = new Date().getMonth();
  const carteira = calcularCarteiraReservas(resList, movList, [], mesAtual);

  const salvarMovimento = async () => {
    if (!movimentoModal || !ano || !empId) return;
    const { reserva, tipo, valorStr, bancoId } = movimentoModal;
    const limpo = valorStr.replace(/\D/g, "");
    const centavos = limpo ? parseInt(limpo, 10) : 0;

    if (centavos <= 0) {
      toast.warn("Informe um valor maior que zero.");
      return;
    }

    const hoje = new Date();
    const dataStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

    await reservaMovimentos.create({
      reservaId: reserva.id,
      anoId: ano.id,
      empresaId: empId,
      mes: mesAtual,
      data: dataStr,
      tipo,
      valor: centavos,
      bancoId: bancoId || undefined,
      obs: tipo === "aporte" ? "Guardado via App Mobile" : "Resgatado via App Mobile",
    });

    toast.success(tipo === "aporte" ? `R$ ${(centavos / 100).toFixed(2)} guardados na caixinha!` : `Resgate de R$ ${(centavos / 100).toFixed(2)} realizado!`);
    setMovimentoModal(null);
  };

  const criarCaixinha = async () => {
    if (!empId || !ano) return;
    if (!novoNome.trim()) {
      toast.warn("Dê um nome para a sua caixinha.");
      return;
    }

    const metaCentavos = novaMetaStr ? Math.round(Number(novaMetaStr.replace(",", ".")) * 100) : undefined;
    const inicialCentavos = novoSaldoInicialStr ? Math.round(Number(novoSaldoInicialStr.replace(",", ".")) * 100) : 0;

    await reservas.create({
      empresaId: empId,
      nome: novoNome.trim(),
      metaCentavos,
      saldoInicialCentavos: inicialCentavos,
      cor: "emerald",
      ativa: true,
    });

    toast.success("Nova caixinha criada!");
    setModalNovaCaixinha(false);
    setNovoNome("");
    setNovaMetaStr("");
    setNovoSaldoInicialStr("");
  };

  return (
    <div style="display:flex;flex-direction:column;gap:14px;padding-bottom:70px;">
      {/* 1. Header Hero Patrimonial */}
      <div class="bank-hero-card">
        <div class="bank-hero-card__header">
          <span class="bank-hero-card__title">
            <Icon name="wallet" style="width:16px;height:16px;color:var(--primary);" />
            Total em Caixinhas
          </span>
          <span class="badge" style="background:var(--in-soft);color:var(--in);font-weight:700;">
            Patrimônio
          </span>
        </div>

        <div class="bank-hero-card__value">
          {moneyPrivacidade(carteira.totalPatrimonioReal)}
        </div>

        <div class="bank-hero-card__meta-row">
          <div class="bank-hero-card__meta-item">
            <span class="bank-hero-card__meta-label">Guardado no Ano</span>
            <span class="bank-hero-card__meta-val" style="color:var(--in);">
              +{moneyPrivacidade(carteira.totalAportadoAnoReal)}
            </span>
          </div>
          <div class="bank-hero-card__meta-item" style="text-align:right;">
            <span class="bank-hero-card__meta-label">Rendimentos</span>
            <span class="bank-hero-card__meta-val" style="color:var(--primary);">
              +{moneyPrivacidade(carteira.totalRendimentoAnoReal)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Lista de Caixinhas */}
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;">
        <h3 style="font-size:0.85rem;font-weight:800;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;margin:0;">
          Minhas Caixinhas ({resList.length})
        </h3>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          style="font-size:0.78rem;font-weight:700;color:var(--primary);"
          onClick={() => setModalNovaCaixinha(true)}
        >
          <Icon name="plus" /> Criar Caixinha
        </button>
      </div>

      {resList.length === 0 ? (
        <div class="card" style="text-align:center;padding:36px 16px;border-radius:20px;color:var(--text-muted);">
          <Icon name="wallet" style="width:36px;height:36px;margin:0 auto 10px;display:block;color:var(--primary);" />
          <h4 style="font-size:1rem;color:var(--text);margin:0 0 6px;">Nenhuma caixinha criada</h4>
          <p style="font-size:0.80rem;margin:0 0 16px;">
            Separe seu dinheiro para Reserva de Emergência, Metas ou Sonhos.
          </p>
          <button
            type="button"
            class="btn btn--primary"
            style="margin:0 auto;border-radius:14px;"
            onClick={() => setModalNovaCaixinha(true)}
          >
            <Icon name="plus" /> Criar Primeira Caixinha
          </button>
        </div>
      ) : (
        <div style="display:flex;flex-direction:column;gap:12px;">
          {carteira.reservas.map((item) => {
            const r = item.reserva;
            const saldo = item.saldoAtualReal;
            const meta = r.metaCentavos || 0;
            const pct = meta > 0 ? Math.min(100, Math.round((saldo / meta) * 100)) : 0;

            return (
              <div key={r.id} class="caixinha-card">
                <div class="caixinha-card__top">
                  <div class="caixinha-card__title">
                    <Icon name="wallet" style="width:18px;height:18px;color:var(--primary);" />
                    <span>{r.nome}</span>
                  </div>
                  {meta > 0 && (
                    <span class="caixinha-card__badge" style="background:var(--primary-soft);color:var(--primary);">
                      {pct}% da meta
                    </span>
                  )}
                </div>

                <div class="caixinha-card__val">
                  {moneyPrivacidade(saldo)}
                </div>

                {meta > 0 && (
                  <div class="caixinha-card__progress-wrap">
                    <div class="caixinha-card__progress-bar">
                      <div class="caixinha-card__progress-fill" style={`width:${pct}%;`} />
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--text-muted);">
                      <span>Atual: {moneyPrivacidade(saldo)}</span>
                      <span>Meta: {moneyPrivacidade(meta)}</span>
                    </div>
                  </div>
                )}

                <div class="caixinha-card__actions">
                  <button
                    type="button"
                    class="caixinha-card__btn caixinha-card__btn--primary"
                    onClick={() =>
                      setMovimentoModal({
                        reserva: r,
                        tipo: "aporte",
                        valorStr: "",
                        bancoId: bancos.length > 0 ? bancos[0].id : "",
                      })
                    }
                  >
                    <Icon name="plus" /> Guardar
                  </button>
                  <button
                    type="button"
                    class="caixinha-card__btn"
                    onClick={() =>
                      setMovimentoModal({
                        reserva: r,
                        tipo: "resgate",
                        valorStr: "",
                        bancoId: bancos.length > 0 ? bancos[0].id : "",
                      })
                    }
                  >
                    Resgatar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Sheet de Guardar / Resgatar */}
      {movimentoModal && (
        <div class="modal-backdrop" onClick={() => setMovimentoModal(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">
                {movimentoModal.tipo === "aporte" ? "Guardar Dinheiro" : "Resgatar Dinheiro"}
              </h3>
              <button
                type="button"
                class="btn btn--ghost btn--icon"
                onClick={() => setMovimentoModal(null)}
              >
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:16px;">
              <div style="font-size:0.86rem;color:var(--text);font-weight:600;">
                Caixinha: <strong>{movimentoModal.reserva.nome}</strong>
              </div>

              <div class="mobile-amount-box">
                <span class="mobile-amount-box__label">
                  {movimentoModal.tipo === "aporte" ? "Valor para Guardar" : "Valor para Resgatar"}
                </span>
                <div class="mobile-amount-box__input-row">
                  <span class="mobile-amount-box__currency">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    class="mobile-amount-box__input"
                    placeholder="0,00"
                    value={movimentoModal.valorStr}
                    onInput={(e) => {
                      const limpo = (e.currentTarget as HTMLInputElement).value.replace(/\D/g, "");
                      const cents = limpo ? parseInt(limpo, 10) : 0;
                      setMovimentoModal({
                        ...movimentoModal,
                        valorStr: (cents / 100).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }),
                      });
                    }}
                    autoFocus
                  />
                </div>
              </div>

              {bancos.length > 0 && (
                <div>
                  <label class="form-label" style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;display:block;">
                    {movimentoModal.tipo === "aporte" ? "Debitar de qual Banco?" : "Creditar em qual Banco?"}
                  </label>
                  <div class="mobile-pill-grid">
                    {bancos.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        class={`mobile-choice-chip ${movimentoModal.bancoId === b.id ? "is-selected" : ""}`}
                        onClick={() =>
                          setMovimentoModal({
                            ...movimentoModal,
                            bancoId: b.id,
                          })
                        }
                      >
                        <Icon name="bank" style="width:14px;height:14px;" />
                        <span>{b.nome}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:48px;border-radius:14px;font-weight:800;"
                onClick={salvarMovimento}
              >
                {movimentoModal.tipo === "aporte" ? "Confirmar Depósito" : "Confirmar Resgate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet de Criação de Nova Caixinha */}
      {modalNovaCaixinha && (
        <div class="modal-backdrop" onClick={() => setModalNovaCaixinha(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Nova Caixinha</h3>
              <button
                type="button"
                class="btn btn--ghost btn--icon"
                onClick={() => setModalNovaCaixinha(false)}
              >
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:14px;">
              <div>
                <label class="form-label" style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;display:block;">
                  Nome da Caixinha
                </label>
                <input
                  type="text"
                  class="input"
                  placeholder="Ex: Reserva de Emergência, Férias, Carro Novo..."
                  value={novoNome}
                  onInput={(e) => setNovoNome((e.currentTarget as HTMLInputElement).value)}
                  style="border-radius:14px;min-height:44px;"
                  autoFocus
                />
              </div>

              <div>
                <label class="form-label" style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;display:block;">
                  Meta Financeira R$ (Opcional)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  class="input"
                  placeholder="Ex: 10.000,00"
                  value={novaMetaStr}
                  onInput={(e) => setNovaMetaStr((e.currentTarget as HTMLInputElement).value)}
                  style="border-radius:14px;min-height:44px;"
                />
              </div>

              <div>
                <label class="form-label" style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;display:block;">
                  Saldo Inicial Já Guardado R$ (Opcional)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  class="input"
                  placeholder="Ex: 500,00"
                  value={novoSaldoInicialStr}
                  onInput={(e) => setNovoSaldoInicialStr((e.currentTarget as HTMLInputElement).value)}
                  style="border-radius:14px;min-height:44px;"
                />
              </div>
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:48px;border-radius:14px;font-weight:800;"
                onClick={criarCaixinha}
              >
                Criar Caixinha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
