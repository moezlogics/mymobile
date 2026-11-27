const fs = require("fs")

/** Minimal .env reader (no dependency). Real process env wins over the file. */
function loadEnv(file) {
  const out = {}
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      out[m[1]] = v
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && v !== "") out[k] = v
  return out
}

module.exports = { loadEnv }
