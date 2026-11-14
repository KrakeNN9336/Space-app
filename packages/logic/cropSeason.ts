import { rangeSuitability, type CropRange } from './cropScore'

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export interface CropSeasonInput {
	monthlyTempC: readonly number[]
	monthlyPrecipMm: readonly number[]
	tempRange: CropRange
	precipRange: CropRange
	seasonDaysRange: {
		min: number
		max: number
	} | null
}

export interface CropSeasonResult {
	startMonthIndex: number
	monthCount: number
	durationDays: number
	meanTempC: number
	seasonPrecipMm: number
	tempScore: number
	rainScore: number
	score: number
	confidence: 'low'
	warningCodes: string[]
}

function validMonthly(
	values: readonly number[],
	nonnegative: boolean,
): boolean {
	return (
		Array.isArray(values) &&
		values.length === 12 &&
		values.every(
			value => Number.isFinite(value) && (!nonnegative || value >= 0),
		)
	)
}

/**
 * Provisional EcoCrop bioclimatic screening.
 *
 * Evaluates complete calendar-month windows and
 * growing-cycle length from the EcoCrop record.
 *
 * The highest-scoring window is NOT a recommended
 * sowing date. Cultivar, crop stages, local calendar,
 * irrigation and frost events remain unverified.
 *
 * Uses no network and does not modify input.
 */
export function evaluateCropSeason(
	input: CropSeasonInput,
): CropSeasonResult | null {
	const length = input.seasonDaysRange

	if (
		!validMonthly(input.monthlyTempC, false) ||
		!validMonthly(input.monthlyPrecipMm, true) ||
		!length ||
		!Number.isInteger(length.min) ||
		!Number.isInteger(length.max) ||
		length.min <= 0 ||
		length.max > 365 ||
		length.min > length.max
	) {
		return null
	}

	let best: CropSeasonResult | null = null

	for (let start = 0; start < 12; start++) {
		let durationDays = 0
		let weightedTemp = 0
		let totalPrecip = 0

		for (let count = 1; count <= 12; count++) {
			const month = (start + count - 1) % 12
			const days = MONTH_DAYS[month]

			durationDays += days
			weightedTemp += input.monthlyTempC[month] * days
			totalPrecip += input.monthlyPrecipMm[month]

			if (durationDays > length.max) break
			if (durationDays < length.min) continue

			const meanTemp = weightedTemp / durationDays

			const tempScore = rangeSuitability(meanTemp, input.tempRange)

			const rainScore = rangeSuitability(totalPrecip, input.precipRange)

			if (tempScore === null || rainScore === null) {
				return null
			}

			// Conservative combination, not a calibrated
			// agronomic probability.
			const score = Math.min(tempScore, rainScore)

			if (best === null || score > best.score) {
				best = {
					startMonthIndex: start,
					monthCount: count,
					durationDays,
					meanTempC: meanTemp,
					seasonPrecipMm: totalPrecip,
					tempScore,
					rainScore,
					score,
					confidence: 'low',
					warningCodes: [
						'PROVISIONAL_ECOCROP_SCREEN',
						'PLANTING_CALENDAR_NOT_VALIDATED',
						'MONTHLY_CLIMATE_RESOLUTION',
					],
				}
			}
		}
	}

	return best
}
