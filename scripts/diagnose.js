const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const DEFAULT_CLI_PATH = 'D:\\Programs\\CatPawAI\\bin\\catpawai.cmd';
const CHECK_TIMEOUT_MS = 800;

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function checkPort(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(CHECK_TIMEOUT_MS);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function main() {
  const cliPath = process.env.CATPAWAI_CLI_PATH || DEFAULT_CLI_PATH;
  const installDir = path.dirname(path.dirname(cliPath));
  const openAiBaseUrl = process.env.CATPAWAI_OPENAI_BASE_URL || '';
  const devtoolsOpen = await checkPort('127.0.0.1', 29199);
  const browserMcpOpen = await checkPort('127.0.0.1', 29200);

  console.log('CatPawAI proxy diagnostics');
  console.log(`- CLI path: ${cliPath}`);
  console.log(`- CLI exists: ${fileExists(cliPath)}`);
  console.log(`- Install dir: ${installDir}`);
  console.log(`- CATPAWAI_OPENAI_BASE_URL configured: ${Boolean(openAiBaseUrl)}`);
  console.log(`- 127.0.0.1:29199 open: ${devtoolsOpen} (CatPawAI devtools proxy, not chat)`);
  console.log(`- 127.0.0.1:29200 open: ${browserMcpOpen} (browser-use MCP, not chat)`);
  console.log('');
  console.log('Finding: installed CatPawAI exposes editor/UI commands, but no direct local OpenAI-compatible chat endpoint was found.');
  console.log('Next: set CATPAWAI_OPENAI_BASE_URL only if CatPawAI provides an explicit OpenAI-compatible backend URL.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
