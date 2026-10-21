import { spawn } from "node:child_process";
import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";

const output = "output/playwright";
await mkdir(output, { recursive: true });
if (!process.argv.slice(2).length || process.argv.includes("framework-layouts")) {
  await copyFile("node_modules/axe-core/axe.min.js", `${output}/axe.min.js`);
}
const bash =
  process.platform === "win32"
    ? path.join(
        process.env.ProgramFiles || "C:/Program Files",
        "Git/bin/bash.exe",
      )
    : "bash";
if (process.platform === "win32") await access(bash);
const wrapper = ".agents/skills/playwright/scripts/playwright_cli.sh";
const production = process.argv.includes("framework-production");
const serverArgs = production ? ["preview", "--port", "4174"] : ["--mode", "local-demo", "--port", "5174"];
const base = production ? "http://127.0.0.1:4174" : "http://127.0.0.1:5174";
const session = `vezz-qa-${process.pid}`;
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", ...serverArgs],
  { windowsHide: true, stdio: "ignore" },
);
const run = (args) =>
  new Promise((resolve, reject) => {
    const proc = spawn(bash, [wrapper, `-s=${session}`, ...args], {
      windowsHide: true,
    });
    let log = "";
    proc.stdout.on("data", (chunk) => {
      log += chunk;
    });
    proc.stderr.on("data", (chunk) => {
      log += chunk;
    });
    proc.on("error", reject);
    proc.on("close", async (code) => {
      if (code || log.includes("### Error")) {
        await writeFile(`${output}/framework-failure.log`, log);
        reject(new Error(log));
      } else resolve(log);
    });
  });
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null)
      throw new Error(
        `Não foi possível iniciar o servidor de QA em ${base}.`,
      );
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(200);
  }
  if (!ready) throw new Error("Servidor de QA indisponível.");
  if (!production) {
    for (const entry of ["/.git/config", "/.env.local-demo", "/video-vezz/package.json"]) {
      const status = (await fetch(base + entry)).status;
      if (![403, 404].includes(status)) throw new Error(`Arquivo privado acessível no dev server: ${entry}`);
    }
    console.log("PASS dev server blocks repository metadata and private files");
  }
  await run(["open", "about:blank"]);
  const requested = process.argv.slice(2);
  const scenarios = requested.length ? requested : ["framework-flows", "framework-admin", "framework-layouts"];
  for (const scenario of scenarios) {
    const log = await run(["run-code", "--filename", `tests/${scenario}.js`]);
    await writeFile(`${output}/${scenario}.log`, log);
    console.log(log.split("### Ran Playwright code")[0].trim());
  }
} finally {
  await run(["close"]).catch(() => {});
  server.kill();
}
