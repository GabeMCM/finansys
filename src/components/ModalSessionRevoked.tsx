import { fecharAvisoSessionRevoked, sessionRevokedSignal } from "../data/cloudSync.ts";
import { Icon } from "./Icon.tsx";

export function ModalSessionRevoked({ onReconectar }: { onReconectar: () => void }) {
  const info = sessionRevokedSignal.value;
  if (!info || !info.revoked) return null;

  return (
    <div
      style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;"
    >
      <div
        class="card"
        style="width:100%;max-width:440px;background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow-lg);border-radius:var(--r-lg);padding:var(--sp-4);"
      >
        <div style="text-align:center;margin-bottom:var(--sp-3);">
          <div
            style="width:54px;height:54px;border-radius:50%;background:var(--warn-soft);color:var(--warn);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;"
          >
            <Icon name="warn" style="width:28px;height:28px;" />
          </div>
          <h2 style="font-size:var(--fs-md);margin-bottom:6px;font-weight:700;">
            Sessão Encerrada
          </h2>
          <p style="font-size:var(--fs-xs);color:var(--text);margin:0 0 12px 0;line-height:1.5;">
            Sua conta foi conectada em outro dispositivo: <br />
            <strong style="display:inline-block;margin-top:4px;color:var(--warn);">
              {info.newDevice || "Outro dispositivo"}
            </strong>
          </p>
          <div
            style="background:var(--surface-sunken);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 14px;font-size:var(--fs-xs);color:var(--text-muted);text-align:left;line-height:1.4;"
          >
            Para proteger a integridade de suas finanças e evitar sobreposição ou contaminação de dados, a sessão deste aparelho foi desconectada e todos os dados locais foram limpos com segurança.
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:center;margin-top:var(--sp-3);">
          <button
            type="button"
            class="btn btn--secondary"
            style="flex:1;"
            onClick={fecharAvisoSessionRevoked}
          >
            Fechar
          </button>
          <button
            type="button"
            class="btn btn--primary"
            style="flex:1;"
            onClick={() => {
              fecharAvisoSessionRevoked();
              onReconectar();
            }}
          >
            <Icon name="user" /> Entrar Novamente
          </button>
        </div>
      </div>
    </div>
  );
}
