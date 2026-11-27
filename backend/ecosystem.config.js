/**
 * PM2 config: mymobile.pk API (Medusa), single shared process
 * (HTTP API + subscribers + scheduled jobs).
 * Port and every other setting come from .env in this folder.
 *   pm2 startOrReload ecosystem.config.js --update-env
 */
const fs = require("fs")
const path = require("path")

const envConfig = {}
const envPath = path.join(__dirname, ".env")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    envConfig[m[1]] = v
  }
}

module.exports = {
  apps: [
    {
      name: "mymobile-api",
      cwd: __dirname,
      // npm run start → medusa start
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        PORT: 3122,
        MEDUSA_WORKER_MODE: "shared",
        ...envConfig,
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1500M",
      kill_timeout: 8000,
      listen_timeout: 15000,
      error_file: path.join(__dirname, "logs/medusa-error.log"),
      out_file: path.join(__dirname, "logs/medusa-out.log"),
      merge_logs: true,
      time: true,
    },
  ],
}
