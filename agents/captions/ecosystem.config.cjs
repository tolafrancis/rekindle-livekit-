// PM2 process file — `.cjs` because package.json is "type": "module".
module.exports = {
  apps: [
    {
      name: 'rekindle-caption-agent',
      script: 'dist/index.js',
      node_args: '--env-file=.env',
      // One instance only: sessions are claimed in-process (see index.ts).
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
    },
  ],
};
