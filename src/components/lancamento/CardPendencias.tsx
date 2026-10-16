import { useState } from "preact/hooks";
import { Icon } from "../Icon.tsx";
import { money, MONTHS } from "../../lib/format.ts";
import { NATURE_META } from "../../lib/natureza.ts";
import type { Conta, Categoria } from "../../data/types.ts";
import type { ProjecaoPendente } from "../../data/calc.ts";

export interface CardPendenciasProps {
  pendencias: ProjecaoPendente[];
  contas: Conta[];
  categorias: Categoria[];
  mesFiltro: number | "todos";
  onLancar: (item: ProjecaoPendente) => void;
  onIgnorar: (item: ProjecaoPendente) => void;
}

export function CardPendencias({
  pendencias,
  contas,
  categorias,
  mesFiltro,
  onLancar,
  onIgnorar,
}: CardPendenciasProps) {
  const [aberto, setAberto] = useState(true);

  if (pendencias.length === 0) {
    return null;
  }

  const contaMap = new Map(contas.map((c) => [c.id, c]));
  const catMap = new Map(categorias.map((c) => [c.id, c.nome]));

  const totalPendenteCentavos = pendencias.reduce((sum, p) => sum + p.valorPendente, 0);
  const totalVencidas = pendencias.filter((p) => p.status === "vencida").length;
  const tituloPeriodo = mesFiltro === "todos" ? "no Ano" : `em ${MONTHS[mesFiltro]}`;

  return (
    <section
      class="card"
      style="margin-bottom:var(--sp-4);border:1px solid rgba(245, 158, 11, 0.35);background:color-mix(in srgb, #f59e0b 4%, var(--surface));overflow:hidden;"
    >
      <div
        style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:var(--sp-3) var(--sp-4);cursor:pointer;user-select:none;"
        onClick={() => setAberto(!aberto)}
      >
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <div
            style={`width:32px;height:32px;border-radius:var(--r-md);display:inline-flex;align-items:center;justify-content:center;background:${
              totalVencidas > 0 ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)"
            };color:${totalVencidas > 0 ? "var(--out)" : "#f59e0b"};flex-shrink:0;`}
          >
            <Icon name={totalVencidas > 0 ? "alertTriangle" : "calendar"} style="width:18px;height:18px;" />
          </div>

          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <h2 style="font-size:var(--fs-sm);font-weight:700;margin:0;color:var(--text);">
                Contas Projetadas Pendentes de Realização ({pendencias.length})
              </h2>
              {totalVencidas > 0 && (
                <span
                  class="badge badge--danger"
                  style="font-size:0.68rem;padding:1px 6px;animation:pulse-sync 1.6s infinite;"
                >
                  {totalVencidas} vencida{totalVencidas > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div class="muted" style="font-size:var(--fs-xs);margin-top:2px;">
              Previsões {tituloPeriodo} que ainda não foram lançadas no real · Total:{" "}
              <strong style="color:var(--text);">{money(totalPendenteCentavos)}</strong>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="btn btn--ghost btn--icon"
          style="min-height:28px;width:28px;"
          onClick={(e) => {
            e.stopPropagation();
            setAberto(!aberto);
          }}
          title={aberto ? "Recolher pendências" : "Expandir pendências"}
          aria-expanded={aberto}
        >
          <Icon
            name="chevronDown"
            style={`width:16px;height:16px;transition:transform 0.2s ease;${aberto ? "transform:rotate(180deg);" : ""}`}
          />
        </button>
      </div>

      {aberto && (
        <div style="border-top:1px solid rgba(245, 158, 11, 0.2);padding:var(--sp-2) var(--sp-4) var(--sp-3) var(--sp-4);display:flex;flex-direction:column;gap:8px;">
          {pendencias.map((item) => {
            const conta = contaMap.get(item.contaId);
            if (!conta) return null;
            const meta = NATURE_META[conta.natureza];
            const catNome = catMap.get(conta.categoriaId) || "Geral";
            const isVencida = item.status === "vencida";

            return (
              <div
                key={`${item.contaId}_${item.mes}`}
                style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);flex-wrap:wrap;"
              >
                <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                  <i class="dot" style={`background:var(--${meta.tone});flex-shrink:0;`} />
                  <div style="min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                      <strong style="font-size:var(--fs-sm);color:var(--text);">{conta.nome}</strong>
                      <span class="muted" style="font-size:var(--fs-xs);">({catNome})</span>
                      <span class={`badge badge--${meta.tone}`} style="font-size:0.65rem;padding:0 5px;">
                        {meta.label}
                      </span>
                    </div>

                    <div style="display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);margin-top:2px;flex-wrap:wrap;">
                      <span class="muted">Previsto para {MONTHS[item.mes]}:</span>
                      {isVencida ? (
                        <span class="badge badge--danger" style="font-size:0.68rem;padding:0 5px;">
                          {item.diasAtraso ? `Vencida há ${item.diasAtraso} dia${item.diasAtraso > 1 ? "s" : ""}` : "Atrasada"}
                        </span>
                      ) : (
                        <span class="badge badge--warning" style="font-size:0.68rem;padding:0 5px;">
                          A vencer dia {item.diaEstimado}
                        </span>
                      )}
                      {item.valorRealizado > 0 && (
                        <span class="muted" style="font-size:0.7rem;">
                          (Já realizado: {money(item.valorRealizado)})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style="display:flex;align-items:center;gap:12px;margin-left:auto;">
                  <div style="text-align:right;">
                    <div class="num" style="font-weight:800;font-size:var(--fs-md);color:var(--text);">
                      {money(item.valorPendente)}
                    </div>
                  </div>

                  <div style="display:flex;align-items:center;gap:6px;">
                    <button
                      type="button"
                      class="btn btn--secondary btn--sm"
                      style="padding:4px 10px;min-height:28px;height:28px;font-size:var(--fs-xs);color:var(--text-muted);"
                      onClick={() => onIgnorar(item)}
                      title="Ignorar esta projeção ou somar ao próximo mês"
                    >
                      Ignorar
                    </button>
                    <button
                      type="button"
                      class="btn btn--primary btn--sm"
                      style="padding:4px 12px;min-height:28px;height:28px;font-size:var(--fs-xs);"
                      onClick={() => onLancar(item)}
                      title="Lançar agora com valor pré-preenchido"
                    >
                      <Icon name="plus" style="width:12px;height:12px;" />
                      Lançar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
