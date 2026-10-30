import { useState } from "react";
import { cloudUser, desconectarConta, getDeviceId, getDeviceName } from "../data/cloudSync.ts";
import { isScreenLocked, unlockScreen } from "../data/inactivityGuard.ts";
import { Icon } from "./Icon.tsx";

export function ModalBloqueioInatividade() {
  const [password, setPassword] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isScreenLocked.value || !cloudUser.value) {
    return null;
  }

  const handleUnlock = async (e: Event) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setErrorMsg("");

    try {
      const email = cloudUser.value?.email;
      if (!email) return;
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: password.trim(),
          deviceId: getDeviceId(),
          deviceName: getDeviceName(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setPassword("");
        unlockScreen();
      } else {
        setErrorMsg(data.error || "Senha incorreta. Tente novamente.");
      }
    } catch (_err) {
      setErrorMsg("Erro de rede ao validar senha. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  };

  const handleSairELimpar = async () => {
    setPassword("");
    await desconectarConta(true);
    unlockScreen();
  };

  return (
    <div
      style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:16px;"
    >
      <div
        class="card"
        style="width:100%;max-width:400px;background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow-lg);border-radius:var(--r-lg);padding:var(--sp-4);"
      >
        <div style="text-align:center;margin-bottom:var(--sp-3);">
          <div
            style="width:54px;height:54px;border-radius:50%;background:var(--primary-soft);color:var(--primary);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;"
          >
            <Icon name="lock" style="width:26px;height:26px;" />
          </div>
          <h2 style="font-size:var(--fs-md);margin-bottom:4px;font-weight:700;">
            Tela Bloqueada por Inatividade
          </h2>
          <p class="muted" style="font-size:var(--fs-xs);margin:0 0 10px 0;">
            Seus dados foram sincronizados na nuvem para sua proteção.
          </p>

          <div
            style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:var(--surface-sunken);border-radius:var(--r-full);font-size:var(--fs-xs);color:var(--text);"
          >
            <Icon name="user" style="width:13px;height:13px;" />
            <strong style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              {cloudUser.value.nome || cloudUser.value.email}
            </strong>
          </div>
        </div>

        {errorMsg && (
          <div
            style="background:var(--out-soft);color:var(--out);padding:8px 12px;border-radius:var(--r-md);font-size:var(--fs-xs);margin-bottom:var(--sp-3);text-align:center;"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleUnlock} class="stack" style="gap:var(--sp-3);">
          <div class="form-group" style="margin:0;">
            <label class="form-label" for="lock-password">Sua Senha de Acesso</label>
            <div style="position:relative;">
              <input
                id="lock-password"
                type={mostrarSenha ? "text" : "password"}
                class="input"
                style="padding-right: 40px;"
                required
                autoFocus
                placeholder={mostrarSenha ? "Sua senha" : "Digite sua senha para desbloquear"}
                value={password}
                onInput={(e) => setPassword(e.currentTarget.value)}
              />
              <button
                type="button"
                class="btn btn--ghost btn--icon"
                style="position:absolute; right:4px; top:50%; transform:translateY(-50%); width:32px; height:32px; min-height:32px; color:var(--text-muted);"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                title={mostrarSenha ? "Ocultar senha" : "Exibir senha"}
                tabIndex={-1}
              >
                <Icon name={mostrarSenha ? "eyeOff" : "eye"} style="width:16px; height:16px;" />
              </button>
            </div>
          </div>

          <button
            type="submit"
            class="btn btn--primary"
            style="width:100%;min-height:38px;"
            disabled={loading}
          >
            {loading ? "Desbloqueando..." : "Desbloquear Tela"}
          </button>
        </form>

        <div style="margin-top:var(--sp-3);padding-top:var(--sp-2);border-top:1px solid var(--border);text-align:center;">
          <button
            type="button"
            class="btn btn--ghost btn--danger"
            style="font-size:var(--fs-xs);width:100%;"
            onClick={handleSairELimpar}
          >
            Sair e Limpar Dados deste Aparelho
          </button>
        </div>
      </div>
    </div>
  );
}
