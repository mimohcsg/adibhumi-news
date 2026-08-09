const path = require("path");
const fs = require("fs");
const express = require("express");
const Parser = require("rss-parser");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");

// Corporate SSL inspection often breaks feed/article fetches.
if (process.env.ADIBHUMI_STRICT_TLS !== "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const PORT = Number(process.env.PORT) || 4174;
const CACHE_MS = 5 * 60 * 1000;
const FULL_ARTICLE_CACHE_MS = 60 * 60 * 1000;
const MIN_FULL_BODY_CHARS = 450;

/** Coverage: West MP tribal belt — Indore + Ujjain divisions (Malwa–Nimar) + statewide MP. */
const COVERAGE = {
  labelHi: "मालवा · निमाड़ · पश्चिम मप्र आदिवासी ज़िले",
  labelEn: "Malwa · Nimad · West MP tribal districts",
  divisions: [
    {
      id: "indore-div",
      hi: "इंदौर संभाग",
      en: "Indore Division",
      aliases: ["इंदौर संभाग", "indore division", "इंदौर मंडल"],
      districts: ["indore", "dhar", "jhabua", "alirajpur", "khargone", "barwani", "khandwa", "burhanpur"],
    },
    {
      id: "ujjain-div",
      hi: "उज्जैन संभाग",
      en: "Ujjain Division",
      aliases: ["उज्जैन संभाग", "ujjain division", "उज्जैन मंडल"],
      districts: ["ujjain", "dewas", "ratlam", "mandsaur", "neemuch", "shajapur", "agar"],
    },
  ],
  districts: [
    { id: "indore", hi: "इंदौर", en: "Indore", division: "indore-div", aliases: ["इंदौर", "इन्दौर", "indore"] },
    {
      id: "dhar",
      hi: "धार",
      en: "Dhar",
      division: "indore-div",
      aliases: ["धार जिला", "धार जिले", "धार जिले में", "dhar district", "धार", "dhar"],
    },
    {
      id: "jhabua",
      hi: "झाबुआ",
      en: "Jhabua",
      division: "indore-div",
      aliases: [
        "झाबुआ",
        "झाबूआ",
        "झाबआ",
        "jhabua",
        "jhabua district",
        "ठाण्डला",
        "थांडला",
        "thandla",
        "पेटलावद",
        "पेटलावाद",
        "petlawad",
        "रानापुर",
        "ranapur",
        "मेघनगर",
        "meghnagar",
        // Avoid bare "रामा" — it matches inside "ड्रामा".
        "रामा झाबुआ",
        "rama jhabua",
      ],
    },

    {
      id: "alirajpur",
      hi: "अलीराजपुर",
      en: "Alirajpur",
      division: "indore-div",
      aliases: [
        "अलीराजपुर",
        "आलीराजपुर",
        "अलीराज्पुर",
        "आलीराज्पुर",
        "अली राजपुर",
        "आली राजपुर",
        "alirajpur",
        "ali rajpur",
        "ali-rajpur",
        "alirajpur district",
        "जोबट",
        "jobat",
        "भाबरा",
        "bhabra",
        "सोंदवा",
        "sondwa",
        "काथीवाड़ा",
        "काथीवाडा",
        "kathiwara",
        "कटीवारा",
        "उदई",
        "udai",
        "चंद्रशेखर आजाद नगर",
        "chandrashekhar azad nagar",
      ],
    },
    { id: "khargone", hi: "खरगोन", en: "Khargone", division: "indore-div", aliases: ["खरगोन", "खर्गोन", "khargone", "west nimar"] },
    { id: "barwani", hi: "बड़वानी", en: "Barwani", division: "indore-div", aliases: ["बड़वानी", "बडवानी", "बारवानी", "barwani", "badwani", "badwani district"] },
    { id: "khandwa", hi: "खंडवा", en: "Khandwa", division: "indore-div", aliases: ["खंडवा", "खण्डवा", "khandwa", "east nimar"] },
    { id: "burhanpur", hi: "बुरहानपुर", en: "Burhanpur", division: "indore-div", aliases: ["बुरहानपुर", "burhanpur"] },
    { id: "ujjain", hi: "उज्जैन", en: "Ujjain", division: "ujjain-div", aliases: ["उज्जैन", "ujjain"] },
    { id: "dewas", hi: "देवास", en: "Dewas", division: "ujjain-div", aliases: ["देवास", "dewas"] },
    { id: "ratlam", hi: "रतलाम", en: "Ratlam", division: "ujjain-div", aliases: ["रतलाम", "ratlam"] },
    { id: "mandsaur", hi: "मंदसौर", en: "Mandsaur", division: "ujjain-div", aliases: ["मंदसौर", "मन्दसौर", "mandsaur"] },
    { id: "neemuch", hi: "नीमच", en: "Neemuch", division: "ujjain-div", aliases: ["नीमच", "neemuch"] },
    { id: "shajapur", hi: "शाजापुर", en: "Shajapur", division: "ujjain-div", aliases: ["शाजापुर", "shajapur"] },
    { id: "agar", hi: "आगर-मालवा", en: "Agar-Malwa", division: "ujjain-div", aliases: ["आगर", "agar malwa", "agar-malwa"] },
  ],
};

/** Top homepage focus — Alirajpur, Jhabua, Dhar, Barwani (Badwani) first. */
const TOP_FOCUS_DISTRICTS = new Set(["alirajpur", "jhabua", "dhar", "barwani"]);
const TOP_FOCUS_ORDER = { alirajpur: 0, jhabua: 1, dhar: 2, barwani: 3 };

/** Other West MP tribal / adjoining districts — after the top four. */
const OTHER_TRIBAL_DISTRICTS = new Set([
  "khargone",
  "khandwa",
  "burhanpur",
  "ratlam",
  "mandsaur",
  "neemuch",
]);

/** Other West MP urban/other districts. */
const WEST_MP_OTHER_DISTRICTS = new Set(["indore", "ujjain", "dewas", "shajapur", "agar"]);

/** @deprecated use TOP_FOCUS + OTHER_TRIBAL — kept for any legacy checks */
const TRIBAL_CORE_DISTRICTS = new Set([...TOP_FOCUS_DISTRICTS, ...OTHER_TRIBAL_DISTRICTS]);

const TRIBAL_KEYWORDS = [
  "आदिवासी",
  "जनजाति",
  "जनजातीय",
  "वनवासी",
  "भील",
  "भीलाला",
  "पटेलिया",
  "बरेला",
  "bhil",
  "bhilala",
  "patelia",
  "barela",
  "adivasi",
  "tribal",
  "scheduled tribe",
  "अनुसूचित जनजाति",
];

const REGION_EXTRA_ALIASES = [
  "मालवा",
  "malwa",
  "निमाड़",
  "निमाड",
  "nimad",
  "nimar",
  "आदिवासी",
  "जनजाति",
  "जनजातीय",
  "वनवासी",
  "भील",
  "भीलाला",
  "bhil",
  "bhilala",
  "पटेलिया",
  "बरेला",
  "मध्य प्रदेश",
  "madhya pradesh",
  "मप्र",
  "भोपाल",
  "bhopal",
  "इंदौर संभाग",
  "उज्जैन संभाग",
  "indore division",
  "ujjain division",
  "पश्चिम मप्र",
  "west madhya pradesh",
  "विधानसभा",
  "मोहन यादव",
];

const INDIA_ALIASES = [
  "भारत",
  "india",
  "देश",
  "दिल्ली",
  "delhi",
  "नई दिल्ली",
  "new delhi",
  "संसद",
  "लोकसभा",
  "राज्यसभा",
  "प्रधानमंत्री",
  "मोदी",
  "केंद्र",
  "centre",
  "center",
  "national",
  "nationwide",
  "भारतीय",
  "सुप्रीम कोर्ट",
  "supreme court",
];

const BREAKING_ALIASES = [
  "ब्रेकिंग",
  "breaking",
  "तत्काल",
  "बड़ी खबर",
  "अभी-अभी",
  "just in",
  "alert",
  "अलर्ट",
  "फ्लैश",
  "flash",
  "urgent",
  "ताज़ा अपडेट",
  "live update",
  "लाइव अपडेट",
];

/** Trusted public RSS sources — West MP divisions + statewide MP. */
const FEEDS = [
  // Statewide MP (always included)
  {
    id: "bhaskar-mp",
    name: "दैनिक भास्कर",
    nameEn: "Dainik Bhaskar",
    lang: "hi",
    region: "mp",
    category: "मध्य प्रदेश",
    categoryEn: "Madhya Pradesh",
    url: "https://www.bhaskar.com/rss-v1--category-1739.xml",
    limit: 80,
  },
  {
    id: "amar-mp",
    name: "अमर उजाला",
    nameEn: "Amar Ujala",
    lang: "hi",
    region: "mp",
    category: "मध्य प्रदेश",
    categoryEn: "Madhya Pradesh",
    url: "https://www.amarujala.com/rss/madhya-pradesh.xml",
    limit: 70,
  },
  {
    id: "naidunia-mp",
    name: "नई दुनिया",
    nameEn: "Nai Dunia",
    lang: "hi",
    region: "mp",
    category: "मध्य प्रदेश",
    categoryEn: "Madhya Pradesh",
    url: "https://rss.jagran.com/naidunia/madhya-pradesh.xml",
    limit: 70,
  },
  // Alirajpur-first district feeds (Google News RSS — fills empty district tabs)
  {
    id: "gnews-alirajpur-hi",
    name: "गूगल न्यूज़",
    nameEn: "Google News",
    lang: "hi",
    region: "mp",
    category: "अलीराजपुर",
    categoryEn: "Alirajpur",
    allowMixedLang: true,
    forceDistrictId: "alirajpur",
    url:
      "https://news.google.com/rss/search?q=(%22%E0%A4%85%E0%A4%B2%E0%A5%80%E0%A4%B0%E0%A4%BE%E0%A4%9C%E0%A4%AA%E0%A5%81%E0%A4%B0%22%20OR%20%22%E0%A4%86%E0%A4%B2%E0%A5%80%E0%A4%B0%E0%A4%BE%E0%A4%9C%E0%A4%AA%E0%A5%81%E0%A4%B0%22%20OR%20Alirajpur%20OR%20%22Ali%20Rajpur%22%20OR%20Jobat%20OR%20%22%E0%A4%9C%E0%A5%8B%E0%A4%AC%E0%A4%9F%22%20OR%20%22%E0%A4%AD%E0%A4%BE%E0%A4%AC%E0%A4%B0%E0%A4%BE%22%20OR%20Bhabra%20OR%20%22%E0%A4%B8%E0%A5%8B%E0%A4%A8%E0%A5%8D%E0%A4%A6%E0%A4%B5%E0%A4%BE%22)%20(%E0%A4%AE%E0%A4%A7%E0%A5%8D%E0%A4%AF%20%E0%A4%AA%E0%A5%8D%E0%A4%B0%E0%A4%A6%E0%A5%87%E0%A4%B6%20OR%20%22Madhya%20Pradesh%22%20OR%20MP)%20when:21d&hl=hi&gl=IN&ceid=IN:hi",
    limit: 50,
  },
  {
    id: "gnews-alirajpur-en",
    name: "गूगल न्यूज़",
    nameEn: "Google News",
    lang: "hi",
    region: "mp",
    category: "अलीराजपुर",
    categoryEn: "Alirajpur",
    allowMixedLang: true,
    forceDistrictId: "alirajpur",
    url:
      "https://news.google.com/rss/search?q=(%22Alirajpur%22%20OR%20%22Ali%20Rajpur%22%20OR%20%22Jobat%22%20OR%20%22Bhabra%22%20OR%20Sondwa)%20(%22Madhya%20Pradesh%22%20OR%20MP)%20when:21d&hl=en-IN&gl=IN&ceid=IN:en",
    limit: 40,
  },
  {
    id: "gnews-jhabua-hi",
    name: "गूगल न्यूज़",
    nameEn: "Google News",
    lang: "hi",
    region: "mp",
    category: "झाबुआ",
    categoryEn: "Jhabua",
    allowMixedLang: true,
    forceDistrictId: "jhabua",
    url:
      "https://news.google.com/rss/search?q=(%22%E0%A4%9D%E0%A4%BE%E0%A4%AC%E0%A5%81%E0%A4%86%22%20OR%20%22%E0%A4%9D%E0%A4%BE%E0%A4%AC%E0%A5%82%E0%A4%86%22%20OR%20Jhabua%20OR%20%22%E0%A4%A0%E0%A4%BE%E0%A4%A3%E0%A5%8D%E0%A4%A1%E0%A4%B2%E0%A4%BE%22%20OR%20Thandla%20OR%20%22%E0%A4%AA%E0%A5%87%E0%A4%9F%E0%A4%B2%E0%A4%BE%E0%A4%B5%E0%A4%A6%22%20OR%20Petlawad%20OR%20%22%E0%A4%AE%E0%A5%87%E0%A4%98%E0%A4%A8%E0%A4%97%E0%A4%B0%22%20OR%20Meghnagar)%20(%E0%A4%AE%E0%A4%A7%E0%A5%8D%E0%A4%AF%20%E0%A4%AA%E0%A5%8D%E0%A4%B0%E0%A4%A6%E0%A5%87%E0%A4%B6%20OR%20%22Madhya%20Pradesh%22%20OR%20MP)%20when:21d&hl=hi&gl=IN&ceid=IN:hi",
    limit: 50,
  },
  {
    id: "gnews-jhabua-en",
    name: "गूगल न्यूज़",
    nameEn: "Google News",
    lang: "hi",
    region: "mp",
    category: "झाबुआ",
    categoryEn: "Jhabua",
    allowMixedLang: true,
    forceDistrictId: "jhabua",
    url:
      "https://news.google.com/rss/search?q=(%22Jhabua%22%20OR%20Thandla%20OR%20Petlawad%20OR%20Meghnagar%20OR%20Ranapur)%20(%22Madhya%20Pradesh%22%20OR%20MP)%20when:21d&hl=en-IN&gl=IN&ceid=IN:en",
    limit: 40,
  },
  {
    id: "gnews-barwani-hi",
    name: "गूगल न्यूज़",
    nameEn: "Google News",
    lang: "hi",
    region: "mp",
    category: "बड़वानी",
    categoryEn: "Barwani",
    allowMixedLang: true,
    forceDistrictId: "barwani",
    url:
      "https://news.google.com/rss/search?q=%22%E0%A4%AC%E0%A4%A1%E0%A4%BC%E0%A4%B5%E0%A4%BE%E0%A4%A8%E0%A5%80%22%20OR%20%22%E0%A4%AC%E0%A4%A1%E0%A4%B5%E0%A4%BE%E0%A4%A8%E0%A5%80%22%20OR%20Barwani%20OR%20Badwani%20when:14d&hl=hi&gl=IN&ceid=IN:hi",
    limit: 25,
  },
  {
    id: "gnews-dhar-hi",
    name: "गूगल न्यूज़",
    nameEn: "Google News",
    lang: "hi",
    region: "mp",
    category: "धार",
    categoryEn: "Dhar",
    allowMixedLang: true,
    forceDistrictId: "dhar",
    url:
      "https://news.google.com/rss/search?q=%22%E0%A4%A7%E0%A4%BE%E0%A4%B0%22%20(%E0%A4%AE%E0%A4%A7%E0%A5%8D%E0%A4%AF%20%E0%A4%AA%E0%A5%8D%E0%A4%B0%E0%A4%A6%E0%A5%87%E0%A4%B6%20OR%20%22Madhya%20Pradesh%22)%20OR%20%22Dhar%20district%22%20when:7d&hl=hi&gl=IN&ceid=IN:hi",
    limit: 25,
  },
  // Broader Hindi — MP / division mentions
  {
    id: "aajtak-home",
    name: "आज तक",
    nameEn: "Aaj Tak",
    lang: "hi",
    region: "national",
    category: "देश",
    categoryEn: "National",
    url: "https://www.aajtak.in/rssfeeds?id=home",
    limit: 24,
    requireRegionHit: true,
  },
  {
    id: "bbc-hindi",
    name: "BBC हिंदी",
    nameEn: "BBC Hindi",
    lang: "hi",
    region: "national",
    category: "देश",
    categoryEn: "National",
    url: "https://feeds.bbci.co.uk/hindi/rss.xml",
    limit: 14,
    requireRegionHit: true,
  },
  {
    id: "bhaskar-desh",
    name: "दैनिक भास्कर",
    nameEn: "Dainik Bhaskar",
    lang: "hi",
    region: "national",
    category: "देश",
    categoryEn: "National",
    url: "https://www.bhaskar.com/rss-v1--category-1061.xml",
    limit: 18,
    requireRegionHit: true,
  },
  // English — MP / west-MP mentions
  {
    id: "toi-top",
    name: "टाइम्स ऑफ इंडिया",
    nameEn: "Times of India",
    lang: "en",
    region: "national",
    category: "टॉप",
    categoryEn: "Top",
    url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
    limit: 25,
    requireRegionHit: true,
  },
  {
    id: "indian-express",
    name: "इंडियन एक्सप्रेस",
    nameEn: "Indian Express",
    lang: "en",
    region: "national",
    category: "देश",
    categoryEn: "National",
    url: "https://indianexpress.com/section/india/feed/",
    limit: 20,
    requireRegionHit: true,
  },
  {
    id: "the-hindu",
    name: "द हिंदू",
    nameEn: "The Hindu",
    lang: "en",
    region: "national",
    category: "देश",
    categoryEn: "National",
    url: "https://www.thehindu.com/news/national/feeder/default.rss",
    limit: 16,
    requireRegionHit: true,
  },
  // Topic rails (homepage columns) — keep feed category; do not force MP filter
  {
    id: "amar-sports",
    name: "अमर उजाला",
    nameEn: "Amar Ujala",
    lang: "hi",
    region: "topic",
    topic: "cricket",
    keepCategory: true,
    category: "क्रिकेट",
    categoryEn: "Cricket",
    url: "https://www.amarujala.com/rss/sports.xml",
    limit: 18,
  },
  {
    id: "amar-entertainment",
    name: "अमर उजाला",
    nameEn: "Amar Ujala",
    lang: "hi",
    region: "topic",
    topic: "entertainment",
    keepCategory: true,
    category: "बॉलीवुड",
    categoryEn: "Bollywood",
    url: "https://www.amarujala.com/rss/entertainment.xml",
    limit: 18,
  },
  {
    id: "amar-lifestyle",
    name: "अमर उजाला",
    nameEn: "Amar Ujala",
    lang: "hi",
    region: "topic",
    topic: "lifestyle",
    keepCategory: true,
    category: "लाइफस्टाइल",
    categoryEn: "Lifestyle",
    url: "https://www.amarujala.com/rss/lifestyle.xml",
    limit: 16,
  },
  {
    id: "amar-jobs",
    name: "अमर उजाला",
    nameEn: "Amar Ujala",
    lang: "hi",
    region: "topic",
    topic: "jobs",
    keepCategory: true,
    category: "जॉब · एजुकेशन",
    categoryEn: "Jobs · Education",
    url: "https://www.amarujala.com/rss/jobs.xml",
    limit: 14,
  },
  {
    id: "amar-education",
    name: "अमर उजाला",
    nameEn: "Amar Ujala",
    lang: "hi",
    region: "topic",
    topic: "jobs",
    keepCategory: true,
    category: "जॉब · एजुकेशन",
    categoryEn: "Jobs · Education",
    url: "https://www.amarujala.com/rss/education.xml",
    limit: 14,
  },
  {
    id: "amar-business",
    name: "अमर उजाला",
    nameEn: "Amar Ujala",
    lang: "hi",
    region: "topic",
    topic: "business",
    keepCategory: true,
    category: "बिजनेस",
    categoryEn: "Business",
    url: "https://www.amarujala.com/rss/business.xml",
    limit: 16,
  },
  {
    id: "amar-world",
    name: "अमर उजाला",
    nameEn: "Amar Ujala",
    lang: "hi",
    region: "topic",
    topic: "world",
    keepCategory: true,
    category: "विदेश",
    categoryEn: "World",
    url: "https://www.amarujala.com/rss/world.xml",
    limit: 16,
  },
];

const parser = new Parser({
  timeout: 12000,
  headers: {
    "User-Agent": "AdibhumiNewsBot/1.0 (+local aggregator; respectful fetch)",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
  // Corporate SSL inspection often injects a local CA; allow feed fetch in that case.
  requestOptions: {
    rejectUnauthorized: process.env.ADIBHUMI_STRICT_TLS === "1",
  },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

const app = express();
app.disable("x-powered-by");

let cache = {
  fetchedAt: 0,
  expiresAt: 0,
  items: [],
  sources: [],
  errors: [],
};

/** Full article bodies fetched from story pages (branded response only). */
const fullArticleCache = new Map();

function stripHtml(html = "") {
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Outlets often appended by Google News / wire RSS — never show these on आदिभूमि. */
const PUBLISHER_NAMES = [
  "Bhopal Samachar",
  "Bhaskar English",
  "Dainik Bhaskar",
  "दैनिक भास्कर",
  "भास्कर",
  "Amar Ujala",
  "अमर उजाला",
  "Nai Dunia",
  "NaiDunia",
  "Naidunia",
  "नई दुनिया",
  "नईदुनिया",
  "नई दुनिया न्यूज",
  "नईदुनिया न्यूज",
  "Jagran",
  "जागरण",
  "Dainik Jagran",
  "दैनिक जागरण",
  "Aaj Tak",
  "आज तक",
  "BBC Hindi",
  "BBC हिंदी",
  "Times of India",
  "टाइम्स ऑफ इंडिया",
  "Indian Express",
  "इंडियन एक्सप्रेस",
  "The Hindu",
  "द हिंदू",
  "Hindustan Times",
  "Jhabua Live",
  "Indore Samachar",
  "Free Press",
  "Free Press Journal",
  "Patrika",
  "पत्रिका",
  "Rajasthan Patrika",
  "News18",
  "NDTV",
  "ABP News",
  "Zee News",
  "Google News",
  "गूगल न्यूज़",
  "ANI",
  "PTI",
  "IANS",
  "scanx.trade",
  "Mshale",
  "Haribhoomi",
  "हरिभूमि",
  "Navbharat",
  "नवभारत",
];

const PUBLISHER_NAME_RE = new RegExp(
  `(?:${PUBLISHER_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
  "gi",
);

function stripPublisherAttribution(text = "") {
  let t = String(text || "").trim();
  if (!t) return "";

  // Google News style: "Headline - Publisher" / "Headline | Publisher"
  for (let i = 0; i < 4; i += 1) {
    const before = t;
    t = t.replace(/\s*[-–—|/]\s*[A-Za-z0-9\u0900-\u097F.&'’ ]{2,48}\s*$/u, (suffix) => {
      const name = suffix.replace(/^[\s\-–—|/]+/, "").trim();
      if (PUBLISHER_NAMES.some((p) => p.toLowerCase() === name.toLowerCase())) return "";
      // Title-case English outlet (e.g. "Bhopal Samachar", "Free Press Journal")
      if (/^[A-Z][A-Za-z0-9.&'’]*(?:\s+[A-Z][A-Za-z0-9.&'’]*){0,4}$/.test(name) && name.length <= 40) {
        return "";
      }
      // Hindi outlet-looking tail without sentence punctuation
      if (/^[\u0900-\u097F\s]{2,30}$/u.test(name) && !/[।?]/.test(name) && name.split(/\s+/).length <= 4) {
        return "";
      }
      return suffix;
    });
    if (t === before) break;
  }

  t = stripWireDateline(t);
  t = t.replace(PUBLISHER_NAME_RE, " ");
  t = t
    .replace(/\(\s*\)/g, "")
    .replace(/\s*[-–—|/]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return t;
}

/**
 * Remove wire datelines / source stamps such as:
 * "नईदुनिया न्यूज, अलीराजपुर।" / "Nai Dunia News, Alirajpur."
 * Also drop scraped publish/update metadata lines.
 */
function stripWireDateline(text = "") {
  let t = String(text || "").trim();
  if (!t) return "";

  // Publish / Updated metadata pasted from publisher pages
  t = t.replace(
    /Publish\s*Date\s*:\s*[A-Za-z0-9,:\s()/.-]+(?:\([A-Z]{2,5}\))?/gi,
    ""
  );
  t = t.replace(
    /Updated\s*Date\s*:\s*[A-Za-z0-9,:\s()/.-]+(?:\([A-Z]{2,5}\))?/gi,
    ""
  );
  t = t.replace(
    /(?:प्रकाशित|अपडेट(?:ेड)?|Updated|Published)\s*(?:तिथि|Date)?\s*[:：]\s*[A-Za-z0-9,:\s()/.-]{6,60}/gi,
    ""
  );

  const outletPart =
    "(?:नई\\s*दुनिया|नईदुनिया|Nai\\s*Dunia|Naidunia|अमर\\s*उजाला|Amar\\s*Ujala|दैनिक\\s*भास्कर|भास्कर|Dainik\\s*Bhaskar|Bhaskar|जागरण|Jagran|पत्रिका|Patrika|आज\\s*तक|Aaj\\s*Tak|नवभारत|Navbharat|हरिभूमि|Haribhoomi|Free\\s*Press(?:\\s*Journal)?|News18|NDTV|ABP(?:\\s*News)?|Zee\\s*News|ANI|PTI|IANS)";

  // Place names only — never absorb Devanagari danda (U+0964) into this class.
  const placePart = "[\\u0900-\\u0963\\u0965-\\u097FA-Za-z\\s\\-]{0,40}";

  // "नईदुनिया न्यूज, अलीराजपुर।" / "Nai Dunia News, Alirajpur."
  t = t.replace(
    new RegExp(
      `^(?:${outletPart})(?:\\s*(?:न्यूज|समाचार|News|Desk|डेस्क))?\\s*[,:\\-–—]?\\s*${placePart}[।.]\\s*`,
      "i"
    ),
    ""
  );

  // Mid-paragraph leftovers: "…। नईदुनिया न्यूज।"
  t = t.replace(
    new RegExp(
      `([।.]\\s*)(?:${outletPart})(?:\\s*(?:न्यूज|समाचार|News))?\\s*[,:\\-–—]?\\s*${placePart}[।.]?`,
      "gi"
    ),
    "$1"
  );

  // Generic Hindi wire openers: "… न्यूज, धार।" when outlet already stripped to "न्यूज, धार।"
  t = t.replace(
    /^(?:न्यूज|समाचार|News)\s*[,:\-–—]\s*[\u0900-\u097FA-Za-z\s\-]{2,40}[।.]\s*/i,
    ""
  );

  return t.replace(/\s{2,}/g, " ").trim();
}

/** Light desk rewrite so copy reads as आदिभूमि coverage, not a wire paste. */
function editorialTitle(rawTitle = "", lang = "hi") {
  let title = stripPublisherAttribution(stripHtml(rawTitle));
  title = title
    .replace(/^(?:breaking|ब्रेकिंग|अपडेट|update)\s*[:\-–—]\s*/i, "")
    .replace(/\s*\|\s*live\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  // Prefer portal spelling for Alirajpur
  title = title.replace(/आलीराजपुर/g, "अलीराजपुर");

  if (lang === "en") {
    title = title.replace(/\s+/g, " ").trim();
    if (title && title === title.toUpperCase() && title.length > 12) {
      title = title.replace(/\w+/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
    }
  }

  // Soft rephrase hooks (headline polish)
  const swaps =
    lang === "hi"
      ? [
          [/को लेकर हंगामा/g, "पर विवाद"],
          [/बड़ी खबर\s*:\s*/g, ""],
          [/ताज़ा अपडेट\s*:\s*/g, ""],
        ]
      : [
          [/\bexclusive\b:?\s*/gi, ""],
          [/\bbreaking\b:?\s*/gi, ""],
        ];
  for (const [re, to] of swaps) title = title.replace(re, to);

  return title.slice(0, 200).trim();
}

function stripDeskFraming(text = "") {
  return String(text || "")
    .replace(/^आदिभूमि डेस्क(?:\s*की)?\s*(?:रिपोर्ट|report)?(?:\s*के\s*अनुसार)?\s*[—\-–:,]*\s*/i, "")
    .replace(/^According to the Adibhumi Desk,?\s*/i, "")
    .replace(/^Adibhumi Desk(?:\s*report)?\s*[—\-–:,]*\s*/i, "")
    .replace(/^के अनुसार,?\s*/i, "")
    .trim();
}

function editorialSummary(rawSummary = "", title = "", lang = "hi", districtLabel = "") {
  let summary = stripPublisherAttribution(stripHtml(rawSummary));
  summary = summary.replace(/आलीराजपुर/g, "अलीराजपुर");
  summary = stripDeskFraming(summary);

  const titleNorm = title.replace(/\s+/g, " ").trim();
  if (!summary || summary === titleNorm || titleNorm.includes(summary.slice(0, 40))) {
    const place = districtLabel || (lang === "hi" ? "मालवा-निमाड़" : "Malwa–Nimad");
    summary =
      lang === "hi"
        ? `आदिभूमि डेस्क: ${place} से जुड़ी यह खबर। ${titleNorm}`
        : `Adibhumi Desk: Coverage from ${place}. ${titleNorm}`;
  } else if (lang === "hi") {
    summary = `आदिभूमि डेस्क — ${summary}`;
  } else {
    summary = `Adibhumi Desk — ${summary}`;
  }

  return stripPublisherAttribution(summary).slice(0, 360).trim();
}

function scrubPublisherFromBody(text = "") {
  return stripPublisherAttribution(String(text || ""))
    .replace(/(?:स्रोत|source|courtesy|via)\s*[:\-–—]\s*[^\n।.]{2,40}/gi, "")
    .replace(/\b(?:read more|also read|और पढ़ें|यह भी पढ़ें)\b[^\n]{0,80}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Thematic stock art — last resort only when the story page has no photo. */
const THEME_IMAGES = {
  politics:
    "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?auto=format&fit=crop&w=1600&q=80",
  agriculture:
    "https://images.unsplash.com/photo-1500937386664-56d1dfef3859?auto=format&fit=crop&w=1600&q=80",
  tribal:
    "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1600&q=80",
  weather:
    "https://images.unsplash.com/photo-1501691223387-dd0500403074?auto=format&fit=crop&w=1600&q=80",
  education:
    "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1600&q=80",
  sports:
    "https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=1600&q=80",
  business:
    "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=80",
  crime:
    "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=1600&q=80",
  health:
    "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1600&q=80",
  festival:
    "https://images.unsplash.com/photo-1604608672516-f1b2496c7c2b?auto=format&fit=crop&w=1600&q=80",
  rural:
    "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1600&q=80",
};

const THEME_IMAGE_SET = new Set(Object.values(THEME_IMAGES));
const storyImageCache = new Map(); // link -> { image, canonicalLink, fetchedAt }
const STORY_IMAGE_CACHE_MS = 6 * 60 * 60 * 1000;
const GOOGLE_NEWS_BATCH = "https://news.google.com/_/DotsSplashUi/data/batchexecute";

function themeKeyFromText(title = "", summary = "", districtId = "", topic = "") {
  const hay = `${title} ${summary} ${topic}`.toLowerCase();
  // Crime / death first — words like छात्र/आदिवासी must not steal these into education/tribal art.
  if (
    /हत्या|मौत|मृत्यु|फंद[ेा]|सुसाइड|आत्महत्या|हॉस्टल|छात्रावास|पुलिस|अपराध|गिरफ्तार|crime|arrest|murder|suicide|hanging|विवाद|झगड़ा|हमला|हड़ताल|संदिग्ध/.test(
      hay
    )
  ) {
    return "crime";
  }
  if (/कृषि|किसान|फसल|खेत|agriculture|farmer|crop|बीज|सिंचाई/.test(hay)) return "agriculture";
  if (/क्रिकेट|खेलाड़ी|मैच|\bsport|ipl|टूर्नामेंट|फुटबॉल|हॉकी/.test(hay)) return "sports";
  if (/बारिश|मौसम|वर्षा|बाढ़|सूखा|weather|rain|monsoon|तूफान/.test(hay)) return "weather";
  if (/शिक्षा|स्कूल|कॉलेज|परीक्षा|जॉब|नौकरी|education|exam|university/.test(hay)) {
    return "education";
  }
  if (/बिजनेस|व्यापार|बाजार|share|business|market|economy|महंगाई/.test(hay)) return "business";
  if (/अस्पताल|स्वास्थ्य|डॉक्टर|मरीज|health|hospital|covid|टीका/.test(hay)) return "health";
  if (/पर्व|त्योहार|दिवासा|मेला|festival|celebration|पूजा/.test(hay)) return "festival";
  if (
    /मंत्री|सांसद|विधानसभा|लोकसभा|सरकार|चुनाव|minister|\bmp\b|mla|meeting|मुलाकात|मांग|बैठक/.test(
      hay
    )
  ) {
    return "politics";
  }
  if (/आदिवासी|जनजाति|भील|tribal|वनवासी/.test(hay)) return "tribal";
  if (topic === "cricket" || topic === "sports") return "sports";
  if (topic === "business") return "business";
  if (topic === "jobs") return "education";
  return "rural";
}

function thematicImage(title, summary, districtId, topic) {
  return THEME_IMAGES[themeKeyFromText(title, summary, districtId, topic)] || THEME_IMAGES.rural;
}

function isStockImageUrl(url = "") {
  if (!url) return true;
  const lower = String(url).toLowerCase();
  if (THEME_IMAGE_SET.has(url)) return true;
  // Any Unsplash / generic stock CDN counts as a stamp — never show on आदिभूमि.
  if (/unsplash\.com|images\.unsplash|pexels\.com|pixabay\.com|placeholder\.com|via\.placeholder|loremflickr|picsum\.photos/i.test(lower)) {
    return true;
  }
  return false;
}

function isThematicImage(url) {
  return isStockImageUrl(url);
}

function isUsableImageUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const lower = String(url).toLowerCase();
  if (isStockImageUrl(lower)) return false;
  if (/\.(svg|gif)(\?|$)/i.test(lower)) return false;
  if (/logo|sprite|icon|favicon|1x1|pixel|spacer|blank\.gif|default[_-]?image|no[_-]?image/i.test(lower)) {
    return false;
  }
  // Google News placeholder / brand marks — not the story photo
  if (/googleusercontent\.com\/j6_cofbogxh|gstatic\.com\/.*logo|lh3\.googleusercontent\.com\/.*s0-w300/i.test(lower)) {
    return false;
  }
  return true;
}

function absoluteUrl(maybeUrl, baseUrl) {
  try {
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

function scoreStoryImageUrl(url = "") {
  const u = String(url).toLowerCase();
  let score = 1;
  if (/bhaskarassets|amarujala|jagranimages|indiatimes|ndtvimg|thehindu|indianexpress|aajtak|patrika|naidunia|timesofindia|toiimg|hindustantimes|wp-content\/uploads|story|article|thumb|photo|media/i.test(u)) {
    score += 8;
  }
  if (/\/\d{3,4}x\d{3,4}\//i.test(u) || /width=\d{3,}/i.test(u)) score += 2;
  if (/avatar|author|icon|logo|sprite|emoji|ads?/i.test(u)) score -= 10;
  if (/\.gif(\?|$)/i.test(u)) score -= 3;
  return score;
}

function extractImagesFromHtml(html = "", baseUrl = "") {
  const out = [];
  const push = (u) => {
    const abs = absoluteUrl(u, baseUrl);
    if (abs && isUsableImageUrl(abs)) out.push(abs);
  };
  const og = String(html).match(
    /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i
  );
  if (og?.[1]) push(og[1]);
  const og2 = String(html).match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i
  );
  if (og2?.[1]) push(og2[1]);
  const tw = String(html).match(
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i
  );
  if (tw?.[1]) push(tw[1]);
  const tw2 = String(html).match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i
  );
  if (tw2?.[1]) push(tw2[1]);
  // Common Indian news CMS image hooks
  const lazy = String(html).matchAll(
    /<(?:img|source)[^>]+(?:data-src|data-original|data-lazy-src|data-img)=["']([^"']+)["']/gi
  );
  for (const match of lazy) push(match[1]);
  const imgs = String(html).matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  for (const match of imgs) {
    push(match[1]);
    if (out.length >= 12) break;
  }
  // Prefer publisher CDN / article photos over random page chrome
  out.sort((a, b) => scoreStoryImageUrl(b) - scoreStoryImageUrl(a));
  return out;
}

/** Prefer the story's own photo from RSS — never invent a stock stamp. */
function pickImage(item, meta = {}) {
  const candidates = [];
  if (item.enclosure?.url) candidates.push(item.enclosure.url);
  if (item.enclosure?.$.url) candidates.push(item.enclosure.$.url);
  const mediaList = []
    .concat(item.mediaContent || [])
    .concat(item["media:content"] || []);
  for (const media of mediaList) {
    if (media?.$?.url) candidates.push(media.$.url);
    if (media?.url) candidates.push(media.url);
  }
  const thumbs = [].concat(item.mediaThumbnail || []).concat(item["media:thumbnail"] || []);
  for (const thumb of thumbs) {
    if (thumb?.$?.url) candidates.push(thumb.$.url);
    if (thumb?.url) candidates.push(thumb.url);
  }
  if (item.image?.url) candidates.push(item.image.url);
  if (typeof item.image === "string") candidates.push(item.image);

  const html = item.contentEncoded || item["content:encoded"] || item.content || item.description || "";
  candidates.push(...extractImagesFromHtml(html, item.link || ""));

  const ranked = candidates
    .filter((url) => isUsableImageUrl(url))
    .sort((a, b) => scoreStoryImageUrl(b) - scoreStoryImageUrl(a));
  return ranked[0] || null;
}

function resolvePublicImage(item) {
  if (isUsableImageUrl(item.image) && !isStockImageUrl(item.image)) return item.image;
  return null;
}

function isGoogleNewsUrl(url = "") {
  return /news\.google\.com\/(rss\/)?articles\//i.test(url);
}

async function resolveGoogleNewsPublisherUrl(articleUrl) {
  const articleId = String(articleUrl).split("/articles/")[1]?.split("?")[0];
  if (!articleId) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const pageRes = await fetch(articleUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "hi-IN,hi;q=0.9,en;q=0.8",
      },
    });
    const pageText = await pageRes.text();
    const signature = pageText.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const timestamp = pageText.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!signature || !timestamp) return null;

    const rpcInner = JSON.stringify([
      "garturlreq",
      [
        ["X", "X", ["X", "X"], null, null, 1, 1, "IN:hi", null, 1, null, null, null, null, null, 0, 1],
        "X",
        "X",
        1,
        [1, 1, 1],
        1,
        1,
        null,
        0,
        0,
        null,
        0,
      ],
      articleId,
      Number(timestamp),
      signature,
    ]);
    const fReq = JSON.stringify([[["Fbv4je", rpcInner, null, "generic"]]]);
    const postRes = await fetch(GOOGLE_NEWS_BATCH, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Referer: "https://news.google.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      body: new URLSearchParams({ "f.req": fReq }).toString(),
    });
    let body = await postRes.text();
    body = String(body || "").replace(/^\)\]\}'\s*/, "");
    const lines = body.split(/\r?\n/);
    if (lines[0] && /^\d+$/.test(lines[0].trim())) {
      body = lines.slice(1).join("\n");
    }
    const envelopes = JSON.parse(body.trim());
    for (const env of envelopes) {
      if (Array.isArray(env) && env[0] === "wrb.fr" && env[1] === "Fbv4je") {
        const payload = JSON.parse(env[2]);
        if (Array.isArray(payload) && payload[0] === "garturlres" && typeof payload[1] === "string") {
          return payload[1];
        }
      }
    }
  } catch (err) {
    console.warn("[adibhumi] google news resolve failed", err.message);
  } finally {
    clearTimeout(timer);
  }
  return null;
}

async function resolveCanonicalArticleUrl(link) {
  if (!link) return null;
  if (!isGoogleNewsUrl(link)) return canonicalArticleUrl(link);
  const cached = storyImageCache.get(link);
  if (cached?.canonicalLink) return cached.canonicalLink;
  const resolved = await resolveGoogleNewsPublisherUrl(link);
  return resolved ? canonicalArticleUrl(resolved) : null;
}

async function fetchStoryImageFromPage(url) {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "hi-IN,hi;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const images = extractImagesFromHtml(html, res.url);
    return images[0] || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function hydrateStoryImage(item) {
  if (!item?.link) return item;
  if (isUsableImageUrl(item.image) && !isStockImageUrl(item.image)) {
    return { ...item, imageIsFallback: false };
  }

  const cached = storyImageCache.get(item.link);
  if (cached && Date.now() - cached.fetchedAt < STORY_IMAGE_CACHE_MS && cached.image) {
    return {
      ...item,
      image: cached.image,
      canonicalLink: cached.canonicalLink || item.canonicalLink,
      imageIsFallback: false,
    };
  }

  try {
    const publisherUrl = (await resolveCanonicalArticleUrl(item.link)) || item.link;
    // Google News links with no resolved publisher cannot yield a story photo.
    if (isGoogleNewsUrl(publisherUrl)) {
      return { ...item, image: null, imageIsFallback: true };
    }
    const image = await fetchStoryImageFromPage(publisherUrl);
    if (isUsableImageUrl(image) && !isStockImageUrl(image)) {
      storyImageCache.set(item.link, {
        image,
        canonicalLink: publisherUrl,
        fetchedAt: Date.now(),
      });
      return {
        ...item,
        image,
        canonicalLink: publisherUrl,
        imageIsFallback: false,
      };
    }
  } catch (err) {
    console.warn("[adibhumi] story image hydrate failed", err.message);
  }

  return {
    ...item,
    image: null,
    imageIsFallback: true,
  };
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

/** Pull real story photos for the homepage rail (Google News RSS rarely includes images). */
async function hydrateNewsImages(items, { limit = 48, concurrency = 5 } = {}) {
  const ranked = [...items].sort((a, b) => {
    const fa = a.isTopFocus ? 0 : 1;
    const fb = b.isTopFocus ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return (b.frontScore || 0) - (a.frontScore || 0);
  });
  const need = ranked
    .filter((item) => !item.image || isThematicImage(item.image) || item.imageIsFallback)
    .slice(0, limit);
  if (!need.length) return items;

  const hydrated = await mapPool(need, concurrency, (item) => hydrateStoryImage(item));
  const byId = new Map(hydrated.map((item) => [item.id, item]));
  return items.map((item) => byId.get(item.id) || item);
}


function hasDevanagari(text = "") {
  return /[\u0900-\u097F]/.test(text);
}

function sanitizeHtml(html = "") {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<a\b[^>]*>/gi, "<span>")
    .replace(/<\/a>/gi, "</span>");
}

function makeArticleId(feedId, link) {
  return Buffer.from(`${feedId}|${link}`).toString("base64url");
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasMatches(hay, alias) {
  const a = String(alias).toLowerCase().trim();
  if (!a) return false;
  // Short Latin tokens (e.g. "dhar") need word boundaries to avoid false hits.
  if (/^[a-z0-9][a-z0-9\s-]{0,24}$/i.test(a) && !/[\u0900-\u097F]/.test(a)) {
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(a)}(?:[^a-z0-9]|$)`, "i").test(hay);
  }
  // Short Hindi tokens need letter boundaries:
  // "धार" ≠ "आधार", "रामा" ≠ "ड्रामा".
  const units = Array.from(a);
  if (units.length <= 6) {
    return new RegExp(
      `(?:^|[^\\u0900-\\u097F])${escapeRegExp(a)}(?:[^\\u0900-\\u097F]|$)`,
      "u"
    ).test(hay);
  }
  return hay.includes(a);
}

function detectDistrict(text = "") {
  const hay = String(text).toLowerCase();
  let best = null;
  let bestLen = 0;
  // Prefer longer aliases so "धार जिला" wins over accidental short hits.
  for (const district of COVERAGE.districts) {
    const aliases = [...district.aliases].sort((a, b) => String(b).length - String(a).length);
    for (const alias of aliases) {
      if (!aliasMatches(hay, alias)) continue;
      const len = String(alias).length;
      if (len > bestLen) {
        best = district;
        bestLen = len;
      }
    }
  }
  return best;
}

function isDeskTopicItem(item) {
  return Boolean(item?.topic);
}

const MALWA_NIMAD_DISTRICTS = new Set([
  ...TOP_FOCUS_DISTRICTS,
  ...OTHER_TRIBAL_DISTRICTS,
  ...WEST_MP_OTHER_DISTRICTS,
]);

function matchesTopicFilter(item, topic) {
  if (!topic || topic === "all") return true;
  const hay = `${item.title || ""} ${item.summary || ""} ${item.category || ""}`;

  if (topic === "breaking") {
    // Focus-district / breaking only — exclude national topic desks.
    if (isDeskTopicItem(item)) return false;
    return Boolean(item.isBreaking || item.isTopFocus || TOP_FOCUS_DISTRICTS.has(item.districtId));
  }

  if (topic === "local" || topic === "tribal") {
    if (isDeskTopicItem(item)) return false;
    return Boolean(
      item.isTopFocus ||
        TOP_FOCUS_DISTRICTS.has(item.districtId) ||
        OTHER_TRIBAL_DISTRICTS.has(item.districtId)
    );
  }

  if (topic === "malwa" || topic === "region") {
    // West MP geography only — not national desks / false district tags.
    if (isDeskTopicItem(item)) return false;
    const titleHay = String(item.title || "");
    const placeInTitle =
      /मालवा|निमाड़|निमाड|malwa|nimad|nimar|झाबुआ|अलीराजपुर|धार|बड़वानी|बडवानी|खरगोन|खंडवा|बुरहानपुर|इंदौर|उज्जैन|देवास|रतलाम|मंदसौर|नीमच|शाजापुर|आगर/i.test(
        titleHay
      );
    // Bollywood / film wires without a place name in the headline are not regional.
    if (
      !placeInTitle &&
      /फिल्म|बॉलीवुड|ड्रामा|सनी देओल|bollywood|box office|cast fees/i.test(hay)
    ) {
      return false;
    }
    if (item.districtId && MALWA_NIMAD_DISTRICTS.has(item.districtId)) return true;
    if (
      (item.divisionId === "indore-div" || item.divisionId === "ujjain-div") &&
      (placeInTitle || (item.regionScore || 0) >= 20)
    ) {
      return true;
    }
    return /मालवा|निमाड़|निमाड|malwa|nimad|nimar/i.test(titleHay);
  }

  if (topic === "sports" || topic === "cricket") {
    if (item.topic === "cricket" || item.topic === "sports") return true;
    if (isDeskTopicItem(item)) return false;
    return /क्रिकेट|खिलाड़ी|sport|ipl|मैच|टी.?20|फुटबॉल|हॉकी|बैडमिंटन|टेनिस|bcci|विश्व कप/i.test(
      hay
    );
  }

  if (topic === "business") {
    return item.topic === "business";
  }

  if (topic === "lifestyle") {
    return item.topic === "lifestyle" || item.topic === "entertainment";
  }

  if (topic === "jobs") {
    return item.topic === "jobs";
  }

  if (topic === "entertainment") {
    return item.topic === "entertainment";
  }

  if (topic === "opinion") {
    if (item.topic === "opinion") return true;
    if (isDeskTopicItem(item) && item.topic !== "world") return false;
    return /ओपिनियन|opinion|संपादकीय|मत|कॉलम|editorial/i.test(hay);
  }

  if (topic === "world") {
    return item.topic === "world" || Boolean(item.isIndia && !item.districtId);
  }

  return item.topic === topic;
}

function detectDivision(text = "", district = null) {
  if (district?.division) {
    return COVERAGE.divisions.find((d) => d.id === district.division) || null;
  }
  const hay = String(text).toLowerCase();
  for (const division of COVERAGE.divisions) {
    for (const alias of division.aliases) {
      if (hay.includes(String(alias).toLowerCase())) return division;
    }
  }
  return null;
}

function hasTribalKeyword(text = "") {
  const hay = String(text).toLowerCase();
  return TRIBAL_KEYWORDS.some((alias) => hay.includes(String(alias).toLowerCase()));
}

function regionScore(item, feed) {
  const hay = `${item.title || ""} ${item.summary || ""} ${item.link || ""}`.toLowerCase();
  let score = 0;
  const district = detectDistrict(hay);
  const division = detectDivision(hay, district);
  const tribalHit = hasTribalKeyword(hay);

  if (district) {
    if (TOP_FOCUS_DISTRICTS.has(district.id)) score += 70;
    else if (OTHER_TRIBAL_DISTRICTS.has(district.id)) score += 40;
    else if (WEST_MP_OTHER_DISTRICTS.has(district.id)) score += 22;
    else score += 14;
  }
  if (division) score += 6;
  if (tribalHit) score += 18;

  for (const alias of REGION_EXTRA_ALIASES) {
    if (hay.includes(String(alias).toLowerCase())) score += 3;
  }
  if (feed.region === "mp") score += 8; // statewide MP news always relevant
  return { score, district, division, tribalHit };
}

function indiaScore(text = "") {
  const hay = String(text).toLowerCase();
  let score = 0;
  for (const alias of INDIA_ALIASES) {
    if (hay.includes(String(alias).toLowerCase())) score += 5;
  }
  return Math.min(score, 25);
}

function isBreakingStory(text = "") {
  const hay = String(text).toLowerCase();
  return BREAKING_ALIASES.some((alias) => hay.includes(String(alias).toLowerCase()));
}

function freshnessScore(publishedAt) {
  if (!publishedAt) return 0;
  const ageMs = Date.now() - Date.parse(publishedAt);
  if (!Number.isFinite(ageMs)) return 0;
  // Future-dated feeds: treat as brand-new, not "old".
  if (ageMs < 0) return 120;
  const ageHours = ageMs / (60 * 60 * 1000);
  if (ageHours <= 1) return 120;
  if (ageHours <= 3) return 100;
  if (ageHours <= 6) return 80;
  if (ageHours <= 12) return 55;
  if (ageHours <= 24) return 35;
  if (ageHours <= 48) return 18;
  if (ageHours <= 72) return 8;
  return 1;
}

/**
 * Homepage priority tiers for आदिभूमि:
 * 1 = Alirajpur / Jhabua / Dhar / Barwani
 * 2 = other West MP tribal & regional
 * 3 = Madhya Pradesh statewide
 * 4 = India
 * 5 = other
 */
function storyTier(item) {
  if (item.districtId && TOP_FOCUS_DISTRICTS.has(item.districtId)) return 1;
  if (item.districtId && OTHER_TRIBAL_DISTRICTS.has(item.districtId)) return 2;
  if (item.isTribal) return 2; // tribal keywords without the top-four districts
  if (item.districtId && WEST_MP_OTHER_DISTRICTS.has(item.districtId)) return 2;
  if (item.divisionId && (item.regionScore || 0) >= 12) return 2;
  if (item.isMpStatewide || ((item.regionScore || 0) >= 8 && !item.isIndia)) return 3;
  if (item.isIndia) return 4;
  return 5;
}

function districtRank(item) {
  if (!item.districtId) return 99;
  return TOP_FOCUS_ORDER[item.districtId] ?? 50;
}

function frontScore(item) {
  const tier = item.storyTier || storyTier(item);
  // Recency dominates homepage order; district tier is a light boost only.
  const tierBoost = { 1: 24, 2: 14, 3: 8, 4: 4, 5: 0 }[tier] || 0;
  const focusBoost = tier === 1 ? (4 - Math.min(districtRank(item), 3)) * 2 : 0;
  const breaking = item.isBreaking ? 30 : 0;
  const india = tier >= 4 ? item.indiaScore || 0 : Math.min(item.indiaScore || 0, 6);
  const region = Math.min(item.regionScore || 0, 40);
  const fresh = freshnessScore(item.publishedAt);
  return fresh * 2.4 + tierBoost + focusBoost + region * 0.35 + india * 0.4 + breaking;
}

function toPublicItem(item, lang) {
  const districtMeta = item.districtId
    ? COVERAGE.districts.find((d) => d.id === item.districtId)
    : null;
  const divisionMeta = item.divisionId
    ? COVERAGE.divisions.find((d) => d.id === item.divisionId)
    : districtMeta
      ? COVERAGE.divisions.find((d) => d.id === districtMeta.division)
      : null;

  return {
    id: item.id,
    title: editorialTitle(item.title, lang),
    summary: editorialSummary(item.summary, item.title, lang, districtMeta ? (lang === "en" ? districtMeta.en : districtMeta.hi) : ""),
    image: isUsableImageUrl(item.image) && !isStockImageUrl(item.image) ? item.image : null,
    imageIsFallback: Boolean(
      !item.image || item.imageIsFallback || isStockImageUrl(item.image)
    ),
    publishedAt: item.publishedAt,
    lang: item.lang,
    category: lang === "en" ? item.categoryEn : item.category,
    portal: "आदिभूमि",
    source: lang === "en" ? "Adibhumi" : "आदिभूमि",
    region: "mp-west",
    district: item.districtId || null,
    districtLabel: districtMeta ? (lang === "en" ? districtMeta.en : districtMeta.hi) : null,
    division: divisionMeta?.id || item.divisionId || null,
    divisionLabel: divisionMeta ? (lang === "en" ? divisionMeta.en : divisionMeta.hi) : null,
    regionScore: item.regionScore || 0,
    indiaScore: item.indiaScore || 0,
    frontScore: item.frontScore || frontScore(item),
    storyTier: item.storyTier || storyTier(item),
    isBreaking: Boolean(item.isBreaking),
    isIndia: Boolean(item.isIndia),
    isMpStatewide: Boolean(item.isMpStatewide),
    isTribal: Boolean(item.isTribal),
    isTopFocus: Boolean(item.isTopFocus),
    topic: item.topic || null,
  };
}

function resolvePublishedAt(item) {
  const candidates = [item.isoDate, item.pubDate, item.published, item.updated];
  const now = Date.now();
  for (const raw of candidates) {
    if (!raw) continue;
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) continue;
    // Clamp wild future timestamps from some feeds.
    const clamped = ms > now + 2 * 60 * 60 * 1000 ? now : ms;
    return new Date(clamped).toISOString();
  }
  return null;
}

function itemTimeMs(item) {
  const ms = Date.parse(item?.publishedAt || 0);
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeItem(item, feed) {
  const rawTitle = stripHtml(item.title || "");
  const link = item.link || item.guid || "";
  if (!rawTitle || !link || !/^https?:/i.test(link)) return null;

  const publishedAt = resolvePublishedAt(item);

  const rawHtml = item.contentEncoded || item["content:encoded"] || item.content || "";
  const rawSummary = stripHtml(item.contentSnippet || item.summary || rawHtml || "").slice(0, 420);
  const bodyTextRaw = stripHtml(rawHtml || rawSummary).slice(0, 20000);
  const bodyHtmlRaw = sanitizeHtml(rawHtml).slice(0, 40000);

  // Detect district from original text (before publisher strip / rewrite)
  if (!feed.allowMixedLang) {
    if (feed.lang === "hi" && !hasDevanagari(rawTitle)) return null;
    if (feed.lang === "en" && hasDevanagari(rawTitle)) return null;
  }

  const draft = {
    title: rawTitle,
    summary: rawSummary,
    link,
  };
  let { score, district, division, tribalHit } = regionScore(draft, feed);
  if (feed.forceDistrictId) {
    const forced = COVERAGE.districts.find((d) => d.id === feed.forceDistrictId);
    const hay = `${rawTitle} ${rawSummary} ${link}`.toLowerCase();
    const mentionsForced =
      Boolean(forced) &&
      (district?.id === forced.id ||
        forced.aliases.some((alias) => aliasMatches(hay, alias)));
    if (forced && mentionsForced) {
      district = forced;
      division = detectDivision("", forced);
      if (TOP_FOCUS_DISTRICTS.has(forced.id)) score = Math.max(score, 70);
      else score = Math.max(score, 40);
    } else if (feed.requireDistrictMention !== false) {
      // District Google feeds can return noisy neighbours — drop non-matches.
      return null;
    }
  }
  const india = indiaScore(`${rawTitle} ${rawSummary} ${link}`);
  const breaking = isBreakingStory(`${rawTitle} ${rawSummary}`);
  const isTribal =
    Boolean(tribalHit) ||
    Boolean(district && (TOP_FOCUS_DISTRICTS.has(district.id) || OTHER_TRIBAL_DISTRICTS.has(district.id)));
  const isTopFocus = Boolean(district && TOP_FOCUS_DISTRICTS.has(district.id));

  // National feeds: keep if West MP / region OR India national relevance.
  if (feed.requireRegionHit && score < 6 && india < 6) return null;

  let category = feed.category;
  let categoryEn = feed.categoryEn || feed.category;
  if (!feed.keepCategory) {
    if (district) {
      category = district.hi;
      categoryEn = district.en;
    } else if (isTribal) {
      category = "आदिवासी";
      categoryEn = "Tribal";
    } else if (division) {
      category = division.hi;
      categoryEn = division.en;
    } else if (feed.region === "mp") {
      category = "मध्य प्रदेश";
      categoryEn = "Madhya Pradesh";
    } else if (india >= 6) {
      category = "देश";
      categoryEn = "India";
    }
  }

  const title = editorialTitle(rawTitle, feed.lang);
  if (!title) return null;
  const districtLabel = district ? (feed.lang === "en" ? district.en : district.hi) : "";
  const summary = editorialSummary(rawSummary, title, feed.lang, districtLabel);
  const bodyText = scrubPublisherFromBody(bodyTextRaw) || summary;
  const bodyHtml = sanitizeHtml(String(bodyHtmlRaw || "").replace(PUBLISHER_NAME_RE, " "));

  const normalized = {
    id: makeArticleId(feed.id, link),
    title,
    summary,
    bodyText,
    bodyHtml,
    link,
    image: pickImage(item, {
      title,
      summary,
      districtId: district?.id,
      topic: feed.topic || null,
    }),
    publishedAt,
    source: "आदिभूमि",
    sourceEn: "Adibhumi",
    sourceId: feed.id,
    lang: feed.lang,
    category,
    categoryEn,
    topic: feed.topic || null,
    regionScore: score,
    indiaScore: india,
    isBreaking: breaking,
    isIndia: india >= 6 && !district && !isTribal,
    isTribal,
    isTopFocus,
    districtId: district?.id || null,
    divisionId: division?.id || district?.division || null,
    isMpStatewide: feed.region === "mp" && !district && !isTribal,
  };
  normalized.storyTier = storyTier(normalized);
  normalized.frontScore = frontScore(normalized);
  normalized.fullFetched = bodyText.length >= MIN_FULL_BODY_CHARS;
  normalized.imageIsFallback = !normalized.image || isStockImageUrl(normalized.image);
  return normalized;
}

async function fetchFeed(feed) {
  const parsed = await parser.parseURL(feed.url);
  const limit = feed.limit || 12;
  const items = (parsed.items || [])
    .slice(0, limit)
    .map((item) => normalizeItem(item, feed))
    .filter(Boolean);
  return { feed, items };
}

function canonicalArticleUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    [
      "at_medium",
      "at_campaign",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ocid",
      "ns_source",
      "ns_mchannel",
      "ns_campaign",
    ].forEach((key) => u.searchParams.delete(key));
    return u.toString();
  } catch {
    return rawUrl;
  }
}

function isNoiseParagraph(text, title = "") {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t.length < 45) return true;
  if (title && t === title) return true;
  if (title && title.includes(t) && t.length <= title.length) return true;
  if (/^(getty images|reuters|afp|ani|pti|विज्ञापन|advertisement|share|follow|subscribe)/i.test(t)) {
    return true;
  }
  if (PUBLISHER_NAMES.some((p) => t.toLowerCase().includes(p.toLowerCase()) && t.length < 120)) {
    return true;
  }
  if (/(?:स्रोत|source|courtesy|via)\s*[:\-–—]/i.test(t) && t.length < 140) return true;
  if (/^\d{1,2}\s+\S+\s+\d{4}/.test(t) && t.length < 90) return true;
  if (/IST\s*$/i.test(t) && t.length < 100) return true;
  if (/^(अपडेटेड|updated|published|last updated)/i.test(t) && t.length < 110) return true;
  if (/मिनट पहले|minutes ago|hours ago|घंटे पहले/i.test(t) && t.length < 90) return true;
  if (/^https?:\/\//i.test(t)) return true;
  // Publisher widgets / video promo lines that often become the fake "lead"
  if (/video\s*में\s*देखने|ऊपर\s*क्लिक|click\s*(above|here)|चुनिंदा\s*बड़ी\s*खबरों/i.test(t)) {
    return true;
  }
  if (/दिनभर\s*(की|में).*VIDEO|watch\s*.*video\s*click/i.test(t)) return true;
  return false;
}

function paragraphsFromHtml(html, title = "") {
  const dom = new JSDOM(`<div id="root">${html || ""}</div>`);
  const root = dom.window.document.getElementById("root");
  const blocks = [];

  root.querySelectorAll("h1, h2, h3").forEach((el) => el.remove());
  root.querySelectorAll("figure, figcaption, aside, nav, button, script, style").forEach((el) =>
    el.remove()
  );

  root.querySelectorAll("p, li").forEach((node) => {
    const text = stripHtml(node.textContent || "");
    if (isNoiseParagraph(text, title)) return;
    if (blocks.some((b) => b === text || (b.includes(text) && text.length > 80))) return;
    blocks.push(text);
  });

  if (blocks.length < 2) {
    stripHtml(root.textContent || "")
      .replace(/\s+/g, " ")
      .split(/(?<=[।.!?])\s+/)
      .map((p) => p.trim())
      .filter((p) => !isNoiseParagraph(p, title))
      .forEach((p) => {
        if (!blocks.includes(p)) blocks.push(p);
      });
  }

  return blocks.slice(0, 40);
}

function buildCleanArticle(title, rawHtml, rawText, lang = "hi") {
  let paras = paragraphsFromHtml(rawHtml || "", title);
  if (paras.length < 2 && rawText) {
    paras = String(rawText)
      .replace(/\s+/g, " ")
      .split(/(?<=[।.!?])\s+/)
      .map((p) => p.trim())
      .filter((p) => !isNoiseParagraph(p, title))
      .slice(0, 40);
  }

  paras = paras
    .map((p) => scrubPublisherFromBody(p))
    .map((p) => stripDeskFraming(p))
    .map((p) => p.replace(/आलीराजपुर/g, "अलीराजपुर"))
    .filter((p) => p && !isNoiseParagraph(p, title));

  if (paras[0] && title) {
    const lead = paras[0];
    if (lead === title || (lead.includes(title.slice(0, Math.min(20, title.length))) && lead.length < title.length + 40)) {
      paras = paras.slice(1);
    }
  }

  // Body stays clean news copy — byline already says आदिभूमि डेस्क.
  // Framing is applied once in the summary/dek only.
  const escape = (p) => p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const bodyHtml = paras.map((p) => `<p>${escape(p)}</p>`).join("\n");
  const bodyText = paras.join("\n\n");
  const summary = editorialSummary(paras[0] || "", title, lang);

  return { bodyHtml, bodyText, summary, paragraphCount: paras.length };
}

async function fetchFullArticleFromUrl(url) {
  const cleanUrl = canonicalArticleUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch(cleanUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "hi-IN,hi;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const dom = new JSDOM(html, { url: cleanUrl });
    const doc = dom.window.document;
    const article = new Readability(doc).parse();
    if (!article) return null;

    const title = editorialTitle(article.title || "", "hi");
    const cleaned = buildCleanArticle(title, article.content || "", article.textContent || "", "hi");
    if (cleaned.paragraphCount < 1 || cleaned.bodyText.length < 180) return null;

    let image = null;
    const og = doc.querySelector('meta[property="og:image"]');
    if (og?.content && isUsableImageUrl(og.content)) image = og.content;
    if (!image) {
      const img = doc.querySelector("article img[src], .story-image img[src], main img[src]");
      if (img?.src && isUsableImageUrl(img.src)) image = img.src;
    }

    return {
      title,
      image,
      bodyHtml: cleaned.bodyHtml,
      bodyText: cleaned.bodyText,
      summary: cleaned.summary,
    };
  } finally {
    clearTimeout(timer);
  }
}

const EPAPER_DIR = path.join(__dirname, "data", "epaper");

function ensureEpaperDir() {
  fs.mkdirSync(EPAPER_DIR, { recursive: true });
}

function istDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function istParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

function formatIstLong(dayKey, lang = "hi") {
  const [y, m, d] = dayKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 6, 30));
  return new Intl.DateTimeFormat(lang === "en" ? "en-IN" : "hi-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(utc);
}

function epaperFilePath(dayKey) {
  return path.join(EPAPER_DIR, `${dayKey}.json`);
}

function loadDailyArchive(dayKey) {
  ensureEpaperDir();
  const file = epaperFilePath(dayKey);
  if (!fs.existsSync(file)) {
    return {
      dayKey,
      timezone: "Asia/Kolkata",
      cutoff: "23:59",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finalized: false,
      items: [],
    };
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {
      dayKey,
      timezone: "Asia/Kolkata",
      cutoff: "23:59",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finalized: false,
      items: [],
    };
  }
}

function saveDailyArchive(archive) {
  ensureEpaperDir();
  archive.updatedAt = new Date().toISOString();
  fs.writeFileSync(epaperFilePath(archive.dayKey), JSON.stringify(archive, null, 2), "utf8");
}

function isEditionFinalized(dayKey, now = new Date()) {
  const today = istDayKey(now);
  if (dayKey < today) return true;
  if (dayKey > today) return false;
  const p = istParts(now);
  return p.hour > 23 || (p.hour === 23 && p.minute >= 59);
}

function toArchiveItem(item) {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    image: item.image || null,
    publishedAt: item.publishedAt,
    lang: item.lang,
    category: item.category,
    categoryEn: item.categoryEn,
    districtId: item.districtId || null,
    divisionId: item.divisionId || null,
    regionScore: item.regionScore || 0,
    isMpStatewide: Boolean(item.isMpStatewide),
    gatheredAt: new Date().toISOString(),
  };
}

function archiveDailyNews(items) {
  const dayKey = istDayKey();
  if (isEditionFinalized(dayKey)) {
    // After 23:59 IST, stop mutating today's edition.
    const archive = loadDailyArchive(dayKey);
    if (!archive.finalized) {
      archive.finalized = true;
      archive.finalizedAt = new Date().toISOString();
      saveDailyArchive(archive);
    }
    return archive;
  }

  const archive = loadDailyArchive(dayKey);
  const map = new Map(archive.items.map((entry) => [entry.id, entry]));
  items.forEach((item) => {
    const prev = map.get(item.id);
    const next = toArchiveItem(item);
    if (prev) {
      map.set(item.id, {
        ...prev,
        ...next,
        gatheredAt: prev.gatheredAt || next.gatheredAt,
      });
    } else {
      map.set(item.id, next);
    }
  });

  archive.items = Array.from(map.values()).sort((a, b) => {
    if ((b.regionScore || 0) !== (a.regionScore || 0)) {
      return (b.regionScore || 0) - (a.regionScore || 0);
    }
    return Date.parse(b.publishedAt || b.gatheredAt || 0) - Date.parse(a.publishedAt || a.gatheredAt || 0);
  });
  archive.finalized = false;
  saveDailyArchive(archive);
  return archive;
}

function listEpaperDates() {
  ensureEpaperDir();
  return fs
    .readdirSync(EPAPER_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => name.replace(/\.json$/, ""))
    .sort()
    .reverse();
}

function buildEpaperEdition(dayKey, lang = "hi") {
  const archive = loadDailyArchive(dayKey);
  const finalized = isEditionFinalized(dayKey) || Boolean(archive.finalized);
  if (finalized && !archive.finalized) {
    archive.finalized = true;
    archive.finalizedAt = archive.finalizedAt || new Date().toISOString();
    saveDailyArchive(archive);
  }

  const items = (archive.items || [])
    .filter((item) => item.lang === lang)
    .map((item) => {
      const districtMeta = item.districtId
        ? COVERAGE.districts.find((d) => d.id === item.districtId)
        : null;
      const divisionMeta = item.divisionId
        ? COVERAGE.divisions.find((d) => d.id === item.divisionId)
        : null;
      return {
        id: item.id,
        title: item.title,
        summary: item.summary,
        image: item.image,
        publishedAt: item.publishedAt,
        gatheredAt: item.gatheredAt,
        category: lang === "en" ? item.categoryEn || item.category : item.category,
        district: item.districtId || null,
        districtLabel: districtMeta ? (lang === "en" ? districtMeta.en : districtMeta.hi) : null,
        division: item.divisionId || null,
        divisionLabel: divisionMeta ? (lang === "en" ? divisionMeta.en : divisionMeta.hi) : null,
        regionScore: item.regionScore || 0,
        isMpStatewide: Boolean(item.isMpStatewide),
      };
    });

  const focusIds = ["alirajpur", "jhabua", "dhar", "barwani"];
  const focus = items.filter((i) => focusIds.includes(i.district));
  const tribal = items.filter(
    (i) =>
      !focusIds.includes(i.district) &&
      ["khargone", "khandwa", "burhanpur", "ratlam", "mandsaur", "neemuch"].includes(i.district)
  );
  const indoreDiv = items.filter((i) => i.division === "indore-div" || i.district === "indore");
  const ujjainDiv = items.filter(
    (i) => i.division === "ujjain-div" || ["ujjain", "dewas"].includes(i.district)
  );
  const mp = items.filter((i) => i.isMpStatewide || (!i.district && !i.division));
  const top = [...focus, ...items.filter((i) => !focus.some((f) => f.id === i.id))].slice(0, 12);
  const used = new Set([...top, ...focus, ...tribal, ...indoreDiv, ...ujjainDiv, ...mp].map((i) => i.id));
  const more = items.filter((i) => !used.has(i.id));

  const pages = [
    {
      id: "front",
      number: 1,
      label: lang === "en" ? "Front page" : "मुख्य पृष्ठ",
      kicker: lang === "en" ? "Top headlines" : "बड़ी खबरें",
      items: top,
    },
    {
      id: "tribal",
      number: 2,
      label: lang === "en" ? "Tribal districts" : "आदिवासी ज़िले",
      kicker: lang === "en" ? "Alirajpur · Jhabua · Dhar · Barwani" : "अलीराजपुर · झाबुआ · धार · बड़वानी",
      items: [...focus, ...tribal].slice(0, 20),
    },
    {
      id: "region",
      number: 3,
      label: lang === "en" ? "Malwa–Nimad" : "मालवा-निमाड़",
      kicker: lang === "en" ? "Indore & Ujjain divisions" : "इंदौर व उज्जैन संभाग",
      items: [...indoreDiv, ...ujjainDiv]
        .filter((i, idx, arr) => arr.findIndex((x) => x.id === i.id) === idx)
        .slice(0, 20),
    },
    {
      id: "mp",
      number: 4,
      label: lang === "en" ? "Madhya Pradesh" : "मध्य प्रदेश",
      kicker: lang === "en" ? "Statewide desk" : "राज्य डेस्क",
      items: mp.slice(0, 20),
    },
    {
      id: "more",
      number: 5,
      label: lang === "en" ? "More news" : "और खबरें",
      kicker: lang === "en" ? "Also in today's edition" : "आज के संस्करण में और",
      items: more.slice(0, 24),
    },
  ].filter((page) => page.items.length > 0)
    .map((page, index) => ({ ...page, number: index + 1 }));

  return {
    brand: "आदिभूमि",
    title: lang === "en" ? "Adibhumi E-Paper" : "आदिभूमि ई-पेपर",
    editionName: lang === "en" ? "West MP Morning Edition" : "पश्चिम मप्र संस्करण",
    focus: lang === "en" ? COVERAGE.labelEn : COVERAGE.labelHi,
    dayKey,
    dateLabel: formatIstLong(dayKey, lang),
    timezone: "Asia/Kolkata",
    cutoff: "23:59",
    status: finalized ? "final" : "live",
    statusLabel:
      lang === "en"
        ? finalized
          ? "Final edition (locked at 11:59 PM)"
          : "Live edition — collecting until 11:59 PM"
        : finalized
          ? "अंतिम संस्करण (रात 11:59 पर लॉक)"
          : "लाइव संस्करण — रात 11:59 तक संग्रह",
    count: items.length,
    updatedAt: archive.updatedAt,
    finalizedAt: archive.finalizedAt || null,
    pages,
    // Keep sections for older clients
    sections: pages.map((page) => ({
      id: page.id,
      title: page.label,
      items: page.items,
    })),
  };
}

async function enrichArticle(item, { force = false } = {}) {
  if (!item?.link) return item;

  const cached = fullArticleCache.get(item.id);
  if (!force && cached && Date.now() - cached.fetchedAt < FULL_ARTICLE_CACHE_MS) {
    return {
      ...item,
      bodyHtml: cached.bodyHtml,
      bodyText: cached.bodyText,
      summary: cached.summary || item.summary,
      image:
        (isUsableImageUrl(item.image) && !isThematicImage(item.image) && item.image) ||
        cached.image ||
        resolvePublicImage(item),
      imageIsFallback: false,
      fullFetched: true,
    };
  }

  try {
    const publisherUrl =
      item.canonicalLink ||
      (await resolveCanonicalArticleUrl(item.link)) ||
      item.link;
    const full = await fetchFullArticleFromUrl(publisherUrl);
    if (!full) {
      const cleaned = buildCleanArticle(
        item.title,
        item.bodyHtml,
        item.bodyText || item.summary,
        item.lang || "hi"
      );
      const hydrated = await hydrateStoryImage(item);
      return {
        ...item,
        ...hydrated,
        bodyHtml: cleaned.bodyHtml || item.bodyHtml,
        bodyText: cleaned.bodyText || item.bodyText,
        summary: editorialSummary(cleaned.summary || item.summary, item.title, item.lang || "hi"),
        fullFetched: cleaned.bodyText.length >= MIN_FULL_BODY_CHARS,
      };
    }

    const storyImage =
      (isUsableImageUrl(full.image) && full.image) ||
      (isUsableImageUrl(item.image) && !isThematicImage(item.image) && item.image) ||
      (await fetchStoryImageFromPage(publisherUrl)) ||
      resolvePublicImage({ ...item, summary: full.summary || item.summary });

    const enriched = {
      bodyHtml: full.bodyHtml,
      bodyText: full.bodyText,
      summary: editorialSummary(full.summary || item.summary, item.title, item.lang || "hi"),
      image: storyImage,
      fetchedAt: Date.now(),
    };
    fullArticleCache.set(item.id, enriched);

    const idx = cache.items.findIndex((entry) => entry.id === item.id);
    if (idx >= 0) {
      cache.items[idx] = {
        ...cache.items[idx],
        bodyHtml: enriched.bodyHtml,
        bodyText: enriched.bodyText,
        summary: enriched.summary,
        image: enriched.image,
        canonicalLink: publisherUrl,
        imageIsFallback: isThematicImage(enriched.image),
        fullFetched: true,
      };
    }

    return {
      ...item,
      title: editorialTitle(item.title, item.lang || "hi"),
      bodyHtml: enriched.bodyHtml,
      bodyText: enriched.bodyText,
      summary: enriched.summary,
      image: enriched.image,
      canonicalLink: publisherUrl,
      imageIsFallback: isThematicImage(enriched.image),
      fullFetched: true,
    };
  } catch (err) {
    console.warn(`[adibhumi] full article fetch failed: ${item.sourceId}`, err.message);
    const cleaned = buildCleanArticle(
      item.title,
      item.bodyHtml,
      item.bodyText || item.summary,
      item.lang || "hi"
    );
    const hydrated = await hydrateStoryImage(item);
    return {
      ...item,
      ...hydrated,
      bodyHtml: cleaned.bodyHtml || item.bodyHtml,
      bodyText: cleaned.bodyText || item.bodyText,
      summary: editorialSummary(cleaned.summary || item.summary, item.title, item.lang || "hi"),
    };
  }
}

function sortNewsItems(items) {
  return [...items].sort((a, b) => {
    // Focus districts first as a pool, then strict newest-first.
    const focusA = a.districtId && TOP_FOCUS_DISTRICTS.has(a.districtId) ? 0 : 1;
    const focusB = b.districtId && TOP_FOCUS_DISTRICTS.has(b.districtId) ? 0 : 1;
    if (focusA !== focusB) return focusA - focusB;

    const tb = itemTimeMs(b);
    const ta = itemTimeMs(a);
    if (tb !== ta) return tb - ta;

    if (Boolean(b.isBreaking) !== Boolean(a.isBreaking)) return a.isBreaking ? -1 : 1;
    return (b.frontScore || 0) - (a.frontScore || 0);
  });
}

async function refreshNews(force = false) {
  const now = Date.now();
  if (!force && cache.items.length && now < cache.expiresAt) {
    return cache;
  }

  const results = await Promise.allSettled(FEEDS.map((feed) => fetchFeed(feed)));
  const items = [];
  const sources = [];
  const errors = [];

  results.forEach((result, index) => {
    const feed = FEEDS[index];
    if (result.status === "fulfilled") {
      sources.push({
        id: feed.id,
        name: feed.name,
        nameEn: feed.nameEn,
        count: result.value.items.length,
        ok: true,
      });
      items.push(...result.value.items);
    } else {
      sources.push({
        id: feed.id,
        name: feed.name,
        nameEn: feed.nameEn,
        count: 0,
        ok: false,
      });
      errors.push({
        source: feed.name,
        message: result.reason?.message || "Fetch failed",
      });
      console.warn(`[adibhumi] feed failed: ${feed.id}`, result.reason?.message);
    }
  });

  const seen = new Set();
  const deduped = sortNewsItems(
    items.filter((item) => {
      const key = item.title.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  );

  let withImages = deduped;
  try {
    // Block until focus/top stories have real publisher photos (no stock stamps).
    withImages = await hydrateNewsImages(deduped, { limit: 40, concurrency: 8 });
    withImages = sortNewsItems(withImages);
  } catch (err) {
    console.warn("[adibhumi] image hydrate failed", err.message);
  }

  cache = {
    fetchedAt: now,
    expiresAt: now + CACHE_MS,
    nextRefreshMs: CACHE_MS,
    items: withImages,
    sources,
    errors,
  };

  // Fill more photos in the background.
  hydrateNewsImages(withImages, { limit: 80, concurrency: 5 })
    .then((more) => {
      if (cache.fetchedAt !== now) return;
      cache.items = sortNewsItems(more);
      try {
        archiveDailyNews(cache.items);
      } catch {
        /* ignore */
      }
    })
    .catch((err) => console.warn("[adibhumi] background image hydrate failed", err.message));

  try {
    archiveDailyNews(withImages);
  } catch (err) {
    console.warn("[adibhumi] e-paper archive failed", err.message);
  }

  const realPhotos = withImages.filter((i) => i.image && !isStockImageUrl(i.image)).length;
  console.log(
    `[adibhumi] refreshed ${withImages.length} stories (${realPhotos} with story photos) from ${sources.filter((s) => s.ok).length}/${FEEDS.length} sources`
  );
  return cache;
}

app.get("/api/epaper", async (req, res) => {
  try {
    const lang = req.query.lang === "en" ? "en" : "hi";
    const dayKey = String(req.query.date || istDayKey()).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      return res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD" });
    }

    // Keep today's archive fresh before generating.
    if (dayKey === istDayKey()) {
      const data = await refreshNews(false);
      archiveDailyNews(data.items);
    }

    const edition = buildEpaperEdition(dayKey, lang);
    res.set("Cache-Control", "public, max-age=60");
    res.json(edition);
  } catch (err) {
    console.error("[adibhumi] /api/epaper error", err);
    res.status(500).json({
      error: "ई-पेपर तैयार नहीं हो सका",
      message: err.message,
    });
  }
});

app.get("/api/epaper/dates", (_req, res) => {
  const today = istDayKey();
  const dates = listEpaperDates();
  if (!dates.includes(today)) dates.unshift(today);
  res.json({
    brand: "आदिभूमि",
    timezone: "Asia/Kolkata",
    cutoff: "23:59",
    today,
    dates: Array.from(new Set(dates)).slice(0, 30),
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    brand: "आदिभूमि",
    focus: COVERAGE.labelHi,
    cacheExpiresAt: cache.expiresAt || null,
  });
});

app.get("/api/region", (_req, res) => {
  res.json({
    brand: "आदिभूमि",
    focus: COVERAGE,
  });
});

app.get("/api/news", async (req, res) => {
  try {
    const force = req.query.refresh === "1";
    const lang = req.query.lang === "en" ? "en" : "hi";
    const district = String(req.query.district || "").toLowerCase();
    const division = String(req.query.division || "").toLowerCase();
    const topic = String(req.query.topic || "").toLowerCase();
    const data = await refreshNews(force);
    let filtered = data.items.filter((item) => item.lang === lang);

    if (topic && topic !== "all") {
      filtered = filtered.filter((item) => matchesTopicFilter(item, topic));
    } else if (district === "mp" || division === "mp") {
      // Statewide Madhya Pradesh stories (plus any tagged district in MP feeds).
      filtered = filtered.filter(
        (item) => item.isMpStatewide || item.districtId || (item.regionScore || 0) >= 8
      );
    } else if (division === "indore-div" || division === "ujjain-div") {
      const ids = COVERAGE.divisions.find((d) => d.id === division)?.districts || [];
      filtered = filtered.filter(
        (item) => item.divisionId === division || ids.includes(item.districtId)
      );
    } else if (district && district !== "all") {
      if (district === "dewas") {
        // Highlight Dewas strongly when requested.
        filtered = filtered.filter((item) => item.districtId === "dewas");
      } else {
        filtered = filtered.filter((item) => item.districtId === district);
      }
    }

    // Always re-sort at response time so newest focus stories stay on top.
    filtered = sortNewsItems(filtered);

    const okFeeds = data.sources.filter((s) => {
      const feed = FEEDS.find((f) => f.id === s.id);
      return s.ok && feed?.lang === lang;
    }).length;

    res.set("Cache-Control", "public, max-age=60");
    res.json({
      brand: "आदिभूमि",
      focus: lang === "en" ? COVERAGE.labelEn : COVERAGE.labelHi,
      lang,
      topic: topic || "all",
      district: district || "all",
      division: division || "all",
      divisions: COVERAGE.divisions.map((d) => ({
        id: d.id,
        label: lang === "en" ? d.en : d.hi,
        districts: d.districts,
      })),
      districts: COVERAGE.districts.map((d) => ({
        id: d.id,
        label: lang === "en" ? d.en : d.hi,
        division: d.division,
      })),
      refreshedAt: new Date(data.fetchedAt).toISOString(),
      nextRefreshAt: new Date(data.expiresAt).toISOString(),
      refreshIntervalMs: CACHE_MS,
      count: filtered.length,
      feedsActive: okFeeds,
      items: filtered.map((item) => toPublicItem(item, lang)),
    });
  } catch (err) {
    console.error("[adibhumi] /api/news error", err);
    res.status(500).json({
      error: "समाचार लोड नहीं हो सके",
      message: err.message,
    });
  }
});

app.get("/api/news/article", async (req, res) => {
  try {
    const id = String(req.query.id || "");
    if (!id) {
      return res.status(400).json({ error: "Article id required" });
    }

    const data = await refreshNews(false);
    const item = data.items.find((entry) => entry.id === id);
    if (!item) {
      return res.status(404).json({
        error: "खबर नहीं मिली",
        message: "Article not found or feed was refreshed",
      });
    }

    // Always rebuild a clean article body for the detail page (avoids messy RSS dumps).
    const full = await enrichArticle(item, { force: true });
    const related = data.items
      .filter((entry) => entry.lang === item.lang && entry.id !== item.id)
      .slice(0, 6)
      .map((entry) => toPublicItem(entry, item.lang));

    res.set("Cache-Control", "public, max-age=60");
    res.json({
      brand: "आदिभूमि",
      article: {
        ...toPublicItem(full, full.lang),
        summary: full.summary,
        body: full.bodyText || full.summary,
        bodyHtml: full.bodyHtml || "",
        fullFetched: Boolean(full.fullFetched),
      },
      related,
    });
  } catch (err) {
    console.error("[adibhumi] /api/news/article error", err);
    res.status(500).json({
      error: "खबर लोड नहीं हो सकी",
      message: err.message,
    });
  }
});

app.use(
  express.static(path.join(__dirname), {
    extensions: ["html"],
    setHeaders(res, filePath) {
      if (/\.(?:html|js|css)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`आदिभूमि running at http://localhost:${PORT}`);
  try {
    await refreshNews(true);
  } catch (err) {
    console.warn("[adibhumi] initial refresh failed", err.message);
  }
  setInterval(() => {
    refreshNews(true).catch((err) => {
      console.warn("[adibhumi] scheduled refresh failed", err.message);
    });
  }, CACHE_MS);
});
