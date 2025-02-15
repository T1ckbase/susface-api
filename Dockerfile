FROM denoland/deno:latest

EXPOSE 7860

WORKDIR /app

# Prefer not to run as root.
USER deno

COPY . /app

RUN deno install --entrypoint main.ts

CMD ["run", "-A", "main.ts"]