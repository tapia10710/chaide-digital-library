import assert from 'node:assert/strict';

const values = new Map<string, string>();
const listeners = new Map<string, Set<EventListener>>();
const browser = {
  sessionStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
  addEventListener: (type: string, listener: EventListener) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(listener);
  },
  dispatchEvent: (event: Event) => {
    listeners.get(event.type)?.forEach(listener => listener(event));
    return true;
  },
};
Object.assign(globalThis, { window: browser });

const access = await import('../src/lib/distributorAccess');
const distributor = { category: 'Catálogo de Distribuidores' };
let notifications = 0;
browser.addEventListener(access.DISTRIBUTOR_ACCESS_EVENT, () => { notifications++; });
assert.equal(access.isDistributorPasswordRequired(), true);
assert.equal(access.canViewDistributorDocument(distributor, 'user'), false);
access.updateDistributorPasswordRequired(false);
assert.equal(access.canViewDistributorDocument(distributor, 'user'), true);
assert.equal(access.hasDistributorAccess(), true);
access.updateDistributorPasswordRequired(true);
assert.equal(access.canViewDistributorDocument(distributor, 'user'), false);
access.grantDistributorAccess();
assert.equal(access.canViewDistributorDocument(distributor, 'user'), true);
access.updateDistributorPasswordRequired(false);
access.updateDistributorPasswordRequired(true);
assert.equal(access.hasDistributorAccess(), false, 'Al reactivar se debe pedir la clave nuevamente.');
assert.equal(notifications, 5);
console.log('PASS: acceso cerrado, apertura, reactivación y renovación de sesión.');
