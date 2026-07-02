require('dotenv').config();

const { createApp } = require('./app');
const { log } = require('./logger');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 13000);

if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
  throw new Error('CatPawAI Proxy must stay local. Set HOST=127.0.0.1.');
}

const app = createApp();

app.listen(PORT, HOST, () => {
  log(`CatPawAI Proxy listening on http://${HOST}:${PORT}`);
  log(`OpenAI-compatible base URL: http://${HOST}:${PORT}/v1`);
});
