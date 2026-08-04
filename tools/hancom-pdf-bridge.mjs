import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.HANCOM_BRIDGE_HOST || "127.0.0.1";
const port = Number(process.env.HANCOM_BRIDGE_PORT || 43127);
const maximumBytes = 50 * 1024 * 1024;
const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "convert-hwpx-to-pdf.ps1");
const configuredOrigins = new Set((process.env.HANCOM_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean));

function allowedOrigin(origin) {
  if (!origin) return true;
  return /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin) || configuredOrigins.has(origin);
}

function corsHeaders(origin) {
  return allowedOrigin(origin) && origin ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "X-PDF-Page-Count",
    Vary: "Origin",
  } : {};
}

function json(response, status, payload, origin) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) });
  response.end(JSON.stringify(payload));
}

async function requestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error("HWPX 파일은 50MB 이하만 변환할 수 있습니다.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function runPowerShell(inputPath, outputPath) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", scriptPath, "-InputPath", inputPath, "-OutputPath", outputPath,
    ], { windowsHide: true });
    let errorText = "";
    let outputText = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("한컴 PDF 변환 시간이 2분을 초과했습니다."));
    }, 120_000);
    child.stderr.on("data", chunk => { errorText += chunk.toString("utf8"); });
    child.stdout.on("data", chunk => { outputText += chunk.toString("utf8"); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("exit", code => {
      clearTimeout(timer);
      if (code === 0) resolvePromise(Math.max(1, Number(outputText.trim()) || 1));
      else reject(new Error(errorText.trim() || `한컴 변환 프로세스가 종료되었습니다. (${code})`));
    });
  });
}

function pdfPageCount(bytes) {
  const body = bytes.toString("latin1");
  return Math.max(1, (body.match(/\/Type\s*\/Page\b/g) || []).length);
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  if (!allowedOrigin(origin)) return json(response, 403, { error: "허용되지 않은 호출 주소입니다." }, origin);
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(origin));
    return response.end();
  }
  if (request.method === "GET" && request.url === "/health") {
    return json(response, 200, { available: process.platform === "win32", engine: "Hancom Office", canonical: "HWPX" }, origin);
  }
  if (request.method !== "POST" || request.url !== "/convert") return json(response, 404, { error: "요청 경로를 찾지 못했습니다." }, origin);

  let workDirectory;
  try {
    const input = await requestBody(request);
    if (input.length < 4 || input[0] !== 0x50 || input[1] !== 0x4b) throw new Error("올바른 HWPX ZIP 파일이 아닙니다.");
    workDirectory = await mkdtemp(join(tmpdir(), "parkmaster-hancom-"));
    const inputPath = join(workDirectory, "source.hwpx");
    const outputPath = join(workDirectory, "result.pdf");
    await writeFile(inputPath, input);
    const pageCount = await runPowerShell(inputPath, outputPath);
    const pdf = await readFile(outputPath);
    if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("한컴 결과 파일의 PDF 서명이 올바르지 않습니다.");
    response.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": pdf.length,
      "X-PDF-Page-Count": String(pageCount || pdfPageCount(pdf)),
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    });
    response.end(pdf);
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : "한컴 PDF 변환에 실패했습니다." }, origin);
  } finally {
    if (workDirectory) await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
});

server.listen(port, host, () => {
  process.stdout.write(`[ParkMaster] Hancom PDF bridge: http://${host}:${port}\n`);
});
