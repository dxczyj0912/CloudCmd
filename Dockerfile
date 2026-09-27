FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=8787
ENV HOST=0.0.0.0
ENV CLOUDCMD_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "server.js"]
