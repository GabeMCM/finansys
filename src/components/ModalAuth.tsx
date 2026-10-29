import { useEffect, useRef, useState } from "preact/hooks";
import { autenticarConta, buscarPerfilPorEmail, cloudUser } from "../data/cloudSync.ts";
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
  const [buscandoPerfil, setBuscandoPerfil] = useState(false);
  const [contaExiste, setContaExiste] = useState<boolean | null>(null);
  const [editandoNome, setEditandoNome] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const timerBuscaRef = useRef<number | null>(null);

  // Consulta e reconhece o usuário assim que digita o e-mail
  useEffect(() => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setContaExiste(null);
      return;
    }

    if (timerBuscaRef.current) clearTimeout(timerBuscaRef.current);

    timerBuscaRef.current = setTimeout(async () => {
      setBuscandoPerfil(true);
      const res = await buscarPerfilPorEmail(cleanEmail);
      setBuscandoPerfil(false);

      if (res.exists) {
        setContaExiste(true);
        if (res.nome) {
          setNome(res.nome);
        }
      } else {
        setContaExiste(false);
      }
    }, 350);

    return () => {
      if (timerBuscaRef.current) clearTimeout(timerBuscaRef.current);
    };
  }, [email]);

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
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;gap:12px;flex-wrap:wrap;">
          <button
            type="button"
            class="btn btn--ghost"
            style="font-size:var(--fs-xs);"
            onClick={onClose}
          >
            Usar sem conta (offline)
          </button>
          <button
            type="submit"
            form="form-auth-modal"
            class="btn btn--primary"
            disabled={loading}
          >
            <Icon name="cloud" />{" "}
            {loading
              ? "Conectando..."
              : contaExiste === true
              ? "Entrar na Conta"
              : contaExiste === false
              ? "Criar Nova Conta"
              : "Entrar / Criar Conta"}
          </button>
        </div>
      }
    >
      <form id="form-auth-modal" onSubmit={handleSubmit} class="stack" style="gap:var(--sp-3);">
        <div style="text-align:center;padding:var(--sp-2) 0;">
          <img src="/favicon.svg" alt="" style="width:40px;height:40px;margin-bottom:8px;" />
          <h3 style="font-size:var(--fs-md);margin-bottom:4px;">
            {contaExiste === true
              ? "Bem-vindo(a) de volta!"
              : contaExiste === false
              ? "Criar sua Conta Finansys"
              : "Entre ou Crie sua Conta"}
          </h3>
          <p class="muted" style="font-size:var(--fs-xs);">
            {contaExiste === true
              ? "Conta reconhecida. Digite sua senha para acessar sua sincronização."
              : "Seus dados financeiros salvos e sincronizados automaticamente na nuvem."}
          </p>
        </div>

        {errorMsg && (
          <div style="background:var(--out-soft);color:var(--out);padding:8px 12px;border-radius:var(--r-md);font-size:var(--fs-xs);">
            {errorMsg}
          </div>
        )}

        {/* E-mail primeiro para reconhecimento automático */}
        <div class="form-group" style="margin:0;">
          <label class="form-label" for="auth-email">Seu E-mail *</label>
          <div style="position:relative;">
            <input
              id="auth-email"
              type="email"
              class="input"
              required
              autoFocus
              placeholder="seu@email.com"
              value={email}
              onInput={(e) => setEmail(e.currentTarget.value)}
            />
            {buscandoPerfil && (
              <span
                style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:var(--fs-xs);color:var(--text-muted);"
              >
                <Icon name="cloud" class="spin" style="width:14px;height:14px;" />
              </span>
            )}
          </div>
        </div>

        {/* Notificação de Conta Reconhecida */}
        {contaExiste === true && nome && !editandoNome && (
          <div
            style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:var(--in-soft);border:1px solid color-mix(in srgb, var(--in) 25%, transparent);border-radius:var(--r-md);font-size:var(--fs-xs);color:var(--in);"
          >
            <div style="display:flex;align-items:center;gap:6px;">
              <Icon name="check" style="width:14px;height:14px;flex:none;" />
              <span>
                Conectando como: <b>{nome}</b>
              </span>
            </div>
            <button
              type="button"
              class="btn btn--ghost"
              style="font-size:0.7rem;padding:2px 6px;min-height:22px;color:var(--in);"
              onClick={() => setEditandoNome(true)}
              title="Corrigir ou alterar nome cadastrado"
            >
              Alterar nome
            </button>
          </div>
        )}

        {/* Campo de Nome: exibido se for conta nova OU se o usuário clicar para editar o nome */}
        {(contaExiste !== true || editandoNome || !nome) && (
          <div class="form-group" style="margin:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <label class="form-label" for="auth-nome" style="margin-bottom:4px;">
                {contaExiste === false ? "Seu Nome (Como deseja ser chamado) *" : "Seu Nome"}
              </label>
              {editandoNome && (
                <button
                  type="button"
                  class="btn btn--ghost"
                  style="font-size:0.7rem;padding:0;min-height:20px;"
                  onClick={() => setEditandoNome(false)}
                >
                  Concluir
                </button>
              )}
            </div>
            <input
              id="auth-nome"
              class="input"
              placeholder="Ex: Aline"
              value={nome}
              onInput={(e) => setNome(e.currentTarget.value)}
            />
            {contaExiste === false && (
              <span class="muted" style="font-size:0.68rem;margin-top:2px;">
                O nome será salvo na sua conta e reconhecido em logins futuros.
              </span>
            )}
          </div>
        )}

        {/* Senha */}
        <div class="form-group" style="margin:0;">
          <label class="form-label" for="auth-senha">Senha de Acesso *</label>
          <div style="position:relative;">
            <input
              id="auth-senha"
              type={mostrarSenha ? "text" : "password"}
              class="input"
              style="padding-right: 40px;"
              required
              placeholder={mostrarSenha ? "Sua senha" : "••••••••"}
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
          <span class="muted" style="font-size:0.68rem;margin-top:2px;">
            {contaExiste === true
              ? "Digite sua senha para autenticar."
              : "Defina uma senha com pelo menos 4 caracteres."}
          </span>
        </div>
      </form>
    </Modal>
  );
}
