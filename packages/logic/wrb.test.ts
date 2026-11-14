import { describe, it, expect } from 'vitest'
import { getWrbGroup } from './wrb'
import catalog from '../../data/soil-wrb.json'

describe('WRB soil classification', () => {
	it('contains 30 unique soil groups', () => {
		expect(catalog.groups).toHaveLength(30)

		const codes = catalog.groups.map(g => g.code)
		expect(new Set(codes).size).toBe(30)
	})

	it('finds Chernozems in Ukrainian', () => {
		const result = getWrbGroup({ name: 'Chernozems', probability: 0.82 }, 'uk')

		expect(result?.code).toBe('CH')
		expect(result?.name).toBe('Чорноземи')
		expect(result?.probability).toBe(0.82)
		expect(result?.explain).toContain('Темні')
	})

	it('supports short WRB codes', () => {
		const result = getWrbGroup({ name: 'AR', probability: 0.6 }, 'en')

		expect(result?.name).toBe('Arenosols')
	})

	it('returns null for missing soil group', () => {
		expect(getWrbGroup(null, 'en')).toBeNull()

		expect(
			getWrbGroup({ name: 'UnknownSoil', probability: null }, 'uk'),
		).toBeNull()
	})

	it('does not invent invalid probability', () => {
		const result = getWrbGroup({ name: 'Chernozems', probability: 1.5 }, 'en')

		expect(result?.probability).toBeNull()
	})
})
