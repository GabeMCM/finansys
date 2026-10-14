import { handleApiRequest } from "./server/api.ts";

/**
 * Servidor HTTP nativo do Deno para produção / Deno Deploy.
 * Executa as APIs /api/* via Deno KV e serve a SPA de dist/
 */

const port = Number(Deno.env.get("PORT") || 8000);

Deno.serve({ port }, async (req: Request) => {
  const url = new URL(req.url);

  // 1. Endpoints de API
  if (url.pathname.startsWith("/api/")) {
    const apiRes = await handleApiRequest(req);
    if (apiRes) return apiRes;
  }

  // 2. Arquivos estáticos da pasta dist/
  let pathname = url.pathname;
  if (pathname === "/" || pathname === "") pathname = "/index.html";

  const filePath = `./dist${pathname}`;

  try {
    const file = await Deno.open(filePath, { read: true });
    const mime = getMimeType(filePath);
    const headers: Record<string, string> = { "Content-Type": mime };
    if (pathname.startsWith("/assets/")) {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    }
    return new Response(file.readable, { headers });
  } catch (_e) {
    // Fallback para SPA (Single Page Application) apenas quando a rota não é um arquivo com extensão
    try {
      const indexHtml = await Deno.open("./dist/index.html", { read: true });
      return new Response(indexHtml.readable, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (_e2) {
      return new Response("App não compilado. Execute 'deno task build'.", { status: 404 });
    }
  }
});

function getMimeType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".json") || path.endsWith(".webmanifest")) return "application/json";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}
