import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleApiRequest } from "./server/api.ts";
import { Buffer } from "node:buffer";

/**
 * Plugin de compilação: garante suporte transparente a class="..." e className="..." em JSX do React,
 * evitando avisos no console e permitindo escrita amigável e interoperável.
 */
function jsxClassTransformPlugin(): Plugin {
  return {
    name: "finansys-jsx-class-transform",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith(".tsx") && !id.endsWith(".jsx")) return null;
      if (!code.includes("class=")) return null;
      const transformed = code.replace(/\bclass=(["'{])/g, "className=$1");
      return { code: transformed, map: null };
    },
  };
}

function apiMiddlewarePlugin(): Plugin {
  return {
    name: "finansys-api-middleware",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();

        try {
          const protocol = "http";
          const host = req.headers.host || "localhost:5173";
          const url = `${protocol}://${host}${req.url}`;

          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
          }
          const bodyBuffer = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

          const webReq = new Request(url, {
            method: req.method,
            // deno-lint-ignore no-explicit-any
            headers: req.headers as any,
            body: req.method !== "GET" && req.method !== "HEAD" ? bodyBuffer : undefined,
          });

          const webRes = await handleApiRequest(webReq);
          if (!webRes) return next();

          res.statusCode = webRes.status;
          webRes.headers.forEach((val, key) => res.setHeader(key, val));
          const arrayBuf = await webRes.arrayBuffer();
          res.end(Buffer.from(arrayBuf));
        } catch (err) {
          console.error("API error:", err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [jsxClassTransformPlugin(), react(), apiMiddlewarePlugin()],
  server: { host: true, port: 5173 },
});
