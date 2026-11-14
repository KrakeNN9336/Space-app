import { describe, expect, it } from 'vitest'
import { evaluateCropSeason, type CropSeasonInput } from './cropSeason'

const example: CropSeasonInput = {
	monthlyTempC: Array(12).fill(20),
	monthlyPrecipMm: Array(12).fill(100),
	tempRange: {
		min: 10,
		optMin: 15,
		optMax: 25,
		max: 40,
	},
	precipRange: {
		min: 200,
		optMin: 280,
		optMax: 320,
		max: 500,
	},
	seasonDaysRange: { min: 89, max: 92 },
}

describe('EcoCrop seasonal screening', () => {
	it('finds a suitable climate window', () => {
		const result = evaluateCropSeason(example)

		expect(result).not.toBeNull()
		expect(result?.score).toBe(100)
		expect(result?.monthCount).toBe(3)
		expect(result?.confidence).toBe('low')
	})

	it('supports seasons crossing December', () => {
		const temperatures = Array(12).fill(0)
		const precipitation = Array(12).fill(0)

		for (const m of [11, 0, 1]) {
			temperatures[m] = 25
			precipitation[m] = 100
		}

		const result = evaluateCropSeason({
			...example,
			monthlyTempC: temperatures,
			monthlyPrecipMm: precipitation,
			tempRange: {
				min: 10,
				optMin: 20,
				optMax: 30,
				max: 40,
			},
		})

		expect(result?.startMonthIndex).toBe(11)
		expect(result?.score).toBe(100)
	})

	it('does not invent missing season length', () => {
		expect(
			evaluateCropSeason({
				...example,
				seasonDaysRange: null,
			}),
		).toBeNull()
	})

	it('rejects incomplete climate data', () => {
		expect(
			evaluateCropSeason({
				...example,
				monthlyPrecipMm: [100],
			}),
		).toBeNull()
	})

	it('does not produce changing results', () => {
		expect(evaluateCropSeason(example)).toEqual(evaluateCropSeason(example))
	})

	it('reports zero for unsuitable known climate', () => {
		const result = evaluateCropSeason({
			...example,
			monthlyTempC: Array(12).fill(0),
			monthlyPrecipMm: Array(12).fill(0),
		})

		expect(result?.score).toBe(0)
	})
})
