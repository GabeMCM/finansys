import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { CustomSelect } from "./CustomSelect.tsx";
import { Icon, type IconName } from "./Icon.tsx";
import { MobileUserMenu } from "./MobileUserMenu.tsx";
import { ModalAuth } from "./ModalAuth.tsx";
import { ModalBloqueioInatividade } from "./ModalBloqueioInatividade.tsx";
import { ModalConfirm } from "./ModalConfirm.tsx";
import { ModalSessionRevoked } from "./ModalSessionRevoked.tsx";
import { PainelNotificacoes, useDiagnosticoFinanceiro } from "./PainelNotificacoes.tsx";
import { ToastContainer } from "./Toast.tsx";
import { useLive } from "../data/useLive.ts";
import { anos, empresas } from "../data/repo.ts";
import { cloudSyncStatus, cloudUltimoBackup, cloudUser } from "../data/cloudSync.ts";
import { anoAtivo, applyTheme, empresaAtiva, setAno, setEmpresa, theme } from "../state.ts";

export const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Início", icon: "chart" },
  { href: "/projecoes", label: "Projeções", icon: "grid" },
  { href: "/realizacoes", label: "Realizações", icon: "list" },
  { href: "/reservas", label: "Reservas", icon: "wallet" },
  { href: "/investimentos", label: "Investimentos", icon: "sparkles" },
  { href: "/ajustes", label: "Ajustes", icon: "settings" },
];

const isActive = (route: string, href: string) => {
  if (href === "/") return route === "/" || route.startsWith("/relatorios");
  if (href === "/realizacoes") return route.startsWith("/realizacoes") || route.startsWith("/lancamentos");
  return route.startsWith(href);
};

function ThemeToggle({ id }: { id: string }) {
  const dark = theme.value === "dark";
  return (
    <button id={id} type="button" class="btn btn--ghost btn--icon" aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
      onClick={() => applyTheme(dark ? "light" : "dark")}>
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}

export function AppShell({ route, children }: { route: string; children: ComponentChildren }) {
  const listaEmpresas = useLive(() => empresas.list(), [], []);
  const empId = empresaAtiva.value;
  const listaAnos = useLive(() => (empId ? anos.byEmpresa(empId) : Promise.resolve([])), [empId], []);

  const [authModalAberta, setAuthModalAberta] = useState(false);
  const { resumo } = useDiagnosticoFinanceiro(empId, anoAtivo.value);
  const [painelNotifAberto, setPainelNotifAberto] = useState(false);
  const [painelNotifPinned, setPainelNotifPinned] = useState(() => {
    return localStorage.getItem("finansys_notif_pinned") === "true";
  });

  const togglePinPainel = () => {
    setPainelNotifPinned((prev) => {
      const next = !prev;
      localStorage.setItem("finansys_notif_pinned", String(next));
      return next;
    });
  };

  useEffect(() => {
    // Solicita login/criação de conta logo ao abrir a página se o usuário ainda não estiver autenticado
    if (!cloudUser.value && !sessionStorage.getItem("finansys_auth_prompted")) {
      setAuthModalAberta(true);
      sessionStorage.setItem("finansys_auth_prompted", "true");
    }
  }, [cloudUser.value]);

  return (
    <div class={`shell ${painelNotifAberto && painelNotifPinned ? "has-pinned-panel" : ""}`}>
      {/* Desktop */}
      <aside class="sidebar" aria-label="Navegação principal">
        <div class="sidebar__brand">
          <img src="/favicon.svg" alt="" /> Finansys
        </div>
        {NAV.map((n) => (
          <a id={`side-${n.icon}`} href={`#${n.href}`} class={isActive(route, n.href) ? "is-active" : ""}>
            <Icon name={n.icon} /> {n.label}
          </a>
        ))}
        <div class="sidebar__foot">
          <a id="side-new" href="#/realizacoes/novo" class="btn btn--primary">
            <Icon name="plus" /> Nova realização
          </a>
        </div>
      </aside>

      <div>
        <header class="topbar">
          <div class="topbar__brand">
            <a href="#/" aria-label="Finansys Início" style="display:flex;align-items:center;text-decoration:none;">
              <img src="/favicon.svg" alt="Finansys" />
            </a>
          </div>

          {(listaEmpresas.length > 0 || listaAnos.length > 0) && (
            <div class="topbar__selectors">
              {listaEmpresas.length > 0 && (
                <div class="topbar__company-select">
                  <CustomSelect
                    id="company-switch"
                    ariaLabel="Empresa Ativa"
                    value={empId ?? ""}
                    placeholder="Empresa"
                    options={listaEmpresas.map((e) => ({ value: e.id, label: e.nome }))}
                    onChange={(id) => setEmpresa(id)}
                  />
                </div>
              )}

              {listaAnos.length > 0 && (
                <div class="topbar__year-select">
                  <CustomSelect
                    id="year-switch"
                    ariaLabel="Ano Fiscal"
                    value={anoAtivo.value}
                    placeholder="Ano"
                    options={listaAnos.map((a) => ({ value: a.ano, label: String(a.ano) }))}
                    onChange={(ano) => setAno(Number(ano))}
                  />
                </div>
              )}
            </div>
          )}

          <div class="topbar__spacer" />

          {/* Botão de Notificações e Diagnósticos (Desktop e Mobile) */}
          <button
            type="button"
            class={`btn btn--ghost btn--icon ${painelNotifAberto ? "is-active" : ""}`}
            style="position:relative;min-height:34px;width:34px;"
            onClick={() => setPainelNotifAberto(!painelNotifAberto)}
            title="Diagnóstico Financeiro e Notificações"
            aria-label="Abrir notificações e diagnósticos"
          >
            <Icon name="bell" style="width:18px;height:18px;" />
            {resumo.total > 0 && (
              <span
                class={`notif-badge ${resumo.criticos > 0 ? "" : "notif-badge--warn"}`}
                style="position:absolute;top:2px;right:2px;"
              >
                {resumo.total}
              </span>
            )}
          </button>

          {/* Ações de Topo para Desktop (escondidas no Mobile) */}
          <div class="hide-mobile" style="display:inline-flex;align-items:center;gap:var(--sp-2);">
            {/* Usuário / Saudação */}
            {cloudUser.value ? (
              <a
                href="#/ajustes"
                class="chip"
                style="min-height:30px;font-size:var(--fs-xs);gap:6px;text-decoration:none;"
                title={`Conectado como ${cloudUser.value.email}. Clique para gerenciar conta em Ajustes.`}
              >
                <Icon name="user" />
                <span class="muted">Olá,</span>
                <strong style="color:var(--text);max-width:85px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  {cloudUser.value.nome || cloudUser.value.email.split("@")[0]}
                </strong>
              </a>
            ) : (
              <button
                type="button"
                class="btn btn--primary"
                style="min-height:30px;padding:0 10px;font-size:var(--fs-xs);gap:6px;"
                onClick={() => setAuthModalAberta(true)}
              >
                <Icon name="user" />
                <span>Entrar</span>
              </button>
            )}

            {/* Status do Backup em Nuvem */}
            {(() => {
              const status = cloudSyncStatus.value;
              const ultimo = cloudUltimoBackup.value;
              const email = cloudUser.value?.email;

              return (
                <a
                  href="#/ajustes"
                  class="chip"
                  style="min-height:30px;padding:0 8px;font-size:var(--fs-xs);gap:6px;border-color:transparent;"
                  title={
                    email
                      ? status === "salvo"
                        ? `Nuvem Ativa: ${email} (Salvo ${ultimo ? ultimo.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "recente"})`
                        : status === "salvando"
                        ? "Salvando backup na nuvem..."
                        : status === "pendente"
                        ? "Alterações pendentes de sincronização"
                        : "Erro de sincronização. Clique para verificar em Ajustes."
                      : "Backup em nuvem desconectado. Clique para ativar com seu e-mail."
                  }
                >
                  <Icon name="cloud" class={status === "salvando" ? "spin" : ""} />
                  <i
                    class="dot"
                    style={
                      status === "salvo"
                        ? "background:var(--in);"
                        : status === "salvando"
                        ? "background:var(--primary);"
                        : status === "pendente"
                        ? "background:var(--warn);"
                        : status === "erro"
                        ? "background:var(--out);"
                        : "background:var(--text-faint);"
                    }
                  />
                  <span class="sr-only">Status do Backup</span>
                </a>
              );
            })()}

            <ThemeToggle id="theme-toggle" />
          </div>

          {/* Menu de Perfil e Ações Rápidas Unificado (visível apenas no Mobile) */}
          <div class="only-mobile">
            <MobileUserMenu onOpenAuth={() => setAuthModalAberta(true)} />
          </div>
        </header>

        <main class="main" key={route}>{children}</main>
      </div>

      {/* Terceira Div Vertical: Painel de Notificações & Diagnósticos */}
      {painelNotifAberto && !painelNotifPinned && (
        <div class="notif-backdrop" onClick={() => setPainelNotifAberto(false)} />
      )}
      <PainelNotificacoes
        isOpen={painelNotifAberto}
        isPinned={painelNotifPinned}
        onClose={() => setPainelNotifAberto(false)}
        onTogglePin={togglePinPainel}
      />

      {/* Mobile */}
      <a id="fab-new" href="#/realizacoes/novo" class="fab" aria-label="Nova realização">
        <Icon name="plus" />
      </a>
      <nav class="bottomnav" aria-label="Navegação">
        {NAV.map((n) => (
          <a id={`nav-${n.icon}`} href={`#${n.href}`} class={isActive(route, n.href) ? "is-active" : ""}>
            <Icon name={n.icon} />
            {n.label}
          </a>
        ))}
      </nav>

      {/* Modal de Autenticação / Boas-vindas Inicial */}
      <ModalAuth isOpen={authModalAberta} onClose={() => setAuthModalAberta(false)} />

      {/* Bloqueio de Tela por Inatividade */}
      <ModalBloqueioInatividade />

      {/* Aviso de Sessão Desconectada por Outro Aparelho */}
      <ModalSessionRevoked onReconectar={() => setAuthModalAberta(true)} />

      {/* Diálogo Moderno de Confirmação Global */}
      <ModalConfirm />

      {/* Notificações Toast do Sistema */}
      <ToastContainer />
    </div>
  );
}
