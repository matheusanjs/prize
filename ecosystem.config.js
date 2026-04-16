module.exports = {
  apps: [
    {
      name: 'backend',
      cwd: '/root/prize-clube/backend',
      script: 'dist/src/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        TZ: 'America/Sao_Paulo',
      },
      node_args: '-r dotenv/config',
    },
    {
      name: 'admin',
      cwd: '/root/prize-clube/admin',
      script: 'node_modules/.bin/next',
      args: 'start -p 3001 -H 0.0.0.0',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        TZ: 'America/Sao_Paulo',
      },
      node_args: '--max-old-space-size=4096',
    },
    {
      name: 'pwa',
      cwd: '/root/prize-clube/pwa',
      script: 'node_modules/.bin/next',
      args: 'start -p 3002 -H 0.0.0.0',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        TZ: 'America/Sao_Paulo',
      },
      node_args: '--max-old-space-size=4096',
    },
    {
      name: 'site',
      cwd: '/root/prize-clube/site',
      script: 'node_modules/.bin/next',
      args: 'start -p 3003 -H 0.0.0.0',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
        TZ: 'America/Sao_Paulo',
      },
      node_args: '--max-old-space-size=4096',
    },
    {
      name: 'garcom',
      cwd: '/root/prize-clube/garcom',
      script: 'node_modules/.bin/next',
      args: 'start -p 3004 -H 0.0.0.0',
      env: {
        NODE_ENV: 'production',
        PORT: 3004,
        TZ: 'America/Sao_Paulo',
      },
      node_args: '--max-old-space-size=4096',
    },
  ],
};
