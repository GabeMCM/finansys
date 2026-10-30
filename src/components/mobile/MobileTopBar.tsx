import { useState } from "preact/hooks";
import { Icon } from "../Icon.tsx";
import { anoAtivo, applyTheme, empresaAtiva, ocultarValores, setAno, setEmpresa, theme, toggleOcultarValores } from "../../state.ts";
import { cloudUser } from "../../data/cloudSync.ts";
import type { Empresa, Ano } from "../../data/types.ts";

interface MobileTopBarProps {
  empresas: Empresa[];
  anos: Ano[];
  notifCount: number;
  hasCriticos: boolean;
  onOpenNotif: () => void;
  onOpenAuth: () => void;
}

export function MobileTopBar({
  empresas,
  anos,
  notifCount,
  hasCriticos,
  onOpenNotif,
  onOpenAuth,
}: MobileTopBarProps) {
  const [modalEmpresa, setModalEmpresa] = useState(false);
  const [modalAno, setModalAno] = useState(false);

  const empAtual = empresas.find((e) => e.id === empresaAtiva.value);
  const anoAtual = anoAtivo.value;
  const user = cloudUser.value;
  const userName = user?.nome || (user?.email ? user.email.split("@")[0] : "Visitante");
  const userInitial = userName.charAt(0).toUpperCase();
  const isDark = theme.value === "dark";

  return (
    <>
      <header class="mobile-appbar only-mobile" aria-label="Cabeçalho mobile">
        {/* Top Row: Perfil, Olho de Privacidade, Sino de Notificações, Tema */}
        <div class="mobile-appbar__top">
          <div
            class="mobile-appbar__user"
            onClick={() => (user ? (window.location.hash = "#/ajustes") : onOpenAuth())}
            role="button"
            tabIndex={0}
            title={user ? "Acessar Ajustes" : "Fazer Login"}
          >
            <div class="mobile-avatar">
              <span>{userInitial}</span>
              <span class="mobile-avatar__badge" />
            </div>
            <div class="mobile-appbar__greeting">
              <span class="mobile-appbar__greeting-sub">Olá,</span>
              <span class="mobile-appbar__greeting-name">{userName}</span>
            </div>
          </div>

          <div class="mobile-appbar__actions">
            {/* Olho de Privacidade: oculta ou revela todos os saldos e valores */}
            <button
              type="button"
              class="mobile-action-btn"
              onClick={toggleOcultarValores}
              aria-label={ocultarValores.value ? "Mostrar valores" : "Ocultar valores"}
              title={ocultarValores.value ? "Mostrar valores" : "Ocultar valores"}
            >
              <Icon name={ocultarValores.value ? "eyeOff" : "eye"} />
            </button>

            {/* Diagnóstico / Notificações */}
            <button
              type="button"
              class="mobile-action-btn"
              onClick={onOpenNotif}
              aria-label="Notificações e diagnósticos"
              title="Notificações"
            >
              <Icon name="bell" />
              {notifCount > 0 && (
                <span class={`mobile-action-btn__badge ${hasCriticos ? "" : "mobile-action-btn__badge--warn"}`}>
                  {notifCount}
                </span>
              )}
            </button>

            {/* Alternador de Tema Escuro / Claro */}
            <button
              type="button"
              class="mobile-action-btn"
              onClick={() => applyTheme(isDark ? "light" : "dark")}
              aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
              title={isDark ? "Modo Claro" : "Modo Escuro"}
            >
              <Icon name={isDark ? "sun" : "moon"} />
            </button>
          </div>
        </div>

        {/* Bottom Row: Cápsulas de Contexto (Empresa e Ano) */}
        {(empresas.length > 0 || anos.length > 0) && (
          <div class="mobile-context-pills">
            {empresas.length > 0 && (
              <button
                type="button"
                class="mobile-pill"
                onClick={() => setModalEmpresa(true)}
                title="Trocar Empresa Ativa"
              >
                <Icon name="building" style="width:14px;height:14px;" />
                <span>{empAtual ? empAtual.nome : "Selecione a empresa"}</span>
                <Icon name="chevron" class="chevron-icon" />
              </button>
            )}

            {anos.length > 0 && (
              <button
                type="button"
                class="mobile-pill"
                onClick={() => setModalAno(true)}
                title="Trocar Ano Fiscal"
              >
                <Icon name="calendar" style="width:14px;height:14px;" />
                <span>{anoAtual}</span>
                <Icon name="chevron" class="chevron-icon" />
              </button>
            )}
          </div>
        )}
      </header>

      {/* Bottom Sheet para Seleção de Empresa */}
      {modalEmpresa && (
        <div class="modal-backdrop only-mobile" onClick={() => setModalEmpresa(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()} style="max-height:80dvh;">
            <div class="modal__head">
              <h3 class="modal__title">Selecionar Empresa</h3>
              <button
                type="button"
                class="btn btn--ghost btn--icon"
                onClick={() => setModalEmpresa(false)}
                aria-label="Fechar"
              >
                <Icon name="x" />
              </button>
            </div>
            <div class="modal__body" style="display:flex;flex-direction:column;gap:8px;">
              {empresas.map((e) => {
                const isSelected = e.id === empresaAtiva.value;
                return (
                  <button
                    key={e.id}
                    type="button"
                    class={`card card--interactive ${isSelected ? "is-selected" : ""}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "16px",
                      borderRadius: "14px",
                      border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: isSelected ? "var(--primary-soft)" : "var(--surface)",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      setEmpresa(e.id);
                      setModalEmpresa(false);
                    }}
                  >
                    <div style="display:flex;align-items:center;gap:12px;">
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "10px",
                          background: isSelected ? "var(--primary)" : "var(--surface-hover)",
                          color: isSelected ? "#fff" : "var(--text)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name="building" />
                      </div>
                      <div>
                        <div style="font-weight:700;font-size:0.95rem;color:var(--text);">{e.nome}</div>
                        {e.cnpj && <div style="font-size:0.75rem;color:var(--text-muted);">{e.cnpj}</div>}
                      </div>
                    </div>
                    {isSelected && <Icon name="check" style="color:var(--primary);width:22px;height:22px;" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet para Seleção de Ano */}
      {modalAno && (
        <div class="modal-backdrop only-mobile" onClick={() => setModalAno(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()} style="max-height:80dvh;">
            <div class="modal__head">
              <h3 class="modal__title">Selecionar Ano Fiscal</h3>
              <button
                type="button"
                class="btn btn--ghost btn--icon"
                onClick={() => setModalAno(false)}
                aria-label="Fechar"
              >
                <Icon name="x" />
              </button>
            </div>
            <div class="modal__body" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              {anos.map((a) => {
                const isSelected = a.ano === anoAtivo.value;
                return (
                  <button
                    key={a.ano}
                    type="button"
                    class={`card card--interactive ${isSelected ? "is-selected" : ""}`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "18px 12px",
                      borderRadius: "14px",
                      border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: isSelected ? "var(--primary-soft)" : "var(--surface)",
                      cursor: "pointer",
                      gap: "4px",
                    }}
                    onClick={() => {
                      setAno(a.ano);
                      setModalAno(false);
                    }}
                  >
                    <span style="font-size:1.25rem;font-weight:800;color:var(--text);">{a.ano}</span>
                    <span style="font-size:0.72rem;color:var(--text-muted);">
                      {isSelected ? "Ano Ativo" : "Alternar"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
