'use strict';

const { exec } = require('child_process');
const { createApp } = require('./src/app');

const PORT = process.env.PORT || 4848;
const app = createApp();

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`EC51 Realm Studio dang chay tai ${url}`);
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${opener} ${url}`, () => {});
});
