import type { Climate, Soil, Priorities } from '@field-shift/shared'

import { scoreCrop, type CropProfile, type CropScoreResult } from './cropScore'

import { evaluateCropSeason, type CropSeasonResult } from './cropSeason'

export interface CatalogCrop extends CropProfile {
	seasonDaysRange: {
		min: number
		max: number
	} | null
}

export interface CropAssessmentContext {
	climate: Climate | null
	soil: Soil | null
	previousCropIds: readonly string[]
	previousFamilies: readonly string[]
	priorities: Priorities

	// Only supply a score from a validated risk model.
	// Current uncalibrated stress scores must not be
	// treated as validated crop suitability.
	verifiedRiskSuitabilityPct: number | null
}

export interface CropAssessment {
	id: string
	preliminarySeason: CropSeasonResult | null
	suitability: CropScoreResult
	eligibleForRecommendation: boolean
	blockerCodes: string[]
}

/**
 * Combines seasonal screening with crop scoring.
 *
 * No network calls and no input mutation.
 * Unverified EcoCrop requirements cannot produce
 * an actionable crop recommendation.
 *
 * Blocker codes are internal and must be localized
 * by the presentation layer.
 */
export function assessCropSeasons(
	crops: readonly CatalogCrop[],
	context: CropAssessmentContext,
): CropAssessment[] {
	return crops.map(crop => {
		const monthly = context.climate?.monthly

		const preliminarySeason = monthly
			? evaluateCropSeason({
					monthlyTempC: monthly.tempC,
					monthlyPrecipMm: monthly.precipMm,
					tempRange: crop.tempRange,
					precipRange: crop.precipRange,
					seasonDaysRange: crop.seasonDaysRange,
				})
			: null

		const soilPh = context.soil?.properties.phH2O.median ?? null

		const risk = context.verifiedRiskSuitabilityPct

		const suitability = scoreCrop(crop, {
			seasonTempC: preliminarySeason?.meanTempC ?? null,

			seasonPrecipMm: preliminarySeason?.seasonPrecipMm ?? null,

			soilPh,
			riskSuitabilityPct: risk,

			previousCropIds: [...context.previousCropIds],
			previousFamilies: [...context.previousFamilies],
			priorities: context.priorities,
		})

		const blockerCodes: string[] = []

		if (crop.verificationStatus !== 'verified' || !crop.source?.trim()) {
			blockerCodes.push('CROP_NOT_VERIFIED')
		}

		if (!preliminarySeason) {
			blockerCodes.push('SEASON_DATA_UNAVAILABLE')
		}

		if (soilPh === null || !Number.isFinite(soilPh)) {
			blockerCodes.push('SOIL_PH_UNAVAILABLE')
		}

		if (risk === null || !Number.isFinite(risk) || risk < 0 || risk > 100) {
			blockerCodes.push('VALIDATED_RISK_UNAVAILABLE')
		}

		if (suitability.score === null && blockerCodes.length === 0) {
			blockerCodes.push('SCORE_INPUT_INCOMPLETE')
		}

		return {
			id: crop.id,
			preliminarySeason,
			suitability,
			eligibleForRecommendation:
				suitability.score !== null && blockerCodes.length === 0,
			blockerCodes,
		}
	})
}
