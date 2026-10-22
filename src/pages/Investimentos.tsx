import { useState } from "preact/hooks";
import { Icon } from "../components/Icon.tsx";
import { ModalReserva } from "../components/investimento/ModalReserva.tsx";
import { ModalMovimentoReserva } from "../components/investimento/ModalMovimentoReserva.tsx";
import { ModalProjecaoReserva } from "../components/investimento/ModalProjecaoReserva.tsx";
import { toast } from "../components/Toast.tsx";
import { calcularCarteiraReservas } from "../data/calc.ts";
import { anos, contas, empresas, reservaMovimentos, reservaProjecoes, reservas } from "../data/repo.ts";
import type { Reserva, ReservaMovimento, TipoMovimentoReserva } from "../data/types.ts";
import { useLive } from "../data/useLive.ts";
import { money, MONTHS } from "../lib/format.ts";
import { anoAtivo, empresaAtiva } from "../state.ts";

const CORES_PALETA_MAP: Record<string, string> = {
  emerald: "#10b981",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  rose: "#f43f5e",
  cyan: "#06b6d4",
};

export function Investimentos() {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  // Modais
  const [modalReservaAberta, setModalReservaAberta] = useState<Reserva | "nova" | null>(null);
  const [modalMovimento, setModalMovimento] = useState<{
    reservaId?: string;
    tipo?: TipoMovimentoReserva;
    movimento?: ReservaMovimento | null;
  } | null>(null);
  const [modalProjecaoReserva, setModalProjecaoReserva] = useState<Reserva | null>(null);

  // Filtros e Visualização
  const [abaInferior, setAbaInferior] = useState<"extrato" | "evolucao">("extrato");
  const [filtroReservaId, setFiltroReservaId] = useState<string>("todas");
  const [filtroMes, setFiltroMes] = useState<number | "todos">("todos");

  const dados = useLive(async () => {
    if (!empId) return null;
    const [emp, ano] = await Promise.all([empresas.get(empId), anos.find(empId, anoNum)]);
    if (!emp || !ano) return { emp, ano: undefined } as const;

    const [resList, movList, projList, contList] = await Promise.all([
      reservas.byEmpresa(empId),
      reservaMovimentos.byAno(ano.id),
      reservaProjecoes.byAno(ano.id),
      contas.byEmpresa(empId),
    ]);

    return { emp, ano, resList, movList, projList, contList } as const;
  }, [empId, anoNum], undefined);

  if (dados === undefined) return null; // Carregando
  if (!dados || !dados.emp) {
    return (
      <section class="card empty">
        <Icon name="building" />
        <h2>Selecione uma empresa</h2>
        <p>Acesse o menu superior para escolher ou cadastrar uma empresa.</p>
      </section>
    );
  }
  if (!dados.ano) {
    return (
      <section class="card empty">
        <Icon name="calendar" />
        <h2>Nenhum ano aberto para {anoNum}</h2>
        <p>Abra o ano financeiro em Ajustes para gerenciar suas reservas.</p>
      </section>
    );
  }

  const { ano, resList, movList, projList, contList } = dados;

  // Mês de referência para saldo atual da carteira
  const hoje = new Date();
  const mesAtual = ano.ano < hoje.getFullYear() ? 11 : ano.ano > hoje.getFullYear() ? 0 : hoje.getMonth();

  // Cálculo consolidado da carteira
  const carteira = calcularCarteiraReservas(resList, movList, projList, mesAtual);

  // Mapa de contas operacionais por ID
  const contaMap = new Map(contList.map((c) => [c.id, c.nome]));
  const reservaMap = new Map(resList.map((r) => [r.id, r]));

  // Extrato filtrado
  const extratoFiltrado = movList.filter((m) => {
    if (filtroReservaId !== "todas" && m.reservaId !== filtroReservaId) return false;
    if (filtroMes !== "todos" && m.mes !== filtroMes) return false;
    return true;
  });

  return (
    <>
      {/* Cabeçalho da Página */}
      <div class="page-head">
        <div>
          <h1>Investimentos & Reservas</h1>
          <p>Gestão patrimonial e caixinhas estratégicas — Exercício {ano.ano}</p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          {resList.length > 0 && (
            <button
              type="button"
              class="btn"
              onClick={() => setModalMovimento({ tipo: "aporte" })}
            >
              <Icon name="plus" /> Nova Movimentação
            </button>
          )}
          <button
            type="button"
            class="btn btn--primary"
            onClick={() => setModalReservaAberta("nova")}
          >
            <Icon name="wallet" /> Nova Reserva
          </button>
        </div>
      </div>

      <div class="stack" style="gap: var(--sp-4);">
        {/* Cockpit Patrimonial (2x2 Mobile, 4 Colunas Desktop) */}
        <section class="grid grid--stats">
          <div class="stat">
            <span class="stat__label">
              <span class="dot" style="background: var(--primary);" />
              Patrimônio em Reservas
            </span>
            <div class="stat__value" style="color: var(--primary);">
              {money(carteira.totalPatrimonioReal)}
            </div>
            <div class="stat__sub">
              Projetado fim do ano: {money(carteira.totalPatrimonioProj)}
            </div>
          </div>

          <div class="stat">
            <span class="stat__label">
              <span class="dot" style="background: var(--in);" />
              Guardado / Aplicado no Ano
            </span>
            <div class="stat__value" style="color: var(--in);">
              {money(carteira.totalAportadoAnoReal)}
            </div>
            <div class="stat__sub">
              Meta anual prevista: {money(carteira.totalAportadoAnoProj)}
            </div>
          </div>

          <div class="stat">
            <span class="stat__label">
              <span class="dot" style="background: var(--aporte);" />
              Resgatado no Ano
            </span>
            <div class="stat__value" style="color: var(--aporte);">
              {money(carteira.totalResgatadoAnoReal)}
            </div>
            <div class="stat__sub">
              Previsto resgatar: {money(carteira.totalResgatadoAnoProj)}
            </div>
          </div>

          <div class="stat">
            <span class="stat__label">
              <span class="dot" style="background: #8b5cf6;" />
              Rendimento Acumulado
            </span>
            <div class="stat__value" style="color: #8b5cf6;">
              {money(carteira.totalRendimentoAnoReal)}
            </div>
            <div class="stat__sub">
              Rendimento estimado: {money(carteira.totalRendimentoAnoProj)}
            </div>
          </div>
        </section>

        {/* Estado Vazio: Nenhuma Reserva Cadastrada */}
        {resList.length === 0 && (
          <section class="card empty" style="padding: var(--sp-6) var(--sp-4);">
            <div
              style="width: 56px; height: 56px; border-radius: 16px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; margin: 0 auto var(--sp-3);"
            >
              <Icon name="wallet" style="width: 28px; height: 28px;" />
            </div>
            <h2>Crie sua primeira Caixinha ou Reserva</h2>
            <p style="max-width: 520px; margin: 0 auto 16px; color: var(--text-muted); font-size: var(--fs-sm);">
              Separe recursos para <strong>Reserva de Emergência</strong>, <strong>Provisão de 13º/Férias</strong>, ou{" "}
              <strong>Expansão</strong> sem misturar com suas despesas e receitas do dia a dia.
            </p>
            <button
              type="button"
              class="btn btn--primary"
              onClick={() => setModalReservaAberta("nova")}
            >
              <Icon name="plus" /> Criar Primeira Reserva
            </button>
          </section>
        )}

        {/* Grade de Cards de Reservas */}
        {resList.length > 0 && (
          <div>
            <div class="card__head" style="margin-bottom: var(--sp-3);">
              <span class="card__title" style="display:flex; align-items:center; gap:8px;">
                <Icon name="grid" /> Reservas & Caixinhas ({resList.length})
              </span>
            </div>

            <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--sp-3);">
              {carteira.reservas.map((resumo) => {
                const r = resumo.reserva;
                const corHex = CORES_PALETA_MAP[r.cor || "emerald"] || CORES_PALETA_MAP.emerald;
                const meta = r.metaCentavos || 0;
                const progresso = resumo.progressoMetaPct !== undefined ? resumo.progressoMetaPct : null;

                return (
                  <div
                    key={r.id}
                    class="card"
                    style={`border-top: 4px solid ${corHex}; display: flex; flex-direction: column; justify-content: space-between;`}
                  >
                    <div>
                      {/* Topo do Card */}
                      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
                        <div>
                          <div style="display:flex; align-items:center; gap:6px;">
                            <span
                              style={`width: 10px; height: 10px; border-radius: 50%; background: ${corHex}; flex-shrink: 0;`}
                            />
                            <h3 style="font-size: var(--fs-md); font-weight: 700; margin: 0; color: var(--text);">
                              {r.nome}
                            </h3>
                          </div>
                          {r.descricao && (
                            <p style="font-size: var(--fs-xs); color: var(--text-faint); margin-top: 2px;">
                              {r.descricao}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          class="btn btn--ghost btn--icon"
                          style="height: 32px; width: 32px;"
                          title="Editar Reserva"
                          onClick={() => setModalReservaAberta(r)}
                        >
                          <Icon name="pencil" style="width: 16px; height: 16px;" />
                        </button>
                      </div>

                      {/* Saldo da Reserva */}
                      <div style="margin-top: var(--sp-3); margin-bottom: var(--sp-3);">
                        <span style="font-size: var(--fs-xs); color: var(--text-muted); font-weight: 500;">
                          Saldo Acumulado Atual
                        </span>
                        <div style="font-size: var(--fs-xl); font-weight: 800; color: var(--text); margin-top: 2px;">
                          {money(resumo.saldoAtualReal)}
                        </div>
                      </div>

                      {/* Progresso da Meta (Opcional) */}
                      {meta > 0 ? (
                        <div style="background: var(--surface-soft); padding: 8px 12px; border-radius: var(--r-md); margin-bottom: var(--sp-3);">
                          <div style="display: flex; justify-content: space-between; font-size: var(--fs-xs); font-weight: 600; margin-bottom: 4px;">
                            <span style="color: var(--text-muted);">
                              Meta: {money(meta)}
                            </span>
                            <span style={`color: ${progresso! >= 100 ? "var(--in)" : "var(--primary)"};`}>
                              {progresso}%
                            </span>
                          </div>
                          <div class="progress">
                            <i
                              style={`width: ${Math.min(100, Math.max(0, progresso!))}%; background: ${
                                progresso! >= 100 ? "var(--in)" : corHex
                              };`}
                            />
                          </div>
                        </div>
                      ) : (
                        <div style="font-size: var(--fs-xs); color: var(--text-faint); margin-bottom: var(--sp-3); font-style: italic;">
                          Sem meta financeira definida (livre)
                        </div>
                      )}
                    </div>

                    {/* Ações Rápidas no Card */}
                    <div style="display: flex; flex-direction: column; gap: 6px; padding-top: var(--sp-2); border-top: 1px solid var(--border);">
                      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                        <button
                          type="button"
                          class="btn"
                          style="background: var(--in-soft); color: var(--in); border-color: transparent; font-size: var(--fs-xs); min-height: 36px;"
                          onClick={() => setModalMovimento({ reservaId: r.id, tipo: "aporte" })}
                        >
                          <Icon name="arrowDown" /> Aplicar
                        </button>
                        <button
                          type="button"
                          class="btn"
                          style="background: var(--aporte-soft); color: var(--aporte); border-color: transparent; font-size: var(--fs-xs); min-height: 36px;"
                          onClick={() => setModalMovimento({ reservaId: r.id, tipo: "resgate" })}
                        >
                          <Icon name="arrowUp" /> Resgatar
                        </button>
                      </div>

                      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                        <button
                          type="button"
                          class="btn btn--ghost"
                          style="font-size: var(--fs-xs); min-height: 34px; border: 1px solid var(--border);"
                          onClick={() => setModalMovimento({ reservaId: r.id, tipo: "rendimento" })}
                        >
                          <Icon name="sparkle" /> Rendimento
                        </button>
                        <button
                          type="button"
                          class="btn btn--ghost"
                          style="font-size: var(--fs-xs); min-height: 34px; border: 1px solid var(--border);"
                          onClick={() => setModalProjecaoReserva(r)}
                        >
                          <Icon name="calendar" /> Projetar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bloco Inferior: Abas de Extrato e Evolução Mensal */}
        {resList.length > 0 && (
          <section class="card" style="margin-top: var(--sp-2);">
            {/* Header com Alternância de Abas e Filtros */}
            <div
              style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: var(--sp-3); border-bottom: 1px solid var(--border); padding-bottom: var(--sp-3);"
            >
              <div style="display: flex; gap: 6px;">
                <button
                  type="button"
                  class={`chip ${abaInferior === "extrato" ? "is-active" : ""}`}
                  onClick={() => setAbaInferior("extrato")}
                >
                  <Icon name="list" /> Extrato de Movimentações
                </button>
                <button
                  type="button"
                  class={`chip ${abaInferior === "evolucao" ? "is-active" : ""}`}
                  onClick={() => setAbaInferior("evolucao")}
                >
                  <Icon name="chart" /> Evolução Mensal (Proj × Real)
                </button>
              </div>

              {/* Filtro por Reserva */}
              <div style="display: flex; align-items: center; gap: 8px;">
                <select
                  class="input"
                  style="font-size: var(--fs-xs); height: 34px; padding: 0 8px;"
                  value={filtroReservaId}
                  onChange={(e) => setFiltroReservaId((e.target as HTMLSelectElement).value)}
                >
                  <option value="todas">Todas as Reservas</option>
                  {resList.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>

                {abaInferior === "extrato" && (
                  <select
                    class="input"
                    style="font-size: var(--fs-xs); height: 34px; padding: 0 8px;"
                    value={filtroMes}
                    onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      setFiltroMes(v === "todos" ? "todos" : parseInt(v, 10));
                    }}
                  >
                    <option value="todos">Todos os Meses</option>
                    {MONTHS.map((mNome, mIdx) => (
                      <option key={mIdx} value={mIdx}>
                        {mNome}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* ABA 1: Extrato de Movimentações */}
            {abaInferior === "extrato" && (
              <div>
                {extratoFiltrado.length === 0 ? (
                  <div style="text-align: center; padding: var(--sp-6) var(--sp-3); color: var(--text-muted); font-size: var(--fs-sm);">
                    Nenhuma movimentação encontrada para os filtros selecionados.
                  </div>
                ) : (
                  <div class="list">
                    {extratoFiltrado.map((mov) => {
                      const res = reservaMap.get(mov.reservaId);
                      const contaNome = mov.contaId ? contaMap.get(mov.contaId) : undefined;
                      const isAporte = mov.tipo === "aporte";
                      const isResgate = mov.tipo === "resgate";
                      const isRend = mov.tipo === "rendimento";

                      const badgeCls = isAporte ? "badge--in" : isResgate ? "badge--out" : "badge--neutral";
                      const tipoRotulo = isAporte ? "Aplicação" : isResgate ? "Resgate" : "Rendimento";
                      const sinal = isAporte || isRend ? "+" : "−";
                      const corValor = isAporte ? "var(--in)" : isResgate ? "var(--aporte)" : "#8b5cf6";

                      return (
                        <div key={mov.id} class="list__item">
                          <div
                            class="list__icon"
                            style={`background: ${
                              isAporte ? "var(--in-soft)" : isResgate ? "var(--aporte-soft)" : "hsl(270 40% 50% / 0.15)"
                            }; color: ${corValor};`}
                          >
                            <Icon name={isAporte ? "arrowDown" : isResgate ? "arrowUp" : "sparkle"} />
                          </div>

                          <div class="list__body">
                            <div style="display:flex; align-items:center; gap:8px;">
                              <span class={`badge ${badgeCls}`}>{tipoRotulo}</span>
                              <span class="list__title">{res ? res.nome : "Reserva"}</span>
                            </div>
                            <div class="list__sub" style="margin-top: 3px;">
                              <span>{mov.data.split("-").reverse().join("/")}</span>
                              {contaNome && (
                                <span style="margin-left: 8px; color: var(--text-muted);">
                                  • Caixa: {contaNome}
                                </span>
                              )}
                              {mov.obs && (
                                <span style="margin-left: 8px; font-style: italic;">
                                  • "{mov.obs}"
                                </span>
                              )}
                            </div>
                          </div>

                          <div style="display:flex; align-items:center; gap:12px;">
                            <div class="list__value" style={`color: ${corValor}; font-size: var(--fs-md);`}>
                              {sinal} {money(mov.valor)}
                            </div>

                            <button
                              type="button"
                              class="btn btn--ghost btn--icon"
                              style="width: 32px; height: 32px;"
                              title="Editar movimentação"
                              onClick={() =>
                                setModalMovimento({
                                  reservaId: mov.reservaId,
                                  tipo: mov.tipo,
                                  movimento: mov,
                                })
                              }
                            >
                              <Icon name="pencil" style="width: 15px; height: 15px;" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ABA 2: Evolução Mensal (Projeção × Real) */}
            {abaInferior === "evolucao" && (
              <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: var(--fs-xs);">
                  <thead>
                    <tr style="border-bottom: 2px solid var(--border); text-align: right;">
                      <th style="text-align: left; padding: 8px 12px; color: var(--text-muted); font-weight: 700;">Mês</th>
                      <th style="padding: 8px 12px; color: var(--in); font-weight: 700;">Aportes (Real / Proj)</th>
                      <th style="padding: 8px 12px; color: var(--aporte); font-weight: 700;">Resgates (Real / Proj)</th>
                      <th style="padding: 8px 12px; color: #8b5cf6; font-weight: 700;">Rendimento (Real / Proj)</th>
                      <th style="padding: 8px 12px; color: var(--primary); font-weight: 700;">Saldo Acumulado (Real / Proj)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTHS.map((mNome, mIdx) => {
                      // Se houver filtro por reserva específica ou consolidado
                      const reservasAlvo =
                        filtroReservaId === "todas"
                          ? carteira.reservas
                          : carteira.reservas.filter((r) => r.reserva.id === filtroReservaId);

                      let apReal = 0;
                      let apProj = 0;
                      let resgReal = 0;
                      let resgProj = 0;
                      let rendReal = 0;
                      let rendProj = 0;
                      let saldoReal = 0;
                      let saldoProj = 0;

                      for (const r of reservasAlvo) {
                        saldoReal += r.evolucaoMensalReal[mIdx];
                        saldoProj += r.evolucaoMensalProj[mIdx];

                        // Movimentos do mês
                        const movs = movList.filter((m) => m.reservaId === r.reserva.id && m.mes === mIdx);
                        for (const m of movs) {
                          if (m.tipo === "aporte") apReal += m.valor;
                          else if (m.tipo === "resgate") resgReal += m.valor;
                          else if (m.tipo === "rendimento") rendReal += m.valor;
                        }

                        // Projeções do mês
                        const p = projList.find((item) => item.reservaId === r.reserva.id && item.mes === mIdx);
                        if (p) {
                          apProj += p.valorAporte;
                          resgProj += p.valorResgate;
                          rendProj += p.valorRendimento;
                        }
                      }

                      return (
                        <tr
                          key={mIdx}
                          style={`border-bottom: 1px solid var(--border); ${
                            mIdx === mesAtual ? "background: var(--surface-soft); font-weight: 600;" : ""
                          }`}
                        >
                          <td style="text-align: left; padding: 10px 12px; font-weight: 700; color: var(--text);">
                            {mNome} {mIdx === mesAtual && <span class="badge badge--in" style="font-size: 0.65rem; margin-left: 4px;">Atual</span>}
                          </td>
                          <td style="padding: 10px 12px; text-align: right;">
                            <span style="color: var(--in); font-weight: 600;">{money(apReal)}</span>
                            <span style="color: var(--text-faint); margin-left: 6px;">/ {money(apProj)}</span>
                          </td>
                          <td style="padding: 10px 12px; text-align: right;">
                            <span style="color: var(--aporte); font-weight: 600;">{money(resgReal)}</span>
                            <span style="color: var(--text-faint); margin-left: 6px;">/ {money(resgProj)}</span>
                          </td>
                          <td style="padding: 10px 12px; text-align: right;">
                            <span style="color: #8b5cf6; font-weight: 600;">{money(rendReal)}</span>
                            <span style="color: var(--text-faint); margin-left: 6px;">/ {money(rendProj)}</span>
                          </td>
                          <td style="padding: 10px 12px; text-align: right;">
                            <span style="color: var(--primary); font-weight: 700;">{money(saldoReal)}</span>
                            <span style="color: var(--text-faint); margin-left: 6px;">/ {money(saldoProj)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Modais da Página */}
      <ModalReserva
        isOpen={modalReservaAberta !== null}
        reserva={modalReservaAberta === "nova" ? null : modalReservaAberta}
        empresaId={empId}
        onClose={() => setModalReservaAberta(null)}
        onSave={async (dadosReserva) => {
          if (modalReservaAberta === "nova") {
            await reservas.create({
              empresaId: empId,
              ...dadosReserva,
            });
            toast({ tipo: "sucesso", texto: "Reserva criada com sucesso!" });
          } else if (modalReservaAberta) {
            await reservas.update(modalReservaAberta.id, dadosReserva);
            toast({ tipo: "sucesso", texto: "Reserva atualizada com sucesso!" });
          }
        }}
        onDelete={async (id) => {
          await reservas.delete(id);
          toast({ tipo: "sucesso", texto: "Reserva excluída com sucesso." });
        }}
      />

      {modalMovimento && (
        <ModalMovimentoReserva
          isOpen={true}
          reservas={resList}
          contas={contList}
          empresaId={empId}
          anoId={ano.id}
          anoNum={ano.ano}
          initialReservaId={modalMovimento.reservaId}
          initialTipo={modalMovimento.tipo}
          movimento={modalMovimento.movimento}
          onClose={() => setModalMovimento(null)}
          onSuccess={() => {}}
        />
      )}

      {modalProjecaoReserva && (
        <ModalProjecaoReserva
          isOpen={true}
          reserva={modalProjecaoReserva}
          empresaId={empId}
          anoId={ano.id}
          projecoes={projList}
          onClose={() => setModalProjecaoReserva(null)}
          onSuccess={() => {}}
        />
      )}
    </>
  );
}
