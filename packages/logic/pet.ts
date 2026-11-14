const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function extraterrestrialRadiation(
	latitude: number,
	dayOfYear: number,
): number {
	const phi = (latitude * Math.PI) / 180
	const dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365)
	const delta = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39)

	const x = -Math.tan(phi) * Math.tan(delta)
	const omega = Math.acos(Math.max(-1, Math.min(1, x)))

	const ra =
		((24 * 60) / Math.PI) *
		0.082 *
		dr *
		(omega * Math.sin(phi) * Math.sin(delta) +
			Math.cos(phi) * Math.cos(delta) * Math.sin(omega))

	return Math.max(0, ra)
}

/**
 * Estimates monthly reference evapotranspiration (mm/month).
 * Uses Hargreaves-Samani with FAO-56 extraterrestrial radiation.
 *
 * Input temperatures are monthly means of daily observations.
 * Returns null for missing or invalid input.
 * This is an estimate, not measured field evapotranspiration.
 */
export function estimateMonthlyPetMm(
	latitude: number,
	meanC: readonly number[],
	minC: readonly number[],
	maxC: readonly number[],
): number[] | null {
	if (
		!Number.isFinite(latitude) ||
		Math.abs(latitude) > 90 ||
		[meanC, minC, maxC].some(
			a => a.length !== 12 || a.some(v => !Number.isFinite(v)),
		)
	) {
		return null
	}

	const result: number[] = []
	let startDay = 0

	for (let i = 0; i < 12; i++) {
		const days = DAYS[i]

		if (maxC[i] <= minC[i] || meanC[i] < minC[i] || meanC[i] > maxC[i]) {
			return null
		}

		const middleDay = startDay + (days + 1) / 2
		const ra = extraterrestrialRadiation(latitude, middleDay)

		const petDay =
			0.0023 *
			Math.max(0, meanC[i] + 17.8) *
			Math.sqrt(maxC[i] - minC[i]) *
			(0.408 * ra)

		const petMonth = Math.max(0, petDay * days)

		if (!Number.isFinite(petMonth)) return null

		result.push(petMonth)
		startDay += days
	}

	return result
}
