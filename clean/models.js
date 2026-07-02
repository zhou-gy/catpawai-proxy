const DEFAULT_MODEL_ID = 'deepseek-v3.2';

const MODELS = [
  { id: 'catpawai-cn-text', name: 'CatPawAI Chinese text (glm-5.2)', owned_by: 'catpawai' },
  { id: 'deepseek-v3.2', name: 'deepseek-v3.2', owned_by: 'catpawai' },
  { id: 'longcat-flash', name: 'longcat-flash', owned_by: 'catpawai' },
  { id: 'LongCat-2.0', name: 'LongCat-2.0', owned_by: 'catpawai' },
  { id: 'glm-5v-turbo', name: 'glm-5v-turbo', owned_by: 'catpawai' },
  { id: 'glm-5.2', name: 'glm-5.2', owned_by: 'catpawai' },
  { id: 'glm-5.1', name: 'glm-5.1', owned_by: 'catpawai' },
  { id: 'glm-5', name: 'glm-5', owned_by: 'catpawai' },
  { id: 'kimi-k2.6', name: 'kimi-k2.6', owned_by: 'catpawai' },
  { id: 'kimi-k2.5', name: 'kimi-k2.5', owned_by: 'catpawai' },
  { id: 'MiniMax-M2.7', name: 'MiniMax-M2.7', owned_by: 'catpawai' },
  { id: 'MiniMax-M2.5', name: 'MiniMax-M2.5', owned_by: 'catpawai' },
  {
    id: 'catpawai',
    name: 'CatPawAI default',
    owned_by: 'catpawai',
  },
];

const MODEL_ALIASES = {
  'catpawai-cn-text': 'glm-5.2',
};

function getModel(modelId) {
  return MODELS.find((model) => model.id === modelId);
}

function resolveModelId(modelId) {
  const configuredDefault = process.env.CATPAWAI_MODEL || DEFAULT_MODEL_ID;
  if (!modelId || modelId === 'catpawai') return configuredDefault;
  if (MODEL_ALIASES[modelId]) return MODEL_ALIASES[modelId];
  return modelId;
}

module.exports = {
  DEFAULT_MODEL_ID,
  MODEL_ALIASES,
  MODELS,
  getModel,
  resolveModelId,
};
