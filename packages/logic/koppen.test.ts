import { describe, it, expect } from 'vitest'
import { classifyKoppen } from './koppen'

describe('Koppen-Geiger climate classification', () => {
	it('classifies a continental climate as Dfb', () => {
		const temp = [-5, -3, 2, 9, 15, 19, 21, 20, 14, 8, 2, -3]
		const precip = [40, 37, 44, 49, 65, 80, 88, 78, 65, 55, 46, 42]

		expect(classifyKoppen(temp, precip, 49.8)).toBe('Dfb')
	})

	it('classifies a hot desert climate as BWh', () => {
		const temp = [19, 21, 24, 28, 32, 35, 37, 36, 33, 29, 24, 20]
		const precip = [8, 5, 7, 4, 1, 0, 0, 0, 1, 2, 4, 7]

		expect(classifyKoppen(temp, precip, 25.2)).toBe('BWh')
	})

	it('classifies a tropical savanna climate as Aw', () => {
		const temp = [27, 27, 26, 25, 23, 22, 22, 23, 24, 25, 26, 27]
		const precip = [165, 150, 140, 90, 65, 45, 35, 30, 55, 85, 110, 150]

		expect(classifyKoppen(temp, precip, -22.9)).toBe('Aw')
	})

	it('classifies a temperate oceanic climate as Cfb', () => {
		const temp = [5, 5, 8, 11, 14, 17, 19, 18, 15, 11, 8, 5]
		const precip = [55, 40, 45, 45, 50, 50, 45, 55, 55, 65, 60, 55]

		expect(classifyKoppen(temp, precip, 51.5)).toBe('Cfb')
	})

	it('returns null for incomplete climate data', () => {
		expect(classifyKoppen([10, 15], [50, 60], 49)).toBeNull()
	})
})
