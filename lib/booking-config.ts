export type Locale = "ar" | "en";

export type LocalizedText = {
  ar: string;
  en: string;
};

export type BookingService = {
  id: string;
  categoryId: "hair" | "nails" | "skin" | "packages";
  name: LocalizedText;
  durationMinutes: number;
  startIntervalMinutes?: number;
  showDuration?: boolean;
  price: LocalizedText;
  specialty: "hair" | "nails";
};

export type BookingStaff = {
  id: string;
  name: string;
  role: LocalizedText;
  specialty: "hair" | "nails";
  image?: string;
  founder?: boolean;
};

export const BOOKING_RULES = {
  timezone: "Asia/Amman",
  openingMinutes: 12 * 60,
  closingMinutes: 24 * 60,
  latestStartMinutes: 23 * 60,
  slotMinutes: 30,
  leadMinutes: 30,
  bookingHorizonDays: 365,
  internalBufferMinutes: 0,
} as const;

export const serviceCategories: Array<{ id: BookingService["categoryId"]; name: LocalizedText }> = [
  { id: "hair", name: { ar: "العناية بالشعر واللحية", en: "Hair & beard" } },
  { id: "nails", name: { ar: "العناية بالأظافر", en: "Nail care" } },
  { id: "skin", name: { ar: "العناية بالبشرة", en: "Skin care" } },
  { id: "packages", name: { ar: "البكجات", en: "Packages" } },
];

export const bookingServices: BookingService[] = [
  { id: "haircut", categoryId: "hair", name: { ar: "حلاقة شعر", en: "Haircut" }, durationMinutes: 30, price: { ar: "12 د.أ", en: "12 JOD" }, specialty: "hair" },
  { id: "haircut-beard", categoryId: "hair", name: { ar: "حلاقة شعر + دقن", en: "Haircut + beard" }, durationMinutes: 45, price: { ar: "15 د.أ", en: "15 JOD" }, specialty: "hair" },
  { id: "beard", categoryId: "hair", name: { ar: "حلاقة دقن", en: "Beard trim" }, durationMinutes: 15, price: { ar: "8 د.أ", en: "8 JOD" }, specialty: "hair" },
  { id: "kids-haircut", categoryId: "hair", name: { ar: "حلاقة شعر أطفال", en: "Kids haircut" }, durationMinutes: 30, price: { ar: "8 د.أ", en: "8 JOD" }, specialty: "hair" },
  { id: "blow-dry", categoryId: "hair", name: { ar: "سشوار", en: "Blow dry" }, durationMinutes: 5, price: { ar: "5 د.أ", en: "5 JOD" }, specialty: "hair" },
  { id: "hair-treatment", categoryId: "hair", name: { ar: "ترتمنت للشعر", en: "Hair treatment" }, durationMinutes: 15, price: { ar: "15 د.أ", en: "15 JOD" }, specialty: "hair" },
  { id: "hair-protein", categoryId: "hair", name: { ar: "بروتين للشعر", en: "Hair protein" }, durationMinutes: 45, price: { ar: "يبدأ من 35 د.أ", en: "From 35 JOD" }, specialty: "hair" },
  { id: "dark-colour", categoryId: "hair", name: { ar: "صبغة للشعر (الغامق)", en: "Dark hair colour" }, durationMinutes: 15, price: { ar: "10 د.أ", en: "10 JOD" }, specialty: "hair" },
  { id: "light-colour", categoryId: "hair", name: { ar: "صبغة فاتحة / سحب لون", en: "Light colour / bleach" }, durationMinutes: 120, price: { ar: "يبدأ من 50 د.أ", en: "From 50 JOD" }, specialty: "hair" },
  { id: "henna", categoryId: "hair", name: { ar: "حنة للشعر أو اللحية", en: "Hair or beard henna" }, durationMinutes: 10, price: { ar: "8 د.أ", en: "8 JOD" }, specialty: "hair" },
  { id: "nails-hands", categoryId: "nails", name: { ar: "بدكير + مناكير يدين", en: "Hand care" }, durationMinutes: 20, price: { ar: "10 د.أ", en: "10 JOD" }, specialty: "nails" },
  { id: "nails-feet", categoryId: "nails", name: { ar: "بدكير + مناكير أقدام", en: "Foot care" }, durationMinutes: 25, price: { ar: "15 د.أ", en: "15 JOD" }, specialty: "nails" },
  { id: "nails-both", categoryId: "nails", name: { ar: "بدكير + مناكير يد وأقدام", en: "Hand & foot care" }, durationMinutes: 45, price: { ar: "25 د.أ", en: "25 JOD" }, specialty: "nails" },
  { id: "face-wax", categoryId: "skin", name: { ar: "واكس للوجه كامل", en: "Full-face wax" }, durationMinutes: 15, price: { ar: "10 د.أ", en: "10 JOD" }, specialty: "hair" },
  { id: "package-advance", categoryId: "skin", name: { ar: "ادفانس", en: "Advance" }, durationMinutes: 45, price: { ar: "50 د.أ", en: "50 JOD" }, specialty: "hair" },
  { id: "package-express", categoryId: "skin", name: { ar: "اكسبريس", en: "Express" }, durationMinutes: 25, price: { ar: "20 د.أ", en: "20 JOD" }, specialty: "hair" },
  { id: "package-advance-2", categoryId: "skin", name: { ar: "ادفانس 2", en: "Advance 2" }, durationMinutes: 35, price: { ar: "35 د.أ", en: "35 JOD" }, specialty: "hair" },
  { id: "package-mj", categoryId: "packages", name: { ar: "بكج MJ", en: "MJ Package" }, durationMinutes: 45, price: { ar: "25 د.أ", en: "25 JOD" }, specialty: "hair" },
  { id: "package-mj-2", categoryId: "packages", name: { ar: "MJ 2", en: "MJ 2" }, durationMinutes: 60, price: { ar: "35 د.أ", en: "35 JOD" }, specialty: "hair" },
  { id: "package-mj-super", categoryId: "packages", name: { ar: "MJ SUPER", en: "MJ SUPER" }, durationMinutes: 60, startIntervalMinutes: 60, showDuration: false, price: { ar: "80 د.أ", en: "80 JOD" }, specialty: "hair" },
  { id: "package-full-express", categoryId: "packages", name: { ar: "بكج الإكسبريس", en: "Express Package" }, durationMinutes: 60, startIntervalMinutes: 60, showDuration: false, price: { ar: "50 د.أ", en: "50 JOD" }, specialty: "hair" },
  { id: "package-groom", categoryId: "packages", name: { ar: "بكج العريس", en: "Groom Package" }, durationMinutes: 60, startIntervalMinutes: 60, showDuration: false, price: { ar: "100 د.أ", en: "100 JOD" }, specialty: "hair" },
];

export const bookingStaff: BookingStaff[] = [
  { id: "bahaa", name: "BAHAA", role: { ar: "مصفف شعر", en: "Hair Stylist" }, specialty: "hair", image: "/assets/team-bahaa.jpg" },
  { id: "osaid", name: "OSAID", role: { ar: "مصفف شعر", en: "Hair Stylist" }, specialty: "hair", image: "/assets/team-osaid.jpg" },
  { id: "amro", name: "AMRO", role: { ar: "مصفف شعر", en: "Hair Stylist" }, specialty: "hair", image: "/assets/team-amro.jpg" },
  { id: "ali", name: "ALI", role: { ar: "مصفف شعر", en: "Hair Stylist" }, specialty: "hair", image: "/assets/team-ali.jpg" },
  { id: "mustafa", name: "MUSTAFA", role: { ar: "مصفف شعر والمؤسس", en: "Hair Stylist · Founder" }, specialty: "hair", image: "/assets/team-mustafa.jpg", founder: true },
  { id: "m7m7", name: "M7M7", role: { ar: "مصفف شعر", en: "Hair Stylist" }, specialty: "hair", image: "/assets/team-m7m7.jpg" },
  { id: "mera", name: "MERA", role: { ar: "أخصائية أظافر", en: "Nail Specialist" }, specialty: "nails" },
  { id: "aows", name: "AOWS", role: { ar: "مصفف شعر", en: "Hair Stylist" }, specialty: "hair" },
];

export function minutesToTime(minutes: number, locale: Locale = "ar") {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  if (locale === "en") {
    const suffix = hour24 >= 12 ? "PM" : "AM";
    const hour = hour24 % 12 || 12;
    return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
  }
  const suffix = hour24 >= 12 ? "م" : "ص";
  const hour = hour24 % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function getService(id: string) {
  return bookingServices.find((service) => service.id === id);
}

export function getStaff(id: string) {
  return bookingStaff.find((member) => member.id === id);
}
