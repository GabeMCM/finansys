import { useState } from "react";
import { MobileTopBar } from "../components/mobile/MobileTopBar.tsx";
import { MobileNavBar } from "../components/mobile/MobileNavBar.tsx";
import { ModalAuth } from "../components/ModalAuth.tsx";
import { ModalBloqueioInatividade } from "../components/ModalBloqueioInatividade.tsx";
import { ModalConfirm } from "../components/ModalConfirm.tsx";
import { ModalSessionRevoked } from "../components/ModalSessionRevoked.tsx";
import { PainelNotificacoes, useDiagnosticoFinanceiro } from "../components/PainelNotificacoes.tsx";
import { ToastContainer } from "../components/Toast.tsx";
import { anos, categorias, contas, contasBancarias, empresas, lancamentos, projecoes, reservas, reservaMovimentos } from "../data/repo.ts";
import { calcular, calcularPendencias } from "../data/calc.ts";
import { useLive } from "../data/useLive.ts";
import { anoAtivo, empresaAtiva } from "../state.ts";

import { MobileHomeView, type MobileLancamentoItem } from "../components/mobile/MobileHomeView.tsx";
import { MobileExtrato } from "./views/MobileExtrato.tsx";
import { MobileNovoLancamento } from "./views/MobileNovoLancamento.tsx";
import { MobileMetas } from "./views/MobileMetas.tsx";
import { MobileCaixinhas } from "./views/MobileCaixinhas.tsx";
import { MobileInvestimentos } from "./views/MobileInvestimentos.tsx";
import { MobileRelatorios } from "./views/MobileRelatorios.tsx";
import { MobileAjustes } from "./views/MobileAjustes.tsx";
import { useSignal } from "../lib/signal.ts";

export function MobileShell({ route }: { route: string }) {
  const empId = useSignal(empresaAtiva);
  const anoNum = useSignal(anoAtivo);

  const listaEmpresas = useLive(() => empresas.list(), [], []);
  const listaAnos = useLive(() => (empId ? anos.byEmpresa(empId) : Promise.resolve([])), [empId], []);
  const { resumo } = useDiagnosticoFinanceiro(empId, anoNum);

  const [authModalAberta, setAuthModalAberta] = useState(false);
  const [painelNotifAberto, setPainelNotifAberto] = useState(false);

  // Dados consolidados para o Home
  const dadosHome = useLive(async () => {
    if (!empId) return null;
    const ano = await anos.find(empId, anoNum);
    if (!ano) return null;

    const [cs, ls, ps, cats, resList, movList, bancos] = await Promise.all([
      contas.byEmpresa(empId),
      lancamentos.byAno(ano.id),
      projecoes.byAno(ano.id),
      categorias.byEmpresa(empId),
      reservas.byEmpresa(empId),
      reservaMovimentos.byAno(ano.id),
      contasBancarias.byEmpresa(empId),
    ]);

    return { ano, cs, ls, ps, cats, resList, movList, bancos };
  }, [empId, anoNum], null);

  // Cálculos do Dashboard Home
  const cs = dadosHome?.cs || [];
  const ls = dadosHome?.ls || [];
  const ps = dadosHome?.ps || [];
  const cats = dadosHome?.cats || [];
  const resList = dadosHome?.resList || [];
  const movList = dadosHome?.movList || [];
  const bancos = dadosHome?.bancos || [];
  const ano = dadosHome?.ano;

  const hoje = new Date();
  const mesRef = ano ? (ano.ano < hoje.getFullYear() ? 11 : ano.ano > hoje.getFullYear() ? -1 : hoje.getMonth()) : 0;
  const idx = Math.max(0, mesRef);

  const contaMap = new Map(cs.map((c) => [c.id, c]));
  const catMap = new Map(cats.map((c) => [c.id, c.nome]));

  let totEntradasReal = 0;
  let totSaidasReal = 0;
  for (const l of ls) {
    const c = contaMap.get(l.contaId);
    if (c) {
      if (c.natureza === "receber" || c.natureza === "aporte") totEntradasReal += l.valor;
      else totSaidasReal += l.valor;
    }
  }

  // Motor de cálculo completo para saldo, projeções e gráfico de 12 meses
  const r = ano ? calcular(ano.bancaInicial, cs, ps, ls, mesRef) : null;
  const saldoFinalReal = r ? r.saldoReal[idx] : (ano?.bancaInicial || 0) + (totEntradasReal - totSaidasReal);
  const saldoFinalProj = r ? r.saldoProj[idx] : saldoFinalReal;
  const desvio = saldoFinalReal - saldoFinalProj;

  // Pendências financeiras a vencer/vencidas
  const pendencias = ano ? calcularPendencias(ps, ls, ano.ano, idx, hoje) : [];

  // Controle de teto orçamentário por categoria
  const catDespesas = cats.filter((c) => c.natureza === "pagar" || c.natureza === "saida");
  const controleTeto = catDespesas.map((cat) => {
    const contasDestaCat = cs.filter((c) => c.categoriaId === cat.id);
    const cIds = new Set(contasDestaCat.map((c) => c.id));
    const proj = ps.filter((p) => cIds.has(p.contaId) && p.mes === idx).reduce((s, p) => s + p.valor, 0);
    const real = ls.filter((l) => cIds.has(l.contaId) && l.mes === idx).reduce((s, l) => s + l.valor, 0);
    const pct = proj > 0 ? Math.round((real / proj) * 100) : (real > 0 ? 100 : 0);
    const status: "estourado" | "alerta" | "sem_teto" | "ok" =
      proj === 0 && real > 0 ? "sem_teto" : real > proj ? "estourado" : pct >= 80 ? "alerta" : "ok";
    return { cat, proj, real, pct, status, excesso: real - proj };
  }).filter((item) => item.proj > 0 || item.real > 0)
    .sort((a, b) => {
      const peso: Record<string, number> = { estourado: 3, alerta: 2, sem_teto: 1, ok: 0 };
      return (peso[b.status] - peso[a.status]) || (b.pct - a.pct) || (b.real - a.real);
    });

  const reservasSaldosMap = new Map<string, number>();
  let totalReservas = 0;
  for (const rItem of resList) {
    const inicial = rItem.saldoInicialCentavos || 0;
    const movs = movList.filter((m) => m.reservaId === rItem.id);
    let saldo = inicial;
    for (const m of movs) {
      if (m.tipo === "aporte" || m.tipo === "rendimento") saldo += m.valor;
      else if (m.tipo === "resgate") saldo -= m.valor;
    }
    reservasSaldosMap.set(rItem.id, saldo);
    totalReservas += saldo;
  }

  const patrimonioConsolidado = saldoFinalReal + totalReservas;

  const ultimosLancamentosMobile: MobileLancamentoItem[] = [...ls]
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, 5)
    .map((l) => {
      const c = contaMap.get(l.contaId);
      return {
        id: l.id,
        data: l.data,
        valor: l.valor,
        descricao: l.descricao,
        contaNome: c?.nome || "Lançamento",
        catNome: c ? (catMap.get(c.categoriaId) || "Geral") : "Geral",
        natureza: c?.natureza || "saida",
      };
    });

  // Render da view ativa
  let currentView;
  if (route === "/realizacoes/novo" || route === "/lancamentos/novo") {
    currentView = (
      <MobileNovoLancamento
        onSuccess={() => {
          window.location.hash = "#/realizacoes";
        }}
        onCancel={() => {
          window.history.back();
        }}
      />
    );
  } else if (route.startsWith("/realizacoes") || route.startsWith("/lancamentos")) {
    currentView = (
      <MobileExtrato
        onOpenNovo={() => {
          window.location.hash = "#/realizacoes/novo";
        }}
      />
    );
  } else if (route.startsWith("/projecoes")) {
    currentView = <MobileMetas />;
  } else if (route.startsWith("/investimentos")) {
    currentView = <MobileInvestimentos />;
  } else if (route.startsWith("/reservas")) {
    currentView = <MobileCaixinhas />;
  } else if (route.startsWith("/relatorios")) {
    currentView = <MobileRelatorios />;
  } else if (route.startsWith("/ajustes")) {
    currentView = <MobileAjustes onOpenAuth={() => setAuthModalAberta(true)} />;
  } else {
    currentView = (
      <MobileHomeView
        saldoFinalReal={saldoFinalReal}
        saldoFinalProj={saldoFinalProj}
        desvio={desvio}
        totEntradasReal={totEntradasReal}
        totSaidasReal={totSaidasReal}
        patrimonioConsolidado={patrimonioConsolidado}
        reservasTotal={totalReservas}
        reservas={resList}
        reservasSaldos={reservasSaldosMap}
        ultimosLancamentos={ultimosLancamentosMobile}
        resultadoProj={r?.resultadoProj}
        resultadoReal={r?.resultadoReal}
        mesRef={idx}
        pendencias={pendencias}
        controleTeto={controleTeto}
        contas={cs}
        categorias={cats}
        bancos={bancos}
        anoId={ano?.id}
        anoNum={ano?.ano}
        onVerRelatorioCompleto={() => {
          window.location.hash = "#/relatorios";
        }}
      />
    );
  }

  const hideTopAndBottomNav = route === "/realizacoes/novo" || route === "/lancamentos/novo";

  return (
    <div class="shell" style="min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);">
      {/* Top Bar Nativa de Banco Digital */}
      {!hideTopAndBottomNav && (
        <MobileTopBar
          empresas={listaEmpresas}
          anos={listaAnos}
          notifCount={resumo.total}
          hasCriticos={resumo.criticos > 0}
          onOpenNotif={() => setPainelNotifAberto(!painelNotifAberto)}
          onOpenAuth={() => setAuthModalAberta(true)}
        />
      )}

      {/* Conteúdo Principal com Rolagem Suave */}
      <main class="main" style="flex:1 0 auto;padding-top:14px;box-sizing:border-box;">
        {currentView}
      </main>

      {/* Painel de Notificações / Diagnósticos */}
      {painelNotifAberto && (
        <div class="notif-backdrop" onClick={() => setPainelNotifAberto(false)} />
      )}
      <PainelNotificacoes
        isOpen={painelNotifAberto}
        isPinned={false}
        onClose={() => setPainelNotifAberto(false)}
        onTogglePin={() => {}}
      />

      {/* Bottom Navigation de 5 Abas */}
      {!hideTopAndBottomNav && <MobileNavBar route={route} />}

      {/* Modais Globais de Sistema */}
      <ModalAuth isOpen={authModalAberta} onClose={() => setAuthModalAberta(false)} />
      <ModalBloqueioInatividade />
      <ModalSessionRevoked onReconectar={() => setAuthModalAberta(true)} />
      <ModalConfirm />
      <ToastContainer />
    </div>
  );
}
