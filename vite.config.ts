import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 상대 경로로 빌드해 GitHub Pages(https://<사용자>.github.io/action-map/) 등 어느 하위 경로에서도 동작
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // 지도 라이브러리를 따로 묶어 앱 코드만 바뀌었을 때 다시 받을 양을 줄인다
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          return /@xyflow|d3-/.test(id) ? 'flow' : 'vendor';
        },
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
