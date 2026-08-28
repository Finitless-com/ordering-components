import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isSameOrAfter)

const wallClockInTimezone = (date, timezone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(date)
  const get = (type) => parts.find((part) => part.type === type)?.value
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`
}

// dayjs timezone parses Date.toLocaleString(); ICU >= 72 (Android 14+) breaks it with U+202F
const pluginTz = dayjs.prototype.tz
dayjs.prototype.tz = function (timezone, keepLocalTime) {
  const result = pluginTz.call(this, timezone, keepLocalTime)
  if (result.isValid() || !this.isValid() || !timezone) return result
  const wallClock = keepLocalTime
    ? this.format('YYYY-MM-DD HH:mm:ss')
    : wallClockInTimezone(this.toDate(), timezone)
  return dayjs.tz(wallClock, 'YYYY-MM-DD HH:mm:ss', timezone).millisecond(this.millisecond())
}

export const TIMEZONES = {
  'Europe/Andorra': 'Andorra',
  'Asia/Dubai': 'United Arab Emirates',
  'Asia/Kabul': 'Afghanistan',
  'Europe/Tirane': 'Albania',
  'Asia/Yerevan': 'Armenia',
  'Antarctica/Casey': 'Antarctica',
  'Antarctica/Davis': 'Antarctica',
  'Antarctica/Mawson': 'Antarctica',
  'Antarctica/Palmer': 'Antarctica',
  'Antarctica/Rothera': 'Antarctica',
  'Antarctica/Troll': 'Antarctica',
  'Antarctica/Vostok': 'Antarctica',
  'America/Argentina/Buenos_Aires': 'Argentina',
  'America/Argentina/Cordoba': 'Argentina',
  'America/Argentina/Salta': 'Argentina',
  'America/Argentina/Jujuy': 'Argentina',
  'America/Argentina/Tucuman': 'Argentina',
  'America/Argentina/Catamarca': 'Argentina',
  'America/Argentina/La_Rioja': 'Argentina',
  'America/Argentina/San_Juan': 'Argentina',
  'America/Argentina/Mendoza': 'Argentina',
  'America/Argentina/San_Luis': 'Argentina',
  'America/Argentina/Rio_Gallegos': 'Argentina',
  'America/Argentina/Ushuaia': 'Argentina',
  'Pacific/Pago_Pago': 'Samoa (American)',
  'Europe/Vienna': 'Austria',
  'Australia/Lord_Howe': 'Australia',
  'Antarctica/Macquarie': 'Australia',
  'Australia/Hobart': 'Australia',
  'Australia/Melbourne': 'Australia',
  'Australia/Sydney': 'Australia',
  'Australia/Broken_Hill': 'Australia',
  'Australia/Brisbane': 'Australia',
  'Australia/Lindeman': 'Australia',
  'Australia/Adelaide': 'Australia',
  'Australia/Darwin': 'Australia',
  'Australia/Perth': 'Australia',
  'Australia/Eucla': 'Australia',
  'Asia/Baku': 'Azerbaijan',
  'America/Barbados': 'Barbados',
  'Asia/Dhaka': 'Bangladesh',
  'Europe/Brussels': 'Belgium',
  'Europe/Sofia': 'Bulgaria',
  'Atlantic/Bermuda': 'Bermuda',
  'Asia/Brunei': 'Brunei',
  'America/La_Paz': 'Bolivia',
  'America/Noronha': 'Brazil',
  'America/Belem': 'Brazil',
  'America/Fortaleza': 'Brazil',
  'America/Recife': 'Brazil',
  'America/Araguaina': 'Brazil',
  'America/Maceio': 'Brazil',
  'America/Bahia': 'Brazil',
  'America/Sao_Paulo': 'Brazil',
  'America/Campo_Grande': 'Brazil',
  'America/Cuiaba': 'Brazil',
  'America/Santarem': 'Brazil',
  'America/Porto_Velho': 'Brazil',
  'America/Boa_Vista': 'Brazil',
  'America/Manaus': 'Brazil',
  'America/Eirunepe': 'Brazil',
  'America/Rio_Branco': 'Brazil',
  'Asia/Thimphu': 'Bhutan',
  'Europe/Minsk': 'Belarus',
  'America/Belize': 'Belize',
  'America/St_Johns': 'Canada',
  'America/Halifax': 'Canada',
  'America/Glace_Bay': 'Canada',
  'America/Moncton': 'Canada',
  'America/Goose_Bay': 'Canada',
  'America/Toronto': 'Canada',
  'America/Nipigon': 'Canada',
  'America/Thunder_Bay': 'Canada',
  'America/Iqaluit': 'Canada',
  'America/Pangnirtung': 'Canada',
  'America/Winnipeg': 'Canada',
  'America/Rainy_River': 'Canada',
  'America/Resolute': 'Canada',
  'America/Rankin_Inlet': 'Canada',
  'America/Regina': 'Canada',
  'America/Swift_Current': 'Canada',
  'America/Edmonton': 'Canada',
  'America/Cambridge_Bay': 'Canada',
  'America/Yellowknife': 'Canada',
  'America/Inuvik': 'Canada',
  'America/Dawson_Creek': 'Canada',
  'America/Fort_Nelson': 'Canada',
  'America/Whitehorse': 'Canada',
  'America/Dawson': 'Canada',
  'America/Vancouver': 'Canada',
  'Indian/Cocos': 'Cocos (Keeling) Islands',
  'Europe/Zurich': 'Switzerland',
  'Africa/Abidjan': 'Côte d\'Ivoire',
  'Pacific/Rarotonga': 'Cook Islands',
  'America/Santiago': 'Chile',
  'America/Punta_Arenas': 'Chile',
  'Pacific/Easter': 'Chile',
  'Asia/Shanghai': 'China',
  'Asia/Urumqi': 'China',
  'America/Bogota': 'Colombia',
  'America/Costa_Rica': 'Costa Rica',
  'America/Havana': 'Cuba',
  'Atlantic/Cape_Verde': 'Cape Verde',
  'Indian/Christmas': 'Christmas Island',
  'Asia/Nicosia': 'Cyprus',
  'Asia/Famagusta': 'Cyprus',
  'Europe/Prague': 'Czech Republic',
  'Europe/Berlin': 'Germany',
  'Europe/Copenhagen': 'Denmark',
  'America/Santo_Domingo': 'Dominican Republic',
  'Africa/Algiers': 'Algeria',
  'America/Guayaquil': 'Ecuador',
  'Pacific/Galapagos': 'Ecuador',
  'Europe/Tallinn': 'Estonia',
  'Africa/Cairo': 'Egypt',
  'Africa/El_Aaiun': 'Western Sahara',
  'Europe/Madrid': 'Spain',
  'Africa/Ceuta': 'Spain',
  'Atlantic/Canary': 'Spain',
  'Europe/Helsinki': 'Finland',
  'Pacific/Fiji': 'Fiji',
  'Atlantic/Stanley': 'Falkland Islands',
  'Pacific/Chuuk': 'Micronesia',
  'Pacific/Pohnpei': 'Micronesia',
  'Pacific/Kosrae': 'Micronesia',
  'Atlantic/Faroe': 'Faroe Islands',
  'Europe/Paris': 'France',
  'Europe/London': 'Britain (UK)',
  'Asia/Tbilisi': 'Georgia',
  'America/Cayenne': 'French Guiana',
  'Europe/Gibraltar': 'Gibraltar',
  'America/Nuuk': 'Greenland',
  'America/Danmarkshavn': 'Greenland',
  'America/Scoresbysund': 'Greenland',
  'America/Thule': 'Greenland',
  'Europe/Athens': 'Greece',
  'Atlantic/South_Georgia': 'South Georgia & the South Sandwich Islands',
  'America/Guatemala': 'Guatemala',
  'Pacific/Guam': 'Guam',
  'Africa/Bissau': 'Guinea-Bissau',
  'America/Guyana': 'Guyana',
  'Asia/Hong_Kong': 'Hong Kong',
  'America/Tegucigalpa': 'Honduras',
  'America/Port-au-Prince': 'Haiti',
  'Europe/Budapest': 'Hungary',
  'Asia/Jakarta': 'Indonesia',
  'Asia/Pontianak': 'Indonesia',
  'Asia/Makassar': 'Indonesia',
  'Asia/Jayapura': 'Indonesia',
  'Europe/Dublin': 'Ireland',
  'Asia/Jerusalem': 'Israel',
  'Asia/Kolkata': 'India',
  'Asia/Calcutta': 'India',
  'Indian/Chagos': 'British Indian Ocean Territory',
  'Asia/Baghdad': 'Iraq',
  'Asia/Tehran': 'Iran',
  'Atlantic/Reykjavik': 'Iceland',
  'Europe/Rome': 'Italy',
  'America/Jamaica': 'Jamaica',
  'Asia/Amman': 'Jordan',
  'Asia/Tokyo': 'Japan',
  'Africa/Nairobi': 'Kenya',
  'Asia/Bishkek': 'Kyrgyzstan',
  'Pacific/Tarawa': 'Kiribati',
  'Pacific/Kanton': 'Kiribati',
  'Pacific/Kiritimati': 'Kiribati',
  'Asia/Pyongyang': 'Korea (North)',
  'Asia/Seoul': 'Korea (South)',
  'Asia/Almaty': 'Kazakhstan',
  'Asia/Qyzylorda': 'Kazakhstan',
  'Asia/Qostanay': 'Kazakhstan',
  'Asia/Aqtobe': 'Kazakhstan',
  'Asia/Aqtau': 'Kazakhstan',
  'Asia/Atyrau': 'Kazakhstan',
  'Asia/Oral': 'Kazakhstan',
  'Asia/Beirut': 'Lebanon',
  'Asia/Colombo': 'Sri Lanka',
  'Africa/Monrovia': 'Liberia',
  'Europe/Vilnius': 'Lithuania',
  'Europe/Luxembourg': 'Luxembourg',
  'Europe/Riga': 'Latvia',
  'Africa/Tripoli': 'Libya',
  'Africa/Casablanca': 'Morocco',
  'Europe/Monaco': 'Monaco',
  'Europe/Chisinau': 'Moldova',
  'Pacific/Majuro': 'Marshall Islands',
  'Pacific/Kwajalein': 'Marshall Islands',
  'Asia/Yangon': 'Myanmar (Burma)',
  'Asia/Ulaanbaatar': 'Mongolia',
  'Asia/Hovd': 'Mongolia',
  'Asia/Choibalsan': 'Mongolia',
  'Asia/Macau': 'Macau',
  'America/Martinique': 'Martinique',
  'Europe/Malta': 'Malta',
  'Indian/Mauritius': 'Mauritius',
  'Indian/Maldives': 'Maldives',
  'America/Mexico_City': 'Mexico',
  'America/Cancun': 'Mexico',
  'America/Merida': 'Mexico',
  'America/Monterrey': 'Mexico',
  'America/Matamoros': 'Mexico',
  'America/Mazatlan': 'Mexico',
  'America/Chihuahua': 'Mexico',
  'America/Ojinaga': 'Mexico',
  'America/Hermosillo': 'Mexico',
  'America/Tijuana': 'Mexico',
  'America/Bahia_Banderas': 'Mexico',
  'Asia/Kuala_Lumpur': 'Malaysia',
  'Asia/Kuching': 'Malaysia',
  'Africa/Maputo': 'Mozambique',
  'Africa/Windhoek': 'Namibia',
  'Pacific/Noumea': 'New Caledonia',
  'Pacific/Norfolk': 'Norfolk Island',
  'Africa/Lagos': 'Nigeria',
  'America/Managua': 'Nicaragua',
  'Europe/Amsterdam': 'Netherlands',
  'Europe/Oslo': 'Norway',
  'Asia/Kathmandu': 'Nepal',
  'Pacific/Nauru': 'Nauru',
  'Pacific/Niue': 'Niue',
  'Pacific/Auckland': 'New Zealand',
  'Pacific/Chatham': 'New Zealand',
  'America/Panama': 'Panama',
  'America/Lima': 'Peru',
  'Pacific/Tahiti': 'French Polynesia',
  'Pacific/Marquesas': 'French Polynesia',
  'Pacific/Gambier': 'French Polynesia',
  'Pacific/Port_Moresby': 'Papua New Guinea',
  'Pacific/Bougainville': 'Papua New Guinea',
  'Asia/Manila': 'Philippines',
  'Asia/Karachi': 'Pakistan',
  'Europe/Warsaw': 'Poland',
  'America/Miquelon': 'St Pierre & Miquelon',
  'Pacific/Pitcairn': 'Pitcairn',
  'America/Puerto_Rico': 'Puerto Rico',
  'Asia/Gaza': 'Palestine',
  'Asia/Hebron': 'Palestine',
  'Europe/Lisbon': 'Portugal',
  'Atlantic/Madeira': 'Portugal',
  'Atlantic/Azores': 'Portugal',
  'Pacific/Palau': 'Palau',
  'America/Asuncion': 'Paraguay',
  'Asia/Qatar': 'Qatar',
  'Indian/Reunion': 'Réunion',
  'Europe/Bucharest': 'Romania',
  'Europe/Belgrade': 'Serbia',
  'Europe/Kaliningrad': 'Russia',
  'Europe/Moscow': 'Russia',
  'Europe/Simferopol': 'Russia',
  'Europe/Kirov': 'Russia',
  'Europe/Volgograd': 'Russia',
  'Europe/Astrakhan': 'Russia',
  'Europe/Saratov': 'Russia',
  'Europe/Ulyanovsk': 'Russia',
  'Europe/Samara': 'Russia',
  'Asia/Yekaterinburg': 'Russia',
  'Asia/Omsk': 'Russia',
  'Asia/Novosibirsk': 'Russia',
  'Asia/Barnaul': 'Russia',
  'Asia/Tomsk': 'Russia',
  'Asia/Novokuznetsk': 'Russia',
  'Asia/Krasnoyarsk': 'Russia',
  'Asia/Irkutsk': 'Russia',
  'Asia/Chita': 'Russia',
  'Asia/Yakutsk': 'Russia',
  'Asia/Khandyga': 'Russia',
  'Asia/Vladivostok': 'Russia',
  'Asia/Ust-Nera': 'Russia',
  'Asia/Magadan': 'Russia',
  'Asia/Sakhalin': 'Russia',
  'Asia/Srednekolymsk': 'Russia',
  'Asia/Kamchatka': 'Russia',
  'Asia/Anadyr': 'Russia',
  'Asia/Riyadh': 'Saudi Arabia',
  'Pacific/Guadalcanal': 'Solomon Islands',
  'Indian/Mahe': 'Seychelles',
  'Africa/Khartoum': 'Sudan',
  'Europe/Stockholm': 'Sweden',
  'Asia/Singapore': 'Singapore',
  'America/Paramaribo': 'Suriname',
  'Africa/Juba': 'South Sudan',
  'Africa/Sao_Tome': 'Sao Tome & Principe',
  'America/El_Salvador': 'El Salvador',
  'Asia/Damascus': 'Syria',
  'America/Grand_Turk': 'Turks & Caicos Is',
  'Africa/Ndjamena': 'Chad',
  'Indian/Kerguelen': 'French Southern & Antarctic Lands',
  'Asia/Bangkok': 'Thailand',
  'Asia/Dushanbe': 'Tajikistan',
  'Pacific/Fakaofo': 'Tokelau',
  'Asia/Dili': 'East Timor',
  'Asia/Ashgabat': 'Turkmenistan',
  'Africa/Tunis': 'Tunisia',
  'Pacific/Tongatapu': 'Tonga',
  'Europe/Istanbul': 'Turkey',
  'Pacific/Funafuti': 'Tuvalu',
  'Asia/Taipei': 'Taiwan',
  'Europe/Kiev': 'Ukraine',
  'Europe/Uzhgorod': 'Ukraine',
  'Europe/Zaporozhye': 'Ukraine',
  'Pacific/Wake': 'US minor outlying islands',
  'America/New_York': 'United States',
  'America/Detroit': 'United States',
  'America/Kentucky/Louisville': 'United States',
  'America/Kentucky/Monticello': 'United States',
  'America/Indiana/Indianapolis': 'United States',
  'America/Indiana/Vincennes': 'United States',
  'America/Indiana/Winamac': 'United States',
  'America/Indiana/Marengo': 'United States',
  'America/Indiana/Petersburg': 'United States',
  'America/Indiana/Vevay': 'United States',
  'America/Chicago': 'United States',
  'America/Indiana/Tell_City': 'United States',
  'America/Indiana/Knox': 'United States',
  'America/Menominee': 'United States',
  'America/North_Dakota/Center': 'United States',
  'America/North_Dakota/New_Salem': 'United States',
  'America/North_Dakota/Beulah': 'United States',
  'America/Denver': 'United States',
  'America/Boise': 'United States',
  'America/Phoenix': 'United States',
  'America/Los_Angeles': 'United States',
  'America/Anchorage': 'United States',
  'America/Juneau': 'United States',
  'America/Sitka': 'United States',
  'America/Metlakatla': 'United States',
  'America/Yakutat': 'United States',
  'America/Nome': 'United States',
  'America/Adak': 'United States',
  'Pacific/Honolulu': 'United States',
  'America/Montevideo': 'Uruguay',
  'Asia/Samarkand': 'Uzbekistan',
  'Asia/Tashkent': 'Uzbekistan',
  'America/Caracas': 'Venezuela',
  'Asia/Ho_Chi_Minh': 'Vietnam',
  'Pacific/Efate': 'Vanuatu',
  'Pacific/Wallis': 'Wallis & Futuna',
  'Pacific/Apia': 'Samoa (western)',
  'Africa/Johannesburg': 'South Africa',
  'America/Antigua': 'Antigua & Barbuda',
  'America/Anguilla': 'Anguilla',
  'Africa/Luanda': 'Angola',
  'Antarctica/McMurdo': 'Antarctica',
  'Antarctica/DumontDUrville': 'Antarctica',
  'Antarctica/Syowa': 'Antarctica',
  'America/Aruba': 'Aruba',
  'Europe/Mariehamn': 'Åland Islands',
  'Europe/Sarajevo': 'Bosnia & Herzegovina',
  'Africa/Ouagadougou': 'Burkina Faso',
  'Asia/Bahrain': 'Bahrain',
  'Africa/Bujumbura': 'Burundi',
  'Africa/Porto-Novo': 'Benin',
  'America/St_Barthelemy': 'St Barthelemy',
  'America/Kralendijk': 'Caribbean NL',
  'America/Nassau': 'Bahamas',
  'Africa/Gaborone': 'Botswana',
  'America/Blanc-Sablon': 'Canada',
  'America/Atikokan': 'Canada',
  'America/Creston': 'Canada',
  'Africa/Kinshasa': 'Congo (Dem. Rep.)',
  'Africa/Lubumbashi': 'Congo (Dem. Rep.)',
  'Africa/Bangui': 'Central African Rep.',
  'Africa/Brazzaville': 'Congo (Rep.)',
  'Africa/Douala': 'Cameroon',
  'America/Curacao': 'Curaçao',
  'Europe/Busingen': 'Germany',
  'Africa/Djibouti': 'Djibouti',
  'America/Dominica': 'Dominica',
  'Africa/Asmara': 'Eritrea',
  'Africa/Addis_Ababa': 'Ethiopia',
  'Africa/Libreville': 'Gabon',
  'America/Grenada': 'Grenada',
  'Europe/Guernsey': 'Guernsey',
  'Africa/Accra': 'Ghana',
  'Africa/Banjul': 'Gambia',
  'Africa/Conakry': 'Guinea',
  'America/Guadeloupe': 'Guadeloupe',
  'Africa/Malabo': 'Equatorial Guinea',
  'Europe/Zagreb': 'Croatia',
  'Europe/Isle_of_Man': 'Isle of Man',
  'Europe/Jersey': 'Jersey',
  'Asia/Phnom_Penh': 'Cambodia',
  'Indian/Comoro': 'Comoros',
  'America/St_Kitts': 'St Kitts & Nevis',
  'Asia/Kuwait': 'Kuwait',
  'America/Cayman': 'Cayman Islands',
  'Asia/Vientiane': 'Laos',
  'America/St_Lucia': 'St Lucia',
  'Europe/Vaduz': 'Liechtenstein',
  'Africa/Maseru': 'Lesotho',
  'Europe/Podgorica': 'Montenegro',
  'America/Marigot': 'St Martin (French)',
  'Indian/Antananarivo': 'Madagascar',
  'Europe/Skopje': 'North Macedonia',
  'Africa/Bamako': 'Mali',
  'Pacific/Saipan': 'Northern Mariana Islands',
  'Africa/Nouakchott': 'Mauritania',
  'America/Montserrat': 'Montserrat',
  'Africa/Blantyre': 'Malawi',
  'Africa/Niamey': 'Niger',
  'Asia/Muscat': 'Oman',
  'Africa/Kigali': 'Rwanda',
  'Atlantic/St_Helena': 'St Helena',
  'Europe/Ljubljana': 'Slovenia',
  'Arctic/Longyearbyen': 'Svalbard & Jan Mayen',
  'Europe/Bratislava': 'Slovakia',
  'Africa/Freetown': 'Sierra Leone',
  'Europe/San_Marino': 'San Marino',
  'Africa/Dakar': 'Senegal',
  'Africa/Mogadishu': 'Somalia',
  'America/Lower_Princes': 'St Maarten (Dutch)',
  'Africa/Mbabane': 'Eswatini (Swaziland)',
  'Africa/Lome': 'Togo',
  'America/Port_of_Spain': 'Trinidad & Tobago',
  'Africa/Dar_es_Salaam': 'Tanzania',
  'Africa/Kampala': 'Uganda',
  'Pacific/Midway': 'US minor outlying islands',
  'Europe/Vatican': 'Vatican City',
  'America/St_Vincent': 'St Vincent',
  'America/Tortola': 'Virgin Islands (UK)',
  'America/St_Thomas': 'Virgin Islands (US)',
  'Asia/Aden': 'Yemen',
  'Indian/Mayotte': 'Mayotte',
  'Africa/Lusaka': 'Zambia',
  'Africa/Harare': 'Zimbabwe'
}

/**
 * Validates if a timezone is valid for dayjs
 * @param {string} timezone - The timezone to validate
 * @returns {boolean} - True if the timezone is valid
 */
export const isValidTimezone = (timezone) => {
  if (!timezone || typeof timezone !== 'string') {
    return false
  }

  try {
    // Check if the timezone is in our list of valid timezones
    if (TIMEZONES[timezone]) {
      return true
    }

    // Check if dayjs can handle the timezone
    dayjs().tz(timezone)
    return true
  } catch (error) {
    return false
  }
}

/**
 * Gets a valid timezone, if the provided one is not valid, returns the local timezone
 * @param {string} timezone - The timezone to validate
 * @returns {string} - A valid timezone
 */
export const getValidTimezone = (timezone) => {
  if (isValidTimezone(timezone)) {
    return timezone
  }

  // If not valid, try to get the local timezone from the device
  try {
    const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (isValidTimezone(localTimezone)) {
      return localTimezone
    }
  } catch (error) {
    // If we can't get the local timezone, use UTC as fallback
  }

  // Fallback to UTC if everything else fails
  return 'UTC'
}

/**
 * Creates a dayjs date with validated timezone
 * @param {string} timezone - The timezone to use
 * @param {any} date - The date (optional, defaults to current date)
 * @returns {dayjs.Dayjs} - Dayjs object with validated timezone
 */
export const createDayjsWithTimezone = (timezone, date = null) => {
  const validTimezone = getValidTimezone(timezone)
  return date ? dayjs(date).tz(validTimezone) : dayjs().tz(validTimezone)
}

/**
 * Parses a calendar date + time in the business timezone.
 * @param {string} date - YYYY-MM-DD
 * @param {string} time - HH:mm
 * @param {string} timezone - IANA timezone
 */
export const parseBusinessDateTime = (date, time, timezone) => {
  const validTimezone = getValidTimezone(timezone)
  return dayjs.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', validTimezone)
}

/**
 * Formats a UTC datetime string in the business timezone.
 * @param {string} utcDate - UTC datetime string
 * @param {string} timezone - IANA timezone
 * @param {string} format - dayjs format string
 */
export const formatUtcInBusinessTimezone = (utcDate, timezone, format = 'YYYY-MM-DD HH:mm') => {
  if (!utcDate) return null
  const validTimezone = getValidTimezone(timezone)
  return dayjs.utc(utcDate).tz(validTimezone).format(format)
}

/**
 * Builds max preorder date at end of day in the business timezone.
 * @param {string} timezone - IANA timezone
 * @param {number} limitDays - max days ahead allowed for preorder
 */
export const getPreorderMaxDate = (timezone, limitDays) => {
  const daysAhead = limitDays > 1 ? limitDays - 1 : limitDays === 1 ? 0 : 6
  return createDayjsWithTimezone(timezone).add(daysAhead, 'day').endOf('day').toDate()
}
