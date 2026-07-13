// ─── PM2: CoordinaOT en producción (Linux) ───────────────────────────────────
// IT solo tiene que hacer:
//   1. cp .env.example .env.local   (y rellenar credenciales — ver DEPLOY.md)
//   2. pnpm install && pnpm build
//   3. pm2 start ecosystem.config.cjs && pm2 save
//
// Las credenciales NO van aquí: Next.js lee .env.local en runtime por sí solo.

module.exports = {
  apps: [
    {
      name: "coordina-ot",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3100",
      cwd: __dirname,

      // UNA sola instancia, modo fork — obligatorio: la app cachea en memoria
      // la vista pesada de RPS (TGM_PENDIENTE_OT, 7-15 s). En modo cluster
      // cada worker tendría su caché y multiplicaría las consultas caras.
      exec_mode: "fork",
      instances: 1,

      env: {
        NODE_ENV: "production",
      },

      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // La consulta pesada + PDFs en memoria: margen holgado antes de reciclar.
      max_memory_restart: "1G",

      out_file: "logs/coordina-ot.out.log",
      error_file: "logs/coordina-ot.err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
