FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY deploy/frontend/nginx-frontend.conf /etc/nginx/conf.d/default.conf
COPY deploy/frontend/parkmaster-entrypoint.sh /usr/local/bin/parkmaster-entrypoint
RUN chmod 0755 /usr/local/bin/parkmaster-entrypoint
EXPOSE 80 443
ENTRYPOINT ["/usr/local/bin/parkmaster-entrypoint"]
