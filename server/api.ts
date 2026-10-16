/**
 * Backend da API de Autenticação e Sincronização em Nuvem (Finansys Cloud Vault).
 * Utiliza o Deno KV nativo para armazenamento de contas e backups.
 * Suporta payloads de qualquer tamanho dividindo em chunks seguros (< 64 KB).
 */

// Abre o KV do Deno (com suporte local e Deno Deploy)
// deno-lint-ignore no-explicit-any
let _kvPromise: Promise<any> | null = null;

// deno-lint-ignore no-explicit-any
async function getKv(): Promise<any> {
  if (_kvPromise) return _kvPromise;

  _kvPromise = (async () => {
    // deno-lint-ignore no-explicit-any
    const denoAny = Deno as any;
    if (typeof denoAny.openKv !== "function") {
      throw new Error("Deno KV não está disponível. Verifique se o banco de dados KV está ativado no painel do Deno Deploy (aba KV).");
    }

    try {
      // 1. Tenta Deno.openKv() nativo (Deno Deploy com banco associado ou local)
      return await denoAny.openKv();
    } catch (err1: any) {
      console.warn("[Finansys] openKv() nativo falhou, tentando fallback local:", err1);
      try {
        // 2. Fallback para arquivo SQLite local
        return await denoAny.openKv("./finansys_data.db");
      } catch (err2: any) {
        console.error("[Finansys] Falha total ao abrir Deno KV:", err2);
        throw new Error(`Erro ao conectar ao Deno KV: ${err1?.message || err1}`);
      }
    }
  })();

  return _kvPromise;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const CHUNK_SIZE = 48_000; // 48.000 caracteres por chunk (bem abaixo dos 65.536 bytes limite do Deno KV)

// Gerenciador global de conexões Server-Sent Events (SSE) para atualização em tempo real entre dispositivos
const sseSubscribers = new Map<string, Set<ReadableStreamDefaultController>>();

function notifySyncUpdate(email: string, savedAt: number, senderId?: string) {
  const subs = sseSubscribers.get(email);
  if (!subs || subs.size === 0) return;
  const msg = new TextEncoder().encode(`data: ${JSON.stringify({ type: "sync_updated", savedAt, senderId })}\n\n`);
  for (const controller of subs) {
    try {
      controller.enqueue(msg);
    } catch (_err) {
      subs.delete(controller);
    }
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password + salt),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    true,
    ["sign"],
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  return Array.from(new Uint8Array(exported)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
async function saveBackupKv(kv: any, email: string, payload: unknown, savedAt: number): Promise<void> {
  const jsonString = JSON.stringify(payload);
  const chunks: string[] = [];
  for (let i = 0; i < jsonString.length; i += CHUNK_SIZE) {
    chunks.push(jsonString.slice(i, i + CHUNK_SIZE));
  }

  // Remove chunks antigos
  const oldChunks = kv.list({ prefix: ["backups", email, "chunk"] });
  for await (const entry of oldChunks) {
    await kv.delete(entry.key);
  }

  // Salva metadata e cada chunk
  const atomic = kv.atomic();
  atomic.set(["backups", email, "meta"], {
    chunkCount: chunks.length,
    totalLength: jsonString.length,
    savedAt,
  });

  for (let i = 0; i < chunks.length; i++) {
    atomic.set(["backups", email, "chunk", i], chunks[i]);
  }

  const commitRes = await atomic.commit();
  if (!commitRes.ok) {
    // Fallback sequencial se o lote atômico estourar
    await kv.set(["backups", email, "meta"], {
      chunkCount: chunks.length,
      totalLength: jsonString.length,
      savedAt,
    });
    for (let i = 0; i < chunks.length; i++) {
      await kv.set(["backups", email, "chunk", i], chunks[i]);
    }
  }
}

// deno-lint-ignore no-explicit-any
async function getBackupKv(kv: any, email: string): Promise<{ payload: unknown; savedAt: number } | null> {
  // 1. Tenta formato particionado em chunks
  const metaEntry = await kv.get(["backups", email, "meta"]);
  if (metaEntry.value) {
    const meta = metaEntry.value as { chunkCount: number; savedAt: number };
    const chunks: string[] = [];
    for (let i = 0; i < meta.chunkCount; i++) {
      const c = await kv.get(["backups", email, "chunk", i]);
      if (c.value) chunks.push(c.value as string);
    }
    const fullJson = chunks.join("");
    return { payload: JSON.parse(fullJson), savedAt: meta.savedAt };
  }

  // 2. Retrocompatibilidade para backups pequenos no formato antigo
  const legacy = await kv.get(["backups", email]);
  if (legacy.value) {
    return legacy.value as { payload: unknown; savedAt: number };
  }

  return null;
}

export async function handleApiRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/")) return null;

  // Pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const kv = await getKv();

  // Helper para ler token do header
  const getAuthUser = async (): Promise<string | null> => {
    const auth = req.headers.get("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) return null;
    const token = auth.slice(7).trim();
    const session = await kv.get(["sessions", token]);
    return (session.value as { email: string })?.email || null;
  };

  // 1. GET /api/auth/lookup (Reconhece se o e-mail já existe e retorna o nome cadastrado)
  if (url.pathname === "/api/auth/lookup" && req.method === "GET") {
    const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return json({ exists: false });
    }
    const userEntry = await kv.get(["users", email]);
    if (!userEntry.value) {
      return json({ exists: false });
    }
    const user = userEntry.value as { nome?: string };
    return json({ exists: true, email, nome: user.nome || "" });
  }

  // 2. POST /api/auth (Login ou Registro unificado com email e senha)
  if (url.pathname === "/api/auth" && req.method === "POST") {
    try {
      const body = await req.json();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "").trim();

      if (!email || !email.includes("@")) {
        return json({ error: "E-mail inválido." }, 400);
      }
      if (password.length < 4) {
        return json({ error: "A senha deve ter pelo menos 4 caracteres." }, 400);
      }

      const nomeRecebido = String(body.nome || "").trim();
      const extractName = (em: string) => {
        const raw = em.split("@")[0].replace(/[._-]/g, " ");
        return raw.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      };

      const userEntry = await kv.get(["users", email]);

      if (!userEntry.value) {
        // Cria nova conta com nome
        const nome = nomeRecebido || extractName(email);
        const salt = crypto.randomUUID();
        const hash = await hashPassword(password, salt);
        await kv.set(["users", email], { email, nome, salt, hash, createdAt: Date.now() });

        const token = crypto.randomUUID();
        await kv.set(["sessions", token], { email, createdAt: Date.now() });
        return json({ ok: true, isNew: true, token, email, nome });
      } else {
        // Usuário existente: valida senha
        const user = userEntry.value as { salt: string; hash: string; nome?: string };
        const testHash = await hashPassword(password, user.salt);
        if (testHash !== user.hash) {
          return json({ error: "Senha incorreta para este e-mail." }, 401);
        }

        // Se o usuário já possuía nome cadastrado, PRESERVA o nome cadastrado
        let nome = user.nome;
        if (nomeRecebido && nomeRecebido !== user.nome) {
          nome = nomeRecebido;
          await kv.set(["users", email], { ...user, nome });
        } else if (!nome) {
          nome = nomeRecebido || extractName(email);
          await kv.set(["users", email], { ...user, nome });
        }

        const token = crypto.randomUUID();
        await kv.set(["sessions", token], { email, createdAt: Date.now() });
        return json({ ok: true, isNew: false, token, email, nome });
      }
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  }

  // 3. GET /api/auth/me (Validação de sessão ativa)
  if (url.pathname === "/api/auth/me" && req.method === "GET") {
    const email = await getAuthUser();
    if (!email) return json({ error: "Não autenticado." }, 401);
    const userEntry = await kv.get(["users", email]);
    const nome = (userEntry.value as { nome?: string })?.nome || email.split("@")[0];
    return json({ email, nome });
  }

  // 4. POST /api/auth/profile (Atualiza o nome do usuário autenticado)
  if (url.pathname === "/api/auth/profile" && req.method === "POST") {
    const email = await getAuthUser();
    if (!email) return json({ error: "Não autenticado." }, 401);
    try {
      const body = await req.json();
      const novoNome = String(body.nome || "").trim();
      if (!novoNome) return json({ error: "O nome não pode ser vazio." }, 400);

      const userEntry = await kv.get(["users", email]);
      if (!userEntry.value) return json({ error: "Usuário não encontrado." }, 404);

      const user = userEntry.value as { salt: string; hash: string; nome?: string };
      await kv.set(["users", email], { ...user, nome: novoNome });
      return json({ ok: true, email, nome: novoNome });
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  }

  // 3. POST /api/sync/push (Salva backup em nuvem com chunking seguro e notifica dispositivos)
  if (url.pathname === "/api/sync/push" && req.method === "POST") {
    const email = await getAuthUser();
    if (!email) return json({ error: "Não autenticado." }, 401);

    try {
      const body = await req.json();
      if (!body.payload) return json({ error: "Payload vazio." }, 400);

      const savedAt = Date.now();
      await saveBackupKv(kv, email, body.payload, savedAt);

      // Notifica todos os nós e instâncias do Deno KV distribuído
      try {
        await kv.set(["sync_updates", email], { savedAt, senderId: body.clientId });
      } catch (_e) {
        // ignore
      }

      // Notifica todos os dispositivos conectados à mesma conta via SSE local
      notifySyncUpdate(email, savedAt, body.clientId);

      return json({ ok: true, savedAt });
    } catch (err) {
      console.error("Erro ao salvar backup no KV:", err);
      return json({ error: "Falha ao gravar backup no banco de dados: " + String(err) }, 500);
    }
  }

  // 4. GET /api/sync/pull (Recupera último backup em nuvem)
  if (url.pathname === "/api/sync/pull" && req.method === "GET") {
    const email = await getAuthUser();
    if (!email) return json({ error: "Não autenticado." }, 401);

    try {
      const backup = await getBackupKv(kv, email);
      if (!backup) {
        return json({ payload: null, savedAt: null });
      }
      return json(backup);
    } catch (err) {
      console.error("Erro ao recuperar backup do KV:", err);
      return json({ error: "Falha ao ler backup do banco de dados: " + String(err) }, 500);
    }
  }

  // 5. GET /api/sync/status (Verificação rápida e leve de atualização na nuvem)
  if (url.pathname === "/api/sync/status" && req.method === "GET") {
    const email = await getAuthUser();
    if (!email) return json({ error: "Não autenticado." }, 401);

    try {
      const metaEntry = await kv.get(["backups", email, "meta"]);
      const savedAt = (metaEntry.value as { savedAt?: number })?.savedAt || null;
      return json({ savedAt });
    } catch (_err) {
      return json({ savedAt: null });
    }
  }

  // 6. GET /api/sync/events (Canal SSE com Deno KV watch distribuído)
  if (url.pathname === "/api/sync/events" && req.method === "GET") {
    let token = url.searchParams.get("token");
    if (!token) {
      const auth = req.headers.get("Authorization");
      if (auth && auth.startsWith("Bearer ")) token = auth.slice(7).trim();
    }
    if (!token) return json({ error: "Token não fornecido." }, 401);

    const session = await kv.get(["sessions", token]);
    const email = (session.value as { email: string })?.email;
    if (!email) return json({ error: "Sessão inválida ou expirada." }, 401);

    let streamController: ReadableStreamDefaultController | null = null;
    // deno-lint-ignore no-explicit-any
    let kvWatcherStream: any = null;

    const body = new ReadableStream({
      async start(controller) {
        // Ping inicial
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "connected", email })}\n\n`));

        // Inicia escuta nativa do Deno KV watch (propaga entre todas as instâncias do Deno Deploy)
        let hasKvWatch = false;
        try {
          if (typeof kv.watch === "function") {
            const watcher = kv.watch([["sync_updates", email]]);
            kvWatcherStream = watcher;
            hasKvWatch = true;
            const reader = watcher.getReader();
            (async () => {
              try {
                while (true) {
                  const { value, done } = await reader.read();
                  if (done) break;
                  const entry = value?.[0];
                  if (entry && entry.value) {
                    const data = entry.value as { savedAt: number; senderId?: string };
                    const msg = new TextEncoder().encode(`data: ${JSON.stringify({ type: "sync_updated", savedAt: data.savedAt, senderId: data.senderId })}\n\n`);
                    controller.enqueue(msg);
                  }
                }
              } catch (_err) {
                // Stream encerrada
              } finally {
                reader.releaseLock();
              }
            })();
          }
        } catch (_err) {
          console.warn("[Finansys] kv.watch não disponível:", _err);
        }

        // Fallback local caso kv.watch não esteja disponível no ambiente
        if (!hasKvWatch) {
          if (!sseSubscribers.has(email)) {
            sseSubscribers.set(email, new Set());
          }
          sseSubscribers.get(email)!.add(controller);
        }
      },
      cancel() {
        if (kvWatcherStream) {
          try {
            kvWatcherStream.cancel();
          } catch (_e) {}
        }
        if (streamController && sseSubscribers.has(email)) {
          sseSubscribers.get(email)!.delete(streamController);
        }
      },
    });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        ...CORS_HEADERS,
      },
    });
  }

    return json({ error: "Rota não encontrada." }, 404);
  } catch (err: any) {
    console.error("[Finansys API Handler Error]:", err);
    return json({ error: "Erro no servidor: " + String(err?.message || err) }, 500);
  }
}
