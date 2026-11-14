import {
	STRESS_IDS,
	type Climate,
	type Soil,
	type Terrain,
	type Lang,
	type StressId,
	type StressItem,
	type StressLevel,
	type Evidence,
	type Confidence,
} from '@field-shift/shared'

import thresholds from '../../data/thresholds.json'
import messages from '../../data/stress-copy.json'
import { calculateAridityIndex } from './waterBalance'

type Values = Record<string, string | number>

function fill(template: string, values: Values = {}): string {
	return template.replace(/\{(\w+)\}/g, (_, key: string) =>
		String(values[key] ?? ''),
	)
}

function validMonthly(values: number[] | undefined): values is number[] {
	return (
		Array.isArray(values) &&
		values.length === 12 &&
		values.every(v => Number.isFinite(v) && v >= 0)
	)
}

function validTemperature(values: number[] | undefined): values is number[] {
	return (
		Array.isArray(values) &&
		values.length === 12 &&
		values.every(Number.isFinite)
	)
}

function total(values: number[]): number {
	return values.reduce((sum, value) => sum + value, 0)
}

function rounded(value: number, digits = 1): number {
	return Number(value.toFixed(digits))
}

export function computeStress(
	climate: Climate | null,
	soil: Soil | null,
	terrain: Terrain | null,
	lang: Lang = 'en',
): StressItem[] {
	const copy = messages[lang]

	function unknown(
		id: StressId,
		evidence: Evidence[] = [],
		sources: string[] = [],
		detail?: string,
	): StressItem {
		return {
			id,
			level: 'low',
			score: thresholds.scoreMapping.unknown,
			whyShort: copy.unknownShort,
			whyFull: detail ? `${detail} ${copy.unknownFull}` : copy.unknownFull,
			evidence,
			confidence: 'low',
			sources,
		}
	}

	function assessed(
		id: StressId,
		level: StressLevel,
		values: Values,
		evidence: Evidence[],
		sources: string[],
		confidence: Confidence = 'low',
	): StressItem {
		const template = copy[id]

		return {
			id,
			level,
			score: thresholds.scoreMapping[level],
			whyShort: fill(template.short, {
				...values,
				level:
					lang === 'uk'
						? (
								{
									low: 'низький',
									moderate: 'помірний',
									high: 'високий',
								} as const
							)[level]
						: level,
			}),
			whyFull: fill(template.full, values),
			evidence,
			confidence,
			sources,
		}
	}

	const results = {} as Record<StressId, StressItem>

	const precip = climate?.monthly.precipMm
	const pet = climate?.monthly.petMm
	const minTemp = climate?.monthly.tempMinC
	const maxTemp = climate?.monthly.tempMaxC

	const hasWater = validMonthly(precip) && validMonthly(pet)

	const climateSource = climate?.source ? [climate.source] : []

	// 1. Climatic dryness: UNEP aridity classification.
	const ai = hasWater ? calculateAridityIndex(precip!, pet!) : null

	if (ai === null) {
		results.drought = unknown('drought')
	} else {
		const level: StressLevel =
			ai < thresholds.aridity.highBelow
				? 'high'
				: ai < thresholds.aridity.moderateBelow
					? 'moderate'
					: 'low'

		results.drought = assessed(
			'drought',
			level,
			{
				p: rounded(total(precip!)),
				pet: rounded(total(pet!)),
				ai: rounded(ai, 3),
			},
			[
				{
					label: copy.drought.label,
					value: rounded(ai, 3),
				},
			],
			[...climateSource, thresholds.aridity.source],
			climate && climate.samples >= 3 ? 'medium' : 'low',
		)
	}

	// 2. Climatic water surplus, not observed soil saturation.
	if (!hasWater) {
		results.waterlogging = unknown('waterlogging')
	} else {
		const wetMonths = precip!.filter((p, index) => p > pet![index]).length

		results.waterlogging = assessed(
			'waterlogging',
			wetMonths === 0 ? 'low' : 'moderate',
			{ count: wetMonths },
			[
				{
					label: copy.waterlogging.label,
					value: wetMonths,
					unit: lang === 'uk' ? 'міс.' : 'months',
				},
			],
			climateSource,
		)
	}

	// 3. Monthly freezing exposure, not frost event frequency.
	if (!validTemperature(minTemp)) {
		results.frost = unknown('frost')
	} else {
		const coldMonths = minTemp.filter(
			value => value <= thresholds.freezing.temperatureC,
		).length

		results.frost = assessed(
			'frost',
			coldMonths === 0 ? 'low' : 'moderate',
			{ count: coldMonths },
			[
				{
					label: copy.frost.label,
					value: coldMonths,
					unit: lang === 'uk' ? 'міс.' : 'months',
				},
			],
			climateSource,
		)
	}

	// 4. Heat thresholds must be calibrated by crop.
	if (!validTemperature(maxTemp)) {
		results.heat = unknown('heat')
	} else {
		const hottest = rounded(Math.max(...maxTemp))

		results.heat = unknown(
			'heat',
			[
				{
					label: copy.heat.label,
					value: hottest,
					unit: '°C',
				},
			],
			climateSource,
			fill(copy.heat.full, { value: hottest }),
		)
	}

	// 5. A slope alone cannot determine RUSLE erosion.
	const slope = terrain?.slopePct

	if (
		slope === null ||
		slope === undefined ||
		!Number.isFinite(slope) ||
		slope < 0
	) {
		results.erosion = unknown('erosion')
	} else {
		const value = rounded(slope)

		results.erosion = unknown(
			'erosion',
			[
				{
					label: copy.erosion.label,
					value,
					unit: '%',
				},
			],
			[],
			fill(copy.erosion.full, { value }),
		)
	}

	// 6. Soil pH limitation, not full nutrient fertility.
	const ph = soil?.properties.phH2O.median

	if (
		ph === null ||
		ph === undefined ||
		!Number.isFinite(ph) ||
		ph < 0 ||
		ph > 14
	) {
		results.fertility = unknown('fertility')
	} else {
		const t = thresholds.soilPh

		const level: StressLevel =
			ph <= t.strongAcidAtOrBelow || ph >= t.strongAlkalineAtOrAbove
				? 'high'
				: ph < t.moderateAcidBelow || ph > t.moderateAlkalineAbove
					? 'moderate'
					: 'low'

		results.fertility = assessed(
			'fertility',
			level,
			{ value: rounded(ph, 2) },
			[
				{
					label: copy.fertility.label,
					value: rounded(ph, 2),
				},
			],
			[soil!.source, thresholds.soilPh.source],
			'low',
		)
	}

	return STRESS_IDS.map(id => results[id])
}
