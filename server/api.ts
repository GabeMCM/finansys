import { MongoClient, type Db } from "mongodb";
import { getHot100, fetchMarketTicker } from "./market.ts";

/**
 * Backend da API de Autenticação e Sincronização em Nuvem (Finansys Cloud Vault).
 * Utiliza o MongoDB Atlas para armazenamento seguro de contas e backups JSON.
 */

// Tenta carregar .env em ambiente local se existir
try {
  const envText = await Deno.readTextFile("./.env");
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!Deno.env.get(key)) {
        Deno.env.set(key, val);
      }
    }
  }
} catch {
  // Ignora se não existir (em produção no Deno Deploy injetado via painel)
}

let _mongoClient: MongoClient | null = null;
let _db: Db | null = null;
let _dbPromise: Promise<Db> | null = null;

export async function getDb(): Promise<Db> {
  if (_db) return _db;
  if (_dbPromise) return _dbPromise;

  _dbPromise = (async () => {
    try {
      const uri = Deno.env.get("MONGODB_URI");
      if (!uri) {
        throw new Error("Variável de ambiente MONGODB_URI não configurada no Render.");
      }

      _mongoClient = new MongoClient(uri);
      await _mongoClient.connect();
      const dbName = Deno.env.get("DENO_TESTING") === "true" ? "finansys_test" : "finansys";
      const database = _mongoClient.db(dbName);

      // Índices de alta performance e integridade
      try {
        await database.collection("users").createIndex({ email: 1 }, { unique: true });
        await database.collection("backups").createIndex({ email: 1 }, { unique: true });
        await database.collection("sessions").createIndex({ token: 1 }, { unique: true });
        await database.collection("sessions").createIndex({ email: 1, deviceId: 1 });
        // TTL Index para expirar sessões sem uso há mais de 60 dias (evita acúmulo desnecessário de sessions)
        await database.collection("sessions").createIndex({ lastActiveAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 });

        // Índices nas collections individuais por feature com vínculo de usuário e IDs
        const featureCols = [
          "col_empresas", "col_anos", "col_categorias", "col_contas",
          "col_contas_bancarias", "col_projecoes", "col_lancamentos",
          "col_reservas", "col_reserva_movimentos", "col_reserva_projecoes",
          "col_operacoes_investimento"
        ];
        for (const c of featureCols) {
          await database.collection(c).createIndex({ userEmail: 1 });
        }
      } catch (_idxErr) {
        // Índices já existentes
      }

      _db = database;
      return database;
    } catch (err) {
      _dbPromise = null;
      _mongoClient = null;
      _db = null;
      throw err;
    }
  })();

  return _dbPromise;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Gerenciador global de conexões Server-Sent Events (SSE) para atualização em tempo real entre dispositivos
const sseSubscribers = new Map<string, Set<ReadableStreamDefaultController>>();

function notifySyncUpdate(email: string, savedAt: number, senderId?: string) {
  const subs = sseSubscribers.get(email.toLowerCase());
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

const FEATURE_COLLECTION_MAP: Record<string, string> = {
  empresas: "col_empresas",
  anos: "col_anos",
  categorias: "col_categorias",
  contas: "col_contas",
  contasBancarias: "col_contas_bancarias",
  projecoes: "col_projecoes",
  lancamentos: "col_lancamentos",
  reservas: "col_reservas",
  reservaMovimentos: "col_reserva_movimentos",
  reservaProjecoes: "col_reserva_projecoes",
  operacoesInvestimento: "col_operacoes_investimento",
};

/**
 * Grava atômica e individualmente cada entidade em sua própria collection no MongoDB Atlas com vínculo por ID.
 */
async function syncCollectionsIndividuais(db: Db, email: string, data: Record<string, unknown[]>) {
  for (const [field, colName] of Object.entries(FEATURE_COLLECTION_MAP)) {
    const items = data[field];
    if (!Array.isArray(items)) continue;

    const col = db.collection(colName);
    if (items.length === 0) {
      await col.deleteMany({ userEmail: email });
      continue;
    }

    const currentIds = new Set<string>();
    // deno-lint-ignore no-explicit-any
    const bulkOps: any[] = [];

    for (const rawItem of items) {
      // deno-lint-ignore no-explicit-any
      const item = rawItem as any;
      if (!item || !item.id) continue;
      currentIds.add(String(item.id));

      bulkOps.push({
        updateOne: {
          filter: { _id: String(item.id), userEmail: email },
          update: {
            $set: {
              ...item,
              _id: String(item.id),
              userEmail: email,
              updatedAt: item.updatedAt || Date.now(),
            },
          },
          upsert: true,
        },
      });
    }

    if (currentIds.size > 0) {
      bulkOps.push({
        deleteMany: {
          filter: {
            userEmail: email,
            _id: { $nin: Array.from(currentIds) },
          },
        },
      });
    }

    if (bulkOps.length > 0) {
      await col.bulkWrite(bulkOps, { ordered: false });
    }
  }
}

/**
 * Reconstitui o payload estruturado a partir das collections dedicadas do MongoDB.
 */
async function assemblePayloadFromCollections(db: Db, email: string): Promise<Record<string, unknown[]> | null> {
  const data: Record<string, unknown[]> = {};
  let totalCount = 0;

  for (const [field, colName] of Object.entries(FEATURE_COLLECTION_MAP)) {
    const docs = await db.collection(colName).find({ userEmail: email }).toArray();
    data[field] = docs.map((d) => {
      // deno-lint-ignore no-unused-vars
      const { _id, userEmail, ...rest } = d;
      return { id: (rest.id as string) || String(_id), ...rest };
    });
    totalCount += docs.length;
  }

  if (totalCount === 0) return null;
  return data;
}

export async function handleApiRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/")) return null;

  // Pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const db = await getDb();

    // Helper para ler token do header e verificar sessão
    const getAuth = async (): Promise<
      | { ok: true; email: string; token: string }
      | { ok: false; status: number; error: string }
    > => {
      const auth = req.headers.get("Authorization");
      if (!auth || !auth.startsWith("Bearer ")) {
        return { ok: false, status: 401, error: "Não autenticado." };
      }
      const token = auth.slice(7).trim();

      const session = await db.collection("sessions").findOne({ token });
      if (!session) {
        return { ok: false, status: 401, error: "Sessão inválida ou expirada." };
      }

      // Atualiza timestamp de última atividade da sessão sem bloquear a resposta
      void db.collection("sessions").updateOne(
        { token },
        { $set: { lastActiveAt: Date.now() } }
      ).catch(() => {});

      return { ok: true, email: (session.email as string).toLowerCase(), token };
    };

    // 1. GET /api/auth/lookup (Reconhece se o e-mail já existe e retorna o nome cadastrado)
    if (url.pathname === "/api/auth/lookup" && req.method === "GET") {
      const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
      if (!email || !email.includes("@")) {
        return json({ exists: false });
      }
      const user = await db.collection("users").findOne({ email });
      if (!user) {
        return json({ exists: false });
      }
      return json({ exists: true, email, nome: (user.nome as string) || "" });
    }

    // 2. POST /api/auth (Login ou Registro com 1 sessão por dispositivo e controle de acúmulo)
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

        const usersCol = db.collection("users");
        const user = await usersCol.findOne({ email });
        let isNew = false;
        let nome = "";

        if (!user) {
          // Cria nova conta
          isNew = true;
          nome = nomeRecebido || extractName(email);
          const salt = crypto.randomUUID();
          const hash = await hashPassword(password, salt);
          await usersCol.insertOne({ email, nome, salt, hash, createdAt: Date.now() });
        } else {
          // Usuário existente: valida senha
          const testHash = await hashPassword(password, user.salt as string);
          if (testHash !== user.hash) {
            return json({ error: "Senha incorreta para este e-mail." }, 401);
          }

          nome = (user.nome as string) || "";
          if (nomeRecebido && nomeRecebido !== user.nome) {
            nome = nomeRecebido;
            await usersCol.updateOne({ email }, { $set: { nome } });
          } else if (!nome) {
            nome = nomeRecebido || extractName(email);
            await usersCol.updateOne({ email }, { $set: { nome } });
          }
        }

        // Identificação do dispositivo para garantir 1 sessão única por aparelho
        const deviceId = String(body.deviceId || "").trim() || "unknown";
        const deviceName = String(body.deviceName || "").trim() || "Dispositivo";

        // Remove qualquer sessão anterior deste mesmo aparelho/dispositivo
        if (deviceId && deviceId !== "unknown") {
          await db.collection("sessions").deleteMany({ email, deviceId });
        }

        // Limita o número de sessões abertas do mesmo usuário (mantém as 5 mais recentes)
        const existingSessions = await db.collection("sessions")
          .find({ email })
          .sort({ lastActiveAt: -1, createdAt: -1 })
          .toArray();
        if (existingSessions.length >= 5) {
          const idsToDelete = existingSessions.slice(4).map((s) => s._id);
          await db.collection("sessions").deleteMany({ _id: { $in: idsToDelete } });
        }

        // Registra a nova sessão única para este dispositivo
        const token = crypto.randomUUID();
        const now = Date.now();
        await db.collection("sessions").insertOne({
          token,
          email,
          deviceId,
          deviceName,
          createdAt: now,
          lastActiveAt: now,
        });

        return json({ ok: true, isNew, token, email, nome });
      } catch (err) {
        return json({ error: String(err) }, 500);
      }
    }

    // 3. POST /api/auth/logout (Desconecta sessão deste aparelho)
    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      const auth = req.headers.get("Authorization");
      if (auth && auth.startsWith("Bearer ")) {
        const token = auth.slice(7).trim();
        await db.collection("sessions").deleteOne({ token });
      }
      return json({ ok: true });
    }

    // 4. GET /api/auth/me (Validação de sessão ativa)
    if (url.pathname === "/api/auth/me" && req.method === "GET") {
      const auth = await getAuth();
      if (!auth.ok) {
        return json({ error: auth.error }, auth.status);
      }
      const user = await db.collection("users").findOne({ email: auth.email });
      const nome = (user?.nome as string) || auth.email.split("@")[0];
      return json({ email: auth.email, nome });
    }

    // 5. POST /api/auth/profile (Atualiza o nome do usuário autenticado)
    if (url.pathname === "/api/auth/profile" && req.method === "POST") {
      const auth = await getAuth();
      if (!auth.ok) {
        return json({ error: auth.error }, auth.status);
      }
      try {
        const body = await req.json();
        const novoNome = String(body.nome || "").trim();
        if (!novoNome) return json({ error: "O nome não pode ser vazio." }, 400);

        await db.collection("users").updateOne({ email: auth.email }, { $set: { nome: novoNome } });
        return json({ ok: true, email: auth.email, nome: novoNome });
      } catch (err) {
        return json({ error: String(err) }, 500);
      }
    }

    // 6. POST /api/sync/push (Salva backup em nuvem no MongoDB Atlas)
    if (url.pathname === "/api/sync/push" && req.method === "POST") {
      const auth = await getAuth();
      if (!auth.ok) {
        return json({ error: auth.error }, auth.status);
      }

      try {
        const body = await req.json();
        if (!body.payload) return json({ error: "Payload vazio." }, 400);

        // Proteção de segurança no servidor: não sobrescrever backup existente populado por um payload vazio
        // deno-lint-ignore no-explicit-any
        const payloadData = (body.payload as any)?.data || body.payload;
        const empresasCount = payloadData?.empresas?.length ?? 0;
        const lancamentosCount = payloadData?.lancamentos?.length ?? 0;

        if (empresasCount === 0 && lancamentosCount === 0) {
          const existing = await db.collection("backups").findOne({ email: auth.email });
          if (existing && existing.payload) {
            // deno-lint-ignore no-explicit-any
            const exData = (existing.payload as any)?.data || existing.payload;
            const exEmp = exData?.empresas?.length ?? 0;
            const exLanc = exData?.lancamentos?.length ?? 0;
            if (exEmp > 0 || exLanc > 0) {
              console.warn(`[Sync Server] Push de base vazia ignorado para ${auth.email} (preservando ${exEmp} empresas e ${exLanc} lançamentos remotos).`);
              return json({ ok: true, ignored: true, savedAt: existing.savedAt });
            }
          }
        }

        const savedAt = Date.now();
        await db.collection("backups").updateOne(
          { email: auth.email },
          {
            $set: {
              email: auth.email,
              payload: body.payload,
              savedAt,
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        );

        // Gravação individual e atômica por feature em collections dedicadas no MongoDB com vínculo por ID
        if (payloadData && typeof payloadData === "object") {
          try {
            await syncCollectionsIndividuais(db, auth.email, payloadData);
          } catch (syncColErr) {
            console.error("[Sync Collections] Erro ao sincronizar collections de features:", syncColErr);
          }
        }

        // Notifica nós e navegadores conectados via SSE
        notifySyncUpdate(auth.email, savedAt, body.clientId);

        return json({ ok: true, savedAt });
      } catch (err) {
        console.error("Erro ao salvar backup no MongoDB Atlas:", err);
        return json({ error: "Falha ao gravar backup no banco de dados: " + String(err) }, 500);
      }
    }

    // 7. GET /api/sync/pull (Recupera último backup em nuvem)
    if (url.pathname === "/api/sync/pull" && req.method === "GET") {
      const auth = await getAuth();
      if (!auth.ok) {
        return json({ error: auth.error }, auth.status);
      }

      try {
        const doc = await db.collection("backups").findOne({ email: auth.email });
        if (!doc) {
          // Tenta reconstituir das collections individuais de features se existirem
          const assembled = await assemblePayloadFromCollections(db, auth.email);
          if (assembled) {
            return json({ payload: { version: 4, exportedAt: Date.now(), data: assembled }, savedAt: Date.now() });
          }
          return json({ payload: null, savedAt: null });
        }
        return json({ payload: doc.payload, savedAt: doc.savedAt });
      } catch (err) {
        console.error("Erro ao recuperar backup do MongoDB Atlas:", err);
        return json({ error: "Falha ao ler backup do banco de dados: " + String(err) }, 500);
      }
    }

    // 8. GET /api/sync/status (Verificação rápida e leve de timestamp na nuvem)
    if (url.pathname === "/api/sync/status" && req.method === "GET") {
      const auth = await getAuth();
      if (!auth.ok) {
        return json({ error: auth.error }, auth.status);
      }

      try {
        const doc = await db.collection("backups").findOne(
          { email: auth.email },
          { projection: { savedAt: 1 } }
        );
        return json({ savedAt: doc?.savedAt || null });
      } catch (_err) {
        return json({ savedAt: null });
      }
    }

    // 9. GET /api/sync/events (Canal SSE em tempo real entre dispositivos)
    if (url.pathname === "/api/sync/events" && req.method === "GET") {
      let token = url.searchParams.get("token");
      if (!token) {
        const auth = req.headers.get("Authorization");
        if (auth && auth.startsWith("Bearer ")) token = auth.slice(7).trim();
      }
      if (!token) return json({ error: "Token não fornecido." }, 401);

      const session = await db.collection("sessions").findOne({ token });
      const email = session?.email ? String(session.email).toLowerCase() : null;
      if (!email) return json({ error: "Sessão inválida ou expirada." }, 401);

      let streamController: ReadableStreamDefaultController | null = null;

      const body = new ReadableStream({
        start(controller) {
          streamController = controller;

          // Registra assinante SSE local
          if (!sseSubscribers.has(email)) {
            sseSubscribers.set(email, new Set());
          }
          sseSubscribers.get(email)!.add(controller);

          // Ping inicial
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "connected", email })}\n\n`));
        },
        cancel() {
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

    // 10. GET /api/market/hotlist (Ranking Dinâmico de Longo Prazo do Melhor ao Pior Ativo - Hot 100)
    if (url.pathname === "/api/market/hotlist" && req.method === "GET") {
      try {
        const forceRefresh = url.searchParams.get("refresh") === "true";
        const res = await getHot100(forceRefresh, db);
        return json({
          ok: true,
          items: res.items,
          updatedAt: res.updatedAt,
          total: res.items.length,
          scanned: res.totalScanned,
        });
      } catch (err: any) {
        return json({ error: "Erro ao gerar ranking de mercado: " + String(err?.message || err) }, 500);
      }
    }

    // 11. GET /api/market/ticker (Busca e analisa qualquer ativo do Brasil ou do Mundo)
    if (url.pathname === "/api/market/ticker" && req.method === "GET") {
      const symbol = url.searchParams.get("symbol");
      if (!symbol) {
        return json({ error: "Parâmetro 'symbol' obrigatório na consulta." }, 400);
      }
      try {
        const data = await fetchMarketTicker(symbol);
        return json({ ok: true, data });
      } catch (err: any) {
        return json({ error: String(err?.message || err) }, 404);
      }
    }

    return json({ error: "Rota não encontrada." }, 404);
  } catch (err: any) {
    console.error("[Finansys API Handler Error]:", err);
    return json({ error: "Erro no servidor: " + String(err?.message || err) }, 500);
  }
}
