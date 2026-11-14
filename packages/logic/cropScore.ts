import type { Priorities } from '@field-shift/shared'

export interface CropRange {
	min: number | null
	optMin: number | null
	optMax: number | null
	max: number | null
}

export interface CropProfile {
	id: string
	family: string | null
	tempRange: CropRange
	precipRange: CropRange
	phRange: CropRange
	verificationStatus: string
	source: string | null
}

export interface CropConditions {
	// Mean temperature during the proposed growing season.
	seasonTempC: number | null

	// Annual precipitation, matching EcoCrop rainfall units.
	annualPrecipMm: number | null

	soilPh: number | null

	// Risk suitability, only from validated indicators.
	riskSuitabilityPct: number | null

	previousCropIds: string[]
	previousFamilies: string[]
	priorities: Priorities
}

export interface CropScoreResult {
	id: string
	score: number | null
	confidence: 'low'
	components: {
		climate: number | null
		water: number | null
		soil: number | null
		rotation: number
		risk: number | null
	}
	warnings: string[]
}

const clamp = (value: number) => Math.max(0, Math.min(100, value))

export function rangeSuitability(
	value: number | null,
	range: CropRange,
): number | null {
	if (value === null || !Number.isFinite(value)) {
		return null
	}

	const { min, optMin, optMax, max } = range

	if ([min, optMin, optMax, max].some(v => v === null || !Number.isFinite(v))) {
		return null
	}

	const a = min as number
	const b = optMin as number
	const c = optMax as number
	const d = max as number

	if (!(a < b && b <= c && c < d)) {
		return null
	}

	if (value <= a || value >= d) return 0
	if (value >= b && value <= c) return 100

	if (value < b) {
		return clamp((100 * (value - a)) / (b - a))
	}

	return clamp((100 * (d - value)) / (d - c))
}

/**
 * Provisional agronomic scoring model.
 * Scores are relative suitability, never yield forecasts.
 * Incomplete or unverified inputs result in a null score.
 */
export function scoreCrop(
	crop: CropProfile,
	conditions: CropConditions,
): CropScoreResult {
	const warnings: string[] = []

	const climate = rangeSuitability(conditions.seasonTempC, crop.tempRange)

	const water = rangeSuitability(conditions.annualPrecipMm, crop.precipRange)

	const soil = rangeSuitability(conditions.soilPh, crop.phRange)

	const riskValue = conditions.riskSuitabilityPct
	const risk =
		riskValue !== null &&
		Number.isFinite(riskValue) &&
		riskValue >= 0 &&
		riskValue <= 100
			? riskValue
			: null

	// Neutral rotation score: provisional model convention,
	// not an observed agronomic measurement.
	let rotation = 90

	if (conditions.previousCropIds.includes(crop.id)) {
		rotation -= 30
	}

	if (
		crop.family === 'Fabaceae' &&
		conditions.previousFamilies.includes('Fabaceae')
	) {
		rotation -= 25
	}

	if (
		crop.family === 'Fabaceae' &&
		conditions.previousFamilies.includes('Poaceae') &&
		!conditions.previousFamilies.includes('Fabaceae')
	) {
		rotation += 10
	}

	rotation = clamp(rotation)

	if (crop.verificationStatus !== 'verified' || !crop.source?.trim()) {
		warnings.push('Crop requirements are not source-verified.')
	}

	if ([climate, water, soil, risk].some(v => v === null)) {
		warnings.push('Missing climate, water, soil or validated risk input.')
	}

	const components = {
		climate,
		water,
		soil,
		rotation,
		risk,
	}

	if (warnings.length > 0) {
		return {
			id: crop.id,
			score: null,
			confidence: 'low',
			components,
			warnings,
		}
	}

	// Requested baseline weights: 30 / 25 / 20 / 20 / 5.
	// Priority multipliers are model preferences, not
	// scientific calibration coefficients.
	const weights = {
		climate: 30,
		water: (25 * conditions.priorities.water) / 3,
		soil: (20 * conditions.priorities.soil) / 3,
		rotation: 20,
		risk: (5 * conditions.priorities.erosion) / 3,
	}

	const totalWeight = Object.values(weights).reduce(
		(sum, value) => sum + value,
		0,
	)

	const weighted =
		climate! * weights.climate +
		water! * weights.water +
		soil! * weights.soil +
		rotation * weights.rotation +
		risk! * weights.risk

	warnings.push(
		'Provisional suitability only; validate crop season, local prices and agronomic constraints.',
	)

	return {
		id: crop.id,
		score: clamp(Math.round(weighted / totalWeight)),
		confidence: 'low',
		components,
		warnings,
	}
}
