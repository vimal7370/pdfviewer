FROM nginx:alpine
RUN sed -i '/http {/a\    server_tokens off;' /etc/nginx/nginx.conf
COPY pdfviewer /usr/share/nginx/html/pdfviewer
