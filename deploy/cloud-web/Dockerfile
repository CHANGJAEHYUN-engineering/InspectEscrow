FROM node:24-bookworm-slim
WORKDIR /app/InspectEscrow_PATCH3_DEPLOY
COPY app/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY app/.patch3-build/ ./.patch3-build/
COPY app/.modelb-local/ ./.modelb-local/
COPY cloud-gateway.cjs /app/cloud-gateway.cjs
ENV PORT=8080 INSPECTESCROW_PORT=8770 INSPECTESCROW_CHAIN_ID=11155111
EXPOSE 8080
CMD ["node","/app/cloud-gateway.cjs"]
