import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bridge = spawn(process.execPath, [resolve(root, "tools", "hancom-pdf-bridge.mjs")], { cwd: root, stdio: "inherit" });
const viteCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const vite = spawn(viteCommand, ["vite", ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  bridge.kill();
  vite.kill();
  process.exitCode = code;
}

bridge.on("exit", code => { if (!stopping && code) stop(code); });
vite.on("exit", code => stop(code || 0));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
