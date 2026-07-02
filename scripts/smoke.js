const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:13000';

async function main() {
  const health = await fetch(`${BASE_URL}/health`);
  if (!health.ok) throw new Error(`health failed: ${health.status}`);

  const models = await fetch(`${BASE_URL}/v1/models`);
  if (!models.ok) throw new Error(`models failed: ${models.status}`);

  const body = await models.json();
  if (!body.data.some((model) => model.id === 'deepseek-v3.2')) {
    throw new Error('missing deepseek-v3.2 model');
  }

  console.log('Smoke checks passed.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
