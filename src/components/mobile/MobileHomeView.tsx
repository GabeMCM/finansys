import { Icon } from "../Icon.tsx";
import { moneyPrivacidade, signedPrivacidade } from "../../lib/format.ts";
import type { Natureza, Reserva } from "../../data/types.ts";

export interface MobileLancamentoItem {
  id: string;
  data: string;
  valor: number;
  descricao?: string;
  contaNome: string;
  catNome: string;
  natureza: Natureza;
}

interface MobileHomeViewProps {
  saldoFinalReal: number;
  saldoFinalProj: number;
  totEntradasReal: number;
  totSaidasReal: number;
  patrimonioConsolidado: number;
  reservasTotal: number;
  reservas: Reserva[];
  reservasSaldos: Map<string, number>;
  ultimosLancamentos: MobileLancamentoItem[];
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
  totEntradasReal,
  totSaidasReal,
  patrimonioConsolidado,
  reservasTotal,
  reservas,
  reservasSaldos,
  ultimosLancamentos,
  onVerRelatorioCompleto,
}: MobileHomeViewProps) {
  const superavit = totEntradasReal - totSaidasReal;

  return (
    <div class="mobile-home-container" style="display:flex;flex-direction:column;gap:16px;">
      {/* 1. Hero Card de Saldo em Conta */}
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
          <span style="color:var(--text-muted);">Patrimônio Total:</span>
          <strong style="color:var(--text);font-variant-numeric:tabular-nums;">
            {moneyPrivacidade(patrimonioConsolidado)}
          </strong>
        </div>
      </section>

      {/* 2. Fileira de Ações Rápidas em Pílulas Circulares (Estilo App de Banco) */}
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

      {/* 3. Indicador do Mês Atual (Entradas x Saídas) */}
      <section
        class="card"
        style={{
          borderRadius: "18px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:6px;">
            <Icon name="chart" style="width:16px;height:16px;color:var(--primary);" />
            <strong style="font-size:0.88rem;color:var(--text);">Resultado do Período</strong>
          </div>
          <span
            style={{
              fontSize: "0.86rem",
              fontWeight: "800",
              color: superavit >= 0 ? "var(--in)" : "var(--out)",
            }}
          >
            {signedPrivacidade(superavit)}
          </span>
        </div>

        {/* Barra Visual Proporcional */}
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

      {/* 4. Minhas Caixinhas & Investimentos */}
      <section style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;">
          <h2 style="font-size:0.95rem;font-weight:800;color:var(--text);margin:0;">
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
            style="text-align:center;padding:20px;border-radius:18px;display:flex;flex-direction:column;align-items:center;gap:8px;"
          >
            <Icon name="wallet" style="width:28px;height:28px;color:var(--text-muted);" />
            <span style="font-size:0.84rem;color:var(--text-muted);">Você ainda não tem caixinhas</span>
            <a href="#/reservas" class="btn btn--primary btn--sm" style="margin-top:4px;">
              Criar Caixinha
            </a>
          </div>
        ) : (
          <div style="display:flex;flex-direction:column;gap:10px;">
            {reservas.slice(0, 3).map((r) => {
              const saldo = reservasSaldos.get(r.id) || 0;
              const meta = r.metaCentavos || 0;
              const pct = meta > 0 ? Math.min(100, Math.round((saldo / meta) * 100)) : 0;

              return (
                <div key={r.id} class="caixinha-card">
                  <div class="caixinha-card__top">
                    <div class="caixinha-card__title">
                      <Icon name="wallet" style="width:16px;height:16px;color:var(--primary);" />
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
                      <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text-muted);">
                        <span>Atual</span>
                        <span>Meta: {moneyPrivacidade(meta)}</span>
                      </div>
                    </div>
                  )}

                  <div class="caixinha-card__actions">
                    <a href="#/reservas" class="caixinha-card__btn caixinha-card__btn--primary">
                      <Icon name="plus" style="width:14px;height:14px;" /> Guardar
                    </a>
                    <a href="#/reservas" class="caixinha-card__btn">
                      Resgatar
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Últimas Transações do Extrato */}
      <section style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;">
          <h2 style="font-size:0.95rem;font-weight:800;color:var(--text);margin:0;">
            Últimas Transações
          </h2>
          <a
            href="#/realizacoes"
            style="font-size:0.78rem;font-weight:700;color:var(--primary);text-decoration:none;"
          >
            Extrato completo
          </a>
        </div>

        {ultimosLancamentos.length === 0 ? (
          <div
            class="card"
            style="text-align:center;padding:24px;border-radius:18px;color:var(--text-muted);font-size:0.84rem;"
          >
            Nenhuma transação recente no período.
          </div>
        ) : (
          <div>
            {ultimosLancamentos.map((tx) => {
              const isEntrada = tx.natureza === "receber" || tx.natureza === "aporte";

              return (
                <a key={tx.id} href="#/realizacoes" class="mobile-tx-card">
                  <div
                    class="mobile-tx-card__icon"
                    style={{
                      background: isEntrada ? "var(--in-soft)" : "var(--out-soft)",
                      color: isEntrada ? "var(--in)" : "var(--out)",
                    }}
                  >
                    <Icon name={isEntrada ? "arrowDown" : "arrowUp"} />
                  </div>

                  <div class="mobile-tx-card__main">
                    <div class="mobile-tx-card__title">
                      {tx.descricao || tx.contaNome}
                    </div>
                    <div class="mobile-tx-card__sub">
                      <span>{formatarDataCurta(tx.data)}</span>
                      <span>•</span>
                      <span>{tx.catNome}</span>
                    </div>
                  </div>

                  <div class="mobile-tx-card__val">
                    <div
                      class="mobile-tx-card__amount"
                      style={{ color: isEntrada ? "var(--in)" : "var(--text)" }}
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
    </div>
  );
}
