import { useState } from "react";
import { Icon } from "../../components/Icon.tsx";
import { toast } from "../../components/Toast.tsx";
import { ModalMovimentoReserva } from "../../components/investimento/ModalMovimentoReserva.tsx";
import { ModalReserva } from "../../components/investimento/ModalReserva.tsx";
import { ModalProjecaoReserva } from "../../components/investimento/ModalProjecaoReserva.tsx";
import { calcularCarteiraReservas } from "../../data/calc.ts";
import { anos, contasBancarias, empresas, reservaMovimentos, reservaProjecoes, reservas } from "../../data/repo.ts";
import type { Reserva, ReservaMovimento, TipoMovimentoReserva } from "../../data/types.ts";
import { useLive } from "../../data/useLive.ts";
import { money, moneyPrivacidade, MONTHS, signedPrivacidade } from "../../lib/format.ts";
import { anoAtivo, empresaAtiva } from "../../state.ts";
import { useSignal } from "../../lib/signal.ts";

export function MobileCaixinhas() {
  const empId = useSignal(empresaAtiva);
  const anoNum = useSignal(anoAtivo);

  // Modais
  const [modalReservaEdicao, setModalReservaEdicao] = useState<Reserva | "nova" | null>(null);
  const [modalMovimento, setModalMovimento] = useState<{
    reservaId?: string;
    tipo?: TipoMovimentoReserva;
    movimento?: ReservaMovimento | null;
  } | null>(null);
  const [modalProjecao, setModalProjecao] = useState<Reserva | null>(null);

  // Aba interna: Minhas Caixinhas ou Extrato de Movimentações
  const [secaoAtiva, setSecaoAtiva] = useState<"caixinhas" | "extrato">("caixinhas");
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const dados = useLive(async () => {
    if (!empId) return null;
    const [emp, ano] = await Promise.all([empresas.get(empId), anos.find(empId, anoNum)]);
    if (!emp || !ano) return null;

    const [resList, movList, projList, bancos] = await Promise.all([
      reservas.byEmpresa(empId),
      reservaMovimentos.byAno(ano.id),
      reservaProjecoes.byAno(ano.id),
      contasBancarias.byEmpresa(empId),
    ]);

    return { emp, ano, resList, movList, projList, bancos };
  }, [empId, anoNum, refreshKey], null);

  const resList = dados?.resList || [];
  const movList = dados?.movList || [];
  const projList = dados?.projList || [];
  const bancos = dados?.bancos || [];
  const ano = dados?.ano;
  const emp = dados?.emp;

  const mesAtual = new Date().getMonth();
  const carteira = calcularCarteiraReservas(resList, movList, projList, mesAtual);
  const bancoMap = new Map(bancos.map((b) => [b.id, b.nome]));
  const resMap = new Map(resList.map((r) => [r.id, r]));

  if (!emp || !ano) {
    return (
      <div class="card empty" style="border-radius:18px;margin-bottom:70px;">
        <Icon name="wallet" />
        <h2 style="font-size:1rem;font-weight:800;">Carregando Caixinhas...</h2>
      </div>
    );
  }

  return (
    <div style="display:flex;flex-direction:column;gap:12px;padding-bottom:70px;">
      {/* 0. Switcher Superior de Contexto: Caixinhas vs Bolsa de Valores */}
      <div class="mobile-segmented" style="margin-bottom:2px;">
        <button
          type="button"
          class="mobile-segmented__btn is-active"
        >
          <Icon name="wallet" style="width:16px;height:16px;" />
          Caixinhas & Metas
        </button>
        <a
          href="#/investimentos"
          class="mobile-segmented__btn"
          style="text-decoration:none;"
        >
          <Icon name="chart" style="width:16px;height:16px;" />
          Bolsa & Ações
        </a>
      </div>

      {/* 1. Header Hero Patrimonial das Caixinhas */}
      <div class="bank-hero-card">
        <div class="bank-hero-card__header">
          <span class="bank-hero-card__title">
            <Icon name="wallet" style="width:16px;height:16px;color:var(--primary);" />
            Total em Caixinhas
          </span>
          <span class="badge" style="background:var(--in-soft);color:var(--in);font-weight:700;font-size:0.70rem;">
            {resList.length} caixinhas
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

        {/* Ações Rápidas no Hero: Nova Caixinha e Movimentar */}
        <div style="display:flex;gap:6px;margin-top:10px;">
          <button
            type="button"
            class="btn btn--primary btn--sm"
            style="flex:1;min-height:38px;border-radius:12px;font-size:0.80rem;font-weight:700;"
            onClick={() => setModalReservaEdicao("nova")}
          >
            <Icon name="plus" /> Nova Caixinha
          </button>
          <button
            type="button"
            class="btn btn--secondary btn--sm"
            style="flex:1;min-height:38px;border-radius:12px;font-size:0.80rem;font-weight:700;"
            onClick={() => setModalMovimento({ tipo: "aporte" })}
          >
            <Icon name="wallet" /> Guardar Dinheiro
          </button>
        </div>
      </div>

      {/* 2. Switcher de Visualização: Caixinhas vs Extrato de Movimentações */}
      <div class="mobile-segmented" style="margin-bottom:2px;">
        <button
          type="button"
          class={`mobile-segmented__btn ${secaoAtiva === "caixinhas" ? "is-active" : ""}`}
          onClick={() => setSecaoAtiva("caixinhas")}
        >
          <Icon name="grid" style="width:14px;height:14px;" />
          Minhas Caixinhas ({resList.length})
        </button>
        <button
          type="button"
          class={`mobile-segmented__btn ${secaoAtiva === "extrato" ? "is-active" : ""}`}
          onClick={() => setSecaoAtiva("extrato")}
        >
          <Icon name="list" style="width:14px;height:14px;" />
          Histórico ({movList.length})
        </button>
      </div>

      {/* 3. CONTEÚDO: MINHAS CAIXINHAS */}
      {secaoAtiva === "caixinhas" && (
        <>
          {resList.length === 0 ? (
            <div class="card empty" style="border-radius:18px;padding:32px 16px;">
              <Icon name="wallet" style="width:36px;height:36px;color:var(--text-muted);margin:0 auto 10px;display:block;" />
              <h3 style="font-size:1rem;font-weight:800;margin:0 0 4px;color:var(--text);">Nenhuma Caixinha</h3>
              <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 16px;">
                Crie metas como Reserva de Emergência, Viagem ou Carro Novo.
              </p>
              <button
                type="button"
                class="btn btn--primary btn--sm"
                onClick={() => setModalReservaEdicao("nova")}
              >
                <Icon name="plus" /> Criar Primeira Caixinha
              </button>
            </div>
          ) : (
            <div style="display:flex;flex-direction:column;gap:10px;">
              {resList.map((r) => {
                const info = carteira.detalhesPorReserva.find((item) => item.reserva.id === r.id);
                const saldoAtual = info?.saldoAtualReal ?? (r.saldoInicialCentavos || 0);
                const meta = r.metaCentavos || 0;
                const pct = meta > 0 ? Math.min(100, Math.round((saldoAtual / meta) * 100)) : 0;

                return (
                  <div key={r.id} class="caixinha-card" style="border-radius:16px;">
                    {/* Topo do Card: Nome, Meta e Menu de Edição */}
                    <div class="caixinha-card__top">
                      <div class="caixinha-card__title" style="flex:1;min-width:0;">
                        <i class="dot" style={`background:var(--${r.cor || "emerald"});width:10px;height:10px;`} />
                        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{r.nome}</span>
                      </div>
                      <div style="display:flex;align-items:center;gap:6px;">
                        {meta > 0 && (
                          <span class="caixinha-card__badge" style="background:var(--primary-soft);color:var(--primary);">
                            {pct}% da meta
                          </span>
                        )}
                        <button
                          type="button"
                          class="btn btn--ghost btn--icon btn--sm"
                          style="width:28px;height:28px;padding:0;"
                          onClick={() => setModalReservaEdicao(r)}
                          title="Editar Caixinha"
                        >
                          <Icon name="pencil" style="width:14px;height:14px;" />
                        </button>
                      </div>
                    </div>

                    {/* Valor Atual do Saldo */}
                    <div class="caixinha-card__val">
                      {moneyPrivacidade(saldoAtual)}
                    </div>

                    {/* Barra de Progresso da Meta */}
                    {meta > 0 && (
                      <div class="caixinha-card__progress-wrap">
                        <div class="caixinha-card__progress-bar">
                          <div class="caixinha-card__progress-fill" style={`width:${pct}%;`} />
                        </div>
                        <div class="caixinha-card__progress-labels">
                          <span>{moneyPrivacidade(saldoAtual)}</span>
                          <span>Meta: {money(meta)}</span>
                        </div>
                      </div>
                    )}

                    {/* Botões de Ação da Caixinha: Guardar, Resgatar, Rendimento e Simular */}
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px;">
                      <button
                        type="button"
                        class="caixinha-card__btn"
                        onClick={() => setModalMovimento({ reservaId: r.id, tipo: "aporte" })}
                      >
                        <Icon name="arrowDown" style="width:14px;height:14px;color:var(--in);" />
                        Guardar
                      </button>

                      <button
                        type="button"
                        class="caixinha-card__btn"
                        onClick={() => setModalMovimento({ reservaId: r.id, tipo: "resgate" })}
                      >
                        <Icon name="arrowUp" style="width:14px;height:14px;color:var(--out);" />
                        Resgatar
                      </button>

                      <button
                        type="button"
                        class="caixinha-card__btn"
                        onClick={() => setModalMovimento({ reservaId: r.id, tipo: "rendimento" })}
                      >
                        <Icon name="sparkles" style="width:14px;height:14px;color:var(--primary);" />
                        Rendimento
                      </button>

                      <button
                        type="button"
                        class="caixinha-card__btn"
                        onClick={() => setModalProjecao(r)}
                        title="Simular Juros Compostos / Projeção"
                      >
                        <Icon name="chart" style="width:14px;height:14px;color:var(--primary);" />
                        Simulador
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 4. CONTEÚDO: HISTÓRICO DE MOVIMENTAÇÕES */}
      {secaoAtiva === "extrato" && (
        <div style="display:flex;flex-direction:column;gap:8px;">
          {movList.length === 0 ? (
            <div class="card empty" style="border-radius:16px;padding:24px;">
              <Icon name="list" />
              <p style="font-size:0.80rem;color:var(--text-muted);margin:0;">Nenhuma movimentação registrada nas caixinhas.</p>
            </div>
          ) : (
            [...movList]
              .sort((a, b) => b.data.localeCompare(a.data))
              .map((m) => {
                const res = resMap.get(m.reservaId);
                const isEntrada = m.tipo === "aporte" || m.tipo === "rendimento";
                const banco = m.bancoId ? bancoMap.get(m.bancoId) : null;
                const tipoLabel =
                  m.tipo === "aporte"
                    ? "Aporte"
                    : m.tipo === "resgate"
                    ? "Resgate"
                    : m.tipo === "rendimento"
                    ? "Rendimento"
                    : "Transferência";

                return (
                  <div
                    key={m.id}
                    class="card"
                    style={{
                      borderRadius: "14px",
                      padding: "10px 12px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      cursor: "pointer",
                    }}
                    onClick={() => setModalMovimento({ movimento: m, reservaId: m.reservaId, tipo: m.tipo })}
                  >
                    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                      <div
                        class="mobile-tx-card__icon"
                        style={{
                          background: isEntrada ? "var(--in-soft)" : "var(--out-soft)",
                          color: isEntrada ? "var(--in)" : "var(--out)",
                          width: "32px",
                          height: "32px",
                          flexShrink: 0,
                        }}
                      >
                        <Icon name={isEntrada ? "arrowDown" : "arrowUp"} style="width:16px;height:16px;" />
                      </div>

                      <div style="flex:1;min-width:0;">
                        <div style="font-size:0.82rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                          {res?.nome || "Caixinha"} • {tipoLabel}
                        </div>
                        <div style="font-size:0.68rem;color:var(--text-muted);">
                          {m.data.split("-").reverse().join("/")} {banco ? `• ${banco}` : ""} {m.obs ? `• ${m.obs}` : ""}
                        </div>
                      </div>
                    </div>

                    <div style="text-align:right;flex-shrink:0;">
                      <div
                        style={{
                          fontSize: "0.88rem",
                          fontWeight: "800",
                          color: isEntrada ? "var(--in)" : "var(--out)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {signedPrivacidade(isEntrada ? m.valor : -m.valor)}
                      </div>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* =========================================================================
          MODAIS INTEGRADOS (NATIVOS DO SISTEMA)
          ========================================================================= */}

      {/* Modal de Movimentação Completa (Aporte, Resgate, Rendimento, Transferência) */}
      {modalMovimento && (
        <ModalMovimentoReserva
          isOpen={true}
          reservas={resList}
          contasBancarias={bancos}
          empresaId={emp.id}
          anoId={ano.id}
          anoNum={anoNum}
          initialReservaId={modalMovimento.reservaId}
          initialTipo={modalMovimento.tipo}
          movimento={modalMovimento.movimento}
          onClose={() => setModalMovimento(null)}
          onSuccess={() => {
            setModalMovimento(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {/* Modal de Criação e Edição de Caixinha */}
      {modalReservaEdicao && (
        <ModalReserva
          isOpen={true}
          reserva={modalReservaEdicao === "nova" ? null : modalReservaEdicao}
          empresaId={emp.id}
          onClose={() => setModalReservaEdicao(null)}
          onSave={async (dados) => {
            if (modalReservaEdicao && modalReservaEdicao !== "nova") {
              await reservas.update(modalReservaEdicao.id, dados);
              toast.success("Caixinha atualizada!");
            } else {
              await reservas.create({ empresaId: emp.id, ...dados });
              toast.success("Caixinha criada!");
            }
            setModalReservaEdicao(null);
            setRefreshKey((k) => k + 1);
          }}
          onDelete={async (id) => {
            await reservas.remove(id);
            toast.success("Caixinha excluída!");
            setModalReservaEdicao(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {/* Modal de Projeção e Simulação de Juros Compostos */}
      {modalProjecao && (
        <ModalProjecaoReserva
          isOpen={true}
          reserva={modalProjecao}
          empresaId={emp.id}
          anoId={ano.id}
          projecoes={projList}
          onClose={() => setModalProjecao(null)}
          onSuccess={() => {
            setModalProjecao(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
