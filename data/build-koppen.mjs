import { writeFileSync } from 'node:fs'

const classes = {}

function add(code, en, uk, explainEn, explainUk) {
	classes[code] = {
		code,
		name: { en, uk },
		explain: { en: explainEn, uk: explainUk },
	}
}

add(
	'Af',
	'Tropical rainforest',
	'Тропічний дощовий',
	'Hot and wet throughout the year, without a pronounced dry season.',
	'Жарко й волого протягом року, без вираженого сухого сезону.',
)

add(
	'Am',
	'Tropical monsoon',
	'Тропічний мусонний',
	'Hot throughout the year, with abundant rain and a short drier period.',
	'Жарко протягом року, з рясними опадами та коротшим сухішим періодом.',
)

add(
	'Aw',
	'Tropical savanna',
	'Тропічна савана',
	'Hot throughout the year, with a pronounced dry season.',
	'Жарко протягом року, є виражений сухий сезон.',
)

for (const [code, en, uk, explanationEn, explanationUk] of [
	[
		'BWh',
		'Hot desert',
		'Жарка пустеля',
		'Very limited rainfall and a hot annual climate.',
		'Дуже мало опадів і високі середньорічні температури.',
	],
	[
		'BWk',
		'Cold desert',
		'Холодна пустеля',
		'Very limited rainfall and a cooler annual climate.',
		'Дуже мало опадів і прохолодніший середньорічний клімат.',
	],
	[
		'BSh',
		'Hot semi-arid',
		'Жаркий напівпосушливий',
		'Limited rainfall, hot conditions and frequent water constraints.',
		'Мало опадів, жаркі умови та часті обмеження доступності води.',
	],
	[
		'BSk',
		'Cold semi-arid',
		'Холодний напівпосушливий',
		'Limited rainfall and relatively cool annual conditions.',
		'Мало опадів і порівняно прохолодні середньорічні умови.',
	],
]) {
	add(code, en, uk, explanationEn, explanationUk)
}

const groups = {
	C: {
		en: 'Temperate',
		uk: 'Помірний',
		explanationEn: 'This is a temperate climate.',
		explanationUk: 'Це клімат помірного типу.',
	},
	D: {
		en: 'Cold continental',
		uk: 'Холодний континентальний',
		explanationEn: 'Cold winters are an important feature of this climate.',
		explanationUk: 'Важливою особливістю цього клімату є холодні зими.',
	},
}

const moisture = {
	f: {
		en: 'no dry season',
		uk: 'без сухого сезону',
		explainEn: 'There is no pronounced seasonal drought in the classification.',
		explainUk: 'За класифікацією немає вираженого сезонного сухого періоду.',
	},
	s: {
		en: 'dry summer',
		uk: 'сухе літо',
		explainEn: 'Summers are relatively dry.',
		explainUk: 'Літній період відносно сухий.',
	},
	w: {
		en: 'dry winter',
		uk: 'суха зима',
		explainEn: 'Winters are relatively dry.',
		explainUk: 'Зимовий період відносно сухий.',
	},
}

const thermal = {
	a: {
		en: 'hot summer',
		uk: 'жарке літо',
		explainEn: 'Summers are hot.',
		explainUk: 'Літо жарке.',
	},
	b: {
		en: 'warm summer',
		uk: 'тепле літо',
		explainEn: 'Summers are warm.',
		explainUk: 'Літо тепле.',
	},
	c: {
		en: 'cool summer',
		uk: 'прохолодне літо',
		explainEn: 'Summers are relatively cool and the warm season is short.',
		explainUk: 'Літо відносно прохолодне, теплий сезон короткий.',
	},
	d: {
		en: 'very cold winter',
		uk: 'дуже холодна зима',
		explainEn: 'Winters can be exceptionally cold.',
		explainUk: 'Узимку можливі надзвичайно низькі температури.',
	},
}

for (const group of ['C', 'D']) {
	for (const m of ['f', 's', 'w']) {
		const heatClasses = group === 'C' ? ['a', 'b', 'c'] : ['a', 'b', 'c', 'd']

		for (const h of heatClasses) {
			const code = `${group}${m}${h}`
			add(
				code,
				`${groups[group].en}, ${moisture[m].en}, ${thermal[h].en}`,
				`${groups[group].uk}, ${moisture[m].uk}, ${thermal[h].uk}`,
				`${groups[group].explanationEn} ${moisture[m].explainEn} ${thermal[h].explainEn}`,
				`${groups[group].explanationUk} ${moisture[m].explainUk} ${thermal[h].explainUk}`,
			)
		}
	}
}

add(
	'ET',
	'Polar tundra',
	'Полярна тундра',
	'A very short, cold growing season limits most crops.',
	'Дуже короткий і холодний вегетаційний період обмежує більшість культур.',
)

add(
	'EF',
	'Polar ice',
	'Полярні льодовики',
	'Temperatures remain too low for normal field-crop cultivation.',
	'Температури залишаються надто низькими для звичайного польового землеробства.',
)

const output = {
	source: 'Beck et al. 2018, doi:10.1038/sdata.2018.214',
	classes,
}

if (Object.keys(classes).length !== 30) {
	throw new Error('Expected exactly 30 climate classes')
}

writeFileSync(
	new URL('./koppen.json', import.meta.url),
	JSON.stringify(output, null, 2) + '\n',
	'utf8',
)

console.log('OK: 30 Koppen climate classes')
console.log('English and Ukrainian descriptions ready')

