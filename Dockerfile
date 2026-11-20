FROM node:22-slim

WORKDIR /app

COPY package.json tsconfig.json glama.json ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public
COPY migrations ./migrations

ENV HOST=0.0.0.0
ENV PORT=8080
ENV MCP_READ_ONLY=false

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/ping').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "--experimental-strip-types", "scripts/dev-server.ts"]
