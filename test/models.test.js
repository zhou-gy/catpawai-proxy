const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_MODEL_ID, MODELS, getModel, resolveModelId } = require('../clean/models');

test('default model is deepseek-v3.2', () => {
  assert.equal(DEFAULT_MODEL_ID, 'deepseek-v3.2');
});

test('model list includes CatPawAI models', () => {
  assert.equal(MODELS.some((model) => model.id === 'catpawai'), true);
  assert.equal(MODELS.some((model) => model.id === 'catpawai-cn-text'), true);
  assert.equal(MODELS.some((model) => model.id === 'deepseek-v3.2'), true);
  assert.equal(MODELS.some((model) => model.id === 'LongCat-2.0'), true);
});

test('resolveModelId maps catpawai alias to configured model override', () => {
  const original = process.env.CATPAWAI_MODEL;
  process.env.CATPAWAI_MODEL = 'custom-catpaw';
  try {
    assert.equal(resolveModelId('catpawai'), 'custom-catpaw');
    assert.equal(resolveModelId(undefined), 'custom-catpaw');
    assert.equal(resolveModelId('catpawai-cn-text'), 'glm-5.2');
    assert.equal(resolveModelId('glm-5'), 'glm-5');
  } finally {
    if (original === undefined) delete process.env.CATPAWAI_MODEL;
    else process.env.CATPAWAI_MODEL = original;
  }
});

test('getModel returns undefined for unknown model', () => {
  assert.equal(getModel('missing'), undefined);
});
