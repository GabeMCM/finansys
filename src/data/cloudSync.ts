import { signal } from "../lib/signal.ts";
import { toast } from "../components/Toast.tsx";
import { dumpDatabase, dumpDatabaseDelta, isRestoring, limparBancoLocal, restoreDatabase } from "./backup.ts";
import { db, changes } from "./db.ts";
import { resetInactivityTimer } from "./inactivityGuard.ts";
import { anoAtivo, empresaAtiva, loadState } from "../state.ts";

export type CloudState = "desconectado" | "salvo" | "salvando" | "pendente" | "erro";

export const cloudUser = signal<{ email: string; nome?: string } | null>(null);
export const cloudSyncStatus = signal<CloudState>("desconectado");
export const cloudUltimoBackup = signal<Date | null>(null);

// Mantido para compatibilidade de componentes que possam referenciar
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
let lastPushHash = "";
let lastPushTime = 0;

// Mutex de sincronização para garantir que push e pull nunca entrem em concorrência
let syncLock: Promise<unknown> = Promise.resolve();
function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = syncLock.then(() => fn(), () => fn());
  syncLock = next.catch(() => {});
  return next;
}

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
 * PROTOCOLO UNIFICADO DE CARREGAMENTO E RESTAURAÇÃO DE DADOS DA NUVEM:
 * - Busca os dados armazenados na conta do usuário no servidor.
 * - Restaura no IndexedDB local de forma atômica e segura.
 * - Atualiza a interface e estado da aplicação.
 */
export async function carregarDadosDaNuvem(
  forcar = false,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  return withSyncLock(async () => {
    const token = getToken();
    if (!token) {
      return { ok: false, error: "Nenhuma conta conectada. Faça login com seu e-mail primeiro." };
    }

    if (isPulling) {
      console.log("[Finansys Cloud] Pull já em execução. Aguardando...");
      return { ok: true, count: 0 };
    }

    isPulling = true;
    cloudSyncStatus.value = "salvando";

    try {
      const lastSync = getLastSyncTime();
      const pullUrl = (lastSync > 0 && !forcar) ? `/api/sync/pull?since=${lastSync}` : "/api/sync/pull";
      const res = await fetch(pullUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          await desconectarConta(false);
          return { ok: false, error: "Sua sessão expirou. Por favor, entre novamente." };
        }
        throw new Error(`Erro do servidor HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!json.payload || json.empty) {
        cloudSyncStatus.value = "salvo";
        return { ok: true, count: 0 };
      }

      // deno-lint-ignore no-explicit-any
      const dataObj = (json.payload as any)?.data || json.payload;

      // Restauração atômica com MERGE preservando dados locais
      const { totalImportados } = await restoreDatabase(json.payload, "merge");
      if (totalImportados > 0) {
        await loadState();
      }

      const savedAt = json.savedAt || Date.now();
      setLastSyncTime(savedAt);
      cloudUltimoBackup.value = new Date(savedAt);
      cloudSyncStatus.value = "salvo";

      console.log(`[Finansys Cloud] Sincronização concluída com sucesso: ${totalImportados} registros mesclados.`);
      return { ok: true, count: totalImportados };
    } catch (err) {
      console.error("Falha no protocolo de busca na nuvem:", err);
      cloudSyncStatus.value = "erro";
      return { ok: false, error: String(err) };
    } finally {
      isPulling = false;
    }
  });
}

// Alias para compatibilidade
export const puxarBackupNuvem = carregarDadosDaNuvem;

/**
 * Conexão Server-Sent Events (SSE) para receber avisos em tempo real
 * quando outro dispositivo (computador ou celular) sincroniza dados.
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
          // Ignora notificações disparadas por esta própria aba
          if (data.senderId && data.senderId === CLIENT_SESSION_ID) {
            return;
          }

          if (isPulling) return;
          console.log("[Finansys Cloud] Alteração recebida de outro dispositivo em tempo real. Atualizando delta...");

          const lastTime = getLastSyncTime();
          const pullUrl = lastTime > 0 ? `/api/sync/pull?since=${lastTime}` : "/api/sync/pull";
          const res = await fetch(pullUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const pullJson = await res.json();
            if (!pullJson.empty && pullJson.payload) {
              const { totalImportados } = await restoreDatabase(pullJson.payload, "merge");
              if (totalImportados > 0) {
                await loadState();
                const agora = Date.now();
                if (agora - lastToastTime > 3500) {
                  lastToastTime = agora;
                  toast.info("Dados sincronizados de outro aparelho em tempo real.", "Nuvem Finansys");
                }
              }
              if (pullJson.savedAt) {
                setLastSyncTime(pullJson.savedAt);
                cloudUltimoBackup.value = new Date(pullJson.savedAt);
              }
            }
          }
        }
      } catch (err) {
        console.error("Erro ao processar evento SSE:", err);
      }
    };

    es.onerror = () => {
      es.close();
      eventSource = null;
      if (getToken() && !reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          iniciarConexaoSSE();
        }, 5000);
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
            await desconectarConta(false);
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

      // 2. Se a base local estiver vazia, SEMPRE puxa da nuvem para restaurar tudo fielmente
      db.empresas.count().then(async (empCount) => {
        if (empCount === 0) {
          console.log("[Finansys Cloud] Base local vazia na inicialização. Puxando dados da nuvem...");
          await carregarDadosDaNuvem(true);
        } else {
          void verificarAtualizacaoNuvem();
        }
      }).catch(() => {});

      // 3. Abre o canal de comunicação em tempo real (SSE)
      iniciarConexaoSSE();
    } catch (_e) {
      // ignore
    }
  }

  // Escuta alterações locais no banco de dados para agendar backup automático
  changes.addEventListener("change", () => {
    // Ignora mutações geradas pela própria sincronização ou restauração
    if (isRestoring || isPulling) return;
    if (!getToken()) return;
    cloudSyncStatus.value = "pendente";

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void sincronizarInteligente();
    }, 600); // 600ms debounce ágil sem travar interface
  });

  // Salva imediatamente com keepalive ao fechar a aba ou mudar de página
  window.addEventListener("pagehide", () => {
    if (cloudSyncStatus.value === "pendente" && getToken()) {
      void sincronizarImediatoKeepalive();
    }
  });

  window.addEventListener("beforeunload", () => {
    if (cloudSyncStatus.value === "pendente" && getToken()) {
      void sincronizarImediatoKeepalive();
    }
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
    if (document.visibilityState === "hidden") {
      // No mobile e desktop: ao minimizar, trocar de aba ou bloquear a tela, salva imediatamente!
      if (cloudSyncStatus.value === "pendente" && getToken()) {
        void sincronizarImediatoKeepalive();
      }
    } else if (document.visibilityState === "visible") {
      if (getToken()) {
        iniciarConexaoSSE();
        void verificarAtualizacaoNuvem();
      }
    }
  });

  window.addEventListener("focus", () => {
    if (getToken()) {
      void verificarAtualizacaoNuvem();
    }
  });

  // Heartbeat de fallback a cada 60s
  setInterval(() => {
    if (getToken() && document.visibilityState === "visible") {
      void verificarAtualizacaoNuvem();
    }
  }, 60_000);
}

/**
 * Checa de forma leve se o servidor possui backup mais novo do que o nosso local.
 * Utiliza consulta delta granular via ?since=timestamp para transferir apenas o que mudou.
 */
async function verificarAtualizacaoNuvem() {
  const token = getToken();
  if (!token) return;

  return withSyncLock(async () => {
    try {
      const empCount = await db.empresas.count();
      if (empCount === 0) {
        await carregarDadosDaNuvem(true);
        return;
      }

      const res = await fetch("/api/sync/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { savedAt } = await res.json();
      const lastSync = getLastSyncTime();

      if (savedAt && savedAt > lastSync) {
        const pullUrl = lastSync > 0 ? `/api/sync/pull?since=${lastSync}` : "/api/sync/pull";
        const pullRes = await fetch(pullUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (pullRes.ok) {
          const pullJson = await pullRes.json();
          if (pullJson.payload && !pullJson.empty) {
            const { totalImportados } = await restoreDatabase(pullJson.payload, "merge");
            if (totalImportados > 0) {
              await loadState();
              toast.info("Dados mais recentes da nuvem sincronizados.", "Nuvem Finansys");
            }
          }
          setLastSyncTime(savedAt);
          cloudUltimoBackup.value = new Date(savedAt);
        }
      }
    } catch (_e) {
      // ignore
    }
  });
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
 */
export async function buscarPerfilPorEmail(email: string): Promise<{ exists: boolean; nome?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return { exists: false };
  }

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
 * Zera completamente o banco de dados IndexedDB e chaves de sessão.
 */
export async function limparDadosLocaisCompletos(): Promise<void> {
  // 1. Zera todas as tabelas locais (IndexedDB / Dexie)
  await limparBancoLocal();

  // 2. Remove tokens e chaves de sessão
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
  localStorage.removeItem("finansys_auth_prompted");

  // 3. Reseta os estados da nuvem
  cloudUser.value = null;
  cloudSyncStatus.value = "desconectado";
  cloudUltimoBackup.value = null;

  // 4. Reseta seleção de empresa e ano
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
 * Autentica ou cria conta com suporte multi-dispositivo seguro.
 * Imediatamente busca os dados salvos na nuvem daquela conta.
 */
export async function autenticarConta(
  email: string,
  password: string,
  nome?: string,
): Promise<{
  ok: boolean;
  error?: string;
  isNew?: boolean;
}> {
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        nome,
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
      }),
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

    // 1. Reseta o timer de inatividade
    resetInactivityTimer();

    // 2. Se houver uma sessão salva de outro usuário diferente, limpa dados residuais para isolamento
    const prevUserRaw = localStorage.getItem(USER_KEY);
    let prevEmail = "";
    try {
      prevEmail = prevUserRaw ? JSON.parse(prevUserRaw)?.email || "" : "";
    } catch {
      // ignore
    }

    if (prevEmail && prevEmail.toLowerCase() !== email.toLowerCase()) {
      console.log(`[Finansys Cloud] Mudança de usuário detectada (${prevEmail} -> ${email}). Limpando dados locais antigos...`);
      await limparDadosLocaisCompletos();
    }

    // 3. Grava novas credenciais
    localStorage.setItem(TOKEN_KEY, json.token);
    const u = { email: json.email, nome: json.nome };
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    if (json.nome) setCachedName(json.email, json.nome);
    cloudUser.value = u;
    cloudSyncStatus.value = "salvando";

    // 4. Executa o protocolo unificado de carregamento da nuvem com merge (sem perda de dados locais)
    const pullRes = await carregarDadosDaNuvem(false);
    if (pullRes.ok && (pullRes.count ?? 0) > 0) {
      toast.success(`Bem-vindo(a)! Dados da nuvem sincronizados com sucesso (${pullRes.count} registros).`);
    } else {
      await loadState();
      cloudSyncStatus.value = "salvo";
      if (!json.isNew) {
        toast.info("Conta conectada.");
      }
    }

    // 5. Se o usuário tinha dados locais criados antes de logar, sobe o estado consolidado
    void sincronizarInteligente();

    resetInactivityTimer();
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
 * Envia imediatamente as alterações pendentes usando fetch com keepalive.
 * Essencial para fechar a aba/sair do navegador sem perder nenhum dado.
 */
export async function sincronizarImediatoKeepalive(): Promise<void> {
  const token = getToken();
  if (!token) return;

  try {
    const lastSync = getLastSyncTime();
    const delta = await dumpDatabaseDelta(lastSync);
    if (delta.totalChanged === 0) return;

    if (!delta.isPartial) {
      const empCount = delta.data?.empresas?.length ?? 0;
      const lancCount = delta.data?.lancamentos?.length ?? 0;
      if (empCount === 0 && lancCount === 0) return;
    }

    fetch("/api/sync/push", {
      method: "POST",
      keepalive: true,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: delta, clientId: CLIENT_SESSION_ID }),
    }).catch(() => {});
  } catch (_e) {
    // ignore
  }
}

/**
 * SINCRONIZAÇÃO INTELIGENTE (PUSH GRANULAR DELTA COM MERGE):
 * - Envia apenas as tabelas e registros modificados desde a última sincronização.
 * - Leve, ultra-rápido, preservando dados em coleções separadas no MongoDB Atlas.
 */
export async function sincronizarInteligente(): Promise<{ ok: boolean; error?: string }> {
  return withSyncLock(async () => {
    const token = getToken();
    if (!token) {
      cloudSyncStatus.value = "desconectado";
      return { ok: false, error: "Nenhuma conta conectada. Faça login com seu e-mail primeiro." };
    }

    if (isPulling || isRestoring) {
      console.log("[Finansys Cloud] Sincronização ignorada pois restauração/pull está ativa.");
      return { ok: true };
    }

    const isPendente = cloudSyncStatus.value === "pendente";
    cloudSyncStatus.value = "salvando";

    try {
      // Se NÃO havia alterações pendentes locais, apenas marca como salvo e encerra
      if (!isPendente) {
        cloudSyncStatus.value = "salvo";
        return { ok: true };
      }

      const lastSync = getLastSyncTime();
      // Extrai apenas as mutações locais ocorridas desde a última sincronização (delta granular)
      const delta = await dumpDatabaseDelta(lastSync);

      // Se não há alterações locais pendentes
      if (delta.totalChanged === 0) {
        cloudSyncStatus.value = "salvo";
        return { ok: true };
      }

      // PROTEÇÃO ABSOLUTA: se for full dump (não parcial), nunca enviar se a base estiver 100% vazia
      if (!delta.isPartial) {
        const empCount = delta.data?.empresas?.length ?? 0;
        const lancCount = delta.data?.lancamentos?.length ?? 0;
        if (empCount === 0 && lancCount === 0) {
          console.warn("[Finansys Cloud] Base local vazia (0 empresas, 0 lançamentos). Envio bloqueado para proteger backup remoto.");
          cloudSyncStatus.value = "salvo";
          return { ok: true };
        }
      }

      // Envia o payload granular (delta) para a nuvem (MongoDB Atlas)
      const pushRes = await fetch("/api/sync/push", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ payload: delta, clientId: CLIENT_SESSION_ID }),
      });

      if (!pushRes.ok) {
        if (pushRes.status === 401) {
          await desconectarConta(false);
          return { ok: false, error: "Sua sessão expirou. Por favor, entre novamente." };
        }
        const data = await pushRes.json().catch(() => ({}));
        throw new Error(data.error || `Erro do servidor HTTP ${pushRes.status}`);
      }

      const pushData = await pushRes.json();
      if (pushData.payload && !pushData.empty) {
        // Se o servidor retornou novidades mescladas de outros dispositivos, mescla localmente
        await restoreDatabase(pushData.payload, "merge");
        await loadState();
      }

      lastPushTime = Date.now();
      const savedAt = Math.max(pushData.savedAt || Date.now(), delta.maxUpdatedAt);
      setLastSyncTime(savedAt);
      cloudSyncStatus.value = "salvo";
      cloudUltimoBackup.value = new Date(savedAt);

      return { ok: true };
    } catch (err) {
      console.error("Falha na sincronização inteligente:", err);
      cloudSyncStatus.value = "erro";
      return { ok: false, error: String(err) };
    }
  });
}

// Aliases para compatibilidade
export const enviarBackupNuvem = sincronizarInteligente;
export const sincronizarAgora = sincronizarInteligente;
