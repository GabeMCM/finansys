import { useState } from "preact/hooks";
import { Icon } from "./Icon.tsx";
import { calcularPendencias } from "../data/calc.ts";
import { db } from "../data/db.ts";
import { anos, categorias, contas, empresas, reservaMovimentos, reservaProjecoes, reservas } from "../data/repo.ts";
import { type Ano, type Conta, type Empresa, SINAL } from "../data/types.ts";
import { useLive } from "../data/useLive.ts";
import { money, MONTHS } from "../lib/format.ts";
import { anoAtivo, empresaAtiva } from "../state.ts";

export type SeveridadeAlerta = "critica" | "alta" | "aviso" | "info";
export type CategoriaAlerta = "orcamento" | "despesa" | "reserva" | "vencimento";

export interface AlertaDiagnostico {
  id: string;
  categoria: CategoriaAlerta;
  severidade: SeveridadeAlerta;
  titulo: string;
  descricao: string;
  valorDestaque?: number;
  porcentagem?: number;
  linkHref: string;
  linkLabel: string;
}

export function useDiagnosticoFinanceiro(empresaId: string | null, anoNum: number) {
  return useLive(async () => {
    if (!empresaId) return { alertas: [], resumo: { criticos: 0, avisos: 0, total: 0 } };

    const anoObj = await anos.find(empresaId, anoNum);
    if (!anoObj) return { alertas: [], resumo: { criticos: 0, avisos: 0, total: 0 } };

    const [cs, cats, ps, ls, resList, projsResList, movsResList] = await Promise.all([
      contas.byEmpresa(empresaId),
      categorias.byEmpresa(empresaId),
      db.projecoes.where("anoId").equals(anoObj.id).filter((p) => !p.deletedAt).toArray(),
      db.lancamentos.where("anoId").equals(anoObj.id).filter((l) => !l.deletedAt).toArray(),
      reservas.byEmpresa(empresaId),
      reservaProjecoes.byAno(anoObj.id),
      db.reservaMovimentos.where("empresaId").equals(empresaId).filter((m) => !m.deletedAt).toArray(),
    ]);

    const hoje = new Date();
    const anoAtualSistema = hoje.getFullYear();
    const mesAtualSistema = hoje.getMonth(); // 0 a 11
    const diaAtualSistema = hoje.getDate();

    // Se o ano analisado for o corrente, usa o mês atual; caso contrário, analisa o último mês (dezembro) ou mês de interesse
    const mesAnalise = anoNum === anoAtualSistema ? mesAtualSistema : 11;
    const mesFormatado = `${anoNum}-${String(mesAnalise + 1).padStart(2, "0")}`;
    const nomeMesAnalise = MONTHS[mesAnalise];

    const alertas: AlertaDiagnostico[] = [];

    // Mapeamentos
    const contaMap = new Map<string, Conta>(cs.map((c) => [c.id, c]));

    // 1. Alerta Orçamentário Global: Projeções de pagar superando receber no mês
    let totalProjReceber = 0;
    let totalProjPagar = 0;

    for (const p of ps) {
      if (p.mes !== mesAnalise || !p.valor) continue;
      const c = contaMap.get(p.contaId);
      if (!c) continue;
      const sinal = SINAL[c.natureza] || 1;
      if (sinal === 1) totalProjReceber += p.valor;
      else if (sinal === -1) totalProjPagar += p.valor;
    }

    if (totalProjPagar > totalProjReceber && totalProjPagar > 0) {
      const deficit = totalProjPagar - totalProjReceber;
      alertas.push({
        id: `deficit-orcamento-${mesAnalise}`,
        categoria: "orcamento",
        severidade: "critica",
        titulo: `Déficit Orçamentário em ${nomeMesAnalise}`,
        descricao: `O total projetado a pagar (${money(totalProjPagar)}) supera o total a receber (${money(totalProjReceber)}) em ${money(deficit)}.`,
        valorDestaque: deficit,
        linkHref: "#/projecoes",
        linkLabel: "Revisar Projeções",
      });
    }

    // 2. Alertas de Itens Isolados: Despesas que superaram a projeção no mês
    const lancamentosMes = ls.filter((l) => l.data.startsWith(mesFormatado));

    for (const c of cs) {
      const sinal = SINAL[c.natureza] || 1;
      if (sinal !== -1) continue; // foca em contas de despesa

      const projConta = ps.find((p) => p.contaId === c.id && p.mes === mesAnalise);
      const projValor = projConta?.valor || 0;

      const realizadoConta = lancamentosMes
        .filter((l) => l.contaId === c.id)
        .reduce((sum, l) => sum + l.valor, 0);

      // Se estipulou projeção e o realizado ultrapassou a projeção
      if (projValor > 0 && realizadoConta > projValor) {
        const excesso = realizadoConta - projValor;
        const perc = Math.round((excesso / projValor) * 100);

        alertas.push({
          id: `estouro-${c.id}-${mesAnalise}`,
          categoria: "despesa",
          severidade: excesso >= 50000 || perc >= 20 ? "critica" : "alta",
          titulo: `Estouro Orçamentário: ${c.nome}`,
          descricao: `Realizado de ${money(realizadoConta)} superou a projeção (${money(projValor)}) em ${money(excesso)} (+${perc}%).`,
          valorDestaque: excesso,
          porcentagem: perc,
          linkHref: "#/realizacoes",
          linkLabel: "Ver Lançamentos",
        });
      }
    }

    // 3. Projeção de Reserva Não Realizada no Mês
    const movsMesRes = movsResList.filter((m) => m.data.startsWith(mesFormatado));

    for (const r of resList) {
      const projRes = projsResList.find((p) => p.reservaId === r.id && p.mes === mesAnalise);
      const aporteProjetado = projRes?.valorAporte || 0;

      if (aporteProjetado > 0) {
        const aporteRealizado = movsMesRes
          .filter((m) => m.reservaId === r.id && m.tipo === "aporte")
          .reduce((sum, m) => sum + m.valor, 0);

        if (aporteRealizado < aporteProjetado) {
          const pendente = aporteProjetado - aporteRealizado;
          alertas.push({
            id: `reserva-pendente-${r.id}-${mesAnalise}`,
            categoria: "reserva",
            severidade: "aviso",
            titulo: `Aporte Pendente: ${r.nome}`,
            descricao: `Meta projetada de ${money(aporteProjetado)} para ${nomeMesAnalise}. Realizado: ${money(aporteRealizado)} (falta aportar ${money(pendente)}).`,
            valorDestaque: pendente,
            linkHref: "#/reservas",
            linkLabel: "Ir para Reservas",
          });
        }
      }
    }

    // 4. Vencimentos Próximos ou Vencidos sem Pagamento no Mês
    if (anoNum === anoAtualSistema) {
      const pendencias = calcularPendencias(ps, ls, anoNum, mesAnalise, hoje);
      for (const pend of pendencias) {
        const c = contaMap.get(pend.contaId);
        if (!c || SINAL[c.natureza] !== -1) continue;

        if (pend.status === "vencida") {
          alertas.push({
            id: `vencida-${c.id}-${mesAnalise}`,
            categoria: "vencimento",
            severidade: "critica",
            titulo: `Pagamento Vencido: ${c.nome}`,
            descricao: `Venceu há ${pend.diasAtraso || 1} dia(s) (${money(pend.valorPendente)} pendentes) e ainda não possui liquidação.`,
            valorDestaque: pend.valorPendente,
            linkHref: "#/realizacoes/novo",
            linkLabel: "Lançar Pagamento",
          });
        } else if (pend.status === "a_vencer" && pend.diaEstimado - diaAtualSistema <= 5) {
          const diasFaltam = pend.diaEstimado - diaAtualSistema;
          alertas.push({
            id: `vencendo-${c.id}-${mesAnalise}`,
            categoria: "vencimento",
            severidade: "aviso",
            titulo: `Vence em Breve: ${c.nome}`,
            descricao: `Vence em ${diasFaltam <= 0 ? "hoje" : `${diasFaltam} dia(s)`} (dia ${pend.diaEstimado}/${mesAnalise + 1}). Valor: ${money(pend.valorPendente)}.`,
            valorDestaque: pend.valorPendente,
            linkHref: "#/realizacoes/novo",
            linkLabel: "Realizar Quitação",
          });
        }
      }
    }

    // Ordenação: Críticas primeiro, depois Altas, Avisos e Infos
    const ordemSev: Record<SeveridadeAlerta, number> = {
      critica: 1,
      alta: 2,
      aviso: 3,
      info: 4,
    };
    alertas.sort((a, b) => ordemSev[a.severidade] - ordemSev[b.severidade]);

    const criticos = alertas.filter((a) => a.severidade === "critica" || a.severidade === "alta").length;
    const avisos = alertas.filter((a) => a.severidade === "aviso").length;

    return {
      alertas,
      resumo: {
        criticos,
        avisos,
        total: alertas.length,
      },
    };
  }, [empresaId, anoNum], {
    alertas: [],
    resumo: { criticos: 0, avisos: 0, total: 0 },
  });
}

export interface PainelNotificacoesProps {
  isOpen: boolean;
  isPinned: boolean;
  onClose: () => void;
  onTogglePin: () => void;
}

export function PainelNotificacoes({
  isOpen,
  isPinned,
  onClose,
  onTogglePin,
}: PainelNotificacoesProps) {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  const { alertas, resumo } = useDiagnosticoFinanceiro(empId, anoNum);
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");

  if (!isOpen) return null;

  const alertasFiltrados = filtroCategoria === "todas"
    ? alertas
    : alertas.filter((a) => a.categoria === filtroCategoria);

  const getSeveridadeBadge = (sev: SeveridadeAlerta) => {
    switch (sev) {
      case "critica":
        return <span class="badge badge--out" style="font-size:0.65rem;font-weight:700;">Urgente</span>;
      case "alta":
        return <span class="badge badge--out" style="font-size:0.65rem;">Atenção</span>;
      case "aviso":
        return <span class="badge badge--warn" style="font-size:0.65rem;">Pendente</span>;
      default:
        return <span class="badge badge--neutral" style="font-size:0.65rem;">Info</span>;
    }
  };

  const getIconeCategoria = (cat: CategoriaAlerta) => {
    switch (cat) {
      case "orcamento":
        return "alertTriangle";
      case "despesa":
        return "arrowDown";
      case "reserva":
        return "wallet";
      case "vencimento":
        return "calendar";
    }
  };

  return (
    <aside
      class={`notif-panel ${isPinned ? "notif-panel--pinned" : "notif-panel--floating"}`}
      aria-label="Painel de Notificações e Diagnósticos"
    >
      {/* Cabeçalho do Painel */}
      <div class="notif-panel__head">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="notif-panel__head-icon">
            <Icon name="bell" style="width:16px;height:16px;color:var(--primary);" />
          </div>
          <div>
            <h3 class="notif-panel__title">Diagnóstico & Alertas</h3>
            <span class="muted" style="font-size:0.72rem;">
              {alertas.length} {alertas.length === 1 ? "apontamento" : "apontamentos"} para {anoNum}
            </span>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:4px;">
          {/* Botão de Fixar/Desafixar no Desktop */}
          <button
            type="button"
            class={`btn btn--icon btn--ghost btn--xs hide-mobile ${isPinned ? "is-active" : ""}`}
            onClick={onTogglePin}
            title={isPinned ? "Desafixar painel lateral" : "Fixar painel como 3ª coluna"}
            style={isPinned ? "color:var(--primary);background:var(--primary-soft);" : ""}
          >
            <Icon name="pin" style="width:14px;height:14px;" />
          </button>

          {/* Botão Fechar */}
          <button
            type="button"
            class="btn btn--icon btn--ghost btn--xs"
            onClick={onClose}
            aria-label="Fechar painel"
          >
            <Icon name="x" style="width:15px;height:15px;" />
          </button>
        </div>
      </div>

      {/* Chips de Filtragem */}
      <div class="notif-panel__filters">
        <button
          type="button"
          class={`chip chip--sm ${filtroCategoria === "todas" ? "is-active" : ""}`}
          onClick={() => setFiltroCategoria("todas")}
        >
          Todas ({alertas.length})
        </button>
        {resumo.criticos > 0 && (
          <button
            type="button"
            class={`chip chip--sm ${filtroCategoria === "despesa" ? "is-active" : ""}`}
            onClick={() => setFiltroCategoria("despesa")}
            style="color:var(--out);"
          >
            Estouros
          </button>
        )}
        <button
          type="button"
          class={`chip chip--sm ${filtroCategoria === "reserva" ? "is-active" : ""}`}
          onClick={() => setFiltroCategoria("reserva")}
        >
          Reservas
        </button>
        <button
          type="button"
          class={`chip chip--sm ${filtroCategoria === "orcamento" ? "is-active" : ""}`}
          onClick={() => setFiltroCategoria("orcamento")}
        >
          Orçamento
        </button>
      </div>

      {/* Lista de Alertas com Scroll Suave */}
      <div class="notif-panel__body">
        {alertasFiltrados.length === 0 ? (
          <div class="notif-panel__empty">
            <div class="notif-panel__empty-icon">
              <Icon name="check" style="width:24px;height:24px;color:var(--in);" />
            </div>
            <h4>Tudo sob controle!</h4>
            <p>Nenhuma inconsistência orçamentária ou projeção pendente encontrada para este período.</p>
          </div>
        ) : (
          alertasFiltrados.map((alerta) => (
            <div
              key={alerta.id}
              class={`notif-card notif-card--${alerta.severidade}`}
            >
              <div class="notif-card__top">
                <div style="display:flex;align-items:center;gap:6px;">
                  <Icon
                    name={getIconeCategoria(alerta.categoria)}
                    style={`width:14px;height:14px;color:var(--${alerta.severidade === "critica" || alerta.severidade === "alta" ? "out" : alerta.severidade === "aviso" ? "warn" : "primary"});`}
                  />
                  <strong class="notif-card__title">{alerta.titulo}</strong>
                </div>
                {getSeveridadeBadge(alerta.severidade)}
              </div>

              <p class="notif-card__desc">{alerta.descricao}</p>

              <div class="notif-card__footer">
                <a
                  href={alerta.linkHref}
                  class="btn btn--subtle btn--xs notif-card__btn"
                  onClick={() => {
                    if (!isPinned) onClose();
                  }}
                >
                  <span>{alerta.linkLabel}</span>
                  <Icon name="arrowLeftRight" style="width:11px;height:11px;" />
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
