import { useState } from "preact/hooks";
import { autenticarConta, cloudUser } from "../data/cloudSync.ts";
import { Icon } from "./Icon.tsx";
import { Modal } from "./Modal.tsx";

export interface ModalAuthProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ModalAuth({ isOpen, onClose }: ModalAuthProps) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setErrorMsg("");

    const res = await autenticarConta(email.trim(), password.trim(), nome.trim() || undefined);
    setLoading(false);

    if (res.ok) {
      onClose();
    } else {
      setErrorMsg(res.error || "Erro ao conectar conta.");
    }
  };

  return (
    <Modal
      title="Acesso ao Finansys"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
          <button
            type="button"
            class="btn btn--ghost"
            style="font-size:var(--fs-xs);"
            onClick={onClose}
          >
            Usar sem conta (apenas offline)
          </button>
          <button
            type="submit"
            form="form-auth-modal"
            class="btn btn--primary"
            disabled={loading}
          >
            <Icon name="cloud" /> {loading ? "Conectando..." : "Entrar / Criar Conta"}
          </button>
        </div>
      }
    >
      <form id="form-auth-modal" onSubmit={handleSubmit} class="stack" style="gap:var(--sp-3);">
        <div style="text-align:center;padding:var(--sp-2) 0;">
          <img src="/favicon.svg" alt="" style="width:40px;height:40px;margin-bottom:8px;" />
          <h3 style="font-size:var(--fs-md);margin-bottom:4px;">Entre ou Crie sua Conta</h3>
          <p class="muted" style="font-size:var(--fs-xs);">
            Seus dados serão sincronizados na nuvem e salvos automaticamente.
          </p>
        </div>

        {errorMsg && (
          <div style="background:var(--out-soft);color:var(--out);padding:8px 12px;border-radius:var(--r-md);font-size:var(--fs-xs);">
            {errorMsg}
          </div>
        )}

        <div class="form-group" style="margin:0;">
          <label class="form-label" for="auth-nome">Seu Nome</label>
          <input
            id="auth-nome"
            class="input"
            placeholder="Ex: Aline"
            value={nome}
            onInput={(e) => setNome(e.currentTarget.value)}
          />
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label" for="auth-email">Seu E-mail *</label>
          <input
            id="auth-email"
            type="email"
            class="input"
            required
            placeholder="seu@email.com"
            value={email}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label" for="auth-senha">Senha de Acesso *</label>
          <input
            id="auth-senha"
            type="password"
            class="input"
            required
            placeholder="••••••••"
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
          <span class="muted" style="font-size:0.68rem;margin-top:2px;">
            Se for seu primeiro acesso, a conta será criada com esta senha.
          </span>
        </div>
      </form>
    </Modal>
  );
}
