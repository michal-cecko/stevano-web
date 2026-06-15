# Astro static site: built with Node, served by nginx.
# Built + pushed by GitHub Actions, pulled by Dokploy.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
# Serve on :80 and answer a /healthz endpoint for the Dokploy healthcheck.
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location = /healthz { return 200 "ok\\n"; add_header Content-Type text/plain; }\n\
    location / { try_files $uri $uri/ =404; }\n\
}\n' > /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
