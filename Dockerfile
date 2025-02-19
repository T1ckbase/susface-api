FROM denoland/deno:latest

EXPOSE 7860

WORKDIR /app

# Prefer not to run as root.
USER deno

RUN deno install --entrypoint main.ts

COPY . .

CMD ["run", "-A", "main.ts"]