import { build } from 'vite'
import { copyFile, writeFile } from 'node:fs/promises'

// Explicit public settings prevent a local staging environment from leaking into a release.
process.env.VITE_API_BASE_URL = 'https://api.singularitystream.org'
process.env.VITE_BUILD_DATE = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
await build({ mode: 'production', build: { outDir: 'dist-production' } })
await copyFile('dist-production/index.html', 'dist-production/404.html')
await writeFile('dist-production/.nojekyll', '')
