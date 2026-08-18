import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Os testes de banco abrem transacao e dao ROLLBACK. Rodar em paralelo
    // funcionaria, mas serializar deixa a saida legivel quando algo quebra.
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
})
