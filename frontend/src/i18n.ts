/**
 * Tiny translation layer. English text is the key: t('Book now') returns the Gujarati or Hindi text when that language is
 * selected and the English text when there is no translation yet, so any screen can be translated one string at a time.
 * Switching language reloads the page (simple and reliable). Server-written messages (chat updates, errors) stay English.
 *
 * To add a string: wrap it in t('...') in the component and add a row to ROWS below.
 */
export type Lang = 'en' | 'gu' | 'hi';
export const LANGS: { code: Lang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'gu', name: 'ગુજરાતી' },
  { code: 'hi', name: 'हिन्दी' },
];

const KEY = 'garage.lang';

function initial(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'en' || s === 'gu' || s === 'hi') return s;
  } catch {
    /* storage unavailable */
  }
  const n = (typeof navigator === 'undefined' ? '' : navigator.language || '').toLowerCase();
  return n.startsWith('gu') ? 'gu' : n.startsWith('hi') ? 'hi' : 'en';
}

export const lang: Lang = initial();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export function setLang(l: Lang): void {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

// [English, Gujarati, Hindi]
const ROWS: [string, string, string][] = [
  // header and footer
  ['Garages', 'ગેરેજ', 'गैराज'],
  ['Why Garage Hub', 'ગેરેજ હબ શા માટે', 'गैराज हब क्यों'],
  ['How it works', 'તે કેવી રીતે કામ કરે છે', 'यह कैसे काम करता है'],
  ['For garage owners', 'ગેરેજ માલિકો માટે', 'गैराज मालिकों के लिए'],
  ['Find a garage', 'ગેરેજ શોધો', 'गैराज खोजें'],
  ['Find', 'શોધો', 'खोजें'],
  ['My bookings', 'મારા બુકિંગ', 'मेरी बुकिंग'],
  ['Bookings', 'બુકિંગ', 'बुकिंग'],
  ['Garage owner', 'ગેરેજ માલિક', 'गैराज मालिक'],
  ['Hi, {name}', 'નમસ્તે, {name}', 'नमस्ते, {name}'],
  ['Log out', 'લૉગ આઉટ', 'लॉग आउट'],
  ['Log in', 'લૉગ ઇન', 'लॉग इन'],
  ['Sign up', 'સાઇન અપ', 'साइन अप'],
  ['Garage login', 'ગેરેજ લૉગિન', 'गैराज लॉगिन'],
  ['Register my garage', 'મારું ગેરેજ નોંધાવો', 'मेरा गैराज रजिस्टर करें'],
  ['Language', 'ભાષા', 'भाषा'],
  ['Own a garage? For garage owners', 'ગેરેજ છે? ગેરેજ માલિકો માટે', 'गैराज है? गैराज मालिकों के लिए'],
  ['Looking for a garage?', 'ગેરેજ શોધો છો?', 'गैराज ढूँढ रहे हैं?'],
  // driver home
  ['Local garages · Honest pricing', 'સ્થાનિક ગેરેજ · પારદર્શક કિંમત', 'स्थानीय गैराज · ईमानदार कीमत'],
  ['Find the right garage.', 'યોગ્ય ગેરેજ શોધો.', 'सही गैराज खोजें।'],
  ['Know the price.', 'કિંમત જાણો.', 'कीमत जानें।'],
  [
    'Browse independent garages near you, see which services each one offers, then create a free account to unlock their pricing.',
    'તમારી નજીકના સ્વતંત્ર ગેરેજ જુઓ, દરેક કઈ સેવાઓ આપે છે તે જુઓ, પછી કિંમતો જોવા માટે મફત ખાતું બનાવો.',
    'अपने पास के स्वतंत्र गैराज देखें, हर गैराज की सेवाएँ देखें, फिर कीमतें देखने के लिए मुफ़्त खाता बनाएँ।',
  ],
  ['Browse garages', 'ગેરેજ જુઓ', 'गैराज देखें'],
  ['Create free account', 'મફત ખાતું બનાવો', 'मुफ़्त खाता बनाएँ'],
  ['Independent, locally owned garages', 'સ્વતંત્ર, સ્થાનિક માલિકીના ગેરેજ', 'स्वतंत्र, स्थानीय मालिकों के गैराज'],
  ['Customer ratings on every listing', 'દરેક ગેરેજ પર ગ્રાહકોના રેટિંગ', 'हर गैराज पर ग्राहकों की रेटिंग'],
  ['Local garages', 'સ્થાનિક ગેરેજ', 'स्थानीय गैराज'],
  ['Independent shops in your neighbourhood.', 'તમારા વિસ્તારની સ્વતંત્ર દુકાનો.', 'आपके इलाके की स्वतंत्र दुकानें।'],
  ['Compare services', 'સેવાઓની સરખામણી', 'सेवाओं की तुलना'],
  ['See what each garage offers at a glance.', 'દરેક ગેરેજ શું આપે છે તે એક નજરે જુઓ.', 'हर गैराज क्या देता है, एक नज़र में देखें।'],
  ['Upfront pricing', 'અગાઉથી કિંમત', 'पहले से कीमत'],
  ['Starting prices before you visit.', 'જતાં પહેલાં શરૂઆતની કિંમતો.', 'जाने से पहले शुरुआती कीमतें।'],
  ['Rated by drivers', 'ડ્રાઇવરો દ્વારા રેટિંગ', 'ड्राइवरों द्वारा रेटिंग'],
  ['Ratings and review counts on every garage.', 'દરેક ગેરેજ પર રેટિંગ અને રિવ્યૂની સંખ્યા.', 'हर गैराज पर रेटिंग और रिव्यू की संख्या।'],
  ['Garages near you', 'તમારી નજીકના ગેરેજ', 'आपके पास के गैराज'],
  ['Choose a garage', 'ગેરેજ પસંદ કરો', 'गैराज चुनें'],
  ['Search by garage, neighbourhood or city', 'ગેરેજ, વિસ્તાર અથવા શહેરથી શોધો', 'गैराज, इलाके या शहर से खोजें'],
  ['Search garages', 'ગેરેજ શોધો', 'गैराज खोजें'],
  ['All services', 'બધી સેવાઓ', 'सभी सेवाएँ'],
  ['Visit garage page', 'ગેરેજ પેજ જુઓ', 'गैराज पेज देखें'],
  ['How far?', 'કેટલું દૂર?', 'कितनी दूर?'],
  ['Find garages', 'ગેરેજ શોધો', 'गैराज खोजें'],
  ['Try again', 'ફરી પ્રયાસ કરો', 'फिर कोशिश करें'],
  ['Four simple steps', 'ચાર સરળ પગલાં', 'चार आसान चरण'],
  ['Open its page, read its services and reviews, then sign in to see prices.', 'તેનું પેજ ખોલો, સેવાઓ અને રિવ્યૂ વાંચો, પછી કિંમતો જોવા સાઇન ઇન કરો.', 'उसका पेज खोलें, सेवाएँ और रिव्यू पढ़ें, फिर कीमतें देखने के लिए साइन इन करें।'],
  ['Book and chat', 'બુક કરો અને ચેટ કરો', 'बुक करें और चैट करें'],
  ['Pick a time, then follow the job and message the garage as it goes.', 'સમય પસંદ કરો, પછી કામ પર નજર રાખો અને ગેરેજને સંદેશ મોકલો.', 'समय चुनें, फिर काम पर नज़र रखें और गैराज को संदेश भेजें।'],
  ['Collect, pay, review', 'ગાડી લો, ચૂકવો, રિવ્યૂ આપો', 'गाड़ी लें, भुगतान करें, रिव्यू दें'],
  ['Pick up your car, pay the garage, and rate your experience.', 'તમારી ગાડી લો, ગેરેજને ચૂકવો અને તમારો અનુભવ રેટ કરો.', 'अपनी गाड़ी लें, गैराज को भुगतान करें और अनुभव को रेट करें।'],
  // auth
  ['Full name', 'પૂરું નામ', 'पूरा नाम'],
  ['Email', 'ઇમેઇલ', 'ईमेल'],
  ['Password', 'પાસવર્ડ', 'पासवर्ड'],
  ['At least 8 characters.', 'ઓછામાં ઓછા 8 અક્ષરો.', 'कम से कम 8 अक्षर।'],
  ['Welcome back', 'ફરી સ્વાગત છે', 'वापसी पर स्वागत है'],
  ['Create your account', 'તમારું ખાતું બનાવો', 'अपना खाता बनाएँ'],
  ['Register your garage', 'તમારું ગેરેજ નોંધાવો', 'अपना गैराज रजिस्टर करें'],
  ['Create account', 'ખાતું બનાવો', 'खाता बनाएँ'],
  ['Please wait...', 'થોડી રાહ જુઓ...', 'कृपया प्रतीक्षा करें...'],
  ['Already have an account?', 'પહેલેથી ખાતું છે?', 'पहले से खाता है?'],
  ['New here?', 'નવા છો?', 'नए हैं?'],
  ['Create an account', 'ખાતું બનાવો', 'खाता बनाएँ'],
  ["This can't be undone.", 'આ પાછું ફેરવી શકાશે નહીં.', 'इसे वापस नहीं किया जा सकेगा।'],
  ['Close', 'બંધ કરો', 'बंद करें'],
  // bookings
  ['Your appointments', 'તમારી એપોઇન્ટમેન્ટ', 'आपकी अपॉइंटमेंट'],
  ['Waiting for the garage to accept', 'ગેરેજની મંજૂરીની રાહ', 'गैराज की मंज़ूरी का इंतज़ार'],
  ['Appointment booked', 'એપોઇન્ટમેન્ટ બુક થઈ', 'अपॉइंटमेंट बुक हो गई'],
  ['Car at the garage', 'ગાડી ગેરેજમાં છે', 'गाड़ी गैराज में है'],
  ['Work in progress', 'કામ ચાલુ છે', 'काम चल रहा है'],
  ['Work completed', 'કામ પૂરું થયું', 'काम पूरा हुआ'],
  ['Car picked up', 'ગાડી લઈ લીધી', 'गाड़ी ले ली गई'],
  ['Declined by the garage', 'ગેરેજે નામંજૂર કર્યું', 'गैराज ने अस्वीकार किया'],
  ['Cancelled', 'રદ કર્યું', 'रद्द किया गया'],
  ['Waiting for the garage to accept this appointment.', 'ગેરેજ આ એપોઇન્ટમેન્ટ સ્વીકારે તેની રાહ જોવાઈ રહી છે.', 'गैराज के इस अपॉइंटमेंट को स्वीकार करने का इंतज़ार है।'],
  ['The garage declined this appointment.', 'ગેરેજે આ એપોઇન્ટમેન્ટ નામંજૂર કરી.', 'गैराज ने यह अपॉइंटमेंट अस्वीकार कर दी।'],
  ['This appointment was cancelled.', 'આ એપોઇન્ટમેન્ટ રદ થઈ.', 'यह अपॉइंटमेंट रद्द हो गई।'],
  ['Progress', 'પ્રગતિ', 'प्रगति'],
  ['Accept appointment', 'એપોઇન્ટમેન્ટ સ્વીકારો', 'अपॉइंटमेंट स्वीकार करें'],
  ['Decline', 'નામંજૂર કરો', 'अस्वीकार करें'],
  ['Car has arrived at the garage', 'ગાડી ગેરેજમાં આવી ગઈ', 'गाड़ी गैराज पहुँच गई'],
  ['Start the work', 'કામ શરૂ કરો', 'काम शुरू करें'],
  ['Mark work completed', 'કામ પૂરું થયું ગણો', 'काम पूरा हुआ चिह्नित करें'],
  ['Car handed back to the owner', 'ગાડી માલિકને પાછી સોંપી', 'गाड़ी मालिक को लौटा दी गई'],
  ['Cancel appointment', 'એપોઇન્ટમેન્ટ રદ કરો', 'अपॉइंटमेंट रद्द करें'],
  ['Cancel my appointment', 'મારી એપોઇન્ટમેન્ટ રદ કરો', 'मेरी अपॉइंटमेंट रद्द करें'],
  ['I picked up my car', 'મેં મારી ગાડી લઈ લીધી', 'मैंने अपनी गाड़ी ले ली'],
  ['Services', 'સેવાઓ', 'सेवाएँ'],
  ['Garage', 'ગેરેજ', 'गैराज'],
  ['Customer phone', 'ગ્રાહકનો ફોન', 'ग्राहक का फ़ोन'],
  ['Messages & updates', 'સંદેશા અને અપડેટ', 'संदेश और अपडेट'],
  ['This appointment is closed, so the chat is read-only.', 'આ એપોઇન્ટમેન્ટ બંધ છે, તેથી ચેટ ફક્ત વાંચવા માટે છે.', 'यह अपॉइंटमेंट बंद है, इसलिए चैट केवल पढ़ने के लिए है।'],
  ['Select an appointment to see its status and chat.', 'સ્થિતિ અને ચેટ જોવા એપોઇન્ટમેન્ટ પસંદ કરો.', 'स्थिति और चैट देखने के लिए अपॉइंटमेंट चुनें।'],
  ['Message', 'સંદેશ', 'संदेश'],
  ['Send message', 'સંદેશ મોકલો', 'संदेश भेजें'],
  // booking form
  ['Ready to book?', 'બુક કરવા તૈયાર છો?', 'बुक करने के लिए तैयार?'],
  ['Book an appointment', 'એપોઇન્ટમેન્ટ બુક કરો', 'अपॉइंटमेंट बुक करें'],
  ['Which services?', 'કઈ સેવાઓ?', 'कौन सी सेवाएँ?'],
  ['Car make and model', 'ગાડીની કંપની અને મોડેલ', 'गाड़ी की कंपनी और मॉडल'],
  ['Number plate', 'નંબર પ્લેટ', 'नंबर प्लेट'],
  ['Mobile number (optional, for WhatsApp updates)', 'મોબાઇલ નંબર (વૈકલ્પિક, WhatsApp અપડેટ માટે)', 'मोबाइल नंबर (वैकल्पिक, WhatsApp अपडेट के लिए)'],
  ['Date', 'તારીખ', 'तारीख'],
  ['Time', 'સમય', 'समय'],
  ['Cancel', 'રદ કરો', 'रद्द करें'],
  ['e.g. Grinding noise when braking', 'દા.ત. બ્રેક મારતી વખતે અવાજ આવે છે', 'जैसे ब्रेक लगाते समय आवाज़ आती है'],
  // job card, payment, review
  ['Job card', 'જોબ કાર્ડ', 'जॉब कार्ड'],
  ['Print', 'પ્રિન્ટ', 'प्रिंट'],
  ['Odometer', 'ઓડોમીટર', 'ओडोमीटर'],
  ['Fuel level', 'ઇંધણનું સ્તર', 'ईंधन स्तर'],
  ['Technician', 'ટેક્નિશિયન', 'तकनीशियन'],
  ['Next service due', 'આગામી સર્વિસ તારીખ', 'अगली सर्विस की तारीख'],
  ['Inspection', 'તપાસ', 'निरीक्षण'],
  ['OK', 'બરાબર', 'ठीक'],
  ['Needs attention', 'ધ્યાન આપવું જરૂરી', 'ध्यान देने की ज़रूरत'],
  ['Not checked', 'તપાસ્યું નથી', 'जाँचा नहीं गया'],
  ['Photos', 'ફોટા', 'फ़ोटो'],
  ['Add photo', 'ફોટો ઉમેરો', 'फ़ोटो जोड़ें'],
  ['Uploading...', 'અપલોડ થઈ રહ્યું છે...', 'अपलोड हो रहा है...'],
  ['Extra parts and labour', 'વધારાના પાર્ટ્સ અને મજૂરી', 'अतिरिक्त पार्ट्स और मज़दूरी'],
  ['No extra work.', 'વધારાનું કામ નથી.', 'कोई अतिरिक्त काम नहीं।'],
  ['Item', 'વસ્તુ', 'आइटम'],
  ['Qty', 'નંગ', 'मात्रा'],
  ['Each', 'દરેકના', 'प्रत्येक'],
  ['Total', 'કુલ', 'कुल'],
  ['Part', 'પાર્ટ', 'पार्ट'],
  ['Labour', 'મજૂરી', 'मज़दूरी'],
  ['Booked services', 'બુક કરેલી સેવાઓ', 'बुक की गई सेवाएँ'],
  ['Extra work', 'વધારાનું કામ', 'अतिरिक्त काम'],
  ['Approve extra work', 'વધારાના કામને મંજૂરી આપો', 'अतिरिक्त काम को मंज़ूरी दें'],
  ['Save job card', 'જોબ કાર્ડ સાચવો', 'जॉब कार्ड सहेजें'],
  ['Send extra work for approval', 'મંજૂરી માટે વધારાનું કામ મોકલો', 'मंज़ूरी के लिए अतिरिक्त काम भेजें'],
  ['Payment', 'ચુકવણી', 'भुगतान'],
  ['How will you pay?', 'તમે કેવી રીતે ચૂકવશો?', 'आप कैसे भुगतान करेंगे?'],
  ["I've paid", 'મેં ચૂકવી દીધું', 'मैंने भुगतान कर दिया'],
  ['Confirm payment received', 'ચુકવણી મળ્યાની પુષ્ટિ કરો', 'भुगतान मिलने की पुष्टि करें'],
  ['Pay the garage directly, then tell us how you paid.', 'ગેરેજને સીધી ચુકવણી કરો, પછી અમને જણાવો કે કેવી રીતે ચૂકવ્યું.', 'गैराज को सीधे भुगतान करें, फिर हमें बताएँ कि कैसे किया।'],
  ['Leave a review', 'રિવ્યૂ આપો', 'रिव्यू दें'],
  ['Submit review', 'રિવ્યૂ મોકલો', 'रिव्यू भेजें'],
  ['Review', 'રિવ્યૂ', 'रिव्यू'],
  // garage's own page
  ['Reviews', 'રિવ્યૂ', 'रिव्यू'],
  ['Visit us', 'અમારી મુલાકાત લો', 'हमसे मिलें'],
  ['Book now', 'હમણાં બુક કરો', 'अभी बुक करें'],
  ['Opening hours', 'ખુલવાનો સમય', 'खुलने का समय'],
  ['Ways to pay', 'ચુકવણીની રીતો', 'भुगतान के तरीके'],
  ['Our services', 'અમારી સેવાઓ', 'हमारी सेवाएँ'],
  ['Sign in to see prices and book', 'કિંમતો જોવા અને બુક કરવા સાઇન ઇન કરો', 'कीमतें देखने और बुक करने के लिए साइन इन करें'],
  ['Sign in to book an appointment', 'એપોઇન્ટમેન્ટ બુક કરવા સાઇન ઇન કરો', 'अपॉइंटमेंट बुक करने के लिए साइन इन करें'],
  ['What drivers say', 'ડ્રાઇવરો શું કહે છે', 'ड्राइवर क्या कहते हैं'],
  ['No reviews yet. Drivers can leave one after their car has been serviced.', 'હજી કોઈ રિવ્યૂ નથી. ગાડીની સર્વિસ પછી ડ્રાઇવરો રિવ્યૂ આપી શકે છે.', 'अभी कोई रिव्यू नहीं। सर्विस के बाद ड्राइवर रिव्यू दे सकते हैं।'],
  ['Share on WhatsApp', 'WhatsApp પર શેર કરો', 'WhatsApp पर शेयर करें'],
  ['Print a QR poster', 'QR પોસ્ટર પ્રિન્ટ કરો', 'QR पोस्टर प्रिंट करें'],
  ['Scan to book online', 'ઓનલાઇન બુક કરવા સ્કેન કરો', 'ऑनलाइन बुक करने के लिए स्कैन करें'],
];

const DICT: Record<string, { gu: string; hi: string }> = {};
for (const [en, gu, hi] of ROWS) DICT[en] = { gu, hi };

/** Translates a fixed English string. Unknown strings stay in English. */
export const t = (s: string): string => (lang === 'en' ? s : DICT[s]?.[lang] ?? s);

/** Like t() but fills {placeholders}. */
export const tf = (s: string, vars: Record<string, string | number>): string =>
  t(s).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
