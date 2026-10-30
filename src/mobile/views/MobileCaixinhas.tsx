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

  // 3 Abas: Minhas Caixinhas, Histórico ou Evolução Anual 12M
  const [secaoAtiva, setSecaoAtiva] = useState<"caixinhas" | "extrato" | "evolucao">("caixinhas");
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Filtros do Histórico
  const [filtroReservaHist, setFiltroReservaHist] = useState<string>("todas");
  const [filtroTipoHist, setFiltroTipoHist] = useState<string>("todos");
  const [filtroMesHist, setFiltroMesHist] = useState<number | "todos">("todos");

  // Filtro da Evolução
  const [filtroReservaEvolucao, setFiltroReservaEvolucao] = useState<string>("todas");

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

  // Filtragem do Histórico
  const movsFiltradas = movList.filter((m) => {
    if (filtroReservaHist !== "todas" && m.reservaId !== filtroReservaHist) return false;
    if (filtroTipoHist !== "todos" && m.tipo !== filtroTipoHist) return false;
    if (filtroMesHist !== "todos" && m.mes !== filtroMesHist) return false;
    return true;
  });

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

        {/* Ações Rápidas no Hero: Nova Caixinha e Guardar */}
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

      {/* 2. Switcher de 3 Abas: Caixinhas vs Histórico vs Evolução 12M */}
      <div class="mobile-segmented" style="margin-bottom:2px;">
        <button
          type="button"
          class={`mobile-segmented__btn ${secaoAtiva === "caixinhas" ? "is-active" : ""}`}
          onClick={() => setSecaoAtiva("caixinhas")}
        >
          <Icon name="grid" style="width:14px;height:14px;" />
          Caixinhas ({resList.length})
        </button>
        <button
          type="button"
          class={`mobile-segmented__btn ${secaoAtiva === "extrato" ? "is-active" : ""}`}
          onClick={() => setSecaoAtiva("extrato")}
        >
          <Icon name="list" style="width:14px;height:14px;" />
          Histórico ({movList.length})
        </button>
        <button
          type="button"
          class={`mobile-segmented__btn ${secaoAtiva === "evolucao" ? "is-active" : ""}`}
          onClick={() => setSecaoAtiva("evolucao")}
        >
          <Icon name="chart" style="width:14px;height:14px;" />
          Evolução 12M
        </button>
      </div>

      {/* =========================================================================
          3. CONTEÚDO: MINHAS CAIXINHAS
          ========================================================================= */}
      {secaoAtiva === "caixinhas" && (
        <>
          {resList.length === 0 ? (
            <div class="card empty" style="border-radius:18px;padding:32px 16px;">
              <Icon name="wallet" style="width:36px;height:36px;color:var(--text-muted);margin:0 auto 10px;display:block;" />
              <h3 style="font-size:1rem;font-weight:800;margin:0 0 4px;color:var(--text);">Nenhuma Caixinha</h3>
              <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 16px;">
                Crie metas como Reserva de Emergência, Viagem ou Provisão de 13º.
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

                    {/* 4 Ações Rápidas: Guardar, Resgatar, Rendimento e Simular */}
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

      {/* =========================================================================
          4. CONTEÚDO: HISTÓRICO COM FILTROS (CAIXINHA / TIPO / MÊS)
          ========================================================================= */}
      {secaoAtiva === "extrato" && (
        <div style="display:flex;flex-direction:column;gap:8px;">
          {/* Filtros em Chips */}
          <div class="hscroll" style="gap:4px;padding-bottom:2px;">
            <button
              type="button"
              class={`chip chip--sm ${filtroReservaHist === "todas" ? "is-active" : ""}`}
              onClick={() => setFiltroReservaHist("todas")}
            >
              Todas as Caixinhas
            </button>
            {resList.map((r) => (
              <button
                key={r.id}
                type="button"
                class={`chip chip--sm ${filtroReservaHist === r.id ? "is-active" : ""}`}
                onClick={() => setFiltroReservaHist(r.id)}
              >
                {r.nome}
              </button>
            ))}
          </div>

          <div class="hscroll" style="gap:4px;padding-bottom:2px;">
            <button
              type="button"
              class={`chip chip--sm ${filtroTipoHist === "todos" ? "is-active" : ""}`}
              onClick={() => setFiltroTipoHist("todos")}
            >
              Todos os Tipos
            </button>
            <button
              type="button"
              class={`chip chip--sm ${filtroTipoHist === "aporte" ? "is-active" : ""}`}
              onClick={() => setFiltroTipoHist("aporte")}
            >
              Aportes (+)
            </button>
            <button
              type="button"
              class={`chip chip--sm ${filtroTipoHist === "resgate" ? "is-active" : ""}`}
              onClick={() => setFiltroTipoHist("resgate")}
            >
              Resgates (−)
            </button>
            <button
              type="button"
              class={`chip chip--sm ${filtroTipoHist === "rendimento" ? "is-active" : ""}`}
              onClick={() => setFiltroTipoHist("rendimento")}
            >
              Rendimentos
            </button>
            <button
              type="button"
              class={`chip chip--sm ${filtroTipoHist === "transferencia" ? "is-active" : ""}`}
              onClick={() => setFiltroTipoHist("transferencia")}
            >
              Transferências
            </button>
          </div>

          {movsFiltradas.length === 0 ? (
            <div class="card empty" style="border-radius:16px;padding:24px;">
              <Icon name="list" />
              <p style="font-size:0.80rem;color:var(--text-muted);margin:0;">Nenhuma movimentação para os filtros selecionados.</p>
            </div>
          ) : (
            [...movsFiltradas]
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
          5. CONTEÚDO: EVOLUÇÃO MENSAL 12 MESES (PROJ × REAL)
          ========================================================================= */}
      {secaoAtiva === "evolucao" && (() => {
        const reservasAlvo =
          filtroReservaEvolucao === "todas"
            ? carteira.reservas
            : carteira.reservas.filter((r) => r.reserva.id === filtroReservaEvolucao);

        const totAportesReal = reservasAlvo.reduce((s, r) => s + r.totalAportesReal, 0);
        const totAportesProj = reservasAlvo.reduce((s, r) => s + r.totalAportesProj, 0);
        const totResgReal = reservasAlvo.reduce((s, r) => s + r.totalResgatesReal, 0);
        const totRendReal = reservasAlvo.reduce((s, r) => s + r.totalRendimentosReal, 0);
        const saldoFinalReal = reservasAlvo.reduce((s, r) => s + (r.evolucaoMensalReal[11] || 0), 0);
        const saldoFinalProj = reservasAlvo.reduce((s, r) => s + (r.saldoFinalProj || 0), 0);

        return (
          <div style="display:flex;flex-direction:column;gap:10px;">
            {/* Seletor da Reserva Alvo */}
            <div class="hscroll" style="gap:4px;padding-bottom:2px;">
              <button
                type="button"
                class={`chip chip--sm ${filtroReservaEvolucao === "todas" ? "is-active" : ""}`}
                onClick={() => setFiltroReservaEvolucao("todas")}
              >
                Todas as Caixinhas
              </button>
              {resList.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  class={`chip chip--sm ${filtroReservaEvolucao === r.id ? "is-active" : ""}`}
                  onClick={() => setFiltroReservaEvolucao(r.id)}
                >
                  {r.nome}
                </button>
              ))}
            </div>

            {/* Card Hero de Totais Anuais */}
            <div
              class="card"
              style="padding:12px 14px;border-radius:14px;background:var(--surface);border:1px solid var(--border);"
            >
              <div style="font-size:0.75rem;font-weight:700;color:var(--text);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em;">
                Totais Anuais da Carteira ({anoNum})
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.72rem;">
                <div style="background:var(--surface-soft);padding:8px 10px;border-radius:10px;">
                  <span style="color:var(--text-muted);font-size:0.68rem;">Aportes Totais:</span>
                  <div style="font-weight:800;color:var(--in);margin-top:2px;">
                    +{moneyPrivacidade(totAportesReal)}
                    <span style="color:var(--text-muted);font-weight:normal;font-size:0.65rem;"> / {moneyPrivacidade(totAportesProj)}</span>
                  </div>
                </div>
                <div style="background:var(--surface-soft);padding:8px 10px;border-radius:10px;">
                  <span style="color:var(--text-muted);font-size:0.68rem;">Rendimentos Totais:</span>
                  <div style="font-weight:800;color:var(--primary);margin-top:2px;">
                    +{moneyPrivacidade(totRendReal)}
                  </div>
                </div>
                <div style="background:var(--surface-soft);padding:8px 10px;border-radius:10px;">
                  <span style="color:var(--text-muted);font-size:0.68rem;">Resgates Totais:</span>
                  <div style="font-weight:800;color:var(--out);margin-top:2px;">
                    -{moneyPrivacidade(totResgReal)}
                  </div>
                </div>
                <div style="background:var(--surface-soft);padding:8px 10px;border-radius:10px;">
                  <span style="color:var(--text-muted);font-size:0.68rem;">Saldo Final Previsto:</span>
                  <div style="font-weight:800;color:var(--text);margin-top:2px;">
                    {moneyPrivacidade(saldoFinalReal)}
                    <span style="color:var(--text-muted);font-weight:normal;font-size:0.65rem;"> / {moneyPrivacidade(saldoFinalProj)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Evolução Mês a Mês (Jan a Dez) */}
            <div style="display:flex;flex-direction:column;gap:6px;">
              {MONTHS.map((mNome, mIdx) => {
                const isAtual = mIdx === mesAtual;

                let apReal = 0;
                let apProj = 0;
                let resgReal = 0;
                let rendReal = 0;
                let saldoReal = 0;
                let saldoProj = 0;

                for (const r of reservasAlvo) {
                  saldoReal += r.evolucaoMensalReal[mIdx] || 0;
                  saldoProj += r.evolucaoMensalProj[mIdx] || 0;

                  const movs = movList.filter((m) => m.reservaId === r.reserva.id && m.mes === mIdx);
                  for (const m of movs) {
                    if (m.tipo === "aporte") apReal += m.valor;
                    else if (m.tipo === "resgate") resgReal += m.valor;
                    else if (m.tipo === "rendimento") rendReal += m.valor;
                  }

                  const p = projList.find((item) => item.reservaId === r.reserva.id && item.mes === mIdx);
                  if (p) {
                    apProj += p.valorAporte;
                  }
                }

                return (
                  <div
                    key={mIdx}
                    class="card"
                    style={{
                      borderRadius: "12px",
                      padding: "10px 12px",
                      background: isAtual ? "color-mix(in srgb, var(--primary) 4%, var(--surface))" : "var(--surface)",
                      border: isAtual ? "1px solid var(--primary)" : "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                      <div style="display:flex;align-items:center;gap:6px;">
                        <strong style="font-size:0.84rem;color:var(--text);">{mNome}</strong>
                        {isAtual && (
                          <span class="badge badge--in" style="font-size:0.65rem;padding:1px 5px;">
                            Mês Atual
                          </span>
                        )}
                      </div>
                      <div style="text-align:right;">
                        <span style="font-size:0.70rem;color:var(--text-muted);">Saldo Acumulado: </span>
                        <strong style="font-size:0.86rem;color:var(--primary);font-variant-numeric:tabular-nums;">
                          {moneyPrivacidade(saldoReal)}
                        </strong>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "0.70rem",
                        paddingTop: "4px",
                        borderTop: "1px dashed var(--border-soft)",
                      }}
                    >
                      <span style="color:var(--in);">
                        Aporte: +{moneyPrivacidade(apReal)}
                        {apProj > 0 && <span style="color:var(--text-muted);font-size:0.65rem;"> (meta {moneyPrivacidade(apProj)})</span>}
                      </span>
                      {resgReal > 0 && (
                        <span style="color:var(--out);">
                          Resgate: -{moneyPrivacidade(resgReal)}
                        </span>
                      )}
                      {rendReal > 0 && (
                        <span style="color:var(--primary);">
                          Rend: +{moneyPrivacidade(rendReal)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
