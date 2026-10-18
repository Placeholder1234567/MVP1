import { expect, it, vi } from 'vitest';
import { ImportBatch } from '../../../src/lib/imports/import-batch';
import { parseImportCsv, previewImport } from '../../../src/lib/domain/csv-import';
const home = '16fd652e-7ddc-425b-8798-a02ec3c43416';
const make = () =>
	new ImportBatch(
		previewImport(
			'people',
			parseImportCsv(
				`home_id,name,first_name,info\n${home},Synthetic One,,\n${home},Synthetic Two,,\n${home},Synthetic Three,,`
			),
			{ homes: [{ id: home, name: 'Synthetic home' }], people: [] }
		)
	);
it('blocks offline and invalid batches before any API call', async () => {
	const create = vi.fn(async () => ({ id: 'created' })),
		changed = vi.fn(),
		batch = make();
	expect(await batch.apply({ create, changed, online: () => false })).toBe(false);
	batch.rows[0].errors.push('Invalid row');
	expect(await batch.apply({ create, changed, online: () => true })).toBe(false);
	expect(create).not.toHaveBeenCalled();
});
it('records successes once and never repeats an already applied preview', async () => {
	const batch = make(),
		create = vi.fn(async () => ({ id: 'synthetic-created-id' }));
	const options = { create, changed: vi.fn(), online: () => true };
	await batch.apply(options);
	await batch.apply(options);
	expect(create).toHaveBeenCalledTimes(3);
	expect(batch.outcomes.map((row) => row.status)).toEqual(['created', 'created', 'created']);
});
it('stops on ambiguous responses, retaining outcomes without retrying any attempted row', async () => {
	const batch = make(),
		create = vi
			.fn()
			.mockResolvedValueOnce({ id: 'first' })
			.mockRejectedValueOnce(new Error('Synthetic network loss'));
	const options = { create, changed: vi.fn(), online: () => true };
	await batch.apply(options);
	await batch.apply(options);
	expect(batch.outcomes).toEqual([
		{ status: 'created', id: 'first' },
		{ status: 'unconfirmed' },
		{ status: 'not-attempted' }
	]);
	expect(create).toHaveBeenCalledTimes(2);
});
it('preserves in-flight success then stops later rows on offline/privacy or an explicit stop', async () => {
	const batch = make();
	let online = true;
	await batch.apply({
		create: async () => {
			online = false;
			return { id: 'first' };
		},
		changed: vi.fn(),
		online: () => online
	});
	expect(batch.outcomes.map((row) => row.status)).toEqual([
		'created',
		'not-attempted',
		'not-attempted'
	]);
	const stopped = make();
	await stopped.apply({
		create: async () => {
			stopped.stop();
			return { id: 'first' };
		},
		changed: vi.fn(),
		online: () => true
	});
	expect(stopped.outcomes.map((row) => row.status)).toEqual([
		'created',
		'not-attempted',
		'not-attempted'
	]);
});
