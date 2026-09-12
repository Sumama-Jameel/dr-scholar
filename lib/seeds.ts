/**
 * Curated catalog of REAL, well-known programs with official URLs.
 * This is the agent's safety net: even if every search engine fails,
 * it can always give the student a credible shortlist, then verify live.
 */

export type Seed = {
  name: string;
  url: string;
  kind: "scholarship" | "internship";
  regions: string[]; // region/country tokens
  levels: string[]; // high_school | undergraduate | masters | phd | recent_graduate | any
  fields: string[]; // field tokens ("any" = all)
  funding: "full" | "partial" | "paid" | "unpaid";
  note?: string;
};

const COUNTRY_MAP: Record<string, string[]> = {
  usa: ["us", "north-america"], "united states": ["us", "north-america"], us: ["us", "north-america"],
  uk: ["uk", "europe", "commonwealth"], "united kingdom": ["uk", "europe", "commonwealth"],
  england: ["uk", "europe", "commonwealth"], britain: ["uk", "europe", "commonwealth"],
  india: ["india", "asia", "developing", "commonwealth"],
  germany: ["germany", "europe"], france: ["france", "europe"], canada: ["canada", "north-america", "commonwealth"],
  australia: ["australia", "commonwealth"], "new zealand": ["new-zealand", "commonwealth"],
  japan: ["japan", "asia"], korea: ["korea", "asia"], "south korea": ["korea", "asia"],
  china: ["china", "asia"], singapore: ["singapore", "asia"],
  nigeria: ["africa", "developing", "commonwealth"], kenya: ["africa", "developing", "commonwealth"],
  ghana: ["africa", "developing", "commonwealth"], ethiopia: ["africa", "developing"],
  "south africa": ["africa", "developing", "commonwealth"], uganda: ["africa", "developing", "commonwealth"],
  tanzania: ["africa", "developing", "commonwealth"], egypt: ["africa", "middle-east", "developing"],
  morocco: ["africa", "middle-east", "developing"], pakistan: ["asia", "developing", "commonwealth"],
  bangladesh: ["asia", "developing", "commonwealth"], "sri lanka": ["asia", "developing", "commonwealth"],
  nepal: ["asia", "developing"], indonesia: ["asia", "developing"], malaysia: ["asia", "developing"],
  philippines: ["asia", "developing"], vietnam: ["asia", "developing"], thailand: ["asia", "developing"],
  brazil: ["latin-america", "developing"], mexico: ["latin-america", "developing"],
  argentina: ["latin-america", "developing"], colombia: ["latin-america", "developing"],
  chile: ["latin-america", "developing"], peru: ["latin-america", "developing"],
  turkey: ["turkey", "middle-east", "europe"], saudi: ["middle-east", "saudi"],
  "saudi arabia": ["middle-east", "saudi"], uae: ["middle-east"], israel: ["middle-east"],
  jordan: ["middle-east", "developing"], lebanon: ["middle-east", "developing"],
  poland: ["europe", "developing"], romania: ["europe", "developing"], ukraine: ["europe", "developing"],
  hungary: ["europe", "developing"], spain: ["europe"], italy: ["europe"], portugal: ["europe"],
  greece: ["europe"], austria: ["europe"], belgium: ["europe"], sweden: ["europe"],
  norway: ["europe"], denmark: ["europe"], finland: ["europe"], ireland: ["ireland", "europe", "commonwealth"],
  netherlands: ["netherlands", "europe"], switzerland: ["switzerland", "europe"],
};

export function mapCountryToTokens(country: string): string[] {
  const c = country.trim().toLowerCase().replace(/^the /, "");
  return COUNTRY_MAP[c] ?? [c.replace(/\s+/g, "-")];
}

const SCHOLARSHIPS: Seed[] = [
  { name: "Chevening Scholarships (UK Master's, fully funded)", url: "https://www.chevening.org/scholarships/", kind: "scholarship", regions: ["uk"], levels: ["masters"], fields: ["any"], funding: "full", note: "2+ yrs work experience required" },
  { name: "Commonwealth Master's Scholarships (UK)", url: "https://cscuk.fcdo.gov.uk/scholarships/commonwealth-masters-scholarships/", kind: "scholarship", regions: ["uk", "commonwealth", "developing"], levels: ["masters"], fields: ["any"], funding: "full" },
  { name: "Commonwealth PhD Scholarships (UK)", url: "https://cscuk.fcdo.gov.uk/scholarships/commonwealth-doctoral-scholarships/", kind: "scholarship", regions: ["uk", "commonwealth", "developing"], levels: ["phd"], fields: ["any"], funding: "full" },
  { name: "Gates Cambridge Scholarship", url: "https://www.gatescambridge.org/apply/", kind: "scholarship", regions: ["uk"], levels: ["masters", "phd"], fields: ["any"], funding: "full" },
  { name: "Rhodes Scholarship (Oxford)", url: "https://www.rhodeshouse.ox.ac.uk/scholarships/the-rhodes-scholarship/", kind: "scholarship", regions: ["uk", "commonwealth"], levels: ["masters", "phd"], fields: ["any"], funding: "full", note: "age ~25+ typically, via constituencies" },
  { name: "Clarendon Fund (Oxford, all grad levels)", url: "https://www.ox.ac.uk/clarendon", kind: "scholarship", regions: ["uk"], levels: ["masters", "phd"], fields: ["any"], funding: "full", note: "auto-considered when applying to Oxford" },
  { name: "GREAT Scholarships (UK Master's)", url: "https://study-uk.britishcouncil.org/scholarships-funding/great-scholarships", kind: "scholarship", regions: ["uk", "developing", "asia", "africa"], levels: ["masters"], fields: ["any"], funding: "partial", note: "£10,000 toward tuition, per-country allocations" },
  { name: "British Council Women in STEM Scholarships (UK)", url: "https://www.britishcouncil.org/study-work-abroad/inbound-scholarships/women-in-stem-scholarships/", kind: "scholarship", regions: ["uk", "women", "developing", "asia", "africa", "latin-america"], levels: ["masters", "phd"], fields: ["stem"], funding: "full", note: "women from eligible countries" },
  { name: "Weidenfeld-Hoffmann Trust (Oxford Master's)", url: "https://www.whtrust.org/", kind: "scholarship", regions: ["uk", "developing"], levels: ["masters"], fields: ["any"], funding: "full" },
  { name: "Saïd Foundation Scholarships (UK)", url: "https://www.saidfoundation.org/", kind: "scholarship", regions: ["uk", "middle-east"], levels: ["masters"], fields: ["any"], funding: "full", note: "Syria, Jordan, Lebanon, Palestine, Iraq" },
  { name: "Fulbright Foreign Student Program (US)", url: "https://foreign.fulbrightonline.org/", kind: "scholarship", regions: ["us", "global"], levels: ["masters", "phd"], fields: ["any"], funding: "full", note: "apply via your country's Fulbright commission" },
  { name: "Knight-Hennessy Scholars (Stanford)", url: "https://knight-hennessy.stanford.edu/admission/apply", kind: "scholarship", regions: ["us"], levels: ["masters", "phd"], fields: ["any"], funding: "full" },
  { name: "AAUW International Fellowships (US, women)", url: "https://www.aauw.org/programs/fellowships-grants/", kind: "scholarship", regions: ["us", "women", "global"], levels: ["masters", "phd", "recent_graduate"], fields: ["any"], funding: "partial" },
  { name: "P.E.O. International Peace Scholarship (US, women)", url: "https://www.peointernational.org/peo-international-peace-scholarship-ips", kind: "scholarship", regions: ["us", "women", "global"], levels: ["masters", "phd"], fields: ["any"], funding: "partial" },
  { name: "Paul & Daisy Soros Fellowships (US, immigrants)", url: "https://www.pdsoros.org/apply", kind: "scholarship", regions: ["us"], levels: ["masters", "phd"], fields: ["any"], funding: "full", note: "for New Americans (green holders/holders, DACA etc.)" },
  { name: "Jack Kent Cooke Foundation Scholarships (US)", url: "https://www.jkcf.org/our-scholarships/", kind: "scholarship", regions: ["us"], levels: ["high_school", "undergraduate"], fields: ["any"], funding: "full" },
  { name: "The Gates Scholarship (US undergrad)", url: "https://www.thegatesscholarship.org/scholarship", kind: "scholarship", regions: ["us"], levels: ["high_school"], fields: ["any"], funding: "full", note: "Pell-eligible, minority students" },
  { name: "QuestBridge (US undergrad, need-based)", url: "https://www.questbridge.org/", kind: "scholarship", regions: ["us"], levels: ["high_school"], fields: ["any"], funding: "full" },
  { name: "Coca-Cola Scholars Program (US HS seniors)", url: "https://www.coca-colascholarsfoundation.org/apply/", kind: "scholarship", regions: ["us"], levels: ["high_school"], fields: ["any"], funding: "partial" },
  { name: "NSF Graduate Research Fellowship (US STEM)", url: "https://www.nsfgrfp.org/", kind: "scholarship", regions: ["us"], levels: ["masters", "phd"], fields: ["stem", "research"], funding: "full" },
  { name: "Hertz Fellowship (US PhD, applied STEM)", url: "https://www.hertzfoundation.org/the-fellowship/", kind: "scholarship", regions: ["us"], levels: ["phd"], fields: ["stem", "engineering", "cs"], funding: "full" },
  { name: "GEM Fellowship (US grad STEM, underrepresented)", url: "https://gemfellowship.org/students/", kind: "scholarship", regions: ["us"], levels: ["masters", "phd"], fields: ["stem", "engineering"], funding: "partial" },
  { name: "DAAD Scholarships Database (Germany)", url: "https://www.daad.de/en/study-and-research-in-germany/scholarships/", kind: "scholarship", regions: ["germany", "global"], levels: ["undergraduate", "masters", "phd"], fields: ["any"], funding: "full", note: "filter by your nationality + level" },
  { name: "DAAD EPOS (development-related Master's)", url: "https://www.daad.de/en/study-and-research-in-germany/scholarships/development-related-postgraduate-courses/", kind: "scholarship", regions: ["germany", "developing"], levels: ["masters"], fields: ["development", "engineering", "social-science"], funding: "full", note: "2 yrs work experience usually required" },
  { name: "Deutschlandstipendium (Germany)", url: "https://www.deutschlandstipendium.de/deutschlandstipendium/de/english/english_node.html", kind: "scholarship", regions: ["germany"], levels: ["undergraduate", "masters"], fields: ["any"], funding: "partial", note: "€300/month via universities" },
  { name: "Heinrich Böll Foundation Scholarships (Germany)", url: "https://www.boell.de/en/scholarships", kind: "scholarship", regions: ["germany"], levels: ["masters", "phd"], fields: ["any"], funding: "partial" },
  { name: "Konrad-Adenauer-Stiftung (Germany, incl. international)", url: "https://www.kas.de/en/web/begabtenfoerderung-und-kultur/auslandsfoerderung", kind: "scholarship", regions: ["germany"], levels: ["masters", "phd"], fields: ["any"], funding: "partial" },
  { name: "Erasmus Mundus Joint Master Scholarships (EU)", url: "https://erasmus-plus.ec.europa.eu/opportunities/opportunities-for-individuals/students/erasmus-mundus-joint-masters-scholarships", kind: "scholarship", regions: ["europe", "global"], levels: ["masters"], fields: ["any"], funding: "full", note: "study in 2+ countries; apply to the consortium directly" },
  { name: "Eiffel Excellence Scholarship (France)", url: "https://www.campusfrance.org/en/eiffel-scholarship-program-of-excellence", kind: "scholarship", regions: ["france"], levels: ["masters", "phd"], fields: ["any"], funding: "full", note: "nominated by the French university" },
  { name: "Charpak Scholarships (India → France)", url: "https://www.ifindia.fr/charpak/", kind: "scholarship", regions: ["france", "india"], levels: ["masters", "undergraduate"], fields: ["any"], funding: "partial" },
  { name: "Swiss Government Excellence Scholarships", url: "https://www.sbfi.admin.ch/sbfi/en/home/education/scholarships-and-grants/swiss-government-excellence-scholarships.html", kind: "scholarship", regions: ["switzerland", "global"], levels: ["phd", "masters"], fields: ["research"], funding: "full" },
  { name: "ETH Zurich Excellence Scholarship (Master's)", url: "https://ethz.ch/en/studies/financial/scholarships/excellencescholarship.html", kind: "scholarship", regions: ["switzerland"], levels: ["masters"], fields: ["stem", "cs", "engineering"], funding: "full" },
  { name: "EPFL Excellence Fellowships (Master's)", url: "https://www.epfl.ch/education/studies/en/financing-study/", kind: "scholarship", regions: ["switzerland"], levels: ["masters"], fields: ["stem", "cs", "engineering"], funding: "partial" },
  { name: "Government of Ireland International Education Scholarships", url: "https://hea.ie/policy/internationalisation/government-of-ireland-international-education-scholarships/", kind: "scholarship", regions: ["ireland", "europe"], levels: ["masters", "phd"], fields: ["any"], funding: "full", note: "€10,000 + full tuition waiver" },
  { name: "NL Scholarship (Netherlands)", url: "https://www.studyinnl.org/finances/nl-scholarship", kind: "scholarship", regions: ["netherlands", "europe"], levels: ["masters", "undergraduate"], fields: ["any"], funding: "partial" },
  { name: "Vanier Canada Graduate Scholarships", url: "https://vanier.gc.ca/en/home-accueil.html", kind: "scholarship", regions: ["canada"], levels: ["phd"], fields: ["any"], funding: "full", note: "CA$50,000/yr, nominated by university" },
  { name: "Lester B. Pearson Scholarships (U Toronto, undergrad)", url: "https://future.utoronto.ca/pearson/", kind: "scholarship", regions: ["canada"], levels: ["high_school"], fields: ["any"], funding: "full", note: "school nomination required" },
  { name: "UBC International Scholars Awards (Canada)", url: "https://you.ubc.ca/financial-planning/scholarships-awards-international-students/", kind: "scholarship", regions: ["canada"], levels: ["high_school"], fields: ["any"], funding: "full" },
  { name: "Australia Awards Scholarships", url: "https://www.australiaawards.org/", kind: "scholarship", regions: ["australia", "asia", "africa", "developing"], levels: ["masters", "phd"], fields: ["any"], funding: "full" },
  { name: "Manaaki New Zealand Scholarships", url: "https://www.mnzscholarships.org/", kind: "scholarship", regions: ["new-zealand", "asia", "africa", "latin-america", "developing"], levels: ["masters", "phd"], fields: ["any"], funding: "full" },
  { name: "MEXT Japanese Government Scholarship", url: "https://www.studyinjapan.go.jp/en/planning/scholarship/", kind: "scholarship", regions: ["japan", "global"], levels: ["undergraduate", "masters", "phd"], fields: ["any"], funding: "full", note: "embassy or university recommendation" },
  { name: "ADB–Japan Scholarship Program (Asia-Pacific)", url: "https://www.adb.org/work-with-us/careers/japan-scholarship-program", kind: "scholarship", regions: ["asia", "developing"], levels: ["masters"], fields: ["development", "business", "stem"], funding: "full" },
  { name: "Joint Japan/World Bank Graduate Scholarships", url: "https://www.worldbank.org/en/programs/scholarships", kind: "scholarship", regions: ["developing", "global"], levels: ["masters"], fields: ["development"], funding: "full" },
  { name: "Global Korea Scholarship (GKS)", url: "https://www.studyinkorea.go.kr/", kind: "scholarship", regions: ["korea", "global"], levels: ["undergraduate", "masters", "phd"], fields: ["any"], funding: "full" },
  { name: "Chinese Government Scholarship (CSC)", url: "https://www.campuschina.org/", kind: "scholarship", regions: ["china", "global"], levels: ["undergraduate", "masters", "phd"], fields: ["any"], funding: "full" },
  { name: "Schwarzman Scholars (China, 1-yr Master's)", url: "https://www.schwarzmanscholars.org/admissions/", kind: "scholarship", regions: ["china"], levels: ["recent_graduate", "masters", "professional"], fields: ["any"], funding: "full" },
  { name: "Yenching Academy Fellowship (Peking University)", url: "https://yenchingacademy.pku.edu.cn/", kind: "scholarship", regions: ["china"], levels: ["masters", "recent_graduate"], fields: ["social-science", "arts"], funding: "full" },
  { name: "Türkiye Bursları (Turkey Government Scholarships)", url: "https://www.turkiyeburslari.gov.tr/", kind: "scholarship", regions: ["turkey", "global"], levels: ["undergraduate", "masters", "phd"], fields: ["any"], funding: "full" },
  { name: "Islamic Development Bank Scholarships", url: "https://www.isdb.org/scholarships", kind: "scholarship", regions: ["middle-east", "asia", "africa", "developing"], levels: ["undergraduate", "masters", "phd"], fields: ["any"], funding: "full" },
  { name: "Mastercard Foundation Scholars Program (Africa)", url: "https://mastercardfdn.org/all/scholars/", kind: "scholarship", regions: ["africa", "developing", "us", "canada"], levels: ["undergraduate", "masters"], fields: ["any"], funding: "full" },
  { name: "Aga Khan Foundation ISP (postgrad, developing countries)", url: "https://the.akdn/en/how-we-work/our-programmes/aga-khan-foundation-international-scholarship-programme", kind: "scholarship", regions: ["developing", "asia", "africa", "middle-east"], levels: ["masters", "phd"], fields: ["any"], funding: "partial", note: "50% grant / 50% loan" },
  { name: "Rotary Peace Fellowship", url: "https://www.rotary.org/en/our-programs/peace-fellowships", kind: "scholarship", regions: ["global"], levels: ["masters"], fields: ["peace", "social-science", "development"], funding: "full" },
  { name: "Inlaks Shivdasani Foundation (India → abroad)", url: "https://www.inlaksfoundation.org/", kind: "scholarship", regions: ["india"], levels: ["masters"], fields: ["any"], funding: "partial" },
  { name: "J. N. Tata Endowment (India → abroad)", url: "https://www.jntataendowment.org/", kind: "scholarship", regions: ["india"], levels: ["masters", "phd"], fields: ["any"], funding: "partial" },
  { name: "Narotam Sekhsaria Scholarship (India)", url: "https://www.nsscholarship.net/", kind: "scholarship", regions: ["india"], levels: ["masters"], fields: ["any"], funding: "partial", note: "interest-free loan scholarship" },
  { name: "National Scholarship Portal (India, govt schemes)", url: "https://scholarships.gov.in/", kind: "scholarship", regions: ["india"], levels: ["undergraduate", "masters", "phd"], fields: ["any"], funding: "partial" },
  { name: "Singapore International Graduate Award (SINGA, PhD)", url: "https://www.a-star.edu.sg/scholarships", kind: "scholarship", regions: ["singapore", "asia"], levels: ["phd"], fields: ["stem", "research"], funding: "full" },
  { name: "MIT need-based financial aid (undergrad)", url: "https://sfs.mit.edu/", kind: "scholarship", regions: ["us"], levels: ["undergraduate"], fields: ["any"], funding: "full", note: "need-blind for all applicants incl. international" },
  { name: "Harvard College financial aid (need-based)", url: "https://college.harvard.edu/financial-aid", kind: "scholarship", regions: ["us"], levels: ["undergraduate"], fields: ["any"], funding: "full", note: "need-blind, family income < $100k typically pays nothing" },
  { name: "Stanford need-based financial aid", url: "https://financialaid.stanford.edu/", kind: "scholarship", regions: ["us"], levels: ["undergraduate"], fields: ["any"], funding: "full" },
];

const INTERNSHIPS: Seed[] = [
  { name: "Google Summer of Code (paid open-source, global)", url: "https://summerofcode.withgoogle.com/", kind: "internship", regions: ["any"], levels: ["undergraduate", "masters", "phd", "recent_graduate"], fields: ["cs", "engineering", "stem"], funding: "paid", note: "18+, 12 weeks remote" },
  { name: "MLH Fellowship (remote software engineering)", url: "https://fellowship.mlh.io/", kind: "internship", regions: ["any"], levels: ["undergraduate", "masters", "recent_graduate"], fields: ["cs"], funding: "paid", note: "12-week remote track" },
  { name: "Outreachy (paid remote internships, underrepresented groups)", url: "https://www.outreachy.org/apply/", kind: "internship", regions: ["any"], levels: ["undergraduate", "masters", "recent_graduate"], fields: ["cs"], funding: "paid", note: "$7,000 stipend, twice yearly" },
  { name: "LFX Mentorship (Linux Foundation)", url: "https://mentorship.lfx.linuxfoundation.org/", kind: "internship", regions: ["any"], levels: ["undergraduate", "masters", "phd"], fields: ["cs"], funding: "paid", note: "quarterly cohorts, remote" },
  { name: "Google STEP Internship (1st/2nd-year students)", url: "https://buildyourfuture.withgoogle.com/programs/step", kind: "internship", regions: ["us", "india", "europe", "middle-east", "africa"], levels: ["undergraduate"], fields: ["cs"], funding: "paid" },
  { name: "Google Student Careers & Internships", url: "https://www.google.com/about/careers/", kind: "internship", regions: ["any"], levels: ["undergraduate", "masters", "phd"], fields: ["cs", "business"], funding: "paid" },
  { name: "Microsoft Research Internship Program", url: "https://www.microsoft.com/en-us/research/opportunity/", kind: "internship", regions: ["us", "global"], levels: ["masters", "phd", "undergraduate"], fields: ["cs", "research"], funding: "paid" },
  { name: "Meta University / Meta Campus Internships", url: "https://www.metacareers.com/", kind: "internship", regions: ["us", "global"], levels: ["undergraduate", "masters"], fields: ["cs"], funding: "paid" },
  { name: "Amazon Student Internships", url: "https://www.amazon.jobs/en/", kind: "internship", regions: ["any"], levels: ["undergraduate", "masters", "phd"], fields: ["cs", "business"], funding: "paid" },
  { name: "Jane Street Internships (quant/trading/tech)", url: "https://www.janestreet.com/join-jane-street/", kind: "internship", regions: ["us", "europe", "asia"], levels: ["undergraduate", "masters", "phd"], fields: ["cs", "business"], funding: "paid" },
  { name: "NVIDIA University Internships", url: "https://www.nvidia.com/en-us/about-nvidia/careers/", kind: "internship", regions: ["any"], levels: ["undergraduate", "masters", "phd"], fields: ["cs", "engineering"], funding: "paid" },
  { name: "Apple Internships", url: "https://jobs.apple.com/en-us/", kind: "internship", regions: ["us", "global"], levels: ["undergraduate", "masters", "phd"], fields: ["cs", "engineering"], funding: "paid" },
  { name: "IBM Research Internships", url: "https://research.ibm.com/careers/", kind: "internship", regions: ["any"], levels: ["masters", "phd", "undergraduate"], fields: ["cs", "research"], funding: "paid" },
  { name: "DeepMind / Google Research roles for students", url: "https://deepmind.google/", kind: "internship", regions: ["us", "uk", "europe", "canada"], levels: ["phd", "masters"], fields: ["cs", "research"], funding: "paid" },
  { name: "NASA Internships (OSTEM)", url: "https://www.nasa.gov/learning-resources/internship-programs/", kind: "internship", regions: ["us"], levels: ["undergraduate", "masters", "phd"], fields: ["stem", "engineering"], funding: "paid", note: "US citizens (some exceptions)" },
  { name: "CERN Technical & Administrative Student Programme", url: "https://careers.cern/", kind: "internship", regions: ["europe", "any"], levels: ["undergraduate", "masters"], fields: ["stem", "engineering", "cs"], funding: "paid", note: "member states + agreements; ~1 year" },
  { name: "ESA Internships & Traineeships", url: "https://www.esa.int/Careers/Vacancies", kind: "internship", regions: ["europe"], levels: ["masters", "undergraduate"], fields: ["stem", "engineering"], funding: "paid", note: "mostly member-state nationals" },
  { name: "United Nations Internship Programme", url: "https://careers.un.org/", kind: "internship", regions: ["any"], levels: ["masters", "undergraduate", "recent_graduate"], fields: ["any"], funding: "unpaid", note: "unpaid — check funding; enrolled or within 1 yr of graduation" },
  { name: "UNICEF Internships", url: "https://jobs.unicef.org/", kind: "internship", regions: ["any"], levels: ["masters", "undergraduate", "recent_graduate"], fields: ["social-science", "development"], funding: "unpaid", note: "some funded via partner scholarships" },
  { name: "World Bank Internship Program (BISP)", url: "https://www.worldbank.org/en/about/careers/programs-and-internships/world-bank-internship-program", kind: "internship", regions: ["any"], levels: ["masters", "phd"], fields: ["development", "business", "stem"], funding: "paid" },
  { name: "IMF Fund Internship Program (FIP)", url: "https://www.imf.org/en/Careers/FIP", kind: "internship", regions: ["any"], levels: ["masters", "phd"], fields: ["business", "stem"], funding: "paid" },
  { name: "ADB Internship Program (Asia-Pacific)", url: "https://www.adb.org/work-with-us/careers/internship-program", kind: "internship", regions: ["asia", "developing"], levels: ["masters", "undergraduate"], fields: ["development", "stem"], funding: "paid", note: "member-country students" },
  { name: "DAAD RISE Germany (research internships for STEM undergrads)", url: "https://www.daad.de/rise/en/", kind: "internship", regions: ["germany", "asia", "americas", "developing"], levels: ["undergraduate"], fields: ["stem", "engineering"], funding: "paid", note: "2nd-3rd year undergrads from outside DACH" },
  { name: "MIT Summer Research Program (MSRP)", url: "https://oge.mit.edu/", kind: "internship", regions: ["us"], levels: ["undergraduate"], fields: ["stem", "research"], funding: "paid", note: "US citizens/PRs; prepares for PhD" },
  { name: "Amgen Scholars Program (biotech research, US/EU/Japan)", url: "https://amgenscholars.com/", kind: "internship", regions: ["us", "europe", "japan"], levels: ["undergraduate"], fields: ["stem", "medicine"], funding: "paid" },
  { name: "Caltech SURF (Summer Undergraduate Research)", url: "https://sfp.caltech.edu/", kind: "internship", regions: ["us"], levels: ["undergraduate"], fields: ["stem", "research"], funding: "paid" },
  { name: "OIST Research Internship (Japan, paid)", url: "https://www.oist.edu/research/internship", kind: "internship", regions: ["japan", "any"], levels: ["undergraduate", "masters", "phd"], fields: ["stem", "research"], funding: "paid", note: "fully funded, all nationalities" },
  { name: "Max Planck Society internships & research positions", url: "https://www.mpg.de/career", kind: "internship", regions: ["germany"], levels: ["undergraduate", "masters", "phd"], fields: ["stem", "research"], funding: "paid" },
  { name: "IUSSTF SN Bose / WISE research internships (India ↔ US)", url: "https://www.iusstf.org/", kind: "internship", regions: ["india", "us"], levels: ["undergraduate", "masters", "phd"], fields: ["stem", "research"], funding: "paid" },
  { name: "PM Internship Scheme (India)", url: "https://pminternship.mca.gov.in/", kind: "internship", regions: ["india"], levels: ["undergraduate", "recent_graduate"], fields: ["any"], funding: "paid", note: "₹5000/month + 12-month placement" },
  { name: "AICTE Internship Portal (India)", url: "https://internship.aicte-india.org/", kind: "internship", regions: ["india"], levels: ["undergraduate", "masters"], fields: ["any"], funding: "unpaid", note: "thousands of listed Indian internships" },
];

const ALL_SEEDS = [...SCHOLARSHIPS, ...INTERNSHIPS];

function scoreSeed(
  s: Seed,
  countryTokens: Set<string>,
  levelTokens: Set<string>,
  fieldTokens: Set<string>,
  needsFullFunding: boolean
): number {
  let score = 1;
  if (s.regions.includes("any") || s.regions.some((r) => countryTokens.has(r))) score += 3;
  if (s.levels.includes("any") || s.levels.some((l) => levelTokens.has(l))) score += 2;
  if (s.fields.includes("any") || s.fields.some((f) => fieldTokens.has(f))) score += 2;
  if (needsFullFunding && s.funding === "full") score += 2;
  if (needsFullFunding && (s.funding === "paid" || s.funding === "partial")) score += 1;
  return score;
}

/** Scores and ranks the catalog against a student profile. */
export function matchSeeds(
  kind: Seed["kind"],
  opts: {
    countries?: string[];
    levels?: string[];
    fieldTokens?: string[];
    needsFullFunding?: boolean;
    limit?: number;
  } = {}
): Seed[] {
  const countryTokens = new Set<string>((opts.countries ?? []).flatMap(mapCountryToTokens));
  const levelTokens = new Set((opts.levels ?? []).map((l) => l.toLowerCase()));
  const fieldTokens = new Set(
    (opts.fieldTokens ?? []).flatMap((f) =>
      f
        .toLowerCase()
        .split(/[^a-z0-9-]+/)
        .filter((t) => t.length > 2)
    )
  );
  return ALL_SEEDS.filter((s) => s.kind === kind)
    .map((s) => ({
      s,
      score: scoreSeed(s, countryTokens, levelTokens, fieldTokens, Boolean(opts.needsFullFunding)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, opts.limit ?? 15))
    .map((x) => x.s);
}

export function seedCounts(): { scholarships: number; internships: number } {
  return {
    scholarships: SCHOLARSHIPS.length,
    internships: INTERNSHIPS.length,
  };
}

