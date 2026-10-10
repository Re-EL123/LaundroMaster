import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePromotions, recordImpressions } from '../api/_lib/promotions.js';

function makeSupa(rows = []) {
  const log = [];
  function builder(table) {
    const ctx = { table, op: null, payload: null, filters: [] };
    const proxy = {
      select() { ctx.op = ctx.op || 'select'; return proxy; },
      update(payload) { ctx.op = 'update'; ctx.payload = payload; return proxy; },
      insert(payload) { ctx.op = 'insert'; ctx.payload = payload; return proxy; },
      eq(c, v) { ctx.filters.push(['eq', c, v]); return proxy; },
      lt(c, v) { ctx.filters.push(['lt', c, v]); return proxy; },
      gt(c, v) { ctx.filters.push(['gt', c, v]); return proxy; },
      is(c, v) { ctx.filters.push(['is', c, v]); return proxy; },
      in(c, v) { ctx.filters.push(['in', c, v]); return proxy; },
      or(expr) { ctx.filters.push(['or', expr]); return proxy; },
      order() { return proxy; },
      limit() { return proxy; },
      single() { return Promise.resolve({ data: {}, error: null }); },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      then(resolve, reject) {
        log.push(ctx);
        const data = ctx.op === 'select' ? rows : null;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return proxy;
  }
  return { from: (t) => builder(t), _log: log };
}

const hasFilter = (ctx, op, col, val) => ctx.filters.some((f) => f[0] === op && f[1] === col && JSON.stringify(f[2]) === JSON.stringify(val));

test('reconcilePromotions expires past-due promos and clears stale featured flags', async () => {
  const supa = makeSupa();
  await reconcilePromotions(supa, { force: true });

  const promo = supa._log.find((c) => c.table === 'promotions' && c.op === 'update');
  assert.deepEqual(promo.payload, { status: 'expired' });
  assert.ok(hasFilter(promo, 'eq', 'status', 'active'));
  assert.ok(promo.filters.some((f) => f[0] === 'lt' && f[1] === 'ends_at'));

  const lm = supa._log.find((c) => c.table === 'laundromats' && c.op === 'update');
  assert.deepEqual(lm.payload, { is_featured: false });
  assert.ok(hasFilter(lm, 'eq', 'is_featured', true));
  assert.ok(lm.filters.some((f) => f[0] === 'or'));
});

test('reconcilePromotions is a no-op when throttled and bypassed by force', async () => {
  const supa = makeSupa();
  await reconcilePromotions(supa, { force: true });
  const after = supa._log.length;
  await reconcilePromotions(supa);
  assert.equal(supa._log.length, after);
});

test('recordImpressions bumps only live featured promotions for the given ids', async () => {
  const supa = makeSupa([{ id: 'p1', impressions: 4 }, { id: 'p2', impressions: 0 }]);
  await recordImpressions(supa, ['lm-1', 'lm-2', null]);

  const select = supa._log.find((c) => c.table === 'promotions' && c.op === 'select');
  assert.ok(hasFilter(select, 'in', 'laundromat_id', ['lm-1', 'lm-2']));
  assert.ok(hasFilter(select, 'eq', 'kind', 'featured'));
  assert.ok(hasFilter(select, 'eq', 'status', 'active'));
  assert.ok(select.filters.some((f) => f[0] === 'gt' && f[1] === 'ends_at'));

  const updates = supa._log.filter((c) => c.table === 'promotions' && c.op === 'update');
  assert.equal(updates.length, 2);
  assert.deepEqual(updates[0].payload, { impressions: 5 });
  assert.deepEqual(updates[1].payload, { impressions: 1 });
});

test('recordImpressions ignores empty id lists', async () => {
  const supa = makeSupa([{ id: 'p1', impressions: 0 }]);
  await recordImpressions(supa, []);
  assert.equal(supa._log.length, 0);
});
