import { useState, useEffect } from "preact/hooks";
import { Icon } from "../Icon.tsx";
import { Modal } from "../Modal.tsx";
import { searchTicker } from "../../lib/marketApi.ts";
import type { OperacaoInvestimento, TipoOperacaoInvestimento } from "../../data/types.ts";

interface Props {
  isOpen: boolean;
  operacao?: OperacaoInvestimento | null;
  tickerInicial?: string;
  empresaId: string;
  anoId?: string;
  onClose: () => void;
  onSave: (dados: Omit<OperacaoInvestimento, "id" | "createdAt" | "updatedAt" | "deletedAt">) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export function ModalOperacaoInvestimento({
  isOpen,
  operacao,
  tickerInicial = "",
  empresaId,
  anoId,
  onClose,
  onSave,
  onDelete,
}: Props) {
  if (!isOpen) return null;

  const [tipo, setTipo] = useState<TipoOperacaoInvestimento>(operacao?.tipo || "compra");
  const [ticker, setTicker] = useState<string>(operacao?.ticker || tickerInicial || "");
  const [nome, setNome] = useState<string>(operacao?.nome || "");
  const [data, setData] = useState<string>(operacao?.data || new Date().toISOString().split("T")[0]);
  const [quantidadeStr, setQuantidadeStr] = useState<string>(operacao ? String(operacao.quantidade) : "10");
  const [precoStr, setPrecoStr] = useState<string>(
    operacao ? (operacao.precoUnitarioCentavos / 100).toFixed(2).replace(".", ",") : ""
  );
  const [taxasStr, setTaxasStr] = useState<string>(
    operacao && operacao.taxasCentavos ? (operacao.taxasCentavos / 100).toFixed(2).replace(".", ",") : "0,00"
  );
  const [moeda, setMoeda] = useState<"BRL" | "USD">(operacao?.moeda || "BRL");
  const [corretora, setCorretora] = useState<string>(operacao?.corretora || "");
  const [obs, setObs] = useState<string>(operacao?.obs || "");
  const [salvando, setSalvando] = useState<boolean>(false);
  const [buscandoTicker, setBuscandoTicker] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  // Auto-busca informações do ticker ao digitar
  useEffect(() => {
    const clean = ticker.trim().toUpperCase();
    if (!clean || clean.length < 2) return;

    // Detecta se é B3 ou Internacional
    const isB3 = /^[A-Z]{4}(3|4|5|6|11|12|32|33|34|35)$/.test(clean) || clean.endsWith(".SA");
    setMoeda(isB3 ? "BRL" : "USD");

    // Se estiver criando nova operação e ainda não tiver preço/nome
    if (!operacao) {
      const timer = setTimeout(async () => {
        try {
          setBuscandoTicker(true);
          const info = await searchTicker(clean);
          if (info) {
            if (!nome) setNome(info.name);
            if (!precoStr) setPrecoStr(info.price.toFixed(2).replace(".", ","));
            setMoeda(info.currency === "USD" ? "USD" : "BRL");
          }
        } catch (_err) {
          // Ativo não encontrado de imediato, usuário pode preencher manualmente
        } finally {
          setBuscandoTicker(false);
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [ticker]);

  // Função auxiliar para conversão financeira tolerante a vírgula e ponto decimal
  const parseMoney = (str: string): number => {
    const limpo = (str || "").trim();
    if (!limpo) return 0;
    if (limpo.includes(",")) {
      return parseFloat(limpo.replace(/\./g, "").replace(",", ".")) || 0;
    }
    return parseFloat(limpo) || 0;
  };

  // Cálculos de Total
  const qtdNum = parseFloat(quantidadeStr.replace(",", ".")) || 0;
  const precoNum = parseMoney(precoStr);
  const taxasNum = parseMoney(taxasStr);
  const totalFinanceiro = qtdNum * precoNum + (tipo === "compra" ? taxasNum : -taxasNum);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const sym = ticker.trim().toUpperCase();
    if (!sym) {
      setErro("Informe o código (ticker) da ação.");
      return;
    }
    if (qtdNum <= 0) {
      setErro("A quantidade de cotas deve ser maior que zero.");
      return;
    }
    if (precoNum <= 0) {
      setErro("O preço unitário pago deve ser maior que zero.");
      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      await onSave({
        empresaId,
        anoId,
        ticker: sym,
        nome: nome.trim() || sym,
        tipo,
        data,
        quantidade: qtdNum,
        precoUnitarioCentavos: Math.round(precoNum * 100),
        taxasCentavos: Math.round(taxasNum * 100),
        moeda,
        corretora: corretora.trim() || undefined,
        obs: obs.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setErro(err?.message || "Erro ao salvar operação.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title={operacao ? "Editar Operação de Ações" : "Registrar Nova Operação de Ações"}
      onClose={onClose}
      size="md"
    >
      <form onSubmit={handleSubmit} class="stack" style="gap: var(--sp-3);">
        {/* Tipo de Operação (Compra ou Venda) */}
        <div style="display: flex; gap: 8px;">
          <button
            type="button"
            class={`btn ${tipo === "compra" ? "btn--primary" : "btn--secondary"}`}
            style={{ flex: 1, ...(tipo === "compra" ? { background: "var(--in)", borderColor: "var(--in)" } : {}) }}
            onClick={() => setTipo("compra")}
          >
            <Icon name="arrowDown" /> Compra (Aporte)
          </button>
          <button
            type="button"
            class={`btn ${tipo === "venda" ? "btn--primary" : "btn--secondary"}`}
            style={{ flex: 1, ...(tipo === "venda" ? { background: "var(--out)", borderColor: "var(--out)" } : {}) }}
            onClick={() => setTipo("venda")}
          >
            <Icon name="arrowUp" /> Venda (Desinvestimento)
          </button>
        </div>

        {/* Ticker & Nome */}
        <div style="display: grid; grid-template-columns: 140px 1fr; gap: 10px;">
          <div>
            <label class="label" style="font-size: 0.78rem;">Código / Ticker</label>
            <div style="position: relative;">
              <input
                type="text"
                class="input"
                placeholder="Ex: BBAS3, KO"
                value={ticker}
                onInput={(e) => setTicker((e.target as HTMLInputElement).value.toUpperCase())}
                style="font-weight: 700; text-transform: uppercase;"
                required
              />
              {buscandoTicker && (
                <span style="position: absolute; right: 8px; top: 8px; font-size: 0.75rem;" class="muted">
                  <Icon name="refresh" />
                </span>
              )}
            </div>
          </div>

          <div>
            <label class="label" style="font-size: 0.78rem;">Nome da Empresa / Ativo</label>
            <input
              type="text"
              class="input"
              placeholder="Ex: Banco do Brasil, Coca-Cola..."
              value={nome}
              onInput={(e) => setNome((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>

        {/* Data & Quantidade & Preço Unitário */}
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
          <div>
            <label class="label" style="font-size: 0.78rem;">Data do Pregão</label>
            <input
              type="date"
              class="input"
              value={data}
              onInput={(e) => setData((e.target as HTMLInputElement).value)}
              required
            />
          </div>

          <div>
            <label class="label" style="font-size: 0.78rem;">Quantidade de Cotas</label>
            <input
              type="text"
              class="input num"
              placeholder="Ex: 100"
              value={quantidadeStr}
              onInput={(e) => setQuantidadeStr((e.target as HTMLInputElement).value)}
              required
            />
          </div>

          <div>
            <label class="label" style="font-size: 0.78rem;">Preço por Cota ({moeda === "BRL" ? "R$" : "$"})</label>
            <input
              type="text"
              class="input num"
              placeholder="0,00"
              value={precoStr}
              onInput={(e) => setPrecoStr((e.target as HTMLInputElement).value)}
              required
            />
          </div>
        </div>

        {/* Taxas & Moeda & Corretora */}
        <div style="display: grid; grid-template-columns: 1fr 100px 1fr; gap: 10px;">
          <div>
            <label class="label" style="font-size: 0.78rem;">Taxas / Corretagem</label>
            <input
              type="text"
              class="input num"
              placeholder="0,00"
              value={taxasStr}
              onInput={(e) => setTaxasStr((e.target as HTMLInputElement).value)}
            />
          </div>

          <div>
            <label class="label" style="font-size: 0.78rem;">Moeda</label>
            <select
              class="select"
              value={moeda}
              onChange={(e) => setMoeda((e.target as HTMLSelectElement).value as any)}
            >
              <option value="BRL">R$ BRL</option>
              <option value="USD">$ USD</option>
            </select>
          </div>

          <div>
            <label class="label" style="font-size: 0.78rem;">Corretora / Banco</label>
            <input
              type="text"
              class="input"
              placeholder="Ex: NuInvest, XP, Avenue..."
              value={corretora}
              onInput={(e) => setCorretora((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>

        {/* Observações */}
        <div>
          <label class="label" style="font-size: 0.78rem;">Anotações / Estratégia</label>
          <input
            type="text"
            class="input"
            placeholder="Ex: Aporte mensal Barsi, abaixo do Preço Teto..."
            value={obs}
            onInput={(e) => setObs((e.target as HTMLInputElement).value)}
          />
        </div>

        {/* Card Resumo do Total */}
        <div
          class="card"
          style="background: var(--surface-bg); padding: 12px; border-radius: var(--rad-md); display: flex; justify-content: space-between; align-items: center;"
        >
          <div>
            <div class="muted" style="font-size: 0.75rem;">Total Financeiro da Operação:</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: tipo === 'compra' ? 'var(--in)' : 'var(--out)';">
              {moeda === "BRL" ? "R$ " : "$ "}
              {totalFinanceiro.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <span class="badge" style="font-size: 0.72rem;">
            {qtdNum} cotas a {moeda === "BRL" ? "R$ " : "$ "}
            {precoNum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {erro && (
          <div style="color: var(--out); font-size: 0.82rem; display: flex; align-items: center; gap: 6px;">
            <Icon name="alertTriangle" style="width: 14px; height: 14px;" /> {erro}
          </div>
        )}

        {/* Botões do Rodapé */}
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: var(--sp-2); border-top: 1px solid var(--border);">
          {operacao && onDelete ? (
            <button
              type="button"
              class="btn btn--danger btn--sm"
              onClick={async () => {
                if (confirm(`Deseja realmente excluir esta operação de ${operacao.ticker}?`)) {
                  await onDelete(operacao.id);
                  onClose();
                }
              }}
            >
              <Icon name="trash" /> Excluir
            </button>
          ) : <div />}

          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn--secondary" onClick={onClose} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" class="btn btn--primary" disabled={salvando}>
              <Icon name="check" /> {salvando ? "Salvando..." : "Confirmar Operação"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
