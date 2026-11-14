export function classifyKoppen(
	monthlyTemp: readonly number[],
	monthlyPrecip: readonly number[],
	lat: number,
): string | null {
	if (
		monthlyTemp.length !== 12 ||
		monthlyPrecip.length !== 12 ||
		!Number.isFinite(lat) ||
		Math.abs(lat) > 90 ||
		monthlyTemp.some(v => !Number.isFinite(v)) ||
		monthlyPrecip.some(v => !Number.isFinite(v) || v < 0)
	) {
		return null
	}

	const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0)

	const hottest = Math.max(...monthlyTemp)
	const coldest = Math.min(...monthlyTemp)
	const annualTemp = sum(monthlyTemp) / 12
	const annualPrecip = sum(monthlyPrecip)
	const driest = Math.min(...monthlyPrecip)
	const monthsAbove10 = monthlyTemp.filter(t => t >= 10).length

	// April–September in the Northern Hemisphere.
	const summerMonths = lat >= 0 ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2]

	const summerSet = new Set(summerMonths)
	const winterMonths = Array.from({ length: 12 }, (_, i) => i).filter(
		i => !summerSet.has(i),
	)

	const seasonValues = (months: number[]) => months.map(i => monthlyPrecip[i])

	const summer = seasonValues(summerMonths)
	const winter = seasonValues(winterMonths)

	const summerTotal = sum(summer)
	const winterTotal = sum(winter)

	// Beck et al. (2018): arid climate takes precedence.
	const dryThreshold =
		annualPrecip === 0
			? 0
			: 20 * annualTemp +
				(winterTotal / annualPrecip >= 0.7
					? 0
					: summerTotal / annualPrecip >= 0.7
						? 280
						: 140)

	const aridThreshold = Math.max(0, dryThreshold)


if (annualPrecip === 0) {
	return annualTemp >= 18 ? 'BWh' : 'BWk'
}


	if (annualPrecip < aridThreshold) {
		const desert = annualPrecip < aridThreshold / 2
		const thermal = annualTemp >= 18 ? 'h' : 'k'
		return `B${desert ? 'W' : 'S'}${thermal}`
	}

	// Tropical climate.
	if (coldest >= 18) {
		if (driest >= 60) return 'Af'
		if (driest >= 100 - annualPrecip / 25) return 'Am'

		
		return 'Aw'

	}

	// Polar climate.
	if (hottest <= 10) {
		return hottest <= 0 ? 'EF' : 'ET'
	}

	// Temperate or continental climate.
	const group = coldest > 0 ? 'C' : 'D'

	const summerDry =
		Math.min(...summer) < 40 && Math.min(...summer) < Math.max(...winter) / 3

	const winterDry = Math.min(...winter) < Math.max(...summer) / 10

	let moisture = 'f'

	if (summerDry && winterTotal > summerTotal) {
		moisture = 's'
	} else if (winterDry && summerTotal >= winterTotal) {
		moisture = 'w'
	}

	let heat: string

	if (hottest >= 22) {
		heat = 'a'
	} else if (monthsAbove10 >= 4) {
		heat = 'b'
	} else if (group === 'D' && coldest < -38) {
		heat = 'd'
	} else {
		heat = 'c'
	}

	return `${group}${moisture}${heat}`
}
