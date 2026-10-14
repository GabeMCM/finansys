import { useState } from "preact/hooks";
import { consultarIndices } from "../lib/bcb.ts";
import { type PlanoReplicacao, type RegraFaltante, aplicarReplicacao, simularReplicacao } from "../data/replicacao.ts";
import { Modal } from "./Modal.tsx";
import { Icon } from "./Icon.tsx";
import { toast } from "./Toast.tsx";
import { money, signed } from "../lib/format.ts";
import { NATURE_META } from "../lib/natureza.ts";
import { NATUREZAS } from "../data/types.ts";
import { setAno } from "../state.ts";

export interface ModalReplicacaoProps {
  empresaId: string;
  anoAtual: number;
  saldoFinalRealAtual: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ModalReplicacao({ empresaId, anoAtual, saldoFinalRealAtual, isOpen, onClose }: ModalReplicacaoProps) {
  const [etapa, setEtapa] = useState<"config" | "previa">("config");
  const [anoDestino, setAnoDestino] = useState<number>(anoAtual + 1);
  const [tipoTaxa, setTipoTaxa] = useState<"fixa" | "ipca">("fixa");
  const [taxaFixa, setTaxaFixa] = useState<number>(5);
  const [taxaIpca, setTaxaIpca] = useState<number | null>(null);
  const [ipcaData, setIpcaData] = useState<string>("");
  const [carregandoIpca, setCarregandoIpca] = useState<boolean>(false);
  const [regraFaltante, setRegraFaltante] = useState<RegraFaltante>("usar_projecao");
  const [bancaDestino, setBancaDestino] = useState<number>(saldoFinalRealAtual / 100);

  const [plano, setPlano] = useState<PlanoReplicacao | null>(null);
  const [salvando, setSalvando] = useState<boolean>(false);

  const obterIpca = async () => {
    setCarregandoIpca(true);
    const res = await consultarIndices();
    setTaxaIpca(res.ipca);
    setIpcaData(res.dataReferencia);
    setCarregandoIpca(false);
  };

  const taxaEfetiva = tipoTaxa === "ipca" ? (taxaIpca ?? 4.5) : taxaFixa;

  const gerarPrevia = async (e: Event) => {
    e.preventDefault();
    try {
      const p = await simularReplicacao({
        empresaId,
        anoOrigem: anoAtual,
        anoDestino,
        taxaPercentual: taxaEfetiva,
        regraFaltante,
        bancaInicialDestino: Math.round(Number(bancaDestino || 0) * 100),
      });
      setPlano(p);
      setEtapa("previa");
    } catch (err) {
      toast.error(String(err));
    }
  };

  const confirmarReplicacao = async () => {
    if (!plano) return;
    setSalvando(true);
    try {
      await aplicarReplicacao(plano);
      setAno(plano.anoDestino);
      toast.success(`Ano ${plano.anoDestino} criado com sucesso com as novas projeções reajustadas!`);
      onClose();
      setEtapa("config");
      setPlano(null);
    } catch (err) {
      toast.error("Erro ao aplicar replicação: " + String(err));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      title={etapa === "config" ? `Replicar Contas: ${anoAtual} → ${anoDestino}` : "Prévia da Projeção Reajustada"}
      isOpen={isOpen}
      onClose={onClose}
      subtela={true}
      footer={
        etapa === "config" ? (
          <>
            <button type="button" class="btn btn--ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" form="form-replicacao" class="btn btn--primary">
              Ver Prévia <Icon name="chevron" />
            </button>
          </>
        ) : (
          <>
            <button type="button" class="btn btn--ghost" onClick={() => setEtapa("config")}>
              <Icon name="arrowLeft" /> Voltar
            </button>
            <button type="button" class="btn btn--primary" disabled={salvando} onClick={confirmarReplicacao}>
              {salvando ? "Criando..." : "Confirmar e Criar Projeções"}
            </button>
          </>
        )
      }
    >
      {etapa === "config" ? (
        <form id="form-replicacao" onSubmit={gerarPrevia} class="stack" style="gap:var(--sp-4);">
          <div style="font-size:var(--fs-sm);color:var(--text-muted);">
            O sistema pegará o <b>valor real realizado de cada conta</b> em {anoAtual} e aplicará um reajuste seguro para criar as projeções de {anoDestino}.
          </div>

          <div class="form-row form-row--2">
            <div class="form-group">
              <label class="form-label">Ano de Origem (Real)</label>
              <input class="input" disabled value={anoAtual} />
            </div>
            <div class="form-group">
              <label class="form-label" for="rep-ano-dest">Ano Destino (Projeção) *</label>
              <input
                id="rep-ano-dest"
                type="number"
                class="input"
                required
                min={anoAtual + 1}
                value={anoDestino}
                onInput={(e) => setAnoDestino(Number(e.currentTarget.value))}
              />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Regra de Reajuste Seguro *</label>
            <div style="display:flex;gap:var(--sp-2);margin-bottom:var(--sp-2);">
              <button
                type="button"
                class={`btn ${tipoTaxa === "fixa" ? "btn--primary" : "btn--secondary"}`}
                style="flex:1;"
                onClick={() => setTipoTaxa("fixa")}
              >
                % Percentual Fixo
              </button>
              <button
                type="button"
                class={`btn ${tipoTaxa === "ipca" ? "btn--primary" : "btn--secondary"}`}
                style="flex:1;"
                onClick={() => {
                  setTipoTaxa("ipca");
                  if (taxaIpca === null) void obterIpca();
                }}
              >
                Índice Oficial (IPCA)
              </button>
            </div>

            {tipoTaxa === "fixa" ? (
              <div style="display:flex;align-items:center;gap:8px;">
                <input
                  type="number"
                  step="0.1"
                  class="input"
                  style="max-width:120px;"
                  value={taxaFixa}
                  onInput={(e) => setTaxaFixa(Number(e.currentTarget.value))}
                />
                <span style="font-weight:600;font-size:var(--fs-sm);">% de reajuste</span>
              </div>
            ) : (
              <div style="border:1px solid var(--border);border-radius:var(--r-md);padding:10px;background:var(--surface);">
                {carregandoIpca ? (
                  <span class="muted" style="font-size:var(--fs-xs);">Consultando Banco Central do Brasil...</span>
                ) : (
                  <div>
                    <div style="font-size:var(--fs-sm);font-weight:700;color:var(--primary);">
                      IPCA 12 meses acumulado: {taxaIpca?.toFixed(2)}%
                    </div>
                    <div class="muted" style="font-size:var(--fs-xs);margin-top:2px;">
                      Fonte: Banco Central do Brasil ({ipcaData})
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div class="form-group">
            <label class="form-label">Se uma conta não teve gasto/receita real em algum mês: *</label>
            <div style="display:flex;flex-direction:column;gap:6px;font-size:var(--fs-sm);">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input
                  type="radio"
                  name="regra"
                  checked={regraFaltante === "usar_projecao"}
                  onChange={() => setRegraFaltante("usar_projecao")}
                />
                <span>Usar o valor da projeção original como base para o reajuste</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input
                  type="radio"
                  name="regra"
                  checked={regraFaltante === "zerar"}
                  onChange={() => setRegraFaltante("zerar")}
                />
                <span>Deixar zerado (R$ 0,00) naquele mês</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="rep-banca">Banca Inicial de {anoDestino} (R$) *</label>
            <input
              id="rep-banca"
              type="number"
              step="0.01"
              class="input"
              required
              value={bancaDestino}
              onInput={(e) => setBancaDestino(Number(e.currentTarget.value))}
            />
            <span class="muted" style="font-size:var(--fs-xs);">
              Sugerido: Saldo final real em conta de {anoAtual} ({money(saldoFinalRealAtual)})
            </span>
          </div>
        </form>
      ) : (
        /* ================= ETAPA DE PRÉVIA ================= */
        <div class="stack" style="gap:var(--sp-3);">
          <div class="card" style="padding:var(--sp-3);background:var(--surface);">
            <div style="font-size:var(--fs-xs);color:var(--text-muted);text-transform:uppercase;font-weight:700;">
              Resumo do Reajuste Aplicado: +{plano?.taxaPercentual.toFixed(2)}%
            </div>
            <div class="grid grid--2" style="margin-top:var(--sp-2);">
              {NATUREZAS.map((n) => {
                const meta = NATURE_META[n];
                const antes = plano?.totalOriginalGeral[n] || 0;
                const depois = plano?.totalReajustadoGeral[n] || 0;
                const diff = depois - antes;
                return (
                  <div key={n} class="stat">
                    <div class="stat__label"><i class="dot" style={`background:var(--${meta.tone})`} />{meta.label}</div>
                    <div class="stat__value num">{money(depois)}</div>
                    <div class="stat__sub num">Antes: {money(antes)} ({signed(diff)})</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style="font-size:var(--fs-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;">
            Detalhamento por Conta ({plano?.itens.length} contas)
          </div>

          <div class="table-wrap" style="max-height:280px;overflow-y:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>Natureza</th>
                  <th>Total Base</th>
                  <th>Novo Total</th>
                  <th>Diferença</th>
                </tr>
              </thead>
              <tbody>
                {plano?.itens.map((it) => {
                  const meta = NATURE_META[it.natureza];
                  const diff = it.totalReajustado - it.totalOriginal;
                  return (
                    <tr key={it.contaId}>
                      <td style="font-weight:600;">{it.contaNome}</td>
                      <td><span class={`badge badge--${meta.tone}`}>{meta.label}</span></td>
                      <td class="num">{money(it.totalOriginal)}</td>
                      <td class="num" style="font-weight:700;">{money(it.totalReajustado)}</td>
                      <td class={`num ${diff >= 0 ? "tone-in" : "tone-out"}`}>{signed(diff)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
