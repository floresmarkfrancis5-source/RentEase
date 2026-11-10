import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'rentease-language'

const TAGALOG = {
  Home: 'Pangunahing pahina',
  Dashboard: 'Buod',
  Platform: 'Platform',
  'My rent': 'Aking renta',
  'Log in': 'Mag-log in',
  Landlord: 'May-ari ng paupahan',
  Tenant: 'Nangungupahan',
  'Superadmin': 'Tagapangasiwa',
  'Landlord menu': 'Menu ng may-ari',
  'Tenant menu': 'Menu ng nangungupahan',
  'Main navigation': 'Pangunahing nabigasyon',
  'Platform control': 'Pamamahala ng platform',
  'Landlord dashboard': 'Dashboard ng may-ari',
  'My profile': 'Aking profile',
  'Site settings': 'Mga setting ng site',
  'Change password': 'Palitan ang password',
  'Log out': 'Mag-log out',
  'Language / Wika': 'Wika',
  English: 'English',
  Tagalog: 'Tagalog',
  'Switch to light mode': 'Gamitin ang light mode',
  'Switch to dark mode': 'Gamitin ang dark mode',
  'Expand sidebar': 'Palawakin ang menu',
  'Collapse sidebar': 'Paliitin ang menu',
  'Close menu': 'Isara ang menu',
  'Close sidebar menu': 'Isara ang menu sa gilid',
  'Open menu': 'Buksan ang menu',
  'Close assistant': 'Isara ang assistant',
  'Open assistant': 'Buksan ang assistant',
  Assistant: 'Assistant',
  'Loading…': 'Naglo-load…',
  Close: 'Isara',
  'or': 'o',
  'Help about property location': 'Tulong tungkol sa lokasyon ng paupahan',
  'Back to list': 'Bumalik sa listahan',
  Use: 'Gamitin',
  'Can’t find it? Type it manually': 'Hindi makita? I-type ito nang mano-mano',
  'Loading official list…': 'Nilo-load ang opisyal na listahan…',
  'Setup steps': 'Mga hakbang sa pag-set up',
  units: 'mga unit',
  'tenant accounts and leases': 'account ng nangungupahan at kontrata sa upa',
  'Create my rental setup': 'Gumawa ng paupahan',
  'Mark at least one unit as good condition before assigning tenants.':
    'Markahang maayos ang kondisyon ng kahit isang unit bago magtalaga ng nangungupahan.',
  'Enter a property name and street address before continuing.':
    'Ilagay ang pangalan ng paupahan at address ng kalye bago magpatuloy.',
  'Each unit needs a name and a monthly rent greater than zero.':
    'Kailangan ng bawat unit ng pangalan at buwanang upa na mas mataas sa zero.',
  'Complete each tenant’s username, email, and full name, or remove the tenant from setup.':
    'Ilagay ang username, email, at buong pangalan ng bawat nangungupahan, o alisin siya sa pag-set up.',
  'Assign each tenant to a different unit.':
    'Italaga ang bawat nangungupahan sa magkakaibang unit.',
  'Tenants can only be assigned to units in good condition.':
    'Maitatalaga lamang ang mga nangungupahan sa mga unit na maayos ang kondisyon.',
  'Sort options': 'Mga opsyon sa pag-aayos',
  'Sort items': 'Ayusin ang mga item',
  'View toggle': 'Palitan ang ayos ng tingin',
  'Grid / Icons view': 'Grid / mga icon',
  'List / Table view': 'Listahan / talahanayan',
  Icons: 'Mga icon',
  List: 'Listahan',
  'Search…': 'Maghanap…',
  Notifications: 'Mga abiso',
  'Mark all as read': 'Markahang nabasa lahat',
  'You’re all caught up.': 'Wala ka nang bagong abiso.',
  Unread: 'Hindi pa nababasa',
  unread: 'hindi pa nababasa',
  'View email log': 'Tingnan ang tala ng mga email',
  'Rental billing, made effortless': 'Madaling pangasiwaan ang paupahan',
  'Rent collection, without the notebook.': 'Singil sa renta, wala nang kuwaderno.',
  'Your rental home': 'Iyong tahanan at paupahan',
  'Welcome home. Your rent, all in one place.': 'Maligayang pagdating. Nasa iisang lugar ang iyong renta.',
  'Check what is due, download receipts, and follow repair updates from your tenant account.':
    'Tingnan ang mga bayarin, i-download ang mga resibo, at subaybayan ang pagkukumpuni sa iyong account.',
  'Go to my rent': 'Tingnan ang aking renta',
  'Units, tenants, monthly billing, online payments and repair requests — in one calm, centralized place.':
    'Mga unit, nangungupahan, buwanang singil, online na bayad, at kahilingan sa pagkukumpuni—nasa iisang lugar.',
  'Get started': 'Magsimula',
  'Downloadable receipts': 'Mga resibong mada-download',
  'Less paperwork': 'Mas kaunting papeles',
  'More peace of mind': 'Mas panatag na isip',
  Manage: 'Pamahalaan',
  Overview: 'Buod',
  Properties: 'Mga paupahan',
  Units: 'Mga unit',
  Tenants: 'Mga nangungupahan',
  Leases: 'Mga kontrata sa upa',
  Bills: 'Mga singil',
  Payments: 'Mga bayad',
  Maintenance: 'Pagkukumpuni',
  Repairs: 'Mga pagkukumpuni',
  'Transfer & move-in requests': 'Mga kahilingan sa paglipat at paglipat-tirahan',
  'Unit transfer': 'Paglipat ng unit',
  Settings: 'Mga setting',
  'Collected this month': 'Nakolekta ngayong buwan',
  Outstanding: 'Hindi pa nababayaran',
  Overdue: 'Lampas na sa takdang bayad',
  Occupancy: 'Mga unit na may umuupa',
  'Open repairs': 'Mga pagkukumpuning bukas',
  'Monthly Income': 'Kita ngayong buwan',
  'Est. Annual Income': 'Tinatayang kita kada taon',
  'payments all time': 'bayad sa kabuuan',
  'unpaid bills': 'hindi pa bayad na singil',
  'late bills': 'lampas na sa takdang bayad',
  vacant: 'bakante',
  properties: 'paupahan',
  'active leases': 'aktibong kontrata sa upa',
  'from active leases': 'mula sa mga aktibong kontrata sa upa',
  'Collections, balances and occupancy at a glance.':
    'Tingnan agad ang mga nakolekta, balanse, at mga unit na may umuupa.',
  'Billed vs collected': 'Sinisingil at nakolekta',
  Billed: 'Sinisingil',
  Collected: 'Nakolekta',
  'Recent payments': 'Mga pinakabagong bayad',
  'No payments yet.': 'Wala pang bayad.',
  'Overdue bills': 'Mga singil na lampas na sa takdang bayad',
  'View bills →': 'Tingnan ang mga singil →',
  'All overdue bills →': 'Lahat ng lampas na sa takdang bayad →',
  'View leases →': 'Tingnan ang mga kontrata →',
  Renew: 'I-renew',
  'Leases expiring soon': 'Malapit nang matapos ang kontrata',
  'Balance due': 'Balanseng dapat bayaran',
  'Your home': 'Tirahan mo',
  Save: 'I-save',
  Cancel: 'Kanselahin',
  Remove: 'Alisin',
  'Add property': 'Magdagdag ng paupahan',
  'Add unit': 'Magdagdag ng unit',
  'Search properties by name, city, address…': 'Maghanap ayon sa pangalan, lungsod, o address…',
  'All Property Types': 'Lahat ng uri ng paupahan',
  Apartment: 'Apartment',
  'Boarding House': 'Boarding house',
  'Property name': 'Pangalan ng paupahan',
  'Property type': 'Uri ng paupahan',
  'Street / house number / building': 'Kalye / numero ng bahay / gusali',
  'House number, street, or building': 'Numero ng bahay, kalye, o gusali',
  'Description (optional)': 'Paglalarawan (opsyonal)',
  'Number of units': 'Bilang ng mga unit',
  'Unit name': 'Pangalan ng unit',
  'Unit name / room': 'Pangalan ng unit / kuwarto',
  'Monthly rent': 'Buwanang upa',
  'Monthly rent (PHP)': 'Buwanang upa (PHP)',
  'Monthly rent (optional)': 'Buwanang upa (opsyonal)',
  'Monthly rent override (optional)': 'Ibang buwanang upa (opsyonal)',
  Capacity: 'Kapasidad',
  Condition: 'Kondisyon',
  'Good condition': 'Maayos ang kondisyon',
  'Under maintenance': 'Kasalukuyang kinukumpuni',
  Username: 'Username',
  'Full name': 'Buong pangalan',
  Email: 'Email',
  'Phone (optional)': 'Telepono (opsyonal)',
  'Assign unit': 'Itakda ang unit',
  'Lease start date': 'Petsa ng simula ng kontrata',
  Deposit: 'Deposito',
  'Due day (1–28)': 'Araw ng takdang bayad (1–28)',
  'Property location': 'Lokasyon ng paupahan',
  'Search an address or move the pin. You can also type locations manually.':
    'Maghanap ng address o ilipat ang pin. Maaari mo ring ilagay nang mano-mano ang lokasyon.',
  'Use my location': 'Gamitin ang lokasyon ko',
  'Search address': 'Maghanap ng address',
  'Search street, building, or landmark': 'Maghanap ng kalye, gusali, o palatandaan',
  Searching: 'Naghahanap',
  Search: 'Maghanap',
  'Address search results': 'Mga resulta ng paghahanap ng address',
  'Interactive property map': 'Mapa ng paupahan',
  'Click the map or drag the pin to set the exact property location.':
    'Pindutin ang mapa o hilahin ang pin para itakda ang eksaktong lokasyon ng paupahan.',
  'City / municipality': 'Lungsod / munisipalidad',
  'Type or select a city': 'I-type o pumili ng lungsod',
  Barangay: 'Barangay',
  'Type or select a barangay': 'I-type o pumili ng barangay',
  'Type a barangay': 'I-type ang barangay',
  Latitude: 'Latitud',
  Longitude: 'Longhitud',
  'Not selected': 'Hindi pa napipili',
  'Used to log in and to receive bills and receipts.':
    'Gagamitin sa pag-log in at pagtanggap ng mga singil at resibo.',
  'Leave empty to use the unit rent.': 'Iwang blangko para gamitin ang karaniwang upa ng unit.',
  Property: 'Paupahan',
  Review: 'Suriin',
  'A unit is a room or apartment that can be rented separately.':
    'Ang unit ay kuwarto o apartment na maaaring paupahan nang hiwalay.',
  'The amount of rent expected each month for this unit.':
    'Ito ang upa para sa unit na ito na inaasahang matatanggap bawat buwan.',
  'This is the maximum number of people allowed in the unit.':
    'Ito ang pinakamaraming taong maaaring tumira sa unit.',
  'Shows whether this unit is ready to rent or needs repair.':
    'Ipinapakita kung maaari nang paupahan ang unit o kailangan muna itong kumpunihin.',
  'The date the rental agreement begins.':
    'Ito ang petsa kung kailan magsisimula ang kasunduan sa pag-upa.',
  'A tenant-specific amount. Leave blank to use the unit’s usual rent.':
    'Espesyal na upa para sa nangungupahang ito. Iwang blangko para gamitin ang karaniwang upa ng unit.',
  'The day of each month when rent is due.':
    'Ito ang araw bawat buwan kung kailan dapat bayaran ang upa.',
  'A separate amount collected at move-in, apart from rent.':
    'Hiwalay na halagang kinokolekta sa paglipat, bukod sa upa.',
  'Shows how many units have tenants compared with all available units.':
    'Ipinapakita kung ilang unit ang may umuupa kumpara sa kabuuang bilang ng unit.',
  'Money recorded as paid during this calendar month.':
    'Halagang naitalang bayad ngayong buwan.',
  'Bills that have not been fully paid yet.':
    'Mga singil na hindi pa nababayaran nang buo.',
  'Bills whose due date has already passed.':
    'Mga singil na lumampas na sa takdang petsa ng bayad.',
  'Total monthly rent from current rental agreements.':
    'Kabuuang buwanang upa mula sa mga kasalukuyang kontrata.',
  'Choose the kind of place you are renting out.':
    'Piliin ang uri ng paupahang iyong pinamamahalaan.',
  'Choose the room or apartment where this tenant will live.':
    'Piliin ang kuwarto o apartment na titirhan ng nangungupahan.',
  Paid: 'Bayad na',
  Unpaid: 'Hindi pa bayad',
  Pending: 'Nakabinbin',
  'In progress': 'Isinasagawa',
  Vacant: 'Bakante',
  Occupied: 'May umuupa',
  Active: 'Aktibo',
  Sent: 'Naipadala',
  Approved: 'Naaprubahan',
  Resolved: 'Nalutas',
  Rejected: 'Tinanggihan',
  Ended: 'Natapos',
  Cancelled: 'Kinansela',
  Failed: 'Nabigo',
  High: 'Mataas',
  Medium: 'Katamtaman',
  Low: 'Mababa',
  'Rent day, all in one place.': 'Araw ng renta, nasa iisang lugar.',
  'Check your bills, pay online and follow repairs — or manage every property as a landlord.':
    'Tingnan at bayaran online ang mga singil at subaybayan ang pagkukumpuni—o pamahalaan ang lahat ng paupahan.',
  'Welcome back': 'Maligayang pagbabalik',
  'Log in to RentEase with your email or username.': 'Mag-log in sa RentEase gamit ang email o username.',
  'Email or username': 'Email o username',
  Password: 'Password',
  'Forgot password?': 'Nakalimutan ang password?',
  'Signing in…': 'Nagla-log in…',
  'Sign in with Google': 'Mag-log in gamit ang Google',
  'Tenant accounts are created by your landlord. Ask them for your username and temporary password.':
    'Ang may-ari ng paupahan ang gumagawa ng account ng nangungupahan. Hingin sa kanya ang iyong username at pansamantalang password.',
  'New landlord?': 'Bagong may-ari ng paupahan?',
  'Create a landlord account': 'Gumawa ng account ng may-ari',
  'Create landlord account': 'Gumawa ng account ng may-ari',
  'Choose a username': 'Pumili ng username',
  'Almost there.': 'Konti na lang.',
  'Google verified your identity. Pick a username to finish creating your landlord account.':
    'Nakumpirma ng Google ang iyong pagkakakilanlan. Pumili ng username para matapos ang paggawa ng account.',
  'This will be your login identifier alongside your Google email.':
    'Ito ang gagamitin mong username kasama ng iyong Google email sa pag-log in.',
  'e.g. juan_dela_cruz': 'hal. juan_dela_cruz',
  '3–50 characters: letters, numbers, dots, dashes, underscores.':
    '3–50 character: mga letra, numero, tuldok, gitling, o underscore.',
  '← Use a different method': '← Gumamit ng ibang paraan',
  'Your properties, in one place.': 'Lahat ng paupahan mo, nasa iisang lugar.',
  'Create a landlord account, set up your first property, and invite tenants when you are ready.':
    'Gumawa ng account, idagdag ang unang paupahan, at mag-imbita ng mga mangungupahan kapag handa ka na.',
  'Choose a username; your email can also be used to sign in.':
    'Pumili ng username. Maaari ring gamitin ang email sa pag-log in.',
  'Confirm password': 'Kumpirmahin ang password',
  'At least 8 characters, including a letter and a number.':
    'Hindi bababa sa 8 character, na may kahit isang letra at numero.',
  'Creating account…': 'Ginagawa ang account…',
  'Create account': 'Gumawa ng account',
  'Create account with Google': 'Gumawa ng account gamit ang Google',
  'Already have an account?': 'May account ka na ba?',
  'First-time setup': 'Unang pag-set up',
  'Let’s get your rental started.': 'Simulan na natin ang iyong paupahan.',
  'A few steps to add a property. You can skip this and manage everything manually later.':
    'Ilang hakbang lang para maidagdag ang paupahan. Maaari mo itong laktawan at mano-manong pamahalaan sa ibang pagkakataon.',
  'Skip setup': 'Laktawan ang pag-set up',
  'Your property': 'Iyong paupahan',
  'How many units do you have?': 'Ilang unit ang mayroon ka?',
  'Do you already have tenants?': 'May mga nangungupahan ka na ba?',
  'Yes, add tenant accounts': 'Oo, magdagdag ng mga account ng nangungupahan',
  'Not yet, I’ll do this later': 'Wala pa, gagawin ko ito mamaya',
  'Add another tenant': 'Magdagdag ng isa pang nangungupahan',
  'Review your setup': 'Suriin ang iyong inilagay',
  'No tenants yet': 'Wala pang nangungupahan',
  'Temporary tenant passwords will be shown once after setup. Copy them and share them privately.':
    'Isang beses lang ipapakita ang pansamantalang password ng nangungupahan. Kopyahin at ipadala ito nang pribado.',
  Back: 'Bumalik',
  Continue: 'Magpatuloy',
  'Saving setup…': 'Sine-save ang pag-set up…',
  'Setup complete': 'Tapos na ang pag-set up',
  'Tenant temporary passwords': 'Pansamantalang password ng nangungupahan',
  'Copy each temporary password now. Tenants must change it when they first sign in.':
    'Kopyahin na ang bawat pansamantalang password. Dapat itong palitan ng mga nangungupahan sa unang pag-log in.',
  'Temporary password': 'Pansamantalang password',
  'Copy credentials': 'Kopyahin ang mga detalye',
  'Go to dashboard': 'Pumunta sa buod',
}

const LanguageContext = createContext({ language: 'en', setLanguage: () => {}, t: (text) => text })

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'tl' ? 'tl' : 'en'
    } catch {
      return 'en'
    }
  })

  const setLanguage = useCallback((next) => {
    const value = next === 'tl' ? 'tl' : 'en'
    setLanguageState(value)
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // The selected language still applies for this session if storage is unavailable.
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const value = useMemo(() => ({
    language,
    setLanguage,
    t: (text) => language === 'tl' ? TAGALOG[text] || text : text,
  }), [language, setLanguage])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export const useLanguage = () => useContext(LanguageContext)

export function helpFor(text, language) {
  const english = {
    'Collected this month': 'Money recorded as paid during this calendar month.',
    Outstanding: 'Bills that have not been fully paid yet.',
    Overdue: 'Bills whose due date has already passed.',
    Occupancy: 'Shows how many units have tenants compared with all available units.',
    'Monthly Income': 'Total monthly rent from current rental agreements.',
    'Unit name': 'A unit is a room or apartment that can be rented separately.',
    'Unit name / room': 'A unit is a room or apartment that can be rented separately.',
    'Monthly rent': 'The amount of rent expected each month for this unit.',
    'Monthly rent (PHP)': 'The amount of rent expected each month for this unit.',
    Capacity: 'This is the maximum number of people allowed in the unit.',
    Condition: 'Shows whether this unit is ready to rent or needs repair.',
    'Lease start date': 'The date the rental agreement begins.',
    'Monthly rent override (optional)': 'A tenant-specific amount. Leave blank to use the unit’s usual rent.',
    Deposit: 'A separate amount collected at move-in, apart from rent.',
    'Due day (1–28)': 'The day of each month when rent is due.',
    'Property type': 'Choose the kind of place you are renting out.',
    'Assign unit': 'Choose the room or apartment where this tenant will live.',
  }
  const textEnglish = english[text]
  return textEnglish ? (language === 'tl' ? TAGALOG[textEnglish] || textEnglish : textEnglish) : ''
}
