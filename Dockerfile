FROM node:22-bookworm-slim

RUN corepack enable && npm install -g @binance/agentic-wallet

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile && pnpm build

ENV PORT=3000
ENV PARALLAX_DATA_DIR=/var/lib/parallax
EXPOSE 3000
VOLUME ["/var/lib/parallax"]

CMD ["node", "scripts/desk.mjs"]
