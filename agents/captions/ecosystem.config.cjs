// PM2 process file — `.cjs` because package.json is "type": "module".
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'rekindle-caption-agent',
      script: 'dist/index.js',
      cwd: __dirname,
      // Fork mode, explicitly: `instances` alone makes PM2 use cluster mode,
      // where Node resolves --env-file against PM2's own directory and exits
      // with ".env: not found" before the agent starts.
      exec_mode: 'fork',
      node_args: `--env-file=${path.join(__dirname, '.env')}`,
      // One instance only: sessions are claimed in-process (see index.ts).
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
    },
  ],
};
