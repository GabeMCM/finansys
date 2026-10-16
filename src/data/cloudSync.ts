import { signal } from "@preact/signals";
import { toast } from "../components/Toast.tsx";
import { dumpDatabase, isRestoring, restoreDatabase } from "./backup.ts";
import { changes } from "./db.ts";

export type CloudState = "desconectado" | "salvo" | "salvando" | "pendente" | "erro";

export const cloudUser = signal<{ email: string; nome?: string } | null>(null);
export const cloudSyncStatus = signal<CloudState>("desconectado");
export const cloudUltimoBackup = signal<Date | null>(null);

const TOKEN_KEY = "finansys_cloud_token";
const USER_KEY = "finansys_cloud_user";
const LAST_SYNC_KEY = "finansys_last_cloud_sync_time";

// Identificador único da sessão desta aba para evitar eco SSE
const CLIENT_SESSION_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

let debounceTimer: number | null = null;
let eventSource: EventSource | null = null;
let reconnectTimer: number | null = null;
let isPulling = false;
let lastToastTime = 0;

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function getLastSyncTime(): number {
  const v = localStorage.getItem(LAST_SYNC_KEY);
  return v ? parseInt(v, 10) : 0;
}

function setLastSyncTime(t: number) {
  localStorage.setItem(LAST_SYNC_KEY, String(t));
}

/**
 * Conexão Server-Sent Events (SSE) para receber avisos em tempo real
 * quando outro dispositivo (ex: computador ou celular) sincroniza.
 */
function iniciarConexaoSSE() {
  const token = getToken();
  if (!token) return;

  if (eventSource) {
    try {
      eventSource.close();
    } catch (_e) {
      // ignore
    }
    eventSource = null;
  }

  try {
    const es = new EventSource(`/api/sync/events?token=${encodeURIComponent(token)}`);
    eventSource = es;

    es.onmessage = async (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === "sync_updated") {
          // Ignora notificações disparadas por este próprio cliente/aba
          if (data.senderId && data.senderId === CLIENT_SESSION_ID) {
            return;
          }

          if (isPulling) return;
          isPulling = true;

          try {
            console.log("[Finansys Cloud] Evento recebido de outro dispositivo. Atualizando...");
            const res = await puxarBackupNuvem(false);
            if (res.ok && (res.totalImportados ?? 1) > 0) {
              const agora = Date.now();
              if (agora - lastToastTime > 3500) {
                lastToastTime = agora;
                toast.info("Dados sincronizados de outro aparelho em tempo real.", "Nuvem Finansys");
              }
            }
          } finally {
            isPulling = false;
          }
        }
      } catch (err) {
        console.error("Erro ao processar evento SSE:", err);
      }
    };

    es.onerror = () => {
      es.close();
      eventSource = null;
      // Tenta reconectar rapidamente após 3 segundos se a sessão continuar ativa
      if (getToken() && !reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          iniciarConexaoSSE();
        }, 3000);
      }
    };
  } catch (err) {
    console.error("Falha ao abrir conexão SSE:", err);
  }
}

export function initCloudSync() {
  const token = getToken();
  const savedUser = localStorage.getItem(USER_KEY);

  if (token && savedUser) {
    try {
      cloudUser.value = JSON.parse(savedUser);
      cloudSyncStatus.value = "salvo";

      // 1. Valida sessão e atualiza perfil do usuário
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
        .then(async (r) => {
          if (!r.ok) {
            desconectarConta();
          } else {
            const me = await r.json();
            if (me.email) {
              const updated = { email: me.email, nome: me.nome };
              cloudUser.value = updated;
              localStorage.setItem(USER_KEY, JSON.stringify(updated));
            }
          }
        })
        .catch(() => {});

      // 2. Busca e mescla os dados mais recentes da nuvem na abertura se houver nova versão
      void verificarAtualizacaoNuvem();

      // 3. Abre o canal de comunicação em tempo real (SSE)
      iniciarConexaoSSE();
    } catch (_e) {
      // ignore
    }
  }

  // Escuta alterações locais no banco de dados para agendar backup automático
  changes.addEventListener("change", () => {
    // Ignora mutações geradas pela própria sincronização ou restauração
    if (isRestoring) return;
    if (!getToken()) return;
    cloudSyncStatus.value = "pendente";

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void sincronizarInteligente();
    }, 1500); // 1.5s debounce ágil e responsivo
  });

  // Ao voltar conexão com internet, sincroniza se estiver pendente
  window.addEventListener("online", () => {
    if (getToken()) {
      void sincronizarInteligente();
      iniciarConexaoSSE();
    }
  });

  // Quando o usuário volta para a aba ou clica na janela (foco)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && getToken()) {
      void verificarAtualizacaoNuvem();
    }
  });

  window.addEventListener("focus", () => {
    if (getToken()) {
      void verificarAtualizacaoNuvem();
    }
  });

  // Heartbeat de fallback a cada 60s quando a página estiver ativa (o SSE já cuida do tempo real)
  setInterval(() => {
    if (getToken() && document.visibilityState === "visible") {
      void verificarAtualizacaoNuvem();
    }
  }, 60_000);
}

/**
 * Checa de forma leve se o servidor possui backup mais novo do que o nosso local.
 */
async function verificarAtualizacaoNuvem() {
  const token = getToken();
  if (!token) return;

  try {
    const res = await fetch("/api/sync/status", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const { savedAt } = await res.json();
    if (savedAt && savedAt > getLastSyncTime()) {
      await puxarBackupNuvem(false);
      toast.info("Dados mais recentes da nuvem carregados.", "Nuvem Finansys");
    }
  } catch (_e) {
    // ignore
  }
}

const KNOWN_NAMES_KEY = "finansys_known_user_names";

function getCachedName(email: string): string | undefined {
  try {
    const raw = localStorage.getItem(KNOWN_NAMES_KEY);
    if (!raw) return undefined;
    const map = JSON.parse(raw);
    return map[email.toLowerCase()];
  } catch {
    return undefined;
  }
}

function setCachedName(email: string, nome: string) {
  if (!email || !nome) return;
  try {
    const raw = localStorage.getItem(KNOWN_NAMES_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[email.toLowerCase()] = nome;
    localStorage.setItem(KNOWN_NAMES_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/**
 * Consulta se um e-mail já possui conta cadastrada e recupera o nome salvo.
 * Verifica o cache local imediatamente e em seguida consulta o servidor.
 */
export async function buscarPerfilPorEmail(email: string): Promise<{ exists: boolean; nome?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { exists: false };
  }

  // 1. Verifica cache local do navegador
  const cached = getCachedName(cleanEmail);

  try {
    const res = await fetch(`/api/auth/lookup?email=${encodeURIComponent(cleanEmail)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.exists) {
        if (data.nome) setCachedName(cleanEmail, data.nome);
        return { exists: true, nome: data.nome || cached };
      }
      return { exists: false };
    }
  } catch {
    // Se a rede falhar, retorna o que tiver em cache local
  }

  if (cached) {
    return { exists: true, nome: cached };
  }

  return { exists: false };
}

/**
 * Atualiza o nome de exibição do usuário na nuvem e localmente.
 */
export async function atualizarNomePerfil(novoNome: string): Promise<{ ok: boolean; error?: string }> {
  const token = getToken();
  if (!token || !cloudUser.value) {
    return { ok: false, error: "Nenhuma sessão ativa." };
  }

  const nomeLimpo = novoNome.trim();
  if (!nomeLimpo) {
    return { ok: false, error: "O nome não pode ser vazio." };
  }

  try {
    const res = await fetch("/api/auth/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ nome: nomeLimpo }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { ok: false, error: errData.error || "Erro ao atualizar nome." };
    }

    const updated = { email: cloudUser.value.email, nome: nomeLimpo };
    cloudUser.value = updated;
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
    setCachedName(updated.email, nomeLimpo);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Entra ou cria conta automaticamente apenas com e-mail e senha.
 */
export async function autenticarConta(
  email: string,
  password: string,
  nome?: string,
): Promise<{ ok: boolean; error?: string; isNew?: boolean }> {
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, nome }),
    });

    const text = await res.text();
    // deno-lint-ignore no-explicit-any
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch (_e) {
      return { ok: false, error: `Servidor retornou erro (${res.status}): ${text.slice(0, 160) || "Sem resposta válida"}` };
    }

    if (!res.ok) {
      return { ok: false, error: json.error || "Erro ao conectar conta." };
    }

    localStorage.setItem(TOKEN_KEY, json.token);
    const u = { email: json.email, nome: json.nome };
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    if (json.nome) setCachedName(json.email, json.nome);
    cloudUser.value = u;
    cloudSyncStatus.value = "salvando";

    // Puxa e mescla dados da nuvem se for conta existente, ou faz o primeiro backup se for nova
    await sincronizarInteligente();
    iniciarConexaoSSE();

    return { ok: true, isNew: json.isNew };
  } catch (err) {
    return { ok: false, error: "Servidor indisponível ou erro de rede: " + String(err) };
  }
}

export function desconectarConta() {
  if (eventSource) {
    try {
      eventSource.close();
    } catch (_e) {
      // ignore
    }
    eventSource = null;
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
  cloudUser.value = null;
  cloudSyncStatus.value = "desconectado";
  cloudUltimoBackup.value = null;
}

/**
 * SINCRONIZAÇÃO INTELIGENTE BIDIRECIONAL:
 * 1. Puxa os dados da nuvem primeiro e mescla na base local (evita sobrescrever dados de outro aparelho).
 * 2. Em seguida, extrai a base completa consolidada localmente e envia de volta para a nuvem.
 */
export async function sincronizarInteligente(): Promise<{ ok: boolean; error?: string }> {
  const token = getToken();
  if (!token) {
    cloudSyncStatus.value = "desconectado";
    return { ok: false, error: "Nenhuma conta conectada. Faça login com seu e-mail primeiro." };
  }

  cloudSyncStatus.value = "salvando";

  try {
    // 1. Puxa o backup atual da nuvem
    const pullRes = await fetch("/api/sync/pull", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (pullRes.ok) {
      const pullJson = await pullRes.json();
      if (pullJson.payload) {
        // Mescla com a base local
        await restoreDatabase(pullJson.payload, "merge");
        if (pullJson.savedAt) {
          setLastSyncTime(pullJson.savedAt);
          cloudUltimoBackup.value = new Date(pullJson.savedAt);
        }
      }
    } else if (pullRes.status === 401) {
      desconectarConta();
      return { ok: false, error: "Sua sessão expirou. Por favor, entre novamente." };
    }

    // 2. Extrai a base local consolidada (que agora contém tanto o que estava na nuvem quanto alterações locais)
    const payload = await dumpDatabase();

    // 3. Envia o estado consolidado para a nuvem
    const pushRes = await fetch("/api/sync/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload, clientId: CLIENT_SESSION_ID }),
    });

    if (!pushRes.ok) {
      const data = await pushRes.json().catch(() => ({}));
      throw new Error(data.error || `Erro do servidor HTTP ${pushRes.status}`);
    }

    const pushData = await pushRes.json();
    const savedAt = pushData.savedAt || Date.now();
    setLastSyncTime(savedAt);
    cloudSyncStatus.value = "salvo";
    cloudUltimoBackup.value = new Date(savedAt);

    return { ok: true };
  } catch (err) {
    console.error("Falha na sincronização inteligente:", err);
    cloudSyncStatus.value = "erro";
    return { ok: false, error: String(err) };
  }
}

/**
 * Puxa e mescla o backup salvo na nuvem com a base deste aparelho.
 */
export async function puxarBackupNuvem(_mostrarAviso = true): Promise<{ ok: boolean; error?: string; totalImportados?: number }> {
  const token = getToken();
  if (!token) return { ok: false, error: "Não autenticado." };

  cloudSyncStatus.value = "salvando";

  try {
    const res = await fetch("/api/sync/pull", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        desconectarConta();
        return { ok: false, error: "Sessão expirada." };
      }
      throw new Error(data.error || `Erro HTTP ${res.status}`);
    }
    const json = await res.json();

    if (json.payload) {
      const { totalImportados } = await restoreDatabase(json.payload, "merge");
      cloudSyncStatus.value = "salvo";
      const savedAt = json.savedAt || Date.now();
      setLastSyncTime(savedAt);
      cloudUltimoBackup.value = new Date(savedAt);
      return { ok: true, totalImportados };
    } else {
      // Primeira vez nesta conta: envia a base atual para a nuvem
      return await sincronizarInteligente();
    }
  } catch (err) {
    console.error("Falha ao puxar da nuvem:", err);
    cloudSyncStatus.value = "erro";
    return { ok: false, error: String(err) };
  }
}

// Aliases para compatibilidade
export const enviarBackupNuvem = sincronizarInteligente;
export const sincronizarAgora = sincronizarInteligente;
