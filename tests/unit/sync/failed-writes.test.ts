import { expect, it } from 'vitest';
import { failedLabel, retryStatement } from '../../../src/lib/sync/failed-writes';

const columns = (t: string) => (t === 'notes' ? ['status', 'content', 'home_id'] : null);
const write = (op: string, data: unknown) => ({
	table_name: 'notes',
	op,
	record_id: 'n1',
	data: JSON.stringify(data)
});

it('queues a refused new record again once it has left the device', () => {
	expect(
		retryStatement(write('PUT', { status: 'draft', content: { a: 1 } }), columns, false)
	).toEqual({
		sql: 'INSERT INTO "notes" ("id", "status", "content") VALUES (?, ?, ?)',
		params: ['n1', 'draft', '{"a":1}']
	});
	expect(retryStatement(write('PUT', { status: 'draft' }), columns, true)).toEqual({ wait: true });
});

it('reapplies an edit or a removal only to a row still on the device', () => {
	expect(retryStatement(write('PATCH', { status: 'submitted' }), columns, true)).toEqual({
		sql: 'UPDATE "notes" SET "status" = ? WHERE id = ?',
		params: ['submitted', 'n1']
	});
	expect(retryStatement(write('PATCH', { status: 'submitted' }), columns, false)).toBeNull();
	expect(retryStatement(write('DELETE', null), columns, true)).toEqual({
		sql: 'DELETE FROM "notes" WHERE id = ?',
		params: ['n1']
	});
});

it('never puts unknown tables or columns into SQL', () => {
	expect(
		retryStatement({ ...write('PUT', { status: 'x' }), table_name: 'notes; DROP' }, columns, false)
	).toBeNull();
	expect(retryStatement(write('PATCH', { 'status" = 1; --': 'x' }), columns, true)).toBeNull();
	expect(retryStatement({ ...write('PUT', {}), data: 'not json' }, columns, false)).toBeNull();
	expect(failedLabel('mar_records')).toBe('Medication record');
	expect(failedLabel('other')).toBe('Change');
});
