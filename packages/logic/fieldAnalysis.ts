import type {
	Climate,
	Lang,
	LogicInput,
	Soil,
	StressItem,
} from '@field-shift/shared'

import catalog from '../../data/koppen.json'
import { classifyKoppen } from './koppen'
import { estimateMonthlyPetMm } from './pet'
import { getWrbGroup } from './wrb'
import { computeStress } from './stress'

export interface FieldAnalysis {
	climate: Climate | null
	soil: Soil | null
	stress: StressItem[]
}

type Description = {
	name: Record<Lang, string>
	explain: Record<Lang, string>
}

const descriptions = catalog.classes as Record<string, Description>

function validMonthly(values: readonly number[], nonnegative = false): boolean {
	return (
		values.length === 12 &&
		values.every(v => Number.isFinite(v) && (!nonnegative || v >= 0))
	)
}

/**
 * Converts raw collected data into field analysis.
 * No network calls, mock measurements or API changes.
 */
export function analyzeField(input: LogicInput): FieldAnalysis {
	const raw = input.climate
	let climate: Climate | null = null

	if (
		raw &&
		validMonthly(raw.monthly.tempC) &&
		validMonthly(raw.monthly.tempMinC) &&
		validMonthly(raw.monthly.tempMaxC) &&
		validMonthly(raw.monthly.precipMm, true)
	) {
		const monthly = raw.monthly

		const pet = estimateMonthlyPetMm(
			input.location.lat,
			monthly.tempC,
			monthly.tempMinC,
			monthly.tempMaxC,
		)

		if (pet) {
			const code = classifyKoppen(
				monthly.tempC,
				monthly.precipMm,
				input.location.lat,
			)

			const description = code ? descriptions[code] : undefined

			const annualTempC = monthly.tempC.reduce((a, b) => a + b, 0) / 12

			const annualPrecipMm = monthly.precipMm.reduce((a, b) => a + b, 0)

			climate = {
				koppen:
					code && description
						? {
								code,
								name: description.name[input.lang],
								explain: description.explain[input.lang],
							}
						: null,

				annualTempC,
				annualPrecipMm,

				// Requires agreed agronomic season definitions.
				growingSeasonMonths: null,
				frostFreeMonths: null,

				monthly: {
					tempC: [...monthly.tempC],
					tempMinC: [...monthly.tempMinC],
					tempMaxC: [...monthly.tempMaxC],
					precipMm: [...monthly.precipMm],
					petMm: pet,
				},

				spread: { ...raw.spread },
				samples: raw.samples,
				source: raw.source,
			}
		}
	}

	const soil: Soil | null = input.soil
		? {
				wrbGroup: getWrbGroup(input.soil.wrbGroup, input.lang),
				properties: input.soil.properties,
				source: input.soil.source,
			}
		: null

	const stress = computeStress(climate, soil, input.terrain, input.lang)

	return { climate, soil, stress }
}
