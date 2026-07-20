/**
 * PM2-Ecosystem-Konfiguration für Anwesenheit-NEO-onprem.
 *
 * Nutzung unter Windows (empfohlen für einfachen Autostart):
 *   npm install -g pm2 pm2-windows-startup
 *   npm run build
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2-startup install      // Autostart beim Booten
 *
 * Logs:   pm2 logs anwesenheit-neo
 * Status: pm2 status
 * Neustart nach Update: npm run build && pm2 reload anwesenheit-neo
 */
module.exports = {
  apps: [
    {
      name: 'anwesenheit-neo',
      script: 'dist/src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      // .env wird von der Anwendung selbst über dotenv/Prozess-Umgebung geladen.
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
