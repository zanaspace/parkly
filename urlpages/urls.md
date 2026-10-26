pnpm --filter @parkly/api dev      # core backend API → :4000
pnpm --filter @parkly/web dev      # driver website only → :3000
pnpm --filter @parkly/portal dev   # portal + attendant → :3001
pnpm --filter @parkly/mobile tunnel # driver mobile (Expo) → :8081