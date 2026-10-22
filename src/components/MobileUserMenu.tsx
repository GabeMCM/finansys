import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./Icon.tsx";
import { confirmarAcao } from "./ModalConfirm.tsx";
import { toast } from "./Toast.tsx";
import {
  cloudSyncStatus,
  cloudUltimoBackup,
  cloudUser,
  desconectarConta,
  sincronizarInteligente,
} from "../data/cloudSync.ts";
import { applyTheme, theme } from "../state.ts";

interface MobileUserMenuProps {
  onOpenAuth: () => void;
}

export function MobileUserMenu({ onOpenAuth }: MobileUserMenuProps) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dark = theme.value === "dark";

  // Fecha ao clicar fora ou apertar ESC
  useEffect(() => {
    if (!aberto) return;

    const handleClickFora = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };

    document.addEventListener("mousedown", handleClickFora);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickFora);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [aberto]);

  const user = cloudUser.value;
  const status = cloudSyncStatus.value;
  const ultimo = cloudUltimoBackup.value;
  const isSyncing = status === "salvando";

  const inicial = user?.nome
    ? user.nome.charAt(0).toUpperCase()
    : user?.email
    ? user.email.charAt(0).toUpperCase()
    : "";

  const corStatus =
    status === "salvo"
      ? "var(--in)"
      : status === "salvando"
      ? "var(--primary)"
      : status === "pendente"
      ? "var(--warn)"
      : status === "erro"
      ? "var(--out)"
      : "var(--text-faint)";

  const labelStatus =
    status === "salvo"
      ? `Salvo ${ultimo ? ultimo.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "recente"}`
      : status === "salvando"
      ? "Sincronizando..."
      : status === "pendente"
      ? "Alterações pendentes"
      : status === "erro"
      ? "Erro de conexão"
      : "Desconectado";

  const handleForcarSync = async () => {
    if (!user) {
      setAberto(false);
      onOpenAuth();
      return;
    }
    toast.info("Sincronizando dados...");
    const res = await sincronizarInteligente();
    if (res.ok) {
      toast.success("Sincronizado com sucesso!");
    } else {
      toast.error(res.error || "Falha ao sincronizar");
    }
  };

  return (
    <div class="user-menu-wrap" ref={containerRef}>
      <button
        type="button"
        class="user-avatar-btn"
        onClick={() => setAberto(!aberto)}
        aria-label="Perfil do Usuário e Status"
        aria-expanded={aberto}
      >
        {user && inicial ? (
          <span class="user-avatar-initial">{inicial}</span>
        ) : (
          <Icon name="user" class="user-avatar-icon" />
        )}
        <span
          class={`user-avatar-badge ${isSyncing ? "is-syncing" : ""}`}
          style={{ background: corStatus }}
        />
      </button>

      {aberto && (
        <div class="user-menu-popover" role="menu">
          {/* Cabeçalho da Conta */}
          <div class="user-menu-header">
            {user ? (
              <>
                <div class="user-menu-name">
                  {user.nome || user.email.split("@")[0]}
                </div>
                <div class="user-menu-email">{user.email}</div>
              </>
            ) : (
              <>
                <div class="user-menu-name">Finansys Cloud</div>
                <div class="user-menu-email">Sincronize entre seus dispositivos</div>
                <button
                  type="button"
                  class="btn btn--primary btn--sm"
                  style="width: 100%; margin-top: 10px; font-size: var(--fs-xs); justify-content: center;"
                  onClick={() => {
                    setAberto(false);
                    onOpenAuth();
                  }}
                >
                  <Icon name="user" /> Entrar / Criar Conta
                </button>
              </>
            )}
          </div>

          <div class="user-menu-divider" />

          {/* Sincronização em Nuvem */}
          <div class="user-menu-section">
            <div class="user-menu-sync-row">
              <div class="user-menu-sync-title">
                <Icon name="cloud" class={isSyncing ? "spin" : ""} />
                <span>{labelStatus}</span>
              </div>
              {user && (
                <button
                  type="button"
                  class="btn btn--ghost btn--sm"
                  style="padding: 2px 8px; font-size: 0.72rem; height: 26px;"
                  onClick={handleForcarSync}
                  disabled={isSyncing}
                >
                  Sincronizar
                </button>
              )}
            </div>
          </div>

          <div class="user-menu-divider" />

          {/* Chaveador Rápido de Tema */}
          <button
            type="button"
            class="user-menu-item"
            onClick={() => applyTheme(dark ? "light" : "dark")}
          >
            <div class="user-menu-item-left">
              <Icon name={dark ? "sun" : "moon"} />
              <span>Tema: {dark ? "Escuro" : "Claro"}</span>
            </div>
            <span class="badge badge--neutral" style="font-size: 0.7rem; padding: 2px 6px;">
              Alternar
            </span>
          </button>

          <div class="user-menu-divider" />

          {/* Atalho para Ajustes Completos */}
          <a
            href="#/ajustes"
            class="user-menu-item"
            onClick={() => setAberto(false)}
          >
            <div class="user-menu-item-left">
              <Icon name="settings" />
              <span>Configurações & Ajustes</span>
            </div>
          </a>

          {/* Logout se logado */}
          {user && (
            <>
              <div class="user-menu-divider" />
              <button
                type="button"
                class="user-menu-item user-menu-item--danger"
                onClick={async () => {
                  setAberto(false);
                  const ok = await confirmarAcao({
                    titulo: "Desconectar Conta",
                    mensagem: "Deseja sair da conta neste aparelho? Seus dados locais serão limpos com segurança deste dispositivo.",
                    rotuloConfirmar: "Sair e Limpar",
                    tipo: "warning",
                  });
                  if (ok) {
                    await desconectarConta(true);
                  }
                }}
              >
                <div class="user-menu-item-left">
                  <Icon name="close" />
                  <span>Desconectar Conta</span>
                </div>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
