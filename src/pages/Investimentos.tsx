import { useState, useEffect } from "preact/hooks";
import { Icon } from "../components/Icon.tsx";
import { CarteiraAcoesView } from "../components/investimento/CarteiraAcoesView.tsx";
import { HotMarketView } from "../components/investimento/HotMarketView.tsx";
import { ModalOperacaoInvestimento } from "../components/investimento/ModalOperacaoInvestimento.tsx";
import { calcularCarteiraInvestimentos } from "../data/calcInvestimentos.ts";
import { anos, empresas, operacoesInvestimento } from "../data/repo.ts";
import type { LongTermAnalysis } from "../data/types.ts";
import { useLive } from "../data/useLive.ts";
import { fetchHotlist, searchTicker } from "../lib/marketApi.ts";
import { anoAtivo, empresaAtiva } from "../state.ts";

export function Investimentos() {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  const [abaAtiva, setAbaAtiva] = useState<"carteira" | "hotmarket">(() => {
    return (localStorage.getItem("finansys_investimentos_aba") as "carteira" | "hotmarket") || "carteira";
  });

  const [modalOperacaoAberta, setModalOperacaoAberta] = useState<boolean>(false);
  const [marketQuotesMap, setMarketQuotesMap] = useState<Map<string, LongTermAnalysis>>(new Map());
  const [taxaCambioUsd, setTaxaCambioUsd] = useState<number>(5.35);
  const [carregandoMercado, setCarregandoMercado] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const trocarAba = (aba: "carteira" | "hotmarket") => {
    setAbaAtiva(aba);
    localStorage.setItem("finansys_investimentos_aba", aba);
  };

  // Carrega cotações e inteligência do radar de mercado
  const carregarCotacoesMercado = async (forceRefresh = false) => {
    setCarregandoMercado(true);
    try {
      const res = await fetchHotlist(forceRefresh);
      setMarketQuotesMap((prev) => {
        const map = new Map(prev);
        for (const it of res.items) {
          map.set(it.symbol, it);
          map.set(it.symbol.replace(".SA", ""), it);
        }
        return map;
      });

      // Busca taxa de câmbio USD/BRL
      try {
        const usdData = await searchTicker("USDBRL=X");
        if (usdData && usdData.price > 0) {
          setTaxaCambioUsd(usdData.price);
        }
      } catch (_cambioErr) {
        // Mantém fallback seguro
      }
    } catch (err) {
      console.warn("[Investimentos] Falha ao sincronizar cotações:", err);
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

  // Efeito ativo para buscar cotações de TODOS os ativos presentes na carteira do investidor
  useEffect(() => {
    if (!dados || !dados.ops || dados.ops.length === 0) return;

    const tickers = Array.from(new Set(dados.ops.map((o) => (o.ticker || "").trim().toUpperCase()))).filter(Boolean);
    const faltantes = tickers.filter((sym) => {
      const clean = sym.replace(".SA", "");
      return !marketQuotesMap.has(clean) && !marketQuotesMap.has(sym);
    });

    if (faltantes.length > 0) {
      Promise.allSettled(faltantes.map((sym) => searchTicker(sym))).then((results) => {
        setMarketQuotesMap((prev) => {
          const next = new Map(prev);
          for (const res of results) {
            if (res.status === "fulfilled" && res.value) {
              const it = res.value;
              next.set(it.symbol, it);
              next.set(it.symbol.replace(".SA", ""), it);
            }
          }
          return next;
        });
      });
    }
  }, [dados?.ops, marketQuotesMap.size]);

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

  // Cálculo consolidado da carteira com base nas operações, cotações em tempo real e taxa cambial
  const carteiraConsolidada = calcularCarteiraInvestimentos(ops, marketQuotesMap, taxaCambioUsd);

  return (
    <>
      {/* Cabeçalho Institucional da Página */}
      <div class="page-head">
        <div>
          <h1>Ações & Investimentos</h1>
          <p>
            {abaAtiva === "carteira"
              ? "Gestão de Ativos de Longo Prazo, Retorno Consolidado, Preço Médio e Efeito Bola de Neve"
              : "Radar de Mercado: Oportunidades Globais de Valor e Dividendos (Bazin, Graham e Barsi)"}
          </p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items: center;">
          <button
            type="button"
            class="btn btn--secondary btn--sm"
            onClick={() => carregarCotacoesMercado(true)}
            disabled={carregandoMercado}
            title="Atualizar cotações e dividendos em tempo real"
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

      {/* Switcher Executivo de Abas */}
      <div style="display: flex; gap: 8px; margin-bottom: var(--sp-4); flex-wrap: wrap;">
        <button
          type="button"
          class={`btn ${abaAtiva === "carteira" ? "btn--primary" : "btn--secondary"}`}
          onClick={() => trocarAba("carteira")}
        >
          <Icon name="chart" /> Minha Carteira ({carteiraConsolidada.posicoes.length} {carteiraConsolidada.posicoes.length === 1 ? "ativo" : "ativos"})
        </button>

        <button
          type="button"
          class={`btn ${abaAtiva === "hotmarket" ? "btn--primary" : "btn--secondary"}`}
          onClick={() => trocarAba("hotmarket")}
        >
          <Icon name="sparkles" /> Radar de Mercado & Oportunidades
        </button>
      </div>

      {/* Conteúdo da Aba Selecionada */}
      {abaAtiva === "carteira" ? (
        <CarteiraAcoesView
          carteira={carteiraConsolidada}
          operacoes={ops}
          empresaId={emp.id}
          anoId={ano?.id}
          cambioUsd={taxaCambioUsd}
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
