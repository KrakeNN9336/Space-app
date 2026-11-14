import type { SoilProperties } from '@field-shift/shared'

export interface WaterBalance {
	storageMm: number[]
	actualEtMm: number[]
	deficitMm: number[]
	surplusMm: number[]
	annualDeficitMm: number
	annualSurplusMm: number
}

const validMonths = (values: readonly number[]) =>
	values.length === 12 && values.every(v => Number.isFinite(v) && v >= 0)

const sum = (values: readonly number[]) =>
	values.reduce((total, value) => total + value, 0)

/**
 * UNEP aridity index: annual precipitation / annual PET.
 * Null means input data is missing or PET is zero.
 */
export function calculateAridityIndex(
	precipitationMm: readonly number[],
	petMm: readonly number[],
): number | null {
	if (!validMonths(precipitationMm) || !validMonths(petMm)) {
		return null
	}

	const annualPet = sum(petMm)
	if (annualPet <= 0) return null

	return sum(precipitationMm) / annualPet
}

/**
 * Saxton-Rawls (2006) estimate of available water capacity.
 *
 * SoilGrids input:
 * sandPct, clayPct: percentages (0-100)
 * organicCarbonGkg: grams per kilogram
 * rootZoneDepthMm: explicitly supplied root-zone depth
 *
 * No default root depth is assumed.
 */
export function estimateAvailableWaterMm(
	properties: SoilProperties | null,
	rootZoneDepthMm: number | null,
): number | null {
	if (
		!properties ||
		rootZoneDepthMm === null ||
		!Number.isFinite(rootZoneDepthMm) ||
		rootZoneDepthMm <= 0
	) {
		return null
	}

	const sandPct = properties.sandPct.median
	const clayPct = properties.clayPct.median
	const carbon = properties.organicCarbonGkg.median

	if (
		sandPct === null ||
		clayPct === null ||
		carbon === null ||
		![sandPct, clayPct, carbon].every(Number.isFinite) ||
		sandPct < 0 ||
		clayPct < 0 ||
		sandPct > 100 ||
		clayPct > 100 ||
		sandPct + clayPct > 100 ||
		carbon < 0 ||
		carbon > 1000
	) {
		return null
	}

	const sand = sandPct / 100
	const clay = clayPct / 100

	// Estimated organic matter percentage from SOC (g/kg).
	const om = carbon * 0.1724

	// Permanent wilting point.
	const theta1500t =
		-0.024 * sand +
		0.487 * clay +
		0.006 * om +
		0.005 * sand * om -
		0.013 * clay * om +
		0.068 * sand * clay +
		0.031

	const theta1500 = theta1500t + (0.14 * theta1500t - 0.02)

	// Field capacity.
	const theta33t =
		-0.251 * sand +
		0.195 * clay +
		0.011 * om +
		0.006 * sand * om -
		0.027 * clay * om +
		0.452 * sand * clay +
		0.299

	const theta33 = theta33t + (1.283 * theta33t ** 2 - 0.374 * theta33t - 0.015)

	if (
		!Number.isFinite(theta33) ||
		!Number.isFinite(theta1500) ||
		theta1500 < 0 ||
		theta33 > 1 ||
		theta33 <= theta1500
	) {
		return null
	}

	return (theta33 - theta1500) * rootZoneDepthMm
}

/**
 * Monthly climatic water balance.
 *
 * Initial water storage must be supplied explicitly.
 * No measured soil moisture is invented.
 *
 * Implements the simplified Thornthwaite-Mather
 * approach documented in docs/agro-math.md.
 */
export function calculateWaterBalance(
	precipitationMm: readonly number[],
	petMm: readonly number[],
	capacityMm: number | null,
	initialWaterMm: number | null,
): WaterBalance | null {
	if (
		!validMonths(precipitationMm) ||
		!validMonths(petMm) ||
		capacityMm === null ||
		initialWaterMm === null ||
		!Number.isFinite(capacityMm) ||
		!Number.isFinite(initialWaterMm) ||
		capacityMm <= 0 ||
		initialWaterMm < 0 ||
		initialWaterMm > capacityMm
	) {
		return null
	}

	const storageMm: number[] = []
	const actualEtMm: number[] = []
	const deficitMm: number[] = []
	const surplusMm: number[] = []

	let water = initialWaterMm

	for (let month = 0; month < 12; month++) {
		const precipitation = precipitationMm[month]
		const pet = petMm[month]

		let actualEt: number
		let deficit = 0
		let surplus = 0

		if (precipitation >= pet) {
			const excess = precipitation - pet
			surplus = Math.max(0, water + excess - capacityMm)
			water = Math.min(capacityMm, water + excess)
			actualEt = pet
		} else {
			const shortage = pet - precipitation
			const previousWater = water

			water *= Math.exp(-shortage / capacityMm)

			actualEt = precipitation + previousWater - water
			deficit = Math.max(0, pet - actualEt)
		}

		storageMm.push(water)
		actualEtMm.push(actualEt)
		deficitMm.push(deficit)
		surplusMm.push(surplus)
	}

	return {
		storageMm,
		actualEtMm,
		deficitMm,
		surplusMm,
		annualDeficitMm: sum(deficitMm),
		annualSurplusMm: sum(surplusMm),
	}
}
