import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { build as viteBuild } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

let cachedStandaloneHtml: string | null = null;
let inFlightBuild: Promise<string> | null = null;

export async function getStandaloneGameHtml(): Promise<string> {
  if (cachedStandaloneHtml) {
    return cachedStandaloneHtml;
  }
  if (inFlightBuild) {
    return inFlightBuild;
  }

  inFlightBuild = (async () => {
    const result = await viteBuild({
      configFile: false,
      root: PROJECT_ROOT,
      resolve: {
        alias: {
          '@': PROJECT_ROOT,
        },
      },
      plugins: [react(), tailwindcss()],
      logLevel: 'silent',
      build: {
        write: false,
        minify: 'esbuild',
        assetsInlineLimit: 100_000_000,
        cssCodeSplit: false,
        rollupOptions: {
          input: path.resolve(PROJECT_ROOT, 'src/main.tsx'),
          output: {
            format: 'iife',
            name: 'ApexCircuitPortable',
            inlineDynamicImports: true,
          },
        },
      },
    });

    const outputs = Array.isArray(result) ? result : [result];
    let jsCode = '';
    const cssParts: string[] = [];

    for (const out of outputs) {
      if (!('output' in out)) continue;
      for (const item of out.output) {
        if (item.type === 'chunk') {
          jsCode += item.code;
        } else if (item.type === 'asset' && item.fileName.endsWith('.css')) {
          cssParts.push(
            typeof item.source === 'string'
              ? item.source
              : Buffer.from(item.source).toString('utf8'),
          );
        }
      }
    }

    const safeCss = cssParts.join('\n').replace(/<\/style/gi, '<\\/style');
    const safeJs = jsCode.replace(/<\/script/gi, '<\\/script');

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Apex Circuit — Portable 3D Racing</title>
    <style>${safeCss}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${safeJs}</script>
  </body>
</html>
`;

    cachedStandaloneHtml = html;
    return html;
  })();

  try {
    return await inFlightBuild;
  } finally {
    inFlightBuild = null;
  }
}
