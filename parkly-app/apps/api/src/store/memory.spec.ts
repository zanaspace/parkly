import { randomUUID } from 'node:crypto';
import { MemoryStore } from './memory.js';
import { storeContract } from './store-contract.js';

storeContract('MemoryStore', () => {
  const store = new MemoryStore();
  return {
    store,
    newUser: async (roles = [{ role: 'DRIVER', operatorId: null }]) => {
      const id = randomUUID();
      store.seedUser(id, { roles });
      return id;
    },
  };
});
