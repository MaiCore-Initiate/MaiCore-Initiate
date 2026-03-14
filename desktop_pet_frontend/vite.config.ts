import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 获取 MaiCore 后端地址 */
function getBackendTarget(): string {
  // MaiCore 默认运行在 localhost:10086
  const host = '127.0.0.1';
  const port = 10086;

  // 可以从环境变量覆盖
  const envHost = process.env.MAICORE_HOST || host;
  const envPort = process.env.MAICORE_PORT ? parseInt(process.env.MAICORE_PORT, 10) : port;

  const target = `http://${envHost}:${envPort}`;
  console.log(`✔ MaiCore 后端地址: ${target}`);
  return target;
}

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['url', 'buffer', 'process'],
    }),
    // Copy static assets for Electron main process
    {
      name: 'copy-electron-assets',
      buildStart() {
        const outDir = resolve(__dirname, 'dist-electron');
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
        const src = resolve(__dirname, 'electron/tray-icon.png');
        if (existsSync(src)) {
          copyFileSync(src, resolve(outDir, 'tray-icon.png'));
        }
      },
    },
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
              },
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart({ reload }) {
          reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5500,
    proxy: {
      '/api': {
        target: getBackendTarget(),
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    // Disable crossorigin on module scripts: file:// protocol doesn't support CORS,
    // and crossorigin="anonymous" breaks dynamic imports in packaged Electron apps.
    crossOriginLoading: false,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
});
