import { signal } from "@preact/signals";
import { toast } from "../components/Toast.tsx";
import { dumpDatabase, isRestoring, limparBancoLocal, restoreDatabase } from "./backup.ts";
import { changes } from "./db.ts";
import { googleUser, syncStatus, ultimoBackup } from "./driveSync.ts";
import { anoAtivo, empresaAtiva, loadState } from "../state.ts";

export type CloudState = "desconectado" | "salvo" | "salvando" | "pendente" | "erro";

export const cloudUser = signal<{ email: string; nome?: string } | null>(null);
export const cloudSyncStatus = signal<CloudState>("desconectado");
export const cloudUltimoBackup = signal<Date | null>(null);

/** Notificação quando este aparelho teve a sessão revogada por outro dispositivo */
export const sessionRevokedSignal = signal<{ revoked: boolean; newDevice?: string } | null>(null);

export function fecharAvisoSessionRevoked() {
  sessionRevokedSignal.value = null;
}

const TOKEN_KEY = "finansys_cloud_token";
const USER_KEY = "finansys_cloud_user";
const LAST_SYNC_KEY = "finansys_last_cloud_sync_time";

// Identificador único da sessão desta aba para evitar eco SSE
const CLIENT_SESSION_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

export function getDeviceId(): string {
  let id = localStorage.getItem("finansys_device_id");
  if (!id) {
    id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("finansys_device_id", id);
  }
  return id;
}

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  let dev = "Navegador";
  if (/Android/i.test(ua)) dev = "Android";
  else if (/iPhone/i.test(ua)) dev = "iPhone";
  else if (/iPad/i.test(ua)) dev = "iPad";
  else if (/Windows/i.test(ua)) dev = "PC Windows";
  else if (/Macintosh|Mac OS/i.test(ua)) dev = "Mac";
  else if (/Linux/i.test(ua)) dev = "Linux";

  let browser = "Web";
  if (/Edg/i.test(ua)) browser = "Edge";
  else if (/Chrome/i.test(ua)) browser = "Chrome";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua)) browser = "Safari";

  return `${browser} no ${dev}`;
}

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

        // Se outro dispositivo assumiu a sessão ativa desta conta:
        if (data.type === "session_revoked") {
          console.warn("[Finansys Cloud] Sessão revogada por outro dispositivo:", data.newDevice);
          await limparDadosLocaisCompletos();
          sessionRevokedSignal.value = {
            revoked: true,
            newDevice: data.newDevice || "Outro dispositivo",
          };
          return;
        }

        if (data.type === "sync_updated") {
          // Ignora notificações disparadas por este próprio cliente/aba
          if (data.senderId && data.senderId === CLIENT_SESSION_ID) {
            return;
          }

          if (isPulling) return;
          isPulling = true;

          try {
            console.log("[Finansys Cloud] Evento recebido de outro dispositivo. Atualizando...");
            const res = await puxarBackupNuvem(false, "overwrite");
            if (res.ok && (res.totalImportados ?? 0) > 0) {
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
      // Tenta reconectar apenas se a sessão continuar ativa e não tiver sido revogada
      if (getToken() && !sessionRevokedSignal.value && !reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          iniciarConexaoSSE();
        }, 4000);
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
            const errData = await r.json().catch(() => ({}));
            if (errData.error === "SESSION_REVOKED") {
              await limparDadosLocaisCompletos();
              sessionRevokedSignal.value = {
                revoked: true,
                newDevice: errData.newDevice || "Outro dispositivo",
              };
            } else {
              await desconectarConta(false);
            }
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
 * Zera completamente o banco de dados IndexedDB e chaves de sessão,
 * garantindo um sistema 100% limpo sem qualquer resquício de contas anteriores.
 */
export async function limparDadosLocaisCompletos(): Promise<void> {
  // 1. Zera todas as tabelas locais (IndexedDB / Dexie)
  await limparBancoLocal();

  // 2. Remove tokens e chaves de sessão
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
  localStorage.removeItem("finansys_auth_prompted");
  localStorage.removeItem("g_drive_access_token");
  localStorage.removeItem("g_drive_user");

  // 3. Reseta os estados da nuvem
  cloudUser.value = null;
  cloudSyncStatus.value = "desconectado";
  cloudUltimoBackup.value = null;

  // 4. Reseta os estados do Google Drive
  googleUser.value = null;
  syncStatus.value = "desconectado";
  ultimoBackup.value = null;

  // 5. Reseta seleção de empresa e ano
  empresaAtiva.value = null;
  anoAtivo.value = new Date().getFullYear();

  // 6. Encerra conexão SSE
  if (eventSource) {
    try {
      eventSource.close();
    } catch (_e) {
      // ignore
    }
    eventSource = null;
  }
}

/**
 * Entra ou cria conta com controle de sessão única por aparelho.
 * Se outro dispositivo estiver conectado, sinaliza requiresTakeoverConfirm.
 */
export async function autenticarConta(
  email: string,
  password: string,
  nome?: string,
  confirmTakeover = false,
): Promise<{
  ok: boolean;
  error?: string;
  isNew?: boolean;
  requiresTakeoverConfirm?: boolean;
  activeDeviceName?: string;
  message?: string;
}> {
  try {
    const deviceId = getDeviceId();
    const deviceName = getDeviceName();

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, nome, deviceId, deviceName, confirmTakeover }),
    });

    const text = await res.text();
    // deno-lint-ignore no-explicit-any
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch (_e) {
      return { ok: false, error: `Servidor retornou erro (${res.status}): ${text.slice(0, 160) || "Sem resposta válida"}` };
    }

    if (json.requiresTakeoverConfirm) {
      return {
        ok: false,
        requiresTakeoverConfirm: true,
        activeDeviceName: json.activeDeviceName || "Outro dispositivo",
        message: json.message,
      };
    }

    if (!res.ok) {
      return { ok: false, error: json.error || "Erro ao conectar conta." };
    }

    // 1. ZERA totalmente os dados locais para evitar qualquer contaminação cruzada
    await limparDadosLocaisCompletos();

    // 2. Grava novas credenciais
    localStorage.setItem(TOKEN_KEY, json.token);
    const u = { email: json.email, nome: json.nome };
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    if (json.nome) setCachedName(json.email, json.nome);
    cloudUser.value = u;
    cloudSyncStatus.value = "salvando";

    // 3. Puxa os dados diretamente da nuvem com sobrescrita total (overwrite)
    const pullRes = await puxarBackupNuvem(false, "overwrite");
    if (pullRes.ok && (pullRes.totalImportados ?? 0) > 0) {
      await loadState();
      cloudSyncStatus.value = "salvo";
    } else {
      // Conta nova e sem dados: a base permanece 100% limpa e vazia
      cloudSyncStatus.value = "salvo";
    }

    iniciarConexaoSSE();

    return { ok: true, isNew: json.isNew };
  } catch (err) {
    return { ok: false, error: "Servidor indisponível ou erro de rede: " + String(err) };
  }
}

export async function desconectarConta(showToast = true): Promise<void> {
  const token = getToken();
  if (token) {
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  await limparDadosLocaisCompletos();

  if (showToast) {
    toast.info("Você saiu da conta. Todos os dados locais foram limpos com segurança.");
  }
}

/**
 * SINCRONIZAÇÃO INTELIGENTE BIDIRECIONAL:
 * 1. Puxa os dados da nuvem primeiro e mescla na base local se houver alterações de outro aparelho.
 * 2. Em seguida, extrai a base local consolidada e envia de volta para a nuvem.
 */
export async function sincronizarInteligente(): Promise<{ ok: boolean; error?: string }> {
  const token = getToken();
  if (!token) {
    cloudSyncStatus.value = "desconectado";
    return { ok: false, error: "Nenhuma conta conectada. Faça login com seu e-mail primeiro." };
  }

  cloudSyncStatus.value = "salvando";

  try {
    // 1. Puxa o backup atual da nuvem para mesclar alterações remotas se houver
    const pullRes = await fetch("/api/sync/pull", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (pullRes.ok) {
      const pullJson = await pullRes.json();
      if (pullJson.payload) {
        await restoreDatabase(pullJson.payload, "merge");
        if (pullJson.savedAt) {
          setLastSyncTime(pullJson.savedAt);
          cloudUltimoBackup.value = new Date(pullJson.savedAt);
        }
      }
    } else if (pullRes.status === 401) {
      const errData = await pullRes.json().catch(() => ({}));
      if (errData.error === "SESSION_REVOKED") {
        await limparDadosLocaisCompletos();
        sessionRevokedSignal.value = {
          revoked: true,
          newDevice: errData.newDevice || "Outro dispositivo",
        };
        return { ok: false, error: "Sessão desconectada porque foi acessada em outro aparelho." };
      }
      await desconectarConta(false);
      return { ok: false, error: "Sua sessão expirou. Por favor, entre novamente." };
    }

    // 2. Extrai a base local consolidada
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
      if (pushRes.status === 401 && data.error === "SESSION_REVOKED") {
        await limparDadosLocaisCompletos();
        sessionRevokedSignal.value = {
          revoked: true,
          newDevice: data.newDevice || "Outro dispositivo",
        };
        return { ok: false, error: "Sessão desconectada porque foi acessada em outro aparelho." };
      }
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
 * Puxa os dados salvos na nuvem e restaura no banco local.
 */
export async function puxarBackupNuvem(
  _mostrarAviso = true,
  strategy: "merge" | "overwrite" = "overwrite",
): Promise<{ ok: boolean; error?: string; totalImportados?: number }> {
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
        if (data.error === "SESSION_REVOKED") {
          await limparDadosLocaisCompletos();
          sessionRevokedSignal.value = {
            revoked: true,
            newDevice: data.newDevice || "Outro dispositivo",
          };
          return { ok: false, error: "Sessão desconectada em outro aparelho." };
        }
        await desconectarConta(false);
        return { ok: false, error: "Sessão expirada." };
      }
      throw new Error(data.error || `Erro HTTP ${res.status}`);
    }
    const json = await res.json();

    if (json.payload) {
      const { totalImportados } = await restoreDatabase(json.payload, strategy);
      await loadState();
      cloudSyncStatus.value = "salvo";
      const savedAt = json.savedAt || Date.now();
      setLastSyncTime(savedAt);
      cloudUltimoBackup.value = new Date(savedAt);
      return { ok: true, totalImportados };
    } else {
      cloudSyncStatus.value = "salvo";
      return { ok: true, totalImportados: 0 };
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
