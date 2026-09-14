const path = require('path');

const monorepoRoot = path.join(__dirname, '../../');
const emptyModulePath = './packages/service/common/system/emptyModule.js';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  compress: true,
  productionBrowserSourceMaps: false,
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ['@fastgpt/global', '@fastgpt/service', '@fastgpt/web'],
  serverExternalPackages: ['mongoose', 'bullmq'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
        ]
      }
    ];
  },
  turbopack: {
    root: monorepoRoot,
    resolveAlias: {
      '@mongodb-js/zstd': emptyModulePath,
      '@aws-sdk/credential-providers': emptyModulePath,
      snappy: emptyModulePath,
      aws4: emptyModulePath,
      'mongodb-client-encryption': emptyModulePath,
      kerberos: emptyModulePath,
      'supports-color': emptyModulePath,
      'bson-ext': emptyModulePath,
      'pg-native': emptyModulePath,
      fs: { browser: emptyModulePath }
    }
  }
};

module.exports = nextConfig;
