FROM denoland/deno:latest

EXPOSE 7860

WORKDIR /app

# Prefer not to run as root.
USER deno

RUN deno install --entrypoint main.ts

COPY . .

# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno cache main.ts

CMD ["serve", "-A", "--port", "7860", "serve.ts"]