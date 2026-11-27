/** PM2 config: mymobile.pk CDN (reads .env from this folder via dotenv). */
const path = require("path")
module.exports = {
  apps: [
    {
      name: "mymobile-cdn",
      cwd: __dirname,
      script: "dist/index.js",
      env: { NODE_ENV: "production", PORT: 3123 },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "600M",
      error_file: path.join(__dirname, "logs/cdn-error.log"),
      out_file: path.join(__dirname, "logs/cdn-out.log"),
      merge_logs: true,
      time: true,
    },
  ],
}
