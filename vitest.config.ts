import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',globals:true,setupFiles:'./src/test/setup.ts',exclude:['tests/firestore.rules.test.ts','**/node_modules/**','**/dist/**']}});
