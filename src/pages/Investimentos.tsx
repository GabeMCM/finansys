import { useState, useEffect } from "preact/hooks";
import { Icon } from "../components/Icon.tsx";
import { CarteiraAcoesView } from "../components/investimento/CarteiraAcoesView.tsx";
import { HotMarketView } from "../components/investimento/HotMarketView.tsx";
import { ModalOperacaoInvestimento } from "../components/investimento/ModalOperacaoInvestimento.tsx";
import { calcularCarteiraInvestimentos } from "../data/calcInvestimentos.ts";
import { anos, empresas, operacoesInvestimento } from "../data/repo.ts";
import type { LongTermAnalysis, OperacaoInvestimento } from "../data/types.ts";
import { useLive } from "../data/useLive.ts";
import { fetchHotlist } from "../lib/marketApi.ts";
import { anoAtivo, empresaAtiva } from "../state.ts";

export function Investimentos() {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  const [abaAtiva, setAbaAtiva] = useState<"carteira" | "hotmarket">(() => {
    return (localStorage.getItem("finansys_investimentos_aba") as "carteira" | "hotmarket") || "carteira";
  });

  const [modalOperacaoAberta, setModalOperacaoAberta] = useState<boolean>(false);
  const [marketQuotesMap, setMarketQuotesMap] = useState<Map<string, LongTermAnalysis>>(new Map());
  const [carregandoMercado, setCarregandoMercado] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const trocarAba = (aba: "carteira" | "hotmarket") => {
    setAbaAtiva(aba);
    localStorage.setItem("finansys_investimentos_aba", aba);
  };

  // Carrega cotações e inteligência do Hot Market para alimentar a carteira
  const carregarCotacoesMercado = async (forceRefresh = false) => {
    setCarregandoMercado(true);
    try {
      const res = await fetchHotlist(forceRefresh);
      const map = new Map<string, LongTermAnalysis>();
      for (const it of res.items) {
        map.set(it.symbol, it);
        map.set(it.symbol.replace(".SA", ""), it);
      }
      setMarketQuotesMap(map);
    } catch (err) {
      console.warn("[Investimentos] Aviso ao carregar cotações de mercado:", err);
    } finally {
      setCarregandoMercado(false);
    }
  };

  useEffect(() => {
    carregarCotacoesMercado(false);
  }, []);

  const dados = useLive(async () => {
    if (!empId) return null;
    const [emp, ano, ops] = await Promise.all([
      empresas.get(empId),
      anos.find(empId, anoNum),
      operacoesInvestimento.byEmpresa(empId),
    ]);
    return { emp, ano, ops } as const;
  }, [empId, anoNum, refreshKey], undefined);

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

  const { emp, ano, ops } = dados;

  // Cálculo consolidado da carteira com base nas operações e cotações ao vivo
  const carteiraConsolidada = calcularCarteiraInvestimentos(ops, marketQuotesMap);

  return (
    <>
      {/* Cabeçalho da Página */}
      <div class="page-head">
        <div>
          <h1>Ações & Investimentos</h1>
          <p>
            {abaAtiva === "carteira"
              ? "Gestão de Carteira de Longo Prazo, Preço Médio, Yield on Cost e Efeito Bola de Neve"
              : "Hot 100 Diário: Melhores Oportunidades Mundiais (Barsi, Bazin 6% B3 / 2,5% Global e Graham)"}
          </p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button
            type="button"
            class="btn btn--secondary btn--sm"
            onClick={() => carregarCotacoesMercado(true)}
            disabled={carregandoMercado}
            title="Atualiza cotações e dividendos em tempo real"
          >
            <Icon name="refresh" />
            {carregandoMercado ? "Atualizando..." : "Sincronizar Cotações"}
          </button>

          <button
            type="button"
            class="btn btn--primary"
            onClick={() => setModalOperacaoAberta(true)}
          >
            <Icon name="plus" /> Registrar Compra / Venda
          </button>
        </div>
      </div>

      {/* Switcher de Visão Superior */}
      <div style="display: flex; gap: 8px; margin-bottom: var(--sp-4); flex-wrap: wrap;">
        <button
          type="button"
          class={`btn ${abaAtiva === "carteira" ? "btn--primary" : "btn--secondary"}`}
          onClick={() => trocarAba("carteira")}
          style={
            abaAtiva === "carteira"
              ? {
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: "#fff",
                  borderColor: "#059669",
                  boxShadow: "0 2px 8px rgba(16, 185, 129, 0.25)",
                }
              : {}
          }
        >
          <Icon name="chart" /> Minha Carteira ({carteiraConsolidada.posicoes.length} ativos)
        </button>

        <button
          type="button"
          class={`btn ${abaAtiva === "hotmarket" ? "btn--primary" : "btn--secondary"}`}
          onClick={() => trocarAba("hotmarket")}
          style={
            abaAtiva === "hotmarket"
              ? {
                  background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                  color: "#fff",
                  borderColor: "#d97706",
                  boxShadow: "0 2px 8px rgba(245, 158, 11, 0.25)",
                }
              : {}
          }
        >
          <Icon name="sparkles" /> 🔥 Hot Market & Análise de Ações
        </button>
      </div>

      {/* Conteúdo da Aba Selecionada */}
      {abaAtiva === "carteira" ? (
        <CarteiraAcoesView
          carteira={carteiraConsolidada}
          operacoes={ops}
          empresaId={emp.id}
          anoId={ano?.id}
          onRefresh={() => setRefreshKey((k) => k + 1)}
        />
      ) : (
        <HotMarketView />
      )}

      {/* Modal de Registro de Operação Global */}
      {modalOperacaoAberta && (
        <ModalOperacaoInvestimento
          isOpen={true}
          empresaId={emp.id}
          anoId={ano?.id}
          onClose={() => setModalOperacaoAberta(false)}
          onSave={async (dadosOp) => {
            await operacoesInvestimento.create(dadosOp);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}
