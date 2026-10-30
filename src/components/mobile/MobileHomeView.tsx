import { useState } from "react";
import { Icon } from "../Icon.tsx";
import { toast } from "../Toast.tsx";
import { CardPendencias } from "../lancamento/CardPendencias.tsx";
import { lancamentos } from "../../data/repo.ts";
import { money, moneyPrivacidade, MONTHS, signedPrivacidade } from "../../lib/format.ts";
import type { ProjecaoPendente } from "../../data/calc.ts";
import type { Categoria, Conta, ContaBancaria, Natureza, Reserva } from "../../data/types.ts";

export interface MobileLancamentoItem {
  id: string;
  data: string;
  valor: number;
  descricao?: string;
  contaNome: string;
  catNome: string;
  natureza: Natureza;
}

export interface MobileHomeViewProps {
  saldoFinalReal: number;
  saldoFinalProj?: number;
  desvio?: number;
  totEntradasReal: number;
  totSaidasReal: number;
  patrimonioConsolidado: number;
  reservasTotal: number;
  reservas: Reserva[];
  reservasSaldos: Map<string, number>;
  ultimosLancamentos: MobileLancamentoItem[];
  resultadoProj?: number[];
  resultadoReal?: number[];
  mesRef?: number;
  pendencias?: ProjecaoPendente[];
  controleTeto?: {
    cat: Categoria;
    proj: number;
    real: number;
    pct: number;
    status: "estourado" | "alerta" | "sem_teto" | "ok";
    excesso: number;
  }[];
  contas?: Conta[];
  categorias?: Categoria[];
  bancos?: ContaBancaria[];
  anoId?: string;
  anoNum?: number;
  onVerRelatorioCompleto: () => void;
}

function formatarDataCurta(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length < 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

export function MobileHomeView({
  saldoFinalReal,
  saldoFinalProj,
  desvio = 0,
  totEntradasReal,
  totSaidasReal,
  patrimonioConsolidado,
  reservasTotal: _reservasTotal,
  reservas,
  reservasSaldos,
  ultimosLancamentos,
  resultadoProj,
  resultadoReal,
  mesRef = new Date().getMonth(),
  pendencias = [],
  controleTeto = [],
  contas = [],
  categorias = [],
  bancos = [],
  anoId,
  anoNum: _anoNum,
  onVerRelatorioCompleto,
}: MobileHomeViewProps) {
  const superavit = totEntradasReal - totSaidasReal;

  // Estado para Quitação Rápida de Pendência
  const [modalQuitarPendencia, setModalQuitarPendencia] = useState<ProjecaoPendente | null>(null);
  const [quitarBancoId, setQuitarBancoId] = useState<string>("");

  const estouradas = controleTeto.filter((c) => c.status === "estourado");
  const alertas = controleTeto.filter((c) => c.status === "alerta");

  return (
    <div class="mobile-home-container" style="display:flex;flex-direction:column;gap:14px;padding-bottom:24px;">
      {/* 1. Hero Card de Saldo em Conta & Cockpit */}
      <section class="bank-hero-card" aria-label="Saldo e resumo financeiro">
        <div class="bank-hero-card__header">
          <span class="bank-hero-card__title">
            <Icon name="bank" style="width:16px;height:16px;color:var(--primary);" />
            Saldo em Conta
          </span>
          <span
            class="badge"
            style={{
              background: saldoFinalReal >= 0 ? "var(--in-soft)" : "var(--out-soft)",
              color: saldoFinalReal >= 0 ? "var(--in)" : "var(--out)",
              fontWeight: "700",
              fontSize: "0.72rem",
            }}
          >
            {saldoFinalReal >= 0 ? "Positivo" : "Negativo"}
          </span>
        </div>

        <div class="bank-hero-card__value">
          {moneyPrivacidade(saldoFinalReal)}
        </div>

        <div class="bank-hero-card__meta-row">
          <div class="bank-hero-card__meta-item">
            <span class="bank-hero-card__meta-label">Entradas Realizadas</span>
            <span class="bank-hero-card__meta-val" style="color:var(--in);">
              +{moneyPrivacidade(totEntradasReal)}
            </span>
          </div>
          <div class="bank-hero-card__meta-item" style="text-align:right;">
            <span class="bank-hero-card__meta-label">Saídas Realizadas</span>
            <span class="bank-hero-card__meta-val" style="color:var(--out);">
              -{moneyPrivacidade(totSaidasReal)}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "8px",
            borderTop: "1px dashed var(--border-soft)",
            fontSize: "0.74rem",
          }}
        >
          {saldoFinalProj !== undefined ? (
            <span style="color:var(--text-muted);">
              Proj: <strong style="color:var(--text);font-variant-numeric:tabular-nums;">{moneyPrivacidade(saldoFinalProj)}</strong>
              {" · "}Desvio: <strong style={{ color: desvio >= 0 ? "var(--in)" : "var(--out)", fontVariantNumeric: "tabular-nums" }}>{signedPrivacidade(desvio)}</strong>
            </span>
          ) : (
            <span style="color:var(--text-muted);">Patrimônio Total:</span>
          )}
          <strong style="color:var(--text);font-variant-numeric:tabular-nums;">
            {moneyPrivacidade(patrimonioConsolidado)}
          </strong>
        </div>
      </section>

      {/* 2. Fileira de Ações Rápidas (Estilo Banco Digital - 6 Pílulas) */}
      <section class="bank-quick-actions" aria-label="Ações rápidas">
        <a href="#/realizacoes/novo" class="bank-quick-action bank-quick-action--primary">
          <div class="bank-quick-action__btn">
            <Icon name="plus" />
          </div>
          <span class="bank-quick-action__label">Novo Gasto</span>
        </a>

        <a href="#/realizacoes" class="bank-quick-action">
          <div class="bank-quick-action__btn">
            <Icon name="list" />
          </div>
          <span class="bank-quick-action__label">Extrato</span>
        </a>

        <a href="#/investimentos" class="bank-quick-action">
          <div class="bank-quick-action__btn">
            <Icon name="sparkles" />
          </div>
          <span class="bank-quick-action__label">Investir</span>
        </a>

        <a href="#/reservas" class="bank-quick-action">
          <div class="bank-quick-action__btn">
            <Icon name="wallet" />
          </div>
          <span class="bank-quick-action__label">Caixinhas</span>
        </a>

        <a href="#/projecoes" class="bank-quick-action">
          <div class="bank-quick-action__btn">
            <Icon name="grid" />
          </div>
          <span class="bank-quick-action__label">Metas</span>
        </a>

        <div class="bank-quick-action" onClick={onVerRelatorioCompleto} role="button" tabIndex={0}>
          <div class="bank-quick-action__btn">
            <Icon name="download" />
          </div>
          <span class="bank-quick-action__label">Relatório</span>
        </div>
      </section>

      {/* 3. Alerta de Pendências Financeiras com Quitação Rápida */}
      {pendencias.length > 0 && contas.length > 0 && categorias.length > 0 && (
        <CardPendencias
          pendencias={pendencias}
          contas={contas}
          categorias={categorias}
          mesFiltro={mesRef}
          onLancar={(p) => {
            setQuitarBancoId(bancos[0]?.id || "");
            setModalQuitarPendencia(p);
          }}
          onIgnorar={(_p) => {}}
        />
      )}

      {/* 4. Indicador do Mês Atual (Entradas x Saídas) */}
      <section
        class="card"
        style={{
          borderRadius: "16px",
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:6px;">
            <Icon name="chart" style="width:16px;height:16px;color:var(--primary);" />
            <strong style="font-size:0.86rem;color:var(--text);">Resultado de {MONTHS[mesRef]}</strong>
          </div>
          <span
            style={{
              fontSize: "0.85rem",
              fontWeight: "800",
              color: superavit >= 0 ? "var(--in)" : "var(--out)",
            }}
          >
            {signedPrivacidade(superavit)}
          </span>
        </div>

        <div
          style={{
            height: "8px",
            borderRadius: "4px",
            background: "var(--surface-soft)",
            display: "flex",
            overflow: "hidden",
            marginTop: "2px",
          }}
        >
          {totEntradasReal + totSaidasReal > 0 && (
            <>
              <div
                style={{
                  height: "100%",
                  background: "var(--in)",
                  width: `${Math.round((totEntradasReal / (totEntradasReal + totSaidasReal)) * 100)}%`,
                }}
                title="Entradas"
              />
              <div
                style={{
                  height: "100%",
                  background: "var(--out)",
                  width: `${Math.round((totSaidasReal / (totEntradasReal + totSaidasReal)) * 100)}%`,
                }}
                title="Saídas"
              />
            </>
          )}
        </div>
      </section>

      {/* 5. Gráfico de Resultado Mensal dos 12 Meses (Proj vs Real) */}
      {resultadoProj && resultadoReal && resultadoProj.length === 12 && (
        <section
          class="card"
          style={{
            borderRadius: "16px",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:6px;">
              <Icon name="chart" style="width:16px;height:16px;color:var(--primary);" />
              <strong style="font-size:0.86rem;color:var(--text);">Resultado Mensal (12 Meses)</strong>
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-size:0.68rem;color:var(--text-muted);">
              <span style="display:flex;align-items:center;gap:4px;">
                <i class="dot" style="background:color-mix(in srgb, var(--primary) 30%, transparent);width:6px;height:6px;" />
                Proj.
              </span>
              <span style="display:flex;align-items:center;gap:4px;">
                <i class="dot" style="background:var(--primary);width:6px;height:6px;" />
                Real
              </span>
            </div>
          </div>

          {(() => {
            const maxVal = Math.max(1, ...resultadoProj.map(Math.abs), ...resultadoReal.map(Math.abs));
            return (
              <div class="bars" role="img" aria-label="Resultado projetado versus real por mês" style="height:110px;gap:3px;">
                {MONTHS.map((m, i) => {
                  const projH = (Math.abs(resultadoProj[i]) / maxVal) * 100;
                  const realH = (Math.abs(resultadoReal[i]) / maxVal) * 100;
                  const isCurrent = i === mesRef;
                  return (
                    <div
                      key={m}
                      class={`bars__col ${isCurrent ? "is-current" : ""}`}
                      title={`${m}: Proj ${money(resultadoProj[i])} · Real ${money(resultadoReal[i])}`}
                    >
                      <div class="bars__pair">
                        <div
                          class="bars__bar bars__bar--proj"
                          style={{ height: `${projH}%` }}
                        />
                        <div
                          class={`bars__bar ${i <= mesRef ? "bars__bar--real" : "bars__bar--future"} ${resultadoReal[i] < 0 ? "is-neg" : ""}`}
                          style={{ height: `${realH}%` }}
                        />
                      </div>
                      <span class="bars__label">{m[0]}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>
      )}

      {/* 6. Controle de Teto Orçamentário */}
      {controleTeto.length > 0 && (
        <section
          class="card"
          style={{
            borderRadius: "16px",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div>
              <div style="display:flex;align-items:center;gap:6px;">
                <Icon name="wallet" style="width:16px;height:16px;color:var(--primary);" />
                <strong style="font-size:0.86rem;color:var(--text);">Teto Orçamentário</strong>
              </div>
              <span style="font-size:0.68rem;color:var(--text-muted);">
                Despesas em {MONTHS[mesRef]}
              </span>
            </div>
            {estouradas.length > 0 ? (
              <span class="badge" style="background:var(--out-soft);color:var(--out);font-weight:700;font-size:0.68rem;padding:2px 6px;">
                <Icon name="alertTriangle" style="width:11px;height:11px;" /> {estouradas.length} estourada{estouradas.length > 1 ? "s" : ""}
              </span>
            ) : alertas.length > 0 ? (
              <span class="badge" style="background:var(--warn-soft);color:var(--warn);font-weight:700;font-size:0.68rem;padding:2px 6px;">
                <Icon name="alertTriangle" style="width:11px;height:11px;" /> {alertas.length} em alerta
              </span>
            ) : (
              <span class="badge" style="background:var(--in-soft);color:var(--in);font-weight:700;font-size:0.68rem;padding:2px 6px;">
                <Icon name="check" style="width:11px;height:11px;" /> No teto
              </span>
            )}
          </div>

          {estouradas.length > 0 && (
            <div
              style={{
                background: "var(--out-soft)",
                color: "var(--out)",
                padding: "8px 12px",
                borderRadius: "10px",
                fontSize: "0.72rem",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Icon name="alertTriangle" style="width:14px;height:14px;flex-shrink:0;" />
              <span>
                {estouradas.length === 1
                  ? `"${estouradas[0].cat.nome}" ultrapassou o teto projetado em +${moneyPrivacidade(estouradas[0].excesso)}.`
                  : `${estouradas.length} categorias ultrapassaram o teto projetado para este mês.`}
              </span>
            </div>
          )}

          <div style="display:flex;flex-direction:column;gap:8px;">
            {controleTeto.slice(0, 5).map((item) => {
              const barColor =
                item.status === "estourado"
                  ? "var(--out)"
                  : item.status === "alerta"
                  ? "var(--warn)"
                  : "var(--in)";
              return (
                <div key={item.cat.id} style="display:flex;flex-direction:column;gap:3px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.74rem;">
                    <span style="font-weight:600;display:flex;align-items:center;gap:6px;color:var(--text);">
                      <i class="dot" style={`background:${barColor}`} />
                      {item.cat.nome}
                    </span>
                    <div style="display:flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums;">
                      <span>
                        <strong>{moneyPrivacidade(item.real)}</strong>
                        <span style="color:var(--text-muted);font-size:0.68rem;"> / {moneyPrivacidade(item.proj)}</span>
                      </span>
                      <span
                        class="badge"
                        style={{
                          background: `${barColor}22`,
                          color: barColor,
                          fontSize: "0.64rem",
                          padding: "1px 5px",
                          fontWeight: "700",
                        }}
                      >
                        {item.pct}%
                      </span>
                    </div>
                  </div>
                  <div style="height:5px;border-radius:3px;background:var(--surface-soft);overflow:hidden;">
                    <div
                      style={{
                        width: `${Math.min(100, item.pct)}%`,
                        height: "100%",
                        background: barColor,
                        borderRadius: "3px",
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 7. Minhas Caixinhas & Investimentos */}
      <section style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;">
          <h2 style="font-size:0.92rem;font-weight:800;color:var(--text);margin:0;">
            Minhas Caixinhas
          </h2>
          <div style="display:flex;align-items:center;gap:10px;">
            <a
              href="#/investimentos"
              style="font-size:0.75rem;font-weight:700;color:var(--primary);text-decoration:none;"
            >
              Bolsa B3 &rarr;
            </a>
            <a
              href="#/reservas"
              style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-decoration:none;"
            >
              Ver todas
            </a>
          </div>
        </div>

        {reservas.length === 0 ? (
          <div
            class="card"
            style="text-align:center;padding:18px;border-radius:16px;display:flex;flex-direction:column;align-items:center;gap:6px;"
          >
            <Icon name="wallet" style="width:24px;height:24px;color:var(--text-muted);" />
            <span style="font-size:0.80rem;color:var(--text-muted);">Você ainda não tem caixinhas</span>
            <a href="#/reservas" class="btn btn--primary btn--sm" style="margin-top:2px;font-size:0.75rem;">
              Criar Caixinha
            </a>
          </div>
        ) : (
          <div style="display:flex;flex-direction:column;gap:8px;">
            {reservas.slice(0, 3).map((r) => {
              const saldo = reservasSaldos.get(r.id) || 0;
              const meta = r.metaCentavos || 0;
              const pct = meta > 0 ? Math.min(100, Math.round((saldo / meta) * 100)) : 0;

              return (
                <div key={r.id} class="caixinha-card" style="padding:12px 14px;">
                  <div class="caixinha-card__top">
                    <div class="caixinha-card__title">
                      <Icon name="wallet" style="width:15px;height:15px;color:var(--primary);" />
                      <span style="font-size:0.84rem;">{r.nome}</span>
                    </div>
                    {meta > 0 && (
                      <span class="caixinha-card__badge" style="background:var(--primary-soft);color:var(--primary);font-size:0.68rem;">
                        {pct}% da meta
                      </span>
                    )}
                  </div>

                  <div class="caixinha-card__val" style="font-size:1.15rem;">
                    {moneyPrivacidade(saldo)}
                  </div>

                  {meta > 0 && (
                    <div class="caixinha-card__progress-wrap">
                      <div class="caixinha-card__progress-bar">
                        <div class="caixinha-card__progress-fill" style={`width:${pct}%;`} />
                      </div>
                      <div style="display:flex;justify-content:space-between;font-size:0.66rem;color:var(--text-muted);">
                        <span>Atual</span>
                        <span>Meta: {moneyPrivacidade(meta)}</span>
                      </div>
                    </div>
                  )}

                  <div class="caixinha-card__actions" style="margin-top:6px;">
                    <a href="#/reservas" class="caixinha-card__btn caixinha-card__btn--primary" style="font-size:0.72rem;padding:4px 8px;">
                      <Icon name="plus" style="width:13px;height:13px;" /> Guardar
                    </a>
                    <a href="#/reservas" class="caixinha-card__btn" style="font-size:0.72rem;padding:4px 8px;">
                      Resgatar
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 8. Últimas Transações do Extrato */}
      <section style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;">
          <h2 style="font-size:0.92rem;font-weight:800;color:var(--text);margin:0;">
            Últimas Transações
          </h2>
          <a
            href="#/realizacoes"
            style="font-size:0.75rem;font-weight:700;color:var(--primary);text-decoration:none;"
          >
            Extrato completo
          </a>
        </div>

        {ultimosLancamentos.length === 0 ? (
          <div
            class="card"
            style="text-align:center;padding:20px;border-radius:16px;color:var(--text-muted);font-size:0.80rem;"
          >
            Nenhuma transação recente no período.
          </div>
        ) : (
          <div>
            {ultimosLancamentos.map((tx) => {
              const isEntrada = tx.natureza === "receber" || tx.natureza === "aporte";

              return (
                <a key={tx.id} href="#/realizacoes" class="mobile-tx-card" style="padding:10px 12px;gap:10px;">
                  <div
                    class="mobile-tx-card__icon"
                    style={{
                      background: isEntrada ? "var(--in-soft)" : "var(--out-soft)",
                      color: isEntrada ? "var(--in)" : "var(--out)",
                      width: "34px",
                      height: "34px",
                    }}
                  >
                    <Icon name={isEntrada ? "arrowDown" : "arrowUp"} style="width:16px;height:16px;" />
                  </div>

                  <div class="mobile-tx-card__main">
                    <div class="mobile-tx-card__title" style="font-size:0.82rem;">
                      {tx.descricao || tx.contaNome}
                    </div>
                    <div class="mobile-tx-card__sub" style="font-size:0.68rem;">
                      <span>{formatarDataCurta(tx.data)}</span>
                      <span>•</span>
                      <span>{tx.catNome}</span>
                    </div>
                  </div>

                  <div class="mobile-tx-card__val">
                    <div
                      class="mobile-tx-card__amount"
                      style={{ color: isEntrada ? "var(--in)" : "var(--text)", fontSize: "0.86rem" }}
                    >
                      {isEntrada ? "+" : "-"}{moneyPrivacidade(tx.valor)}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal Bottom-Sheet de Quitação Rápida de Pendência */}
      {modalQuitarPendencia && (() => {
        const c = contas.find((x) => x.id === modalQuitarPendencia.contaId);
        const cat = categorias.find((x) => x.id === c?.categoriaId);
        return (
          <div class="modal-backdrop" onClick={() => setModalQuitarPendencia(null)}>
            <div class="modal" onClick={(e) => e.stopPropagation()} style="max-width:400px;border-radius:20px;padding:18px;">
              <div class="modal__head" style="margin-bottom:12px;">
                <h3 class="modal__title" style="font-size:0.95rem;">Quitar Conta Pendente</h3>
                <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalQuitarPendencia(null)}>
                  <Icon name="x" />
                </button>
              </div>

              <div style="display:flex;flex-direction:column;gap:12px;">
                <div style="background:var(--surface-soft);padding:12px;border-radius:12px;display:flex;flex-direction:column;gap:4px;">
                  <span style="font-size:0.70rem;color:var(--text-muted);font-weight:700;">VALOR A QUITAR</span>
                  <div style="font-size:1.3rem;font-weight:900;color:var(--out);font-variant-numeric:tabular-nums;">
                    {money(modalQuitarPendencia.valorPendente)}
                  </div>
                  <div style="font-size:0.82rem;font-weight:700;color:var(--text);">
                    {c?.nome || "Conta"}
                  </div>
                  <div style="font-size:0.70rem;color:var(--text-muted);">
                    {cat?.nome || "Geral"} • Vencimento: {modalQuitarPendencia.dataSugerida.split("-").reverse().join("/")}
                  </div>
                </div>

                {bancos.length > 0 && (
                  <div class="field">
                    <label class="field__label" style="font-size:0.75rem;">Banco de Pagamento</label>
                    <select
                      class="input"
                      style="font-size:0.82rem;"
                      value={quitarBancoId}
                      onChange={(e) => setQuitarBancoId((e.currentTarget as HTMLSelectElement).value)}
                    >
                      <option value="">Sem vínculo bancário específico</option>
                      {bancos.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nome} ({b.tipo})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div class="modal__foot" style="display:flex;gap:8px;margin-top:16px;">
                <button type="button" class="btn" style="flex:1;font-size:0.80rem;" onClick={() => setModalQuitarPendencia(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  class="btn btn--primary"
                  style="flex:1;font-size:0.80rem;"
                  onClick={async () => {
                    if (!anoId) return;
                    await lancamentos.create({
                      anoId,
                      contaId: modalQuitarPendencia.contaId,
                      mes: modalQuitarPendencia.mes,
                      data: modalQuitarPendencia.dataSugerida,
                      valor: modalQuitarPendencia.valorPendente,
                      descricao: c?.nome || "Quitação de pendência",
                      bancoId: quitarBancoId || undefined,
                      pago: true,
                      dataQuitacao: modalQuitarPendencia.dataSugerida,
                    });
                    toast.success("Conta quitada com sucesso!");
                    setModalQuitarPendencia(null);
                  }}
                >
                  <Icon name="check" /> Confirmar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
