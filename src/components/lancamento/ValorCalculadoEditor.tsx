import { useState } from "preact/hooks";
import type { Categoria, Conta, RegraVinculo } from "../../data/types.ts";
import { money, MONTHS } from "../../lib/format.ts";
import { NATURE_META } from "../../lib/natureza.ts";
import { Icon } from "../Icon.tsx";

export interface ValorCalculadoEditorProps {
  contas: Conta[];
  categorias: Categoria[];
  currentContaId?: string;
  regra: RegraVinculo;
  onChangeRegra: (regra: RegraVinculo) => void;
  mesAtivo: number;
  avaliarMes: (mes: number) => { ok: boolean; valorCentavos: number; erro?: string; base?: number };
  salvarNaConta?: boolean;
  onChangeSalvarNaConta?: (val: boolean) => void;
  mostrarSalvarNaConta?: boolean;
  onAplicar?: (valorCentavos: number) => void;
}

export function ValorCalculadoEditor({
  contas,
  categorias,
  currentContaId,
  regra,
  onChangeRegra,
  mesAtivo,
  avaliarMes,
  salvarNaConta,
  onChangeSalvarNaConta,
  mostrarSalvarNaConta = false,
  onAplicar,
}: ValorCalculadoEditorProps) {
  const modoGeral = regra.modo || "simples";
  const tipoOrigem = regra.tipo || "conta";
  const formulaStr = regra.formula || "";
  const modoRegra = regra.percentual !== undefined ? "percentual" : "fixo";

  const resultadoMesAtivo = avaliarMes(mesAtivo);

  const contasDisponiveis = contas.filter((c) => c.id !== currentContaId && c.ativa);

  const setModoGeral = (novoModo: "simples" | "formula") => {
    onChangeRegra({
      ...regra,
      modo: novoModo,
    });
  };

  const setTipoOrigem = (novoTipo: "conta" | "categoria") => {
    const defaultOrigemId = novoTipo === "conta"
      ? (contasDisponiveis.find((c) => c.natureza === "receber")?.id || contasDisponiveis[0]?.id || "")
      : (categorias.find((c) => c.natureza === "receber")?.id || categorias[0]?.id || "");

    onChangeRegra({
      ...regra,
      tipo: novoTipo,
      origemId: defaultOrigemId,
    });
  };

  const setModoCalculo = (novoModo: "percentual" | "fixo") => {
    if (novoModo === "percentual") {
      onChangeRegra({
        ...regra,
        percentual: regra.percentual ?? 30,
        valorFixo: undefined,
      });
    } else {
      onChangeRegra({
        ...regra,
        percentual: undefined,
        valorFixo: regra.valorFixo ?? 10000,
      });
    }
  };

  const inserirVariavel = (nome: string) => {
    const varNome = `[${nome}]`;
    const atual = formulaStr.trim();
    onChangeRegra({
      ...regra,
      formula: atual ? `${atual} + ${varNome}` : varNome,
    });
  };

  const inserirOperador = (op: string) => {
    onChangeRegra({
      ...regra,
      formula: `${formulaStr} ${op} `,
    });
  };

  return (
    <div style="background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--r-md);padding:12px;display:flex;flex-direction:column;gap:10px;">
      {/* Abas: Vínculo Simples vs Fórmula */}
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div style="font-weight:700;font-size:var(--fs-xs);color:var(--text);display:flex;align-items:center;gap:6px;">
          {modoGeral === "formula" ? (
            <span style="font-weight:800;font-style:italic;font-family:serif;color:var(--primary);font-size:14px;">fx</span>
          ) : (
            <Icon name="link" style="color:var(--primary);width:14px;height:14px;" />
          )}
          <span>Regra de Cálculo Automático</span>
        </div>

        <div class="tabs tabs--sm" style="margin:0;">
          <button
            type="button"
            class={`tab ${modoGeral === "simples" ? "is-active" : ""}`}
            style="font-size:var(--fs-xs);padding:3px 10px;"
            onClick={() => setModoGeral("simples")}
          >
            Vínculo Direto
          </button>
          <button
            type="button"
            class={`tab ${modoGeral === "formula" ? "is-active" : ""}`}
            style="font-size:var(--fs-xs);padding:3px 10px;"
            onClick={() => setModoGeral("formula")}
          >
            Fórmula (fx)
          </button>
        </div>
      </div>

      {modoGeral === "simples" ? (
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px;">
            <div>
              <label class="form-label" style="font-size:0.7rem;margin-bottom:2px;">Basear em:</label>
              <div class="tabs tabs--sm" style="margin:0;">
                <button
                  type="button"
                  class={`tab ${tipoOrigem === "conta" ? "is-active" : ""}`}
                  style="font-size:var(--fs-xs);padding:3px 8px;min-height:26px;"
                  onClick={() => setTipoOrigem("conta")}
                >
                  Conta
                </button>
                <button
                  type="button"
                  class={`tab ${tipoOrigem === "categoria" ? "is-active" : ""}`}
                  style="font-size:var(--fs-xs);padding:3px 8px;min-height:26px;"
                  onClick={() => setTipoOrigem("categoria")}
                >
                  Categoria
                </button>
              </div>
            </div>

            <div>
              <label class="form-label" style="font-size:0.7rem;margin-bottom:2px;">Tipo da Regra:</label>
              <div class="tabs tabs--sm" style="margin:0;">
                <button
                  type="button"
                  class={`tab ${modoRegra === "percentual" ? "is-active" : ""}`}
                  style="font-size:var(--fs-xs);padding:3px 8px;min-height:26px;"
                  onClick={() => setModoCalculo("percentual")}
                >
                  % Percentual
                </button>
                <button
                  type="button"
                  class={`tab ${modoRegra === "fixo" ? "is-active" : ""}`}
                  style="font-size:var(--fs-xs);padding:3px 8px;min-height:26px;"
                  onClick={() => setModoCalculo("fixo")}
                >
                  Valor Fixo
                </button>
              </div>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" style="font-size:0.7rem;margin-bottom:2px;">
              Origem ({tipoOrigem === "conta" ? "Conta" : "Categoria"}) *
            </label>
            <select
              class="select"
              value={regra.origemId || ""}
              onChange={(e) => onChangeRegra({ ...regra, origemId: (e.currentTarget as HTMLSelectElement).value })}
            >
              <option value="" disabled>Selecione a origem...</option>
              {tipoOrigem === "conta"
                ? contasDisponiveis.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({NATURE_META[c.natureza]?.label || c.natureza})
                    </option>
                  ))
                : categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nome} ({NATURE_META[cat.natureza]?.label || cat.natureza})
                    </option>
                  ))}
            </select>
          </div>

          {modoRegra === "percentual" ? (
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:0.7rem;margin-bottom:2px;">
                Percentual Aplicado (%) *
              </label>
              <div style="display:flex;align-items:center;gap:6px;">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1000"
                  class="input"
                  style="min-height:32px;font-size:var(--fs-xs);"
                  placeholder="Ex: 30"
                  value={regra.percentual !== undefined ? regra.percentual : ""}
                  onInput={(e) =>
                    onChangeRegra({
                      ...regra,
                      percentual: parseFloat((e.currentTarget as HTMLInputElement).value) || 0,
                    })
                  }
                />
                <span style="font-weight:700;font-size:var(--fs-sm);color:var(--text-muted);">%</span>
              </div>
            </div>
          ) : (
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:0.7rem;margin-bottom:2px;">
                Valor Fixo por Lançamento (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                class="input"
                style="min-height:32px;font-size:var(--fs-xs);"
                placeholder="0,00"
                value={regra.valorFixo !== undefined ? (regra.valorFixo / 100).toFixed(2) : ""}
                onInput={(e) =>
                  onChangeRegra({
                    ...regra,
                    valorFixo: Math.round(parseFloat((e.currentTarget as HTMLInputElement).value || "0") * 100),
                  })
                }
              />
            </div>
          )}
        </div>
      ) : (
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div class="muted" style="font-size:11px;line-height:1.4;">
            💡 Insira contas entre colchetes como <code>[Salário]</code>. Exemplo: <code>([Vendas] - [Taxas]) * 10%</code>
          </div>

          <div>
            <div style="font-size:0.7rem;font-weight:600;color:var(--text-muted);margin-bottom:4px;">
              Inserir Conta na Fórmula:
            </div>
            <div
              style="display:flex;gap:4px;flex-wrap:wrap;max-height:80px;overflow-y:auto;padding:6px;background:var(--surface-soft);border:1px solid var(--border);border-radius:var(--r-sm);"
            >
              {contasDisponiveis.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  class="badge"
                  style="cursor:pointer;background:var(--surface);border:1px solid var(--border);color:var(--text);font-size:11px;padding:3px 7px;"
                  onClick={() => inserirVariavel(c.nome)}
                >
                  + [{c.nome}]
                </button>
              ))}
            </div>
          </div>

          <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
            <span class="muted" style="font-size:11px;">Operadores:</span>
            {["+", "-", "*", "/", "(", ")", "%"].map((op) => (
              <button
                key={op}
                type="button"
                class="btn btn--ghost"
                style="min-height:24px;padding:2px 8px;font-size:var(--fs-xs);font-weight:700;"
                onClick={() => inserirOperador(op)}
              >
                {op}
              </button>
            ))}
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" style="font-size:0.7rem;margin-bottom:2px;">Fórmula de Cálculo *</label>
            <textarea
              class="textarea"
              rows={2}
              placeholder="Ex: ([Salário] - [INSS]) * 30%"
              value={formulaStr}
              onInput={(e) => onChangeRegra({ ...regra, formula: (e.currentTarget as HTMLTextAreaElement).value })}
            />
          </div>

          {formulaStr.trim() && (
            <div
              class={`banner ${resultadoMesAtivo.ok ? "banner--success" : "banner--warning"}`}
              style="padding:6px 10px;font-size:var(--fs-xs);margin:0;border-radius:var(--r-sm);"
            >
              {resultadoMesAtivo.ok
                ? `✓ Fórmula válida! Prévia em ${MONTHS[mesAtivo]}: ${money(resultadoMesAtivo.valorCentavos)}`
                : `⚠️ ${resultadoMesAtivo.erro}`}
            </div>
          )}
        </div>
      )}

      {/* Salvar Regra na Conta (para Projeções ou futuro uso) */}
      {mostrarSalvarNaConta && onChangeSalvarNaConta && (
        <div style="display:flex;align-items:center;gap:6px;padding-top:4px;border-top:1px solid var(--border);">
          <input
            id="chk-salvar-regra"
            type="checkbox"
            checked={salvarNaConta}
            onChange={(e) => onChangeSalvarNaConta((e.currentTarget as HTMLInputElement).checked)}
          />
          <label for="chk-salvar-regra" style="font-size:var(--fs-xs);cursor:pointer;color:var(--text);">
            Salvar regra na conta (para sugerir futuros lançamentos e recalcular automaticamente)
          </label>
        </div>
      )}

      {/* Rodapé com Resultado e Ação Aplicar se disponível */}
      <div
        style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:var(--surface-soft);border-radius:var(--r-sm);border:1px solid var(--border);"
      >
        <div style="font-size:var(--fs-xs);color:var(--text-muted);">
          Prévia em <b>{MONTHS[mesAtivo]}</b>:{" "}
          <strong style="color:var(--primary);font-size:var(--fs-sm);">
            {money(resultadoMesAtivo.valorCentavos)}
          </strong>
          {resultadoMesAtivo.base !== undefined && resultadoMesAtivo.base > 0 && (
            <span style="margin-left:6px;font-size:11px;">(base: {money(resultadoMesAtivo.base)})</span>
          )}
        </div>

        {onAplicar && (
          <button
            type="button"
            class="btn btn--primary btn--sm"
            style="font-size:var(--fs-xs);min-height:28px;padding:3px 12px;"
            disabled={resultadoMesAtivo.valorCentavos <= 0}
            onClick={() => onAplicar(resultadoMesAtivo.valorCentavos)}
          >
            Aplicar ao Lançamento
          </button>
        )}
      </div>
    </div>
  );
}
