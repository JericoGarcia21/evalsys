import { defineConfig, type ResolvedConfig } from 'vite'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

let outputDirectory = ''

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: 'evalsys-pwa-build-version',
      apply: 'build',
      configResolved(config: ResolvedConfig) {
        outputDirectory = resolve(config.root, config.build.outDir)
      },
      async closeBundle() {
        const html = await readFile(resolve(outputDirectory, 'index.html'))
        const version = createHash('sha256').update(html).update(String(Date.now())).digest('hex').slice(0, 16)
        const workerPath = resolve(outputDirectory, 'sw.js')
        const worker = await readFile(workerPath, 'utf8')
        await writeFile(workerPath, worker.replaceAll('__BUILD_VERSION__', version))
      },
    },
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
