import { useState } from "react";
import { MobileTopBar } from "../components/mobile/MobileTopBar.tsx";
import { MobileNavBar } from "../components/mobile/MobileNavBar.tsx";
import { ModalAuth } from "../components/ModalAuth.tsx";
import { ModalBloqueioInatividade } from "../components/ModalBloqueioInatividade.tsx";
import { ModalConfirm } from "../components/ModalConfirm.tsx";
import { ModalSessionRevoked } from "../components/ModalSessionRevoked.tsx";
import { PainelNotificacoes, useDiagnosticoFinanceiro } from "../components/PainelNotificacoes.tsx";
import { ToastContainer } from "../components/Toast.tsx";
import { anos, contas, contasBancarias, empresas, lancamentos, reservas, reservaMovimentos } from "../data/repo.ts";
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

    const [cs, ls, resList, movList, bancos] = await Promise.all([
      contas.byEmpresa(empId),
      lancamentos.byAno(ano.id),
      reservas.byEmpresa(empId),
      reservaMovimentos.byAno(ano.id),
      contasBancarias.byEmpresa(empId),
    ]);

    return { ano, cs, ls, resList, movList, bancos };
  }, [empId, anoNum], null);

  // Cálculos do Dashboard Home
  const cs = dadosHome?.cs || [];
  const ls = dadosHome?.ls || [];
  const resList = dadosHome?.resList || [];
  const movList = dadosHome?.movList || [];
  const ano = dadosHome?.ano;

  const contaMap = new Map(cs.map((c) => [c.id, c]));
  let totEntradasReal = 0;
  let totSaidasReal = 0;
  for (const l of ls) {
    const c = contaMap.get(l.contaId);
    if (c) {
      if (c.natureza === "receber" || c.natureza === "aporte") totEntradasReal += l.valor;
      else totSaidasReal += l.valor;
    }
  }

  const saldoFinalReal = (ano?.bancaInicial || 0) + (totEntradasReal - totSaidasReal);

  const reservasSaldosMap = new Map<string, number>();
  let totalReservas = 0;
  for (const r of resList) {
    const inicial = r.saldoInicialCentavos || 0;
    const movs = movList.filter((m) => m.reservaId === r.id);
    let saldo = inicial;
    for (const m of movs) {
      if (m.tipo === "aporte" || m.tipo === "rendimento") saldo += m.valor;
      else if (m.tipo === "resgate") saldo -= m.valor;
    }
    reservasSaldosMap.set(r.id, saldo);
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
        catNome: "Geral",
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
        saldoFinalProj={saldoFinalReal}
        totEntradasReal={totEntradasReal}
        totSaidasReal={totSaidasReal}
        patrimonioConsolidado={patrimonioConsolidado}
        reservasTotal={totalReservas}
        reservas={resList}
        reservasSaldos={reservasSaldosMap}
        ultimosLancamentos={ultimosLancamentosMobile}
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
