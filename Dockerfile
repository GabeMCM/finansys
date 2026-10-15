# Estágio de build e execução com Deno oficial
FROM denoland/deno:latest

WORKDIR /app

# Copia dependências primeiro para aproveitar o cache do Docker
COPY deno.json deno.lock ./
RUN deno install

# Copia o restante do código fonte
COPY . .

# Compila o frontend de produção (gera a pasta dist/)
RUN deno task build

# Expõe a porta padrão
EXPOSE 8000

ENV PORT=8000
ENV DENO_DIR=/app/.deno_cache

# Inicia o servidor HTTP integrado de produção com suporte a Deno KV
CMD ["run", "-A", "--unstable-kv", "server.ts"]
