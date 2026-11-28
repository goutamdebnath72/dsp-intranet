// src/lib/live/priority.ts
//
// THE PRIORITY DESK. Four kinds of news must stand first on the news tabs, whatever else is in the feeds:
//   DEMISE    the death of a renowned person, from West Bengal first, then India, then the world;
//   ACCIDENT  a big accident, in a steel plant or anywhere else, in West Bengal first, then India (an accident outside India is not covered);
//   MASSACRE  a mass killing, anywhere in the world: a terror attack, a mass shooting, a bombing or air strike, a communal massacre, with at least MASSACRE_DEAD dead (see massacreOf);
//   VISIT     a diplomatic visit: the Prime Minister of India abroad (talks, a summit, a state visit), or a foreign head of state or government, minister or delegation visiting India (see visitOf).
// A story stands first in the ENGLISH, the HINDI or the BENGALI tab according to the language it arrived in, and ONCE: the same news in another language is left out of that language's tab, as the owner asked (only the first
// to arrive is shown; see assignDesk). The Business tab has a third kind, RECORD: a record high or low of the share market, of gold or silver, or of the dollar against the rupee (see recordMove).
//
// HOW I TELL. By the words of the headline, in the three languages; this is a heuristic, not understanding, and I said so wherever it shows. The words are in ONE place below. What each rule needs:
//   - a demise needs a word that says a death was announced (dies, passes away, निधन, প্রয়াত) AND a word that says the person is somebody (actor, former minister, legend, MP, अभिनेता, पूर्व मुख्यमंत्री, প্রাক্তন, অভিনেতা ...):
//     "man dies in road accident" is not a demise, "veteran actor dies" is. A headline that says only that a death was announced stays an ordinary story.
//   - an accident needs a word of accident (blast, collapse, fire, crash, derail, gas leak, हादसा, বিস্ফোরণ ...) AND a sign that it is BIG: at least THREE people dead (a number beside killed/dead/died), or a word of disaster
//     (tragedy, major, massive, devastating), or any accident at a steel plant (a steel plant's accident is news to this plant, big or small).
//   - where: West Bengal if the headline names it (Bengal, Kolkata, Durgapur, Asansol ... or Bengali writing about a Bengal place); the world if it names a foreign country or city and no Indian place; else India.
//     Bengali script alone does not make a story West Bengal's: the Bengali papers carry the national and world desks too.
//
// ONE STORY ONCE, ACROSS LANGUAGES. A death or an accident is told in three scripts, so the headlines share no words. I match them by the NAMES in them, written in sound: each name is reduced to a skeleton of its consonants
// (Dharmendra, धर्मेंद्र and ধর্মেন্দ্র all give the same one), and two stories of one kind, within 36 hours, are the same when they share a skeleton that few headlines of the batch carry (a name, a place), or two
// shorter ones (the same number of dead counts as one for an accident). This is a heuristic too; it errs toward showing a story twice rather than hiding a different one (a name has to match, not a common word).
import { DateTime } from "luxon";
import type { FeedItem } from "./rss";

export type PriorityKind = "demise" | "accident" | "massacre" | "record" | "visit";
export type PriorityScope = "wb" | "india" | "world";
export interface PriorityFlag { kind: PriorityKind; scope: PriorityScope }

/* ----------------------------------------------------------------- the words ----------------------------------------------------------------- */

const L = "[\\p{L}\\p{M}]";
/** A word that stands alone in any script (\b does not work for Hindi and Bengali). */
const alone = (w: string) => `(?<!${L})(?:${w})(?!${L})`;
const re = (parts: string[], flags = "iu") => new RegExp(parts.join("|"), flags);

/** A death announced. "Dies" and "no more" are only taken in the forms that say a death. */
const DIED = re([
  alone("dies|died|passes away|passed away|passing away|demise|death of|last rites|funeral of|obituary|condoles?|condolences|mourns?|breathes (?:his|her) last|succumbs|no more|laid to rest|tributes? (?:pour|paid)"),
  "निधन", alone("नहीं रहे|नहीं रहीं|नहीं रहा"), "स्वर्गवास", "दुनिया को अलविदा", "श्रद्धांजलि", "चल बसे", "अंतिम विदाई",
  "প্রয়াত", "প্রয়াণ", "শ্রদ্ধাঞ্জলি", "চলে গেলেন", "শোকপ্রকাশ", "শোক প্রকাশ", "অন্তিম যাত্রা", "প্রয়াতদের",
]);
/** Somebody: a title, a profession of fame, an office, an honour, "former", "veteran", "legend". */
const SOMEBODY = re([
  alone("actor|actress|singer|musician|composer|maestro|lyricist|filmmaker|film-?maker|director|producer|poet|writer|author|novelist|playwright|dramatist|journalist|editor|painter|artist|sculptor|dancer|danseuse|cinematographer|photographer"),
  alone("cricketer|footballer|hockey player|athlete|olympian|wrestler|boxer|badminton|tennis|chess|grandmaster|captain|coach|umpire|commentator"),
  alone("scientist|physicist|chemist|mathematician|economist|historian|professor|academic|vice-?chancellor|surgeon|cardiologist|doctor|nobel|laureate|bharat ratna|padma|padma shri|padma bhushan|padma vibhushan|dadasaheb phalke|jnanpith|sahitya akademi|ramon magsaysay"),
  alone("industrialist|businessman|business tycoon|tycoon|chairman|founder|ceo|billionaire|banker"),
  alone("chief minister|ex-?cm|deputy chief minister|prime minister|president|vice-?president|governor|lieutenant governor|minister|mp|mla|mlc|councillor|mayor|speaker|chief justice|justice|judge|diplomat|ambassador|general|admiral|air chief|field marshal|dgp|ias|ips|freedom fighter|statesman|politician|leader|veteran|doyen|icon|legend(?:ary)?|stalwart|pioneer|eminent|noted|renowned|celebrated|acclaimed|popular|beloved|iconic|former|ex-"),
  alone("rapper|comedian|anchor|host|cartoonist|chef|yoga guru|spiritual leader|saint|pontiff|guru|swami|bishop|cardinal|pope|sultan|emperor|king|queen|prince|princess"),
  // "Strobe Talbott, one of the architects of ... , dies at 80": a person described by what they did is somebody
  alone("one of the|architect of|architects of|father of|mother of|voice of|face of|brain behind|builder of|first (?:indian|woman|man|person)|who (?:led|founded|built|shaped|created|headed|won)"),
  "अभिनेता", "अभिनेत्री", "गायक", "गायिका", "संगीतकार", "निर्देशक", "निर्माता", "कवि", "लेखक", "साहित्यकार", "पत्रकार", "चित्रकार", "कलाकार", "क्रिकेटर", "खिलाड़ी", "फुटबॉलर",
  "वैज्ञानिक", "उद्योगपति", "पूर्व मुख्यमंत्री", "मुख्यमंत्री", "पूर्व प्रधानमंत्री", "पूर्व राष्ट्रपति", "राज्यपाल", "मंत्री", "सांसद", "विधायक", "न्यायाधीश", "जस्टिस", "पद्म", "भारत रत्न", "दिग्गज", "मशहूर", "वरिष्ठ", "पूर्व", "दिवंगत", "महान", "लोकप्रिय", "स्वतंत्रता सेनानी", "संत", "महंत", "बाबा", "शंकराचार्य",
  "অভিনেতা", "অভিনেত্রী", "গায়ক", "গায়িকা", "সুরকার", "পরিচালক", "প্রযোজক", "কবি", "সাহিত্যিক", "লেখক", "সাংবাদিক", "শিল্পী", "চিত্রশিল্পী", "ক্রিকেটার", "ফুটবলার", "খেলোয়াড়", "বিজ্ঞানী", "শিল্পপতি", "প্রাক্তন", "মুখ্যমন্ত্রী", "মন্ত্রী", "সাংসদ", "বিধায়ক", "বিচারপতি", "পদ্ম", "ভারতরত্ন", "কিংবদন্তি", "প্রবীণ", "বিশিষ্ট", "জনপ্রিয়", "মহান", "স্বাধীনতা সংগ্রামী", "সঙ্গীতশিল্পী", "নৃত্যশিল্পী", "অধ্যাপক", "রাষ্ট্রদূত", "সন্ন্যাসী", "মহারাজ",
]);
/** Not a demise of somebody: a death that is a verdict ("death penalty"), a plot ("dies in the film"), a headline of "death toll". */
const NOT_DEMISE = re([alone("death (?:toll|penalty|sentence|anniversary|certificate|valley)|dies down|die-hard|dying declaration|dies by suicide|dead heat|killed in action|film|movie|series|episode|serial|web series|trailer|teaser|character|role"), "मौत की सजा", "फांसी", "फिल्म", "सीरियल", "মৃত্যুদণ্ড", "ফাঁসি", "সিনেমা", "ছবি", "ধারাবাহিক"]);

/** An accident: the word of the event. */
const ACCIDENT = re([
  alone("accidents?|blasts?|explosions?|exploded|fire|fires|blaze|collapses?|collapsed|crash(?:es|ed)?|derail(?:s|ed|ment)?|stampede|gas leak|leakage|tragedy|mishap|capsize[sd]?|capsizing|landslide|landslip|cave-?in|pile-?up|boiler|furnace|hit-and-run|plunge[sd]?|skid(?:s|ded)?|speeding|overturn(?:s|ed)?|collid(?:es|ed)|collision|rams?|rammed|runs? over|ran over|mows? down|mowed down|falls? into|fell into|hits? (?:a )?(?:truck|bus|car|suv|people|pedestrians|tree|divider)"),
  "हादसा", "हादसे", "दुर्घटना", "रौंदा", "कुचला", "पलटी", "टकराई", "टकरा", "विस्फोट", "धमाका", "आग", "अग्निकांड", "ढह", "भूस्खलन", "गैस रिसाव", "पलट", "भिड़ंत", "टक्कर",
  "দুর্ঘটনা", "চাপা পড়", "পিষে", "ধাক্কায়", "বিস্ফোরণ", "আগুন", "অগ্নিকাণ্ড", "ধস", "ভেঙে পড়", "গ্যাস লিক", "ট্রেন লাইনচ্যুত", "লাইনচ্যুত", "ভূমিধস", "ধাক্কা", "উল্টে",
]);
/** The words beside which a number counts as people dead or hurt. */
const DEAD_EN = "killed|kills?|dead|dies|died|deaths?|lives|perish(?:ed)?|charred|burnt to death|drowned|crushed|injured|hurt|wounded|critical|burnt|scalded";
const DEAD_HI = "मौत|मरे|मृत|की जान|झुलस|घायल|जिंदा जल|दबकर|कुचल|शव";
const DEAD_BN = "মৃত|মৃত্যু|নিহত|মারা|প্রাণ হারা|আহত|ঝলসে|দগ্ধ|গুরুতর|দেহ";
/** A word of disaster: it says big by itself. */
const DISASTER = re([alone("tragedy|tragic|major|massive|devastating|horrific|horror|deadly|deadliest|catastrophe|catastrophic|disaster|chain-?reaction|pile-?up|multiple|several|dozens?|scores"), "भीषण", "भयानक", "दर्दनाक", "त्रासदी", "बड़ा हादसा", "बड़ी दुर्घटना", "ভয়াবহ", "মর্মান্তিক", "বিধ্বংসী", "বড়সড়", "বিপর্যয়"]);
/** A steel plant, a mill, a furnace, SAIL's units: an accident there is news for this plant, big or small. */
const STEEL_PLACE = re([alone("steel plant|steel mill|steel works|steelworks|blast furnace|rolling mill|sponge iron|coke oven|SMS|converter shop|SAIL|BSP|BSL|RSP|DSP|ISP|VISP|IISCO|RINL|Tata Steel|JSW|JSPL|Jindal Steel|Bhilai|Bokaro|Rourkela|Burnpur"), "इस्पात", "स्टील प्लांट", "भिलाई", "बोकारो", "राउरकेला", "बर्नपुर", "ब्लास्ट फर्नेस", "ইস্পাত", "স্টিল প্লান্ট", "ব্লাস্ট ফার্নেস", "বার্নপুর", "ভিলাই"]);
/** Not an accident of people: a fire in a film, a stock market "crash", a "blast" of wind, a cricket "blast". */
const NOT_ACCIDENT = re([alone("(?:share|market|stock|price|sensex|nifty|rupee) crash(?:es|ed)?|crash(?:es|ed)? out|crash(?:es|ed)? (?:in value|below)|blast(?:s|ed)? (?:off|past)|big blast|fired up|firing|ceasefire|cease-fire|crackdown|fire sale|friendly fire|film|movie|series|episode|serial|web series|trailer|teaser|ipl|match|t20|odi|test cricket|bbl|video game"), "शेयर बाजार", "फिल्म", "सीरियल", "आईपीएल", "मैच", "শেয়ার", "সিনেমা", "আইপিএল", "ম্যাচ"]);
/** Not an accident that is news here: a crime. A murder or a shooting is not an accident. */
const CRIME = re([alone("murder(?:ed)?|shot dead|stabbed|lynch(?:ed|ing)?|rape|gang-?rape|suicide|assault(?:ed)?|bomb(?:ed|ing)?|air ?strike|shelling|militants?|terrorists?|insurgents?|encounter|gunfight|firing"), "हत्या", "गोली", "आत्महत्या", "बलात्कार", "आतंकी", "मुठभेड़", "খুন", "গুলি", "আত্মহত্যা", "ধর্ষণ", "জঙ্গি", "সংঘর্ষ"]);

/** West Bengal: the state and its places, in English, Hindi and Bengali. */
const WB = re([
  alone("west bengal|bengal|kolkata|calcutta|howrah|hooghly|durgapur|asansol|burdwan|bardhaman|siliguri|darjeeling|kalimpong|jalpaiguri|cooch behar|alipurduar|malda|murshidabad|nadia|krishnanagar|kalyani|barrackpore|barasat|bidhannagar|salt lake|new town|north 24 parganas|south 24 parganas|24 parganas|diamond harbour|basirhat|purulia|bankura|birbhum|bolpur|santiniketan|midnapore|medinipur|kharagpur|haldia|tamluk|jhargram|raiganj|balurghat|burnpur|kulti|raniganj|panagarh|nabanna|sundarbans|ghatal|uluberia|serampore|chandannagar|bhatpara|dum dum|dumdum|garia|sealdah|bagdogra|digha|mamata banerjee|bengal's"),
  "पश्चिम बंगाल", "बंगाल", "कोलकाता", "हावड़ा", "हुगली", "दुर्गापुर", "आसनसोल", "बर्धमान", "बर्दवान", "सिलीगुड़ी", "दार्जिलिंग", "मालदा", "मुर्शिदाबाद", "नदिया", "बैरकपुर", "बारासात", "पुरुलिया", "बांकुड़ा", "बीरभूम", "मेदिनीपुर", "खड़गपुर", "हल्दिया", "रानीगंज", "बर्नपुर", "कुल्टी", "सुंदरबन", "ममता बनर्जी",
  "পশ্চিমবঙ্গ", "রাজ্যের", "রাজ্যে", "বাংলা", "বঙ্গ", "কলকাতা", "হাওড়া", "হুগলি", "হুগলী", "দুর্গাপুর", "আসানসোল", "বর্ধমান", "শিলিগুড়ি", "দার্জিলিং", "কালিম্পং", "জলপাইগুড়ি", "কোচবিহার", "আলিপুরদুয়ার", "মালদহ", "মুর্শিদাবাদ", "নদিয়া", "কৃষ্ণনগর", "কল্যাণী", "ব্যারাকপুর", "বারাসত", "বিধাননগর", "সল্টলেক", "নিউটাউন", "উত্তর ২৪ পরগনা", "দক্ষিণ ২৪ পরগনা", "২৪ পরগনা", "ডায়মন্ড হারবার", "বসিরহাট", "পুরুলিয়া", "বাঁকুড়া", "বীরভূম", "বোলপুর", "শান্তিনিকেতন", "মেদিনীপুর", "খড়্গপুর", "হলদিয়া", "তমলুক", "ঝাড়গ্রাম", "রায়গঞ্জ", "বালুরঘাট", "বার্নপুর", "কুলটি", "রানিগঞ্জ", "নবান্ন", "সুন্দরবন", "শ্রীরামপুর", "চন্দননগর", "ভাটপাড়া", "দমদম", "শিয়ালদহ", "বাগডোগরা", "দিঘা", "মমতা বন্দ্যোপাধ্যায়",
]);
/** India: the country, its capital, its states and big cities, its institutions: a headline with these (and no WB place) is India's. */
const INDIA = re([
  alone("india|indian|indians|bharat|bollywood|tollywood|kollywood|mollywood|delhi|new delhi|mumbai|chennai|bengaluru|bangalore|hyderabad|pune|ahmedabad|jaipur|lucknow|patna|bhopal|ranchi|bhubaneswar|odisha|jharkhand|bihar|uttar pradesh|madhya pradesh|chhattisgarh|maharashtra|gujarat|rajasthan|punjab|haryana|himachal|uttarakhand|kerala|tamil nadu|karnataka|andhra|telangana|assam|manipur|nagaland|meghalaya|tripura|mizoram|arunachal|sikkim|goa|jammu|kashmir|ladakh|puducherry|chandigarh|noida|gurugram|gurgaon|ghaziabad|bhilai|bokaro|rourkela|jamshedpur|dhanbad|nagpur|surat|indore|kanpur|varanasi|prayagraj|amritsar|ludhiana|kochi|thiruvananthapuram|visakhapatnam|vizag|mysuru|coimbatore|madurai|guwahati|shillong|imphal|agartala|aizawl|itanagar|gangtok|panaji|dehradun|shimla|srinagar|leh|raipur|jabalpur|gwalior|nashik|thane|vadodara|rajkot|jodhpur|udaipur|kota|ajmer|bikaner|agra|meerut|aligarh|bareilly|gorakhpur|jhansi|allahabad|sibsagar|mp|mla|lok sabha|rajya sabha|pm modi|modi|supreme court|high court|rbi|isro|drdo|sail|ongc|ntpc|bhel|railways|irctc|nhai"),
  "भारत", "भारतीय", "दिल्ली", "मुंबई", "चेन्नई", "बेंगलुरु", "हैदराबाद", "पुणे", "अहमदाबाद", "जयपुर", "लखनऊ", "पटना", "भोपाल", "रांची", "ओडिशा", "झारखंड", "बिहार", "उत्तर प्रदेश", "मध्य प्रदेश", "छत्तीसगढ़", "महाराष्ट्र", "गुजरात", "राजस्थान", "पंजाब", "हरियाणा", "हिमाचल", "उत्तराखंड", "केरल", "तमिलनाडु", "कर्नाटक", "आंध्र", "तेलंगाना", "असम", "मणिपुर", "जम्मू", "कश्मीर", "लद्दाख", "नोएडा", "गुरुग्राम", "गाजियाबाद", "भिलाई", "बोकारो", "राउरकेला", "जमशेदपुर", "धनबाद", "नागपुर", "सूरत", "इंदौर", "कानपुर", "वाराणसी", "प्रयागराज", "अमृतसर", "सुप्रीम कोर्ट", "हाईकोर्ट", "मोदी", "रेलवे",
  "ভারত", "ভারতীয়", "দিল্লি", "মুম্বই", "চেন্নাই", "বেঙ্গালুরু", "হায়দরাবাদ", "পুণে", "আহমেদাবাদ", "জয়পুর", "লখনউ", "পটনা", "ভোপাল", "রাঁচি", "ওড়িশা", "ঝাড়খণ্ড", "বোকারো", "রাউরকেলা", "ভিলাই", "বিহার", "উত্তরপ্রদেশ", "মধ্যপ্রদেশ", "ছত্তিশগড়", "মহারাষ্ট্র", "গুজরাট", "রাজস্থান", "পঞ্জাব", "হরিয়ানা", "হিমাচল", "উত্তরাখণ্ড", "কেরল", "তামিলনাড়ু", "কর্নাটক", "অন্ধ্র", "তেলঙ্গানা", "অসম", "মণিপুর", "জম্মু", "কাশ্মীর", "লাদাখ", "নয়ডা", "গুরুগ্রাম", "জামশেদপুর", "ধানবাদ", "নাগপুর", "সুরাট", "ইন্দৌর", "কানপুর", "বারাণসী", "প্রয়াগরাজ", "অমৃতসর", "সুপ্রিম কোর্ট", "হাই কোর্ট", "মোদি", "রেল",
]);
/** The world: a foreign country, a foreign city, a foreign institution. A headline with one of these and no Indian place is the world's. */
const WORLD = re([
  // the cities and regions where attacks and wars are reported (a massacre is covered wherever it happens, so its place must be known to be foreign)
  alone("peshawar|quetta|rawalpindi|kabul|kandahar|herat|baghdad|basra|mosul|damascus|aleppo|idlib|tehran|beirut|tel aviv|jerusalem|ramallah|rafah|khan younis|gaza city|khartoum|darfur|mogadishu|kinshasa|goma|abuja|lagos|maiduguri|nairobi|cairo|riyadh|jeddah|doha|sanaa|aden|kharkiv|odesa|donetsk|mariupol|kherson|minsk|tbilisi|yerevan|baku|tashkent|dushanbe|bishkek|ulaanbaatar|manila|jakarta|bangkok|hanoi|yangon|naypyidaw"),
  "पेशावर", "क्वेटा", "रावलपिंडी", "काबुल", "कंधार", "बगदाद", "दमिश्क", "तेहरान", "बेरूत", "यरुशलम", "तेल अवीव", "खार्तूम", "मोगादिशु", "नैरोबी", "काहिरा", "रियाद", "खान यूनिस", "रफा",
  "পেশোয়ার", "কোয়েটা", "রাওয়ালপিন্ডি", "কাবুল", "কান্দাহার", "বাগদাদ", "দামেস্ক", "তেহরান", "বেইরুত", "জেরুজালেম", "তেল আবিব", "খার্তুম", "মোগাদিশু", "নাইরোবি", "কায়রো", "রিয়াদ", "খান ইউনিস", "রাফা",
  // the people of a foreign country, as the papers name them ("Sri Lankan President", "जर्मन चांसलर", "রুশ প্রেসিডেন্ট")
  alone("sri lankan|nepali|nepalese|bhutanese|maldivian|afghan|iranian|iraqi|israeli|emirati|saudi|turkish|egyptian|kenyan|nigerian|brazilian|argentine|mexican|canadian|australian|indonesian|malaysian|singaporean|thai|vietnamese|filipino|japanese|chinese|russian|german|french|italian|spanish|british|american|pakistani|bangladeshi|burmese|qatari|kuwaiti|omani|jordanian|south african|swiss|dutch|swedish|norwegian|danish|polish|greek|korean"),
  "जर्मन", "रूसी", "जापानी", "फ्रांसीसी", "फ्रेंच", "चीनी", "ब्रिटिश", "ऑस्ट्रेलियाई", "इजरायली", "ईरानी", "श्रीलंकाई", "नेपाली", "भूटानी", "मालदीव", "सऊदी", "अमीराती", "तुर्की", "मिस्र", "कनाडाई", "ब्राजीली",
  "জার্মান", "জাপানি", "ফরাসি", "চিনা", "ব্রিটিশ", "অস্ট্রেলীয়", "ইজরায়েলি", "ইরানি", "শ্রীলঙ্কান", "নেপালি", "ভুটানি", "মালদ্বীপ", "সৌদি", "কানাডীয়", "ব্রাজিলীয়",
  alone("u\\.s\\.|usa|united states|america|american|washington|new york|california|hollywood|los angeles|las vegas|chicago|boston|miami|nashville|broadway|texas|florida|trump|biden|white house|pentagon|nasa|u\\.k\\.|britain|british|england|london|scotland|wales|ireland|france|french|paris|germany|german|berlin|italy|italian|rome|spain|spanish|madrid|russia|russian|moscow|ukraine|kyiv|china|chinese|beijing|shanghai|hong kong|taiwan|japan|japanese|tokyo|korea|korean|seoul|pyongyang|pakistan|pakistani|islamabad|karachi|lahore|bangladesh|bangladeshi|dhaka|nepal|kathmandu|sri lanka|colombo|bhutan|myanmar|afghanistan|kabul|taliban|iran|iranian|tehran|iraq|baghdad|israel|israeli|gaza|palestine|palestinian|lebanon|syria|damascus|yemen|saudi|riyadh|dubai|uae|abu dhabi|qatar|doha|kuwait|oman|egypt|cairo|turkey|turkiye|istanbul|ankara|nigeria|kenya|ethiopia|south africa|johannesburg|sudan|congo|ghana|australia|australian|sydney|melbourne|new zealand|canada|canadian|toronto|vancouver|mexico|brazil|argentina|chile|peru|colombia|venezuela|cuba|europe|european|nato|u\\.n\\.|united nations|africa|african|asia|middle east|gulf|vatican|singapore|malaysia|thailand|bangkok|vietnam|indonesia|jakarta|philippines|manila|cambodia|laos|mongolia|kazakhstan|uzbekistan|poland|warsaw|romania|hungary|czech|greece|athens|sweden|norway|denmark|finland|netherlands|belgium|switzerland|austria|portugal"),
  "अमेरिका", "अमेरिकी", "ब्रिटेन", "लंदन", "फ्रांस", "जर्मनी", "रूस", "यूक्रेन", "चीन", "जापान", "पाकिस्तान", "बांग्लादेश", "नेपाल", "श्रीलंका", "अफगानिस्तान", "ईरान", "इराक", "इजराइल", "गाजा", "सऊदी", "दुबई", "तुर्की", "ऑस्ट्रेलिया", "कनाडा", "यूरोप", "ट्रंप", "बाइडेन", "पुतिन", "मिस्र", "नाइजीरिया", "इंडोनेशिया", "फिलीपींस", "थाईलैंड", "वियतनाम", "म्यांमार", "सूडान", "केन्या", "कांगो", "ब्राजील", "मेक्सिको", "अर्जेंटीना", "सीरिया", "यमन", "लेबनान", "कतर", "कुवैत", "ओमान", "मलेशिया", "सिंगापुर", "इथियोपिया", "घाना", "अफ्रीका", "एशिया",
  "আমেরিকা", "মার্কিন", "ব্রিটেন", "লন্ডন", "ফ্রান্স", "জার্মানি", "রাশিয়া", "রুশ", "ইউক্রেন", "চিন", "জাপান", "পাকিস্তান", "বাংলাদেশ", "নেপাল", "শ্রীলঙ্কা", "আফগানিস্তান", "ইরান", "ইরাক", "ইজরায়েল", "গাজা", "সৌদি", "দুবাই", "তুরস্ক", "অস্ট্রেলিয়া", "কানাডা", "ইউরোপ", "ট্রাম্প", "বাইডেন", "পুতিন", "ঢাকা", "মিশর", "নাইজেরিয়া", "ইন্দোনেশিয়া", "ফিলিপিন্স", "থাইল্যান্ড", "ভিয়েতনাম", "মায়ানমার", "সুদান", "কেনিয়া", "কঙ্গো", "ব্রাজিল", "মেক্সিকো", "আর্জেন্টিনা", "সিরিয়া", "ইয়েমেন", "লেবানন", "কাতার", "কুয়েত", "ওমান", "মালয়েশিয়া", "সিঙ্গাপুর", "ইথিওপিয়া", "ঘানা", "আফ্রিকা", "এশিয়া", "কাবুল", "তেহরান", "বেজিং", "মস্কো",
]);

/** Pakistan-occupied Kashmir is named with Kashmir, but it is not India. */
const PAK_OCCUPIED = /pakistan-occupied|pakistan occupied|\bPoK\b|\bPoJK\b|पाक अधिकृत|पीओके|পাক অধিকৃত|পিওকে/i;

/** Where a story is: West Bengal if it names a place of it; the world if it names a foreign place and no Indian one; else India (the papers are Indian: what names nothing is theirs). */
export function scopeOf(title: string): PriorityScope {
  if (PAK_OCCUPIED.test(title)) return "world";
  if (WB.test(title)) return "wb";
  if ((WORLD.test(title) || /\b(?:US|UK|UN|EU)\b/.test(title)) && !INDIA.test(title)) return "world";
  return "india";
}

/** The number of people dead (or hurt) that a headline states: a number or its word beside a word of death, "3 killed", "killed 3", "at least 12 dead", "तीन की मौत", "৩ জনের মৃত্যু". Returns 0 when none is stated. */
export function deadCount(title: string): number {
  const WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, dozens: 24, scores: 20, hundreds: 100 };
  const HI: Record<string, number> = { "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10, "ग्यारह": 11, "बारह": 12 };
  const BN: Record<string, number> = { "দুই": 2, "তিন": 3, "চার": 4, "পাঁচ": 5, "ছয়": 6, "সাত": 7, "আট": 8, "নয়": 9, "দশ": 10, "এগারো": 11, "বারো": 12 };
  const t = title.replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966)).replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6)).replace(/(\d),(\d{3})/g, "$1$2");
  let best = 0;
  const take = (n: number) => { if (Number.isFinite(n) && n > best && n < 100000) best = n; };
  const num = (m: string, words: Record<string, number>) => (/^\d/.test(m) ? Number(m) : words[m.toLowerCase()] ?? 0);
  const before = (words: Record<string, number>, dead: string, flags: string) => new RegExp(`(\\d{1,5}|(?<![\\p{L}\\p{M}])(?:${Object.keys(words).join("|")})(?![\\p{L}\\p{M}]))\\s*(?:\\S+\\s+){0,5}?(?:${dead})`, flags);
  for (const m of t.matchAll(before(WORDS, DEAD_EN, "giu"))) take(num(m[1], WORDS));
  for (const m of t.matchAll(/(?:killed|kills?|dead|dies|died|toll)(?:\s+(?:rises|climbs|goes up))?\s+(?:to\s+)?(\d{1,5})\b/gi)) take(Number(m[1]));
  for (const m of t.matchAll(before(HI, DEAD_HI, "gu"))) take(num(m[1], HI));
  for (const m of t.matchAll(new RegExp(`(?:${DEAD_HI})[^\\d]{0,20}(\\d{1,5})`, "gu"))) take(Number(m[1]));
  for (const m of t.matchAll(before(BN, DEAD_BN, "gu"))) take(num(m[1], BN));
  for (const m of t.matchAll(new RegExp(`(?:${DEAD_BN})[^\\d]{0,20}(\\d{1,5})`, "gu"))) take(Number(m[1]));
  return best;
}

/** How many dead make an accident BIG (anywhere but a steel plant). */
export const BIG_DEAD = 3;

/** Is this the death of a renowned person, and where? */
export function demiseOf(title: string): PriorityFlag | null {
  if (!DIED.test(title) || NOT_DEMISE.test(title) || !SOMEBODY.test(title)) return null;
  // An accident that killed people is an accident story, unless it names a person of note who died in it.
  return { kind: "demise", scope: scopeOf(title) };
}

/** Is this a big accident, in West Bengal or India (an accident abroad is not covered)? A steel plant's accident counts big or small. */
export function accidentOf(title: string): PriorityFlag | null {
  if (!ACCIDENT.test(title) || NOT_ACCIDENT.test(title) || CRIME.test(title)) return null;
  const scope = scopeOf(title);
  // An accident abroad is not covered: a headline that names a foreign place and no Indian one is left out. One that names no place at all is taken for ours (the papers are Indian; the list of foreign names below is long, but not complete).
  const steel = STEEL_PLACE.test(title);
  if (scope === "world") return null;
  const dead = deadCount(title);
  if (steel || dead >= BIG_DEAD || (DISASTER.test(title) && dead >= 1)) return { kind: "accident", scope };
  return null;
}

/* ------------------------------------------------ a massacre ------------------------------------------------ */

/** The words of a mass killing (an attack on people, not an accident): the accident rule leaves these out as crime, and the owner wants the huge ones first, wherever in the world they are. */
const KILLING = re([
  alone("massacres?|massacred|mass shooting|mass killing|mass murder|genocide|ethnic cleansing|terror(?:ist)? attacks?|suicide (?:attack|bombing|bomber|blast)|bombing|bomb blast|car bomb|air ?strikes?|shelling|missile strikes?|drone strikes?|militants? (?:attack|kill)|gunmen|opened fire|open(?:s|ed)? fire|shot dead|mowed down|killed in (?:an? )?(?:attack|shooting|strike|bombing|blast|firing|violence|clashes|riots?|raid|offensive)|communal violence|ethnic violence|sectarian violence|riots?|death toll"),
  "नरसंहार", "हत्याकांड", "आत्मघाती हमला", "आत्मघाती धमाका", "आतंकी हमला", "आतंकवादी हमला", "हमले में", "गोलीबारी", "बमबारी", "हवाई हमला", "धमाके में", "सामूहिक हत्या", "दंगे", "मिसाइल हमला", "ड्रोन हमला",
  "গণহত্যা", "হত্যাকাণ্ড", "আত্মঘাতী হামলা", "আত্মঘাতী বিস্ফোরণ", "জঙ্গি হামলা", "সন্ত্রাসী হামলা", "হামলায়", "গুলিবর্ষণ", "বোমা হামলা", "বিমান হামলা", "বোমাবর্ষণ", "দাঙ্গা", "ক্ষেপণাস্ত্র হামলা", "ড্রোন হামলা",
]);
/** Not a killing of people: a film, a game, a match. */
const NOT_MASSACRE = re([alone("film|movie|series|episode|trailer|game|video game|cricket|ipl|football|match|album|novel|book|documentary"), "फिल्म", "सीरीज", "क्रिकेट", "খেলা", "সিনেমা", "ক্রিকেট"]);
/** How many dead make a mass killing worth the first place (the owner: "huge"). */
export const MASSACRE_DEAD = 10;

/** Is this a mass killing (a massacre, an attack, a bombing) with at least MASSACRE_DEAD dead, and where? Anywhere in the world: the owner wants the huge ones whatever the place. */
export function massacreOf(title: string): PriorityFlag | null {
  if (!KILLING.test(title) || NOT_MASSACRE.test(title) || deadCount(title) < MASSACRE_DEAD) return null;
  return { kind: "massacre", scope: scopeOf(title) };
}

/* ------------------------------------------------ a diplomatic visit ------------------------------------------------ */

/** India's Prime Minister, as the three languages name him (the name is in these lists and nowhere else: if the office changes hands, this is the one place to change). "Modi" alone is taken only where it is not Nirav or Lalit. */
const PM_INDIA = re([
  alone("(?:pm|prime minister)(?: narendra)? modi|pm of india|prime minister of india|indian prime minister|india'?s (?:prime minister|pm)|narendra modi|modi'?s? (?:visit|trip|tour)|modi"),
  "प्रधानमंत्री (?:नरेंद्र )?मोदी", "पीएम (?:नरेंद्र )?मोदी", "नरेंद्र मोदी", "मोदी",
  "প্রধানমন্ত্রী (?:নরেন্দ্র )?মোদি", "নরেন্দ্র মোদি", "মোদি",
], "giu");
const NOT_PM = re([alone("nirav modi|neerav modi|lalit modi|modi nagar|modinagar"), "नीरव मोदी", "ललित मोदी", "मोदीनगर", "নীরব মোদি", "ললিত মোদি"]);
/** What a head of state or government, or a minister or a delegation, is called. */
const LEADER = re([
  alone("president|prime minister|pm|chancellor|king|queen|crown prince|prince|emir|amir|sultan|premier|vice-?president|deputy prime minister|foreign minister|defence minister|defense minister|secretary of state|head of state|head of government|delegation|delegates?|envoy|dignitar(?:y|ies)|monarch|emperor|first lady|leader"),
  "राष्ट्रपति", "प्रधानमंत्री", "चांसलर", "राजा", "रानी", "क्राउन प्रिंस", "राजकुमार", "विदेश मंत्री", "रक्षा मंत्री", "प्रतिनिधिमंडल", "राजदूत", "नेता",
  "রাষ্ট্রপতি", "প্রেসিডেন্ট", "প্রধানমন্ত্রী", "চ্যান্সেলর", "রাজা", "রানি", "যুবরাজ", "বিদেশমন্ত্রী", "প্রতিনিধি দল", "রাষ্ট্রদূত", "নেতা",
]);
/** Words of a journey. */
const TRAVEL = re([
  alone("visit(?:s|ed|ing)?|state visit|official visit|working visit|tour(?:s|ing)?|embarks?|embarked|leaves|left for|departs?(?: for)?|flies|off to|arrives?(?: in| at)?|arrived|lands?(?: in)?|landed|reaches|reached|trip|summit|two-nation|three-nation|four-nation|five-nation|multi-nation|to attend|attends|attending|address(?:es)? (?:the )?(?:parliament|diaspora|joint session)|rousing welcome|red carpet|wraps up|concludes"),
  "दौरे", "दौरा", "यात्रा", "रवाना", "पहुंचे", "पहुंचा", "पहुंचेंगे", "पहुँचे", "शिखर सम्मेलन", "पहुंच",
  "সফর", "রওনা", "পৌঁছ", "শীর্ষ সম্মেলন", "যাত্রা",
]);
/** Words of a meeting between governments: those that say a MEETING of governments (talks, a bilateral, a pact), which need no title beside them... */
const MEETING_GOV = re([
  alone("holds? talks|held talks|talks with|bilateral(?: talks| meeting| ties)?|joint statement|pact|inks|signs (?:pact|deal|agreement|mou)|mou"),
  "द्विपक्षीय", "वार्ता", "समझौता", "দ্বিপাক্ষিক", "চুক্তি",
]);
/** ... and those that say a meeting of people, which count only when the other party is a head of state or government, a minister or a delegation. */
const MEETING_ANY = re([
  alone("meets|met|meeting|calls on|called on|hosts?|hosted|welcomes?|welcomed|receives|received|dinner|banquet"),
  "मुलाकात", "बैठक", "बातचीत", "स्वागत", "मेजबानी",
  "বৈঠক", "সাক্ষাৎ", "আলোচনা", "স্বাগত",
]);
/** The foreign heads of state and government the papers name by name alone ("Putin to visit India"), in the three scripts. A list that has to be kept up as offices change hands: it only helps a headline that names no title. */
const NAMED_LEADER = re([
  alone("putin|xi jinping|trump|biden|macron|starmer|merz|scholz|meloni|albanese|carney|trudeau|netanyahu|zelensky|zelenskyy|erdogan|lula|sharif|yunus|hasina|dahal|dissanayake|muizzu|takaichi|ishiba|kishida|prabowo|anwar ibrahim|ramaphosa|mbs|pezeshkian|tinubu|abiy"),
  "पुतिन", "जिनपिंग", "ट्रंप", "बाइडेन", "मैक्रों", "स्टार्मर", "नेतन्याहू", "जेलेंस्की", "एर्दोआन", "यूनुस", "हसीना", "दिसानायके", "मुइज्जू",
  "পুতিন", "জিনপিং", "ট্রাম্প", "বাইডেন", "ম্যাক্রোঁ", "স্টারমার", "নেতানিয়াহু", "জেলেনস্কি", "এরদোয়ান", "ইউনূস", "হাসিনা", "দিসানায়েকে", "মুইজ্জু",
]);
/** A visit TO India, as a headline words it. */
const VISIT_TO_INDIA = re([
  alone("(?:state |official |working )?visit(?:s|ing|ed)? (?:to |of |in )?india|(?:to|will) (?:visit|tour) india|india (?:visit|tour|trip)|(?:arrives?|arrived|lands?|landed|reaches|reached) (?:in )?(?:india|delhi|new delhi|mumbai|bengaluru|kolkata|hyderabad|chennai|agra|jaipur|varanasi|goa)|visit(?:s|ing)? (?:delhi|new delhi)"),
  "भारत दौरे", "भारत दौरा", "भारत यात्रा", "भारत पहुंचे", "भारत पहुंचा", "भारत आए", "भारत आ रहे", "दिल्ली पहुंचे", "भारत पहुंच",
  "ভারত সফর", "ভারতে আসছেন", "ভারতে এলেন", "ভারতে পৌঁছ", "দিল্লি পৌঁছ", "ভারত সফরে",
]);
/** An unmistakable visit to India (it names no foreign place, and needs none). */
const VISIT_CORE = re([alone("(?:state |official |working )?visit(?:s|ing|ed)? (?:to |of |in )?india|(?:to|will) (?:visit|tour) india|india (?:visit|tour|trip)"), "भारत दौरे", "भारत दौरा", "भारत यात्रा", "ভারত সফর", "ভারতে আসছেন", "ভারতে এলেন"]);
/** Where the Prime Minister receives a guest: the capital and the big cities. A meeting that names one is at home. */
const HOME_CITY = re([alone("delhi|new delhi|hyderabad house|mumbai|kolkata|bengaluru|hyderabad|chennai|ahmedabad|gandhinagar|jaipur|agra|varanasi|goa"), "दिल्ली", "मुंबई", "कोलकाता", "दिल्लि", "মুম্বই", "কলকাতা", "দিল্লি"]);
/** A call, not a visit. */
const BY_PHONE = re([alone("dials?|dialled|phone|phones|telephone|call(?:s|ed)? (?:up|with)|speaks? (?:with|to)|spoke|video ?call|virtual|over the phone|on the phone"), "फोन", "टेलीफोन", "वर्चुअल", "ফোন", "ভার্চুয়াল"]);
/** Places that are not a foreign visit: India Gate and the like. */
const NOT_VISIT_PLACE = re([alone("india gate|india international|india today|india post|india bloc|indian oil|indian railways|indian express|india inc")]);
/** A domestic occasion: the Prime Minister's visit to a rally, a border post, a temple, an inauguration is not a foreign visit even when a foreign country is named in it. */
const DOMESTIC_EVENT = re([alone("rally|roadshow|road show|inaugurat(?:es|ed|ion)|flags? off|foundation stone|bypolls?|election|elections|campaign|poll|temple|kargil|siachen|jawans|troops|soldiers|disaster|flood|flood-hit|cyclone|earthquake-hit|victims"), "रैली", "रोड शो", "उद्घाटन", "चुनाव", "मंदिर", "जवानों", "सैनिकों", "জনসভা", "রোড শো", "উদ্বোধন", "নির্বাচন", "মন্দির"]);
const NOT_VISIT = re([alone("cricket|match|series|trophy|film|movie|album|exhibition|book|biography|statue|quiz|award show"), "क्रिकेट", "फिल्म", "ক্রিকেট", "সিনেমা"]);

/**
 * Is this a DIPLOMATIC VISIT of note? By the words of the headline (a heuristic, like the others), in three shapes:
 *   - a FOREIGN head of state or government, minister or delegation VISITING INDIA (scope "india"): a word of a visit to India and a title or a leader's name ("Putin to visit India next month", "Japan PM arrives in Delhi");
 *   - a foreign leader MEETING India's Prime Minister AT HOME, in Delhi or another big city ("Sri Lankan President holds talks with PM Modi in New Delhi"): scope "india";
 *   - the Prime Minister of India ABROAD (scope "world"): his name or title, a foreign country, city or leader, and a word of a journey ("PM Modi leaves for Moscow", "Modi to attend G20 summit in Johannesburg") or of talks ("Modi, Putin hold talks
 *     at Kremlin"; "PM Modi meets Australian PM").
 * Not these: a phone or video call; a domestic occasion (a rally, a border post, an inauguration); a cricket match with a foreign team; Nirav or Lalit Modi; India Gate; a domestic visitor, who names no foreign title or leader.
 */
export function visitOf(title: string): PriorityFlag | null {
  if (NOT_VISIT_PLACE.test(title) || NOT_VISIT.test(title) || BY_PHONE.test(title)) return null;
  const rest = title.replace(PM_INDIA, " ");
  const pm = rest !== title && !NOT_PM.test(title);
  const named = NAMED_LEADER.test(rest);
  const foreign = WORLD.test(rest) || named;
  const leader = LEADER.test(rest) || named;
  // a foreign visitor in India
  if (leader && (VISIT_CORE.test(title) || (foreign && VISIT_TO_INDIA.test(title)))) return { kind: "visit", scope: "india" };
  // a foreign leader meeting the Prime Minister at home
  if (pm && foreign && leader && HOME_CITY.test(title) && (MEETING_GOV.test(rest) || MEETING_ANY.test(rest)) && !TRAVEL_OUT.test(title)) return { kind: "visit", scope: "india" };
  // the Prime Minister abroad
  if (pm && foreign && !DOMESTIC_EVENT.test(title) && (TRAVEL.test(rest) || MEETING_GOV.test(rest) || (MEETING_ANY.test(rest) && leader))) return { kind: "visit", scope: "world" };
  return null;
}
/** The Prime Minister LEAVING for a foreign country (so that a headline that names Delhi as the place he leaves from is not taken as a meeting at home). */
const TRAVEL_OUT = re([alone("leaves for|left for|departs? for|embarks?|embarked|off to|flies? to|set to visit|to visit|will visit"), "रवाना", "রওনা"]);

/** The priority of a headline for the three news tabs, or null. A demise first (a renowned person who died in an accident is a demise), then an accident, then a massacre, then a diplomatic visit. */
export function priorityOf(title: string): PriorityFlag | null {
  return demiseOf(title) ?? accidentOf(title) ?? massacreOf(title) ?? visitOf(title);
}

/** The order of the priority block: West Bengal, then India, then the world; within a scope the newest first. */
export const SCOPE_RANK: Record<PriorityScope, number> = { wb: 0, india: 1, world: 2 };

/* ---------------------------------- the same story in three scripts: names in sound ---------------------------------- */

const DEV: Record<string, string> = { "क": "k", "ख": "k", "ग": "k", "घ": "k", "ङ": "n", "च": "k", "छ": "k", "ज": "j", "झ": "j", "ञ": "n", "ट": "t", "ठ": "t", "ड": "t", "ढ": "t", "ण": "n", "त": "t", "थ": "t", "द": "t", "ध": "t", "न": "n", "प": "b", "फ": "b", "ब": "b", "भ": "b", "म": "m", "य": "", "र": "r", "ल": "l", "व": "b", "श": "s", "ष": "s", "स": "s", "ह": "", "ड़": "r", "ढ़": "r", "ं": "n", "ँ": "n", "ऑ": "", "क़": "k", "ख़": "k", "ग़": "k", "ज़": "j", "फ़": "b" };
const BEN: Record<string, string> = { "ক": "k", "খ": "k", "গ": "k", "ঘ": "k", "ঙ": "n", "চ": "k", "ছ": "k", "জ": "j", "ঝ": "j", "ঞ": "n", "ট": "t", "ঠ": "t", "ড": "t", "ঢ": "t", "ণ": "n", "ত": "t", "থ": "t", "দ": "t", "ধ": "t", "ন": "n", "প": "b", "ফ": "b", "ব": "b", "ভ": "b", "ম": "m", "য": "j", "র": "r", "ল": "l", "শ": "s", "ষ": "s", "স": "s", "হ": "", "ড়": "r", "ঢ়": "r", "য়": "", "ৎ": "t", "ং": "n", "ঁ": "n", "ঃ": "" };

/** A word reduced to the skeleton of its consonants, in sound: aspirates and the pairs a transliteration mixes up (t/d, k/g/c, b/p/f/v/w, j/z, s/sh) are one letter, vowels and h are dropped, doubles are one. */
export function skeleton(word: string): string {
  let out = "";
  const w = word.normalize("NFC").toLowerCase();
  for (let i = 0; i < w.length; i++) {
    const c = w[i], two = w.slice(i, i + 2);
    let s: string | undefined;
    if (DEV[two] !== undefined) { s = DEV[two]; i++; } else if (BEN[two] !== undefined) { s = BEN[two]; i++; } else if (DEV[c] !== undefined) s = DEV[c]; else if (BEN[c] !== undefined) s = BEN[c];
    else if (/[a-z]/.test(c)) {
      if (/[aeiouyh]/.test(c)) s = "";
      else if (c === "c" && w[i + 1] === "h") { s = "k"; i++; }
      else if (c === "s" && w[i + 1] === "h") { s = "s"; i++; }
      else s = ({ d: "t", g: "k", c: "k", q: "k", x: "ks", p: "b", f: "b", v: "b", w: "b", z: "j" } as Record<string, string>)[c] ?? c;
    } else s = "";
    if (s && s !== out[out.length - 1]) out += s;
  }
  return out;
}

/** The words of a headline that may be a name or a place: every capitalised word of the Latin script, and every word of Hindi and Bengali; each as its skeleton, kept when it has three consonants or more. */
export function nameKeys(title: string): string[] {
  const keys = new Set<string>();
  for (const raw of title.split(/[^\p{L}\p{M}'’]+/u).filter(Boolean)) {
    const w = raw.replace(/['’]s$/i, "");
    if (/^[A-Za-z]/.test(w) && !/^[A-Z]/.test(w)) continue;
    if (STOP.has(w.toLowerCase())) continue;
    const k = skeleton(w);
    if (k.length >= 3) keys.add(k);
    // a Bengali name takes the case ending on the name itself (পুতিন, পুতিনের = Putin's): its stem is a key as well
    if (/[\u0980-\u09FF]/.test(w) && /র$/.test(w)) { const stem = skeleton(w.replace(/(?:ে?র)$/, "")); if (stem.length >= 3) keys.add(stem); }
  }
  return [...keys];
}
/** The capitalised words that are not names: the days, the months, the words of a headline. */
const STOP = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "former", "veteran", "legendary", "noted", "eminent", "renowned", "celebrated", "late", "passes", "away", "dies", "died", "death", "demise", "aged", "age", "india", "indian", "bengal", "kolkata", "west", "minister", "chief", "president", "actor", "actress", "singer", "poet", "writer", "mourns", "condolences", "tributes", "killed", "accident", "blast", "fire", "plant", "steel", "workers", "worker", "police", "news", "live", "updates", "breaking", "video", "photos"]);

/** The time of a story, in milliseconds, or NaN. */
const ms = (i: { publishedAt: string }): number => (i.publishedAt ? DateTime.fromISO(i.publishedAt).toMillis() : NaN);

export interface DeskItem extends FeedItem { lang: "en" | "hi" | "bn"; flag: PriorityFlag }

const withinHours = (a: DeskItem, b: DeskItem): boolean => { const ta = ms(a), tb = ms(b); return Number.isNaN(ta) || Number.isNaN(tb) || Math.abs(ta - tb) <= SAME_HOURS * 3_600_000; };

/** Two stories are one when they are of the same kind and within SAME_HOURS of each other and share a rare name-skeleton (in at most RARE headlines of the batch), or two shorter ones. */
export const SAME_HOURS = 36;
export const RARE = 4;
export function sameEvent(a: DeskItem, b: DeskItem, df: Map<string, number>): boolean {
  if (a.flag.kind !== b.flag.kind) return false;
  const ta = ms(a), tb = ms(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && Math.abs(ta - tb) > SAME_HOURS * 3_600_000) return false;
  const A = nameKeys(a.title), B = new Set(nameKeys(b.title));
  const shared = A.filter((k) => B.has(k));
  const rare = shared.filter((k) => (df.get(k) ?? 1) <= RARE);
  // the same number of dead (or hurt) is one more sign that two accidents are one
  const sameCount = (a.flag.kind === "accident" || a.flag.kind === "massacre") && deadCount(a.title) > 0 && deadCount(a.title) === deadCount(b.title) ? 1 : 0;
  // a visit is told by the visitor's name above all (Putin, Macron: three consonants only), and a visit headline already has the Prime Minister or India in it, so one rare name in common is enough for two visits within the day to be one
  return rare.some((k) => k.length >= 4) || rare.length + sameCount >= (a.flag.kind === "visit" ? 1 : 2);
}

/**
 * MAJOR NEWS: the exception to "a story stands in one tab only" (the owner: the death of an eminent person and any huge massacre may stand in more than one tab at once, by their gravity; and the same for any super important news). A story is MAJOR by one of these signs:
 *   - THE DEATH OF AN EMINENT PERSON: a demise (priority.ts has already required a renowned person) that is carried by at least MAJOR_DEMISE_PAPERS different papers in at least two languages (an eminent person's death is told everywhere), or is that of a FORMER or sitting
 *     President, Prime Minister, Chief Minister, Governor, Chief Justice or Speaker, a Nobel or Bharat Ratna laureate, a pope (a bare "Prime Minister" in the headline is usually the one who condoles, so it is not enough);
 *   - A HUGE LOSS OF LIFE: an accident or a massacre with at least MAJOR_DEAD dead;
 *   - MANY PAPERS: any other priority story carried by at least MAJOR_PAPERS different papers, in at least two languages.
 * A major story is then shown in the tab of EVERY language that carried it (each its own earliest report), not only in the one where it arrived first. Any other story is still shown once.
 */
export const MAJOR_PAPERS = 6;
export const MAJOR_DEMISE_PAPERS = 3;
export const MAJOR_DEAD = 25;
const TOP_OFFICE = re([
  // "former President", "late Chief Minister": the office-holder who DIED (a bare "Prime Minister" is usually the one who condoles: "PM condoles the death of the actor")
  alone("(?:former|ex-?|late|sitting|veteran)\\s+(?:president|vice-?president|prime minister|chief minister|governor|chief justice|speaker)|nobel (?:laureate|prize winner|winner)|bharat ratna|pope|emperor|head of state"),
  "पूर्व राष्ट्रपति", "पूर्व उपराष्ट्रपति", "पूर्व प्रधानमंत्री", "पूर्व मुख्यमंत्री", "पूर्व राज्यपाल", "पूर्व मुख्य न्यायाधीश", "भारत रत्न", "नोबेल पुरस्कार", "दिवंगत मुख्यमंत्री",
  "প্রাক্তন রাষ্ট্রপতি", "প্রাক্তন উপরাষ্ট্রপতি", "প্রাক্তন প্রধানমন্ত্রী", "প্রাক্তন মুখ্যমন্ত্রী", "প্রাক্তন রাজ্যপাল", "প্রাক্তন প্রধান বিচারপতি", "ভারতরত্ন", "নোবেল",
]);
/** Is this group of one event (its stories, from every language) major? */
export function isMajor(group: DeskItem[]): boolean {
  const papers = new Set(group.flatMap((m) => [m.source, ...(m.also ?? [])]));
  const languages = new Set(group.map((m) => m.lang));
  if (group.some((m) => (m.flag.kind === "accident" || m.flag.kind === "massacre") && deadCount(m.title) >= MAJOR_DEAD)) return true;
  if (group.some((m) => m.flag.kind === "demise") && (group.some((m) => TOP_OFFICE.test(m.title)) || (papers.size >= MAJOR_DEMISE_PAPERS && languages.size >= 2))) return true;
  return papers.size >= MAJOR_PAPERS && languages.size >= 2;
}

/**
 * ASSIGNS EACH STORY TO ONE LANGUAGE. `items` are the priority stories of the three languages together. The stories that are the same event (sameEvent, and a story that bridges two is one) form one group, which belongs to the language
 * of the story that arrived FIRST; within that language the stories of the group are shown as one (the earliest-arrived headline of the language). Returns, for each language, the stories to show, in the order of the priority block:
 * West Bengal, then India, then the world, the newest first within a scope.
 */
export function assignDesk(items: DeskItem[], meaning?: (a: string, b: string) => boolean): Record<"en" | "hi" | "bn", DeskItem[]> {
  const df = new Map<string, number>();
  for (const i of items) for (const k of nameKeys(i.title)) df.set(k, (df.get(k) ?? 0) + 1);
  const order = [...items].sort((a, b) => (Number.isNaN(ms(a)) ? Infinity : ms(a)) - (Number.isNaN(ms(b)) ? Infinity : ms(b)));
  const groups: DeskItem[][] = [];
  for (const it of order) {
    const hits = groups.filter((g) => g.some((m) => m.link === it.link || sameEvent(m, it, df) || (!!meaning && m.flag.kind === it.flag.kind && withinHours(m, it) && meaning(m.title, it.title))));
    if (!hits.length) { groups.push([it]); continue; }
    const g = hits[0];
    for (const o of hits.slice(1)) { g.push(...o); groups.splice(groups.indexOf(o), 1); }
    g.push(it);
  }
  const out: Record<"en" | "hi" | "bn", DeskItem[]> = { en: [], hi: [], bn: [] };
  for (const g of groups) {
    // the languages that show the story: the one it arrived in first, and (a MAJOR story only) every other that carried it
    const owners = isMajor(g) ? [...new Set(g.map((m) => m.lang))] : [g[0].lang];
    for (const owner of owners) {
      const mine = g.filter((m) => m.lang === owner);
      // one story in a language: the earliest report in it (the story's identity), named with the other papers of that language that carried it
      const head = mine[0];
      const others = [...new Set(mine.slice(1).map((m) => m.source).filter((s) => s !== head.source))];
      out[owner].push({ ...head, ...(others.length ? { also: [...new Set([...(head.also ?? []), ...others])] } : {}) });
    }
  }
  for (const l of ["en", "hi", "bn"] as const) out[l].sort((a, b) => SCOPE_RANK[a.flag.scope] - SCOPE_RANK[b.flag.scope] || (Number.isNaN(ms(b)) ? -Infinity : ms(b)) - (Number.isNaN(ms(a)) ? -Infinity : ms(a)));
  return out;
}

/* ------------------------------------------------ the business tab: a record ------------------------------------------------ */

/** A RECORD: a record high or low of the share market (an INDEX: Sensex, Nifty, Dow ...), of gold or silver, or of the dollar against the rupee. The headline must name the thing itself AND a record that HAPPENED. */
const THING = re([alone("sensex|nifty|nifty ?50|bank nifty|nifty bank|stock market|share market|stock markets|equity markets?|equity benchmarks?|benchmark indices|benchmarks?|dalal street|gift nifty|dow|dow jones|nasdaq|s&p 500|gold|silver|bullion|rupee|rupee-dollar|dollar-rupee|usd/inr|usd-inr|dollar"), "सेंसेक्स", "निफ्टी", "शेयर बाजार", "सोना", "चांदी", "रुपया", "डॉलर", "সেনসেক্স", "নিফটি", "শেয়ার বাজার", "সোনা", "রুপো", "টাকা", "ডলার"]);
const RECORD = re([
  alone("record(?:-|\\s)(?:high|low|close|closing|breaking|fall|jump|surge|drop|rally|peak|level)|all-?time (?:high|low)|lifetime (?:high|low)|historic (?:high|low)|fresh (?:record|all-?time|lifetime)|new (?:record|all-?time|lifetime)|hits? (?:a )?record|hits? (?:a )?new (?:high|low)|(?:biggest|steepest|sharpest|worst|largest) (?:single-?day|one-?day|daily) (?:fall|drop|gain|jump|surge|decline|loss|rally)|(?:biggest|steepest|sharpest|worst) (?:fall|jump|drop|surge|gain|loss) since"),
  "रिकॉर्ड हाई", "रिकॉर्ड लो", "ऑल टाइम हाई", "ऑल-टाइम हाई", "ऑल टाइम लो", "सर्वकालिक", "रिकॉर्ड ऊंचाई", "रिकॉर्ड निचले स्तर", "रिकॉर्ड स्तर",
  "রেকর্ড উচ্চতা", "রেকর্ড দর", "সর্বকালীন", "সর্বকালের রেকর্ড", "রেকর্ড পতন", "রেকর্ড নিম্ন",
]);
/** Not a record that happened: a guess, a hope, a question, a "still below", a single company's stock, the volume of trading, a futures or options figure, a market capitalisation. */
const NOT_RECORD = re([
  alone("nears?|nearing|eyes?|eyeing|may|might|could|would|will|can|should|expected|expects?|likely|poised|set to|ahead of|still|down from|away from|short of|within reach|yet to|miss(?:es)?|fail(?:s|ed)?|forecasts?|predict(?:s|ed)?|targets?|outlook|what to|why|how|what|is it|stocks? (?:to|that)|top \\d+|record high stocks|stock|stocks|shares of|share price of"),
  alone("futures|liquidity|volumes?|turnover|market cap|mcap|open interest|options|derivatives|etfs?|mutual funds?|sip|demat|ipo|listing|subscription|bitcoin|crypto|ethereum"),
  alone("cricket|ipl|t20|odi|test|runs|wickets?|goals?|box office|collection|film|movie|sales|profit|revenue|earnings|net profit|order book|crop|harvest|foodgrain|production|output|exports?|imports?|gdp|fdi|forex reserves|reserves|gst|tax|turnout|attendance"),
  "क्रिकेट", "फिल्म", "বক্স অফিস", "ক্রিকেট", "সিনেমা", "\\?",
]);

/** Is this the record move of a market, gold, silver or the rupee? (Business tab) */
export function recordMove(title: string): PriorityFlag | null {
  if (!THING.test(title) || !RECORD.test(title) || NOT_RECORD.test(title)) return null;
  return { kind: "record", scope: "india" };
}
