const fs = require('fs');
const path = require('path');

const SQLITE3_PATH = 'D:/Programs/CatPawAI/resources/app/node_modules/@vscode/sqlite3';
const STATE_DB_PATH = path.join(
  process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData/Roaming'),
  'CatPawAI',
  'User',
  'globalStorage',
  'state.vscdb'
);
const ENV_PATH = path.resolve(__dirname, '..', '.env');
const ENV_EXAMPLE_PATH = path.resolve(__dirname, '..', '.env.example');
const STORAGE_KEY = 'mt-idekit.mt-idekit-code';
const DEFAULT_EXTERNAL_TENANT = '5282fa6645';
const DEFAULT_INTERNAL_TENANT = '4391f0be98';
const DEFAULT_IDE_VERSION = '2026.2.3';
const DEFAULT_PLUGIN_VERSION = '2026.2.2';

function loadSqlite3() {
  try {
    return require(SQLITE3_PATH);
  } catch (error) {
    throw new Error(`Cannot load CatPawAI sqlite module: ${error.message}`);
  }
}

function readStorageValue(sqlite3) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(STATE_DB_PATH, sqlite3.OPEN_READONLY, (error) => {
      if (error) reject(error);
    });
    db.get('SELECT value FROM ItemTable WHERE key = ?', [STORAGE_KEY], (error, row) => {
      db.close();
      if (error) {
        reject(error);
        return;
      }
      if (!row) {
        reject(new Error(`Missing storage key: ${STORAGE_KEY}`));
        return;
      }
      const raw = Buffer.isBuffer(row.value) ? row.value.toString('utf8') : String(row.value);
      resolve(JSON.parse(raw));
    });
  });
}

function readEnvLines() {
  if (fs.existsSync(ENV_PATH)) return fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  if (fs.existsSync(ENV_EXAMPLE_PATH)) return fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8').split(/\r?\n/);
  return [];
}

function setEnvLine(lines, key, value) {
  const sanitized = String(value || '').replace(/\r|\n/g, '');
  let found = false;
  const next = lines.map((line) => {
    if (line.trimStart().startsWith(`${key}=`)) {
      found = true;
      return `${key}=${sanitized}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${sanitized}`);
  return next;
}

function pickModel(state) {
  const selected = state.mcopilot_agent_context_state__catpaw_selected_modelprod;
  if (selected && typeof selected === 'object' && selected.modelTypeName) return selected.modelTypeName;
  if (selected && typeof selected === 'object' && typeof selected.id === 'string') return selected.id;
  return 'deepseek-v3.2';
}

function pickTenant(state) {
  const config = state.catpaw_extension_app_global_configprod;
  const external = config?.feature?.externalTenant;
  if (external === true || external === 'true') return DEFAULT_EXTERNAL_TENANT;
  if (external === false || external === 'false') return DEFAULT_INTERNAL_TENANT;
  return process.env.CATPAWAI_TENANT || DEFAULT_EXTERNAL_TENANT;
}

function baseUrlForTenant(tenant) {
  if (tenant === DEFAULT_INTERNAL_TENANT) return 'https://catpaw.sankuai.com/api/gpt';
  return 'https://catpaw.meituan.com/api/gpt';
}

async function main() {
  if (!fs.existsSync(STATE_DB_PATH)) {
    throw new Error(`CatPawAI state database not found: ${STATE_DB_PATH}`);
  }
  const sqlite3 = loadSqlite3();
  const state = await readStorageValue(sqlite3);
  const token = state.accessTokenprod;
  const misId = state.userInfoprod?.misId;
  const model = pickModel(state);
  const tenant = pickTenant(state);

  if (!token) throw new Error('CatPawAI accessTokenprod was not found. Please log in to CatPawAI first.');
  if (!misId) throw new Error('CatPawAI userInfoprod.misId was not found. Please log in to CatPawAI first.');

  let lines = readEnvLines();
  lines = setEnvLine(lines, 'HOST', '127.0.0.1');
  lines = setEnvLine(lines, 'PORT', '13000');
  lines = setEnvLine(lines, 'CATPAWAI_OPENAI_BASE_URL', baseUrlForTenant(tenant));
  lines = setEnvLine(lines, 'CATPAWAI_AUTH_MODE', 'catpaw');
  lines = setEnvLine(lines, 'CATPAWAI_ACCESS_TOKEN', token);
  lines = setEnvLine(lines, 'CATPAWAI_MIS_ID', misId);
  lines = setEnvLine(lines, 'CATPAWAI_TENANT', tenant);
  lines = setEnvLine(lines, 'CATPAWAI_API_KEY', '');
  lines = setEnvLine(lines, 'CATPAWAI_MODEL', model);
  lines = setEnvLine(lines, 'CATPAWAI_IDE_VERSION', DEFAULT_IDE_VERSION);
  lines = setEnvLine(lines, 'CATPAWAI_PLUGIN_VERSION', DEFAULT_PLUGIN_VERSION);
  fs.writeFileSync(ENV_PATH, lines.join('\n'), 'utf8');

  console.log('.env updated from CatPawAI local state.');
  console.log(`Token configured. Length: ${String(token).length}`);
  console.log('mis-id configured.');
  console.log(`Tenant: ${tenant}`);
  console.log(`Model: ${model}`);
  console.log(`Base URL: ${baseUrlForTenant(tenant)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
