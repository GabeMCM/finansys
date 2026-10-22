import { signal } from "@preact/signals";
import { toast } from "../components/Toast.tsx";
import { dumpDatabase, isRestoring, limparBancoLocal, restoreDatabase } from "./backup.ts";
import { changes } from "./db.ts";
import { anoAtivo, empresaAtiva, loadState } from "../state.ts";

export type SyncState = "desconectado" | "salvo" | "salvando" | "pendente" | "erro";

export const syncStatus = signal<SyncState>("desconectado");
export const ultimoBackup = signal<Date | null>(null);
export const googleUser = signal<{ email: string; name?: string } | null>(null);

const DRIVE_FILE_NAME = "finansys_backup.json";
const SETTINGS_TOKEN_KEY = "g_drive_access_token";
const SETTINGS_CLIENT_ID = "g_client_id";

let debounceTimer: number | null = null;
let tokenInMemory: string | null = null;

// Inicializa lendo token ou credencial persistida
export function initDriveSync() {
  tokenInMemory = localStorage.getItem(SETTINGS_TOKEN_KEY);
  const userStr = localStorage.getItem("g_drive_user");
  if (userStr) {
    try {
      googleUser.value = JSON.parse(userStr);
      syncStatus.value = "salvo";
    } catch (_e) {
      // ignore
    }
  }

  // Escuta alterações locais no banco de dados para agendar backup automático
  changes.addEventListener("change", () => {
    if (isRestoring) return;
    if (!tokenInMemory) return;
    syncStatus.value = "pendente";

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void realizarBackupDrive();
    }, 10_000); // 10 segundos de debounce
  });

  // Escuta reconexão com a internet
  window.addEventListener("online", () => {
    if (tokenInMemory && syncStatus.value === "pendente") {
      void realizarBackupDrive();
    }
  });
}

/**
 * Autenticação via Google Identity Services (token client).
 */
export async function conectarGoogleDrive(clientId: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      localStorage.setItem(SETTINGS_CLIENT_ID, clientId);

      // deno-lint-ignore no-explicit-any
      const google = (window as any).google;
      if (!google || !google.accounts || !google.accounts.oauth2) {
        // Se a lib ainda não carregou, tenta via popup OAuth básico
        toast.warn("Aguardando carregamento da biblioteca do Google. Verifique a conexão com a internet.");
        resolve(false);
        return;
      }

      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
        // deno-lint-ignore no-explicit-any
        callback: async (response: any) => {
          if (response.error) {
            console.error("Erro Google Auth:", response);
            syncStatus.value = "erro";
            resolve(false);
            return;
          }

          tokenInMemory = response.access_token;
          localStorage.setItem(SETTINGS_TOKEN_KEY, response.access_token);

          // Obtém dados do usuário logado
          try {
            const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
              headers: { Authorization: `Bearer ${tokenInMemory}` },
            });
            if (userRes.ok) {
              const u = await userRes.json();
              googleUser.value = { email: u.email, name: u.name };
              localStorage.setItem("g_drive_user", JSON.stringify(googleUser.value));
            }
          } catch (_e) {
            googleUser.value = { email: "Conectado ao Drive" };
          }

          // Ao conectar num novo aparelho, busca backup existente no Drive
          await restaurarDoDrive();
          resolve(true);
        },
      });

      client.requestAccessToken();
    } catch (err) {
      console.error(err);
      resolve(false);
    }
  });
}

export async function desconectarGoogleDrive() {
  tokenInMemory = null;
  localStorage.removeItem(SETTINGS_TOKEN_KEY);
  localStorage.removeItem("g_drive_user");
  googleUser.value = null;
  syncStatus.value = "desconectado";
  ultimoBackup.value = null;

  await limparBancoLocal();
  empresaAtiva.value = null;
  anoAtivo.value = new Date().getFullYear();
  toast.info("Google Drive desconectado. Dados locais limpos com segurança.");
}

/**
 * Localiza ou cria a pasta visível "Finansys" na raiz do Meu Drive.
 */
async function obterOuCriarPastaFinansys(token: string): Promise<string> {
  const query = encodeURIComponent("name = 'Finansys' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // Cria a pasta Finansys visível na raiz
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Finansys",
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  if (!createRes.ok) {
    throw new Error("Não foi possível criar a pasta Finansys no Google Drive.");
  }

  const created = await createRes.json();
  return created.id;
}

/**
 * Envia o backup completo da base para a pasta visível Finansys do Google Drive.
 */
export async function realizarBackupDrive(): Promise<boolean> {
  if (!tokenInMemory || !navigator.onLine) {
    if (tokenInMemory && !navigator.onLine) syncStatus.value = "pendente";
    return false;
  }

  syncStatus.value = "salvando";

  try {
    const payload = await dumpDatabase();

    // Proteção absoluta: Nunca enviar base vazia para o Google Drive
    const empCount = payload.data?.empresas?.length ?? 0;
    const lancCount = payload.data?.lancamentos?.length ?? 0;
    if (empCount === 0 && lancCount === 0) {
      console.warn("[Google Drive] Base local vazia (0 empresas, 0 lançamentos). Backup evitado para proteger arquivo remoto.");
      syncStatus.value = "salvo";
      return false;
    }

    const content = JSON.stringify(payload, null, 2);
    const folderId = await obterOuCriarPastaFinansys(tokenInMemory);

    // 1. Procura se o arquivo já existe na pasta Finansys
    const fileQuery = encodeURIComponent(`'${folderId}' in parents and name = '${DRIVE_FILE_NAME}' and trashed = false`);
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${fileQuery}&fields=files(id,name)`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${tokenInMemory}` },
    });

    if (!listRes.ok) {
      if (listRes.status === 401) {
        desconectarGoogleDrive();
        toast.warn("Sua sessão do Google Drive expirou. Por favor, conecte-se novamente em Ajustes.");
        return false;
      }
      throw new Error("Falha ao consultar pasta do Drive");
    }

    const listData = await listRes.json();
    const existingFile = listData.files?.[0];

    // 2. Se já existe, atualiza via PATCH; se não, cria via POST multipart
    if (existingFile) {
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;
      const updateRes = await fetch(updateUrl, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${tokenInMemory}`,
          "Content-Type": "application/json",
        },
        body: content,
      });
      if (!updateRes.ok) throw new Error("Erro ao atualizar arquivo no Drive");
    } else {
      const metadata = {
        name: DRIVE_FILE_NAME,
        parents: [folderId],
      };

      const boundary = "-------314159265358979323846";
      const delimiter = "\r\n--" + boundary + "\r\n";
      const closeDelim = "\r\n--" + boundary + "--";

      const multipartBody =
        delimiter +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        "Content-Type: application/json\r\n\r\n" +
        content +
        closeDelim;

      const createRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenInMemory}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      });

      if (!createRes.ok) throw new Error("Erro ao criar arquivo no Drive");
    }

    syncStatus.value = "salvo";
    ultimoBackup.value = new Date();
    return true;
  } catch (err) {
    console.error("Erro no backup do Drive:", err);
    syncStatus.value = "erro";
    return false;
  }
}

/**
 * Busca e restaura o backup da pasta Finansys do Google Drive.
 */
export async function restaurarDoDrive(): Promise<boolean> {
  if (!tokenInMemory || !navigator.onLine) return false;

  try {
    let existingFile: { id: string; modifiedTime?: string } | null = null;

    // 1. Procura na pasta visível Finansys
    const folderQuery = encodeURIComponent("name = 'Finansys' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
    const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${tokenInMemory}` },
    });

    if (folderRes.ok) {
      const folderData = await folderRes.json();
      const folderId = folderData.files?.[0]?.id;
      if (folderId) {
        const fileQuery = encodeURIComponent(`'${folderId}' in parents and name = '${DRIVE_FILE_NAME}' and trashed = false`);
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${fileQuery}&fields=files(id,name,modifiedTime)`, {
          headers: { Authorization: `Bearer ${tokenInMemory}` },
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          existingFile = listData.files?.[0] || null;
        }
      }
    }

    // 2. Fallback de compatibilidade: procura na appDataFolder caso venha de versão antiga
    if (!existingFile) {
      const appDataRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${DRIVE_FILE_NAME}'&fields=files(id,name,modifiedTime)`,
        { headers: { Authorization: `Bearer ${tokenInMemory}` } }
      );
      if (appDataRes.ok) {
        const appData = await appDataRes.json();
        existingFile = appData.files?.[0] || null;
      }
    }

    if (!existingFile) {
      console.log("[Google Drive] Nenhum arquivo de backup encontrado no Google Drive.");
      syncStatus.value = "salvo";
      return true;
    }

    // Baixa o conteúdo do arquivo
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`;
    const downloadRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${tokenInMemory}` },
    });

    if (!downloadRes.ok) throw new Error("Erro ao baixar backup");
    const payload = await downloadRes.json();

    if (payload) {
      await restoreDatabase(payload, "overwrite");
      await loadState();
      syncStatus.value = "salvo";
      ultimoBackup.value = new Date(existingFile.modifiedTime || Date.now());
      return true;
    }
  } catch (err) {
    console.error("Erro ao restaurar do Drive:", err);
    syncStatus.value = "erro";
  }
  return false;
}

