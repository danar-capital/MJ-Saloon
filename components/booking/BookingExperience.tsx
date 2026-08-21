"use client";

import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  LoaderCircle,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import {
  BOOKING_RULES,
  bookingServices,
  bookingStaff,
  getService,
  getStaffDisplayName,
  minutesToTime,
  serviceCategories,
  type BookingService,
  type BookingStaff,
  type Locale,
} from "@/lib/booking-config";

type AvailabilityStaff = BookingStaff & { status: "available" | "off_today" | "disabled"; status_date?: string | null; breakNow?: boolean };
type AvailabilityService = BookingService & { status: "available" | "off_today" | "disabled"; status_date?: string | null };
type Guest = { serviceId: string; staffId: string; label: string };
type Assignment = { guestIndex: number; serviceId: string; staffId: string; startMinute: number; endMinute: number; label: string };
type Slot = { startMinute: number; assignments: Assignment[] };
type BookingResult = { bookingCode: string; assignments: Assignment[]; salonWhatsAppUrl: string };

const copy = {
  ar: {
    cta: "احجز الآن",
    eyebrow: "MJ BOOKING CONCIERGE",
    title: "موعدك، مصمم حولك.",
    subtitle: "اختر الخدمة، الشخص المناسب، والوقت. نؤكد موعدك مباشرة بعد رمز واتساب.",
    steps: ["الخدمة", "المختص", "الموعد", "بياناتك", "التأكيد"],
    guest: "الشخص",
    guestName: "اسم الشخص",
    addGuest: "إضافة شخص آخر",
    removeGuest: "حذف",
    category: "نوع العناية",
    service: "اختر الخدمة",
    continue: "متابعة",
    back: "رجوع",
    chooseTeam: "اختر المختص لكل شخص",
    any: "أي مختص متاح",
    anyHint: "نختار لك أول مختص متاح ونؤكد اسمه فورًا.",
    off: "إجازة اليوم",
    breakNow: "بريك الآن",
    unavailable: "غير متاح",
    dateTitle: "اختر اليوم والوقت",
    date: "التاريخ",
    calendarHint: "اضغط على التاريخ واختر اليوم المناسب — الأوقات تظهر تلقائيًا",
    weekdays: ["أحد", "اثن", "ثلا", "أربع", "خميس", "جمعة", "سبت"],
    datePrompt: "اختر يومًا من التقويم ثم اعرض الأوقات المتاحة.",
    find: "تغيير اليوم",
    noSlots: "لا توجد أوقات تستوعب هذا الحجز في اليوم المختار. جرّب يومًا آخر أو مختصًا متاحًا.",
    schedule: "ترتيب الموعد",
    person: "شخص",
    detailsTitle: "أدخل بيانات صاحب الحجز",
    firstName: "الاسم الأول",
    lastName: "اسم العائلة",
    phone: "رقم واتساب",
    phoneHint: "سنرسل رمز تأكيد من 6 أرقام. لا يوجد دفع إلكتروني.",
    sendOtp: "إرسال رمز واتساب",
    otpTitle: "أكد رقم واتساب",
    otp: "رمز التأكيد",
    otpSent: "أرسلنا الرمز إلى",
    otpDemo: "وضع التجربة: استخدم الرمز الظاهر أدناه. عند ربط حساب Meta سيصل الرمز على واتساب تلقائيًا.",
    confirm: "تأكيد الحجز",
    confirmed: "تم تأكيد موعدك.",
    confirmedBody: "موعدك أصبح مسجلًا مباشرة لدى MJ، ووصلت تفاصيله إلى المختص.",
    code: "رقم الحجز",
    whatsapp: "فتح واتساب MJ",
    close: "إغلاق",
    loading: "لحظة واحدة…",
    error: "تعذر إكمال الطلب. راجع البيانات وحاول مرة أخرى.",
    slotGone: "هذا الوقت حُجز للتو. اختر وقتًا آخر من القائمة.",
    policy: "الحجز مفتوح حتى 30 دقيقة قبل الموعد · تبدأ المواعيد يوميًا من 12:00 ظهرًا · لا يوجد دفع إلكتروني.",
    daily: "المواعيد يوميًا · 12:00 ظهرًا — 11:00 مساءً",
    duration: "دقيقة",
    selectAll: "أكمل اختيارات جميع الأشخاص للمتابعة.",
  },
  en: {
    cta: "Book now",
    eyebrow: "MJ BOOKING CONCIERGE",
    title: "Your appointment, shaped around you.",
    subtitle: "Choose the service, specialist and time. Your appointment confirms right after WhatsApp verification.",
    steps: ["Service", "Specialist", "Time", "Details", "Confirm"],
    guest: "Guest",
    guestName: "Guest name",
    addGuest: "Add another guest",
    removeGuest: "Remove",
    category: "Care category",
    service: "Choose a service",
    continue: "Continue",
    back: "Back",
    chooseTeam: "Choose a specialist for each guest",
    any: "Any available specialist",
    anyHint: "We’ll assign the first available specialist and confirm the name instantly.",
    off: "Off today",
    breakNow: "On break",
    unavailable: "Unavailable",
    dateTitle: "Choose your date and time",
    date: "Date",
    calendarHint: "Tap the date, choose your day and available times appear automatically",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    datePrompt: "Choose a day from the calendar, then view the available times.",
    find: "Change date",
    noSlots: "No time can fit the complete booking on this date. Try another day or an available specialist.",
    schedule: "Appointment schedule",
    person: "Guest",
    detailsTitle: "Enter the booking owner’s details",
    firstName: "First name",
    lastName: "Last name",
    phone: "WhatsApp number",
    phoneHint: "We’ll send a 6-digit verification code. No online payment is required.",
    sendOtp: "Send WhatsApp code",
    otpTitle: "Verify WhatsApp",
    otp: "Verification code",
    otpSent: "We sent the code to",
    otpDemo: "Test mode: use the code shown below. Once Meta is connected, it will arrive on WhatsApp automatically.",
    confirm: "Confirm booking",
    confirmed: "Your appointment is confirmed.",
    confirmedBody: "MJ and your assigned specialist have received your booking instantly.",
    code: "Booking number",
    whatsapp: "Open MJ WhatsApp",
    close: "Close",
    loading: "One moment…",
    error: "We couldn’t complete the request. Check the details and try again.",
    slotGone: "That time was just booked. Please choose another slot.",
    policy: "Book up to 30 minutes before · appointments start daily at 12:00 PM · no online payment.",
    daily: "Appointments daily · 12:00 PM — 11:00 PM",
    duration: "min",
    selectAll: "Complete every guest’s selection to continue.",
  },
} as const;

function todayInAmman() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BOOKING_RULES.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00+03:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function displayDate(date: string, lang: Locale) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-JO" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: BOOKING_RULES.timezone }).format(new Date(`${date}T12:00:00+03:00`));
}

function safeError(value: unknown) {
  return value instanceof Error ? value.message : "UNKNOWN_ERROR";
}

export default function BookingExperience({ lang, initialServiceId, open, onClose }: { lang: Locale; initialServiceId?: string | null; open: boolean; onClose: () => void }) {
  const t = copy[lang];
  const [step, setStep] = useState(0);
  const [catalogStaff, setCatalogStaff] = useState<AvailabilityStaff[]>(bookingStaff.map((member) => ({ ...member, status: "available" })));
  const [catalogServices, setCatalogServices] = useState<AvailabilityService[]>(bookingServices.map((service) => ({ ...service, status: "available" })));
  const initialSelectedService = initialServiceId || "haircut-beard";
  const [guests, setGuests] = useState<Guest[]>([{ serviceId: initialSelectedService, staffId: getService(initialSelectedService)?.specialty === "skin" ? "skin-specialist" : "any", label: "" }]);
  const [date, setDate] = useState(todayInAmman());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [searchedSlots, setSearchedSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [person, setPerson] = useState({ firstName: "", lastName: "", phone: "+962" });
  const [challenge, setChallenge] = useState<{ id: string; devCode?: string; delivered: boolean } | null>(null);
  const [otp, setOtp] = useState("");
  const [result, setResult] = useState<BookingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const stepRef = useRef(0);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("booking-open");
    document.documentElement.classList.add("booking-open");
    const backgroundVideos = Array.from(document.querySelectorAll<HTMLVideoElement>(".hero-video, .cinema-video"));
    const playing = backgroundVideos.filter((video) => !video.paused);
    backgroundVideos.forEach((video) => video.pause());
    void fetch("/api/booking/config", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("CONFIG_ERROR")))
      .then((data: unknown) => {
        const catalog = data as { staff?: AvailabilityStaff[]; services?: AvailabilityService[] };
        if (Array.isArray(catalog.staff)) setCatalogStaff(catalog.staff);
        if (Array.isArray(catalog.services)) setCatalogServices(catalog.services);
      })
      .catch(() => undefined);
    return () => {
      document.body.classList.remove("booking-open");
      document.documentElement.classList.remove("booking-open");
      playing.forEach((video) => void video.play().catch(() => undefined));
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const activeBookingHistory = (window.history.state as { mjBooking?: boolean } | null)?.mjBooking;
      onCloseRef.current();
      if (activeBookingHistory) window.history.go(-(stepRef.current + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => { stepRef.current = step; }, [step]);

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ mjBooking: true, step: 0 }, "", window.location.href);
    const onPopState = (event: PopStateEvent) => {
      const state = event.state as { mjBooking?: boolean; step?: number } | null;
      if (state?.mjBooking && Number.isInteger(state.step)) {
        setStep(Math.max(0, Math.min(4, state.step!)));
        setError("");
      } else {
        onCloseRef.current();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [open, step, result]);

  const maxDate = addDays(todayInAmman(), BOOKING_RULES.bookingHorizonDays);
  const selectedServices = useMemo(() => guests.map((guest) => getService(guest.serviceId)).filter(Boolean) as BookingService[], [guests]);

  const selectDate = (nextDate: string) => {
    setDate(nextDate);
    setSlots([]);
    setSearchedSlots(false);
    setSelectedSlot(null);
    setError("");
    void findSlots(nextDate);
  };

  const handleAtmosphereMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5;
    const y = (event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5;
    event.currentTarget.style.setProperty("--booking-tilt-x", `${x * 9}deg`);
    event.currentTarget.style.setProperty("--booking-tilt-y", `${y * -7}deg`);
  };

  const resetAtmosphere = (event: ReactPointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--booking-tilt-x", "0deg");
    event.currentTarget.style.setProperty("--booking-tilt-y", "0deg");
  };

  const updateGuest = (index: number, patch: Partial<Guest>) => {
    setGuests((current) => current.map((guest, guestIndex) => {
      if (guestIndex !== index) return guest;
      const next = { ...guest, ...patch };
      if (patch.serviceId) next.staffId = getService(patch.serviceId)?.specialty === "skin" ? "skin-specialist" : "any";
      return next;
    }));
    setSlots([]);
    setSearchedSlots(false);
    setSelectedSlot(null);
    setError("");
  };

  const resetAvailability = () => {
    setSlots([]);
    setSearchedSlots(false);
    setSelectedSlot(null);
    setError("");
  };

  const addGuest = () => {
    setGuests((current) => [...current, { serviceId: current[0]?.serviceId || "haircut", staffId: "any", label: "" }]);
    resetAvailability();
  };

  const removeGuest = (index: number) => {
    setGuests((current) => current.filter((_, guestIndex) => guestIndex !== index));
    resetAvailability();
  };

  const availableStaffFor = (serviceId: string) => {
    const service = getService(serviceId);
    return catalogStaff.filter((member) => member.specialty === service?.specialty);
  };

  const navigateToStep = (nextStep: number) => {
    const bounded = Math.max(0, Math.min(4, nextStep));
    setStep(bounded);
    stepRef.current = bounded;
    window.history.pushState({ mjBooking: true, step: bounded }, "", window.location.href);
  };

  const navigateBack = () => {
    if (stepRef.current <= 0) {
      closeAndReset();
      return;
    }
    window.history.back();
  };

  const navigateBackTo = (target: number) => {
    const distance = Math.max(1, stepRef.current - target);
    window.history.go(-distance);
  };

  const goNext = () => {
    setError("");
    if (step === 0 && guests.some((guest) => !guest.serviceId)) return setError(t.selectAll);
    if (step === 1 && guests.some((guest) => !guest.staffId)) return setError(t.selectAll);
    if (step === 1) {
      navigateToStep(2);
      void findSlots(date);
      return;
    }
    navigateToStep(stepRef.current + 1);
  };

  async function findSlots(targetDate = date) {
    setBusy(true);
    setSearchedSlots(true);
    setError("");
    setSelectedSlot(null);
    try {
      const response = await fetch("/api/booking/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: targetDate, guests }),
      });
      const data = await response.json() as { error?: string; slots?: Slot[] };
      if (!response.ok) throw new Error(data.error || "AVAILABILITY_ERROR");
      setSlots(data.slots ?? []);
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  }

  const sendOtp = async () => {
    if (!person.firstName.trim() || !person.lastName.trim() || person.phone.replace(/\D/g, "").length < 9) {
      setError(t.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/booking/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: person.phone }),
      });
      const data = await response.json() as { error?: string; challenge: { id: string; devCode?: string; delivered: boolean } };
      if (!response.ok) throw new Error(data.error || "OTP_ERROR");
      setChallenge(data.challenge);
      navigateToStep(4);
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  };

  const confirmBooking = async () => {
    if (!challenge || !selectedSlot || otp.length !== 6) return setError(t.error);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/booking/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.id,
          code: otp,
          firstName: person.firstName,
          lastName: person.lastName,
          phone: person.phone,
          locale: lang,
          date,
          startMinute: selectedSlot.startMinute,
          guests,
        }),
      });
      const data = await response.json() as { error?: string; booking: BookingResult };
      if (!response.ok) throw new Error(data.error || "CONFIRM_ERROR");
      setResult(data.booking);
    } catch (caught) {
      const message = safeError(caught);
      setError(message === "SLOT_UNAVAILABLE" ? t.slotGone : t.error);
      if (message === "SLOT_UNAVAILABLE") {
        navigateBackTo(2);
        setSelectedSlot(null);
        void findSlots();
      }
    } finally {
      setBusy(false);
    }
  };

  const closeAndReset = () => {
    const activeBookingHistory = (window.history.state as { mjBooking?: boolean } | null)?.mjBooking;
    const rewind = stepRef.current + 1;
    onCloseRef.current();
    if (activeBookingHistory) window.history.go(-rewind);
    window.setTimeout(() => {
      setStep(0);
      setSlots([]);
      setSearchedSlots(false);
      setSelectedSlot(null);
      setChallenge(null);
      setOtp("");
      setResult(null);
      setError("");
    }, 350);
  };

  if (!open) return null;
  const DirectionArrow = lang === "ar" ? ArrowLeft : ArrowRight;
  const BackArrow = lang === "ar" ? ArrowRight : ArrowLeft;

  return (
    <div className="booking-layer" role="dialog" aria-modal="true" aria-labelledby="booking-title" data-lenis-prevent>
      <button className="booking-backdrop" aria-label={t.close} onClick={closeAndReset} />
      <section className="booking-panel" dir={lang === "ar" ? "rtl" : "ltr"} data-lenis-prevent onPointerMove={handleAtmosphereMove} onPointerLeave={resetAtmosphere}>
        <div className="booking-atmosphere" aria-hidden="true">
          <span className="booking-depth-grid" />
          <div className="booking-3d-stage"><i className="booking-orbit orbit-a" /><i className="booking-orbit orbit-b" /><i className="booking-orbit orbit-c" /><i className="booking-ribbon ribbon-a" /><i className="booking-ribbon ribbon-b" /><i className="booking-ribbon ribbon-c" /></div>
          <span className="booking-light light-red" /><span className="booking-light light-blue" />
        </div>
        <header className="booking-header">
          <div className="booking-brand">
            <img src="/assets/mj-logo.svg" alt="MJ Hair Salon" />
            <div><span>{t.eyebrow}</span><small>{t.daily}</small></div>
          </div>
          <div className="booking-header-actions">
            {step > 0 && !result && <button className="booking-step-back" type="button" onClick={navigateBack}><BackArrow size={18} /><span>{t.back}</span></button>}
            <button className="booking-close" type="button" onClick={closeAndReset} aria-label={t.close}><X size={20} /></button>
          </div>
        </header>

        {!result && (
          <div className="booking-progress" aria-label={lang === "ar" ? "خطوات الحجز" : "Booking steps"}>
            {t.steps.map((label, index) => (
              <button type="button" key={label} className={`${step === index ? "active" : ""} ${step > index ? "done" : ""}`} onClick={() => index < step && navigateBackTo(index)} disabled={index > step}>
                <span>{step > index ? <Check size={13} /> : index + 1}</span><small>{label}</small>
              </button>
            ))}
          </div>
        )}

        <div className="booking-content" data-lenis-prevent ref={contentRef}>
          {result ? (
            <div className="booking-success">
              <div className="success-orbit"><Check size={36} /></div>
              <p className="booking-kicker">MJ / CONFIRMED</p>
              <h2 id="booking-title">{t.confirmed}</h2>
              <p>{t.confirmedBody}</p>
              <div className="booking-code"><small>{t.code}</small><strong>{result.bookingCode}</strong></div>
              <div className="success-schedule">
                {result.assignments.map((item) => (
                  <div key={`${item.guestIndex}-${item.staffId}`}><span>{getService(item.serviceId)?.name[lang]}</span><strong>{getStaffDisplayName(item.staffId, lang)} · {minutesToTime(item.startMinute, lang)}</strong></div>
                ))}
              </div>
              <div className="success-actions">
                <a href={result.salonWhatsAppUrl} target="_blank" rel="noreferrer" className="booking-secondary"><FaWhatsapp size={18} />{t.whatsapp}</a>
                <button type="button" className="booking-primary" onClick={closeAndReset}>{t.close}<DirectionArrow size={18} /></button>
              </div>
            </div>
          ) : (
            <>
              <div className="booking-title-block">
                <p className="booking-kicker">{t.eyebrow}</p>
                <h2 id="booking-title">{step === 0 ? t.title : step === 1 ? t.chooseTeam : step === 2 ? t.dateTitle : step === 3 ? t.detailsTitle : t.otpTitle}</h2>
                {step === 0 && <p>{t.subtitle}</p>}
              </div>

              {step === 0 && (
                <div className="guest-stack">
                  {guests.map((guest, index) => {
                    const selected = getService(guest.serviceId);
                    return (
                      <article className="guest-card" key={`guest-${index}`}>
                        <div className="guest-head"><span><UserRound size={17} />{t.guest} {index + 1}</span>{guests.length > 1 && <button type="button" onClick={() => removeGuest(index)}><Minus size={14} />{t.removeGuest}</button>}</div>
                        <input className="booking-input guest-label" value={guest.label} placeholder={t.guestName} onChange={(event) => updateGuest(index, { label: event.target.value })} />
                        <div className="category-tabs">
                          {serviceCategories.map((category) => (
                            <button key={category.id} type="button" className={selected?.categoryId === category.id ? "active" : ""} onClick={() => {
                              const next = catalogServices.find((service) => service.categoryId === category.id && service.status === "available" && (!service.status_date || service.status_date !== date));
                              if (next) updateGuest(index, { serviceId: next.id });
                            }}>{category.name[lang]}</button>
                          ))}
                        </div>
                        <div className="service-picks">
                          {catalogServices.filter((service) => service.categoryId === selected?.categoryId).map((service) => {
                            const disabled = service.status === "disabled" || (service.status === "off_today" && (!service.status_date || service.status_date === date));
                            return (
                              <button type="button" key={service.id} disabled={disabled} className={guest.serviceId === service.id ? "active" : ""} onClick={() => updateGuest(index, { serviceId: service.id })}>
                                <span><strong>{service.name[lang]}</strong>{service.showDuration !== false && <small>{service.durationMinutes} {t.duration}</small>}{service.details && <em>{service.details[lang]}</em>}</span><b>{disabled ? (service.status === "off_today" ? t.off : t.unavailable) : service.price[lang]}</b>
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                  <button type="button" className="add-guest" onClick={addGuest}><Plus size={18} />{t.addGuest}</button>
                </div>
              )}

              {step === 1 && (
                <div className="staff-selection">
                  {guests.map((guest, index) => {
                    const service = getService(guest.serviceId)!;
                    return (
                      <article className="staff-guest" key={`staff-guest-${index}`}>
                        <div className="staff-guest-head"><span>{t.guest} {index + 1}</span><strong>{service.name[lang]}</strong></div>
                        <div className="staff-grid">
                          {service.specialty !== "skin" && <button type="button" className={`staff-pick any ${guest.staffId === "any" ? "active" : ""}`} onClick={() => updateGuest(index, { staffId: "any" })}>
                            <span className="staff-avatar any"><Sparkles size={26} /></span><strong>{t.any}</strong><small>{t.anyHint}</small>
                          </button>}
                          {availableStaffFor(guest.serviceId).map((member) => {
                            const unavailable = member.status === "disabled" || (member.status === "off_today" && (!member.status_date || member.status_date === date));
                            return (
                              <button type="button" key={member.id} disabled={unavailable} className={`staff-pick ${guest.staffId === member.id ? "active" : ""} ${unavailable ? "unavailable" : ""} ${member.breakNow ? "on-break" : ""}`} onClick={() => updateGuest(index, { staffId: member.id })}>
                                <span className="staff-avatar">{member.image ? <img src={member.image} alt="" /> : <b>{member.name.slice(0, 2)}</b>}</span>
                                <strong>{getStaffDisplayName(member.id, lang)}</strong><small>{unavailable ? (member.status === "off_today" ? t.off : t.unavailable) : member.breakNow ? t.breakNow : member.role[lang]}</small>
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {step === 2 && (
                <div className="time-selection">
                  <label className="compact-date-picker" onClick={() => dateInputRef.current?.showPicker?.()}>
                    <CalendarDays size={22} />
                    <span><small>{t.date}</small><strong>{displayDate(date, lang)}</strong><em>{t.calendarHint}</em></span>
                    <b>{t.find}</b>
                    <input ref={dateInputRef} type="date" value={date} min={todayInAmman()} max={maxDate} aria-label={t.date} onChange={(event) => event.target.value && selectDate(event.target.value)} />
                  </label>
                  {busy && <div className="time-empty"><LoaderCircle className="spin" size={28} /><p>{t.loading}</p></div>}
                  {!busy && slots.length > 0 && <div className="slot-grid">{slots.map((slot) => <button type="button" key={slot.startMinute} className={selectedSlot?.startMinute === slot.startMinute ? "active" : ""} onClick={() => setSelectedSlot(slot)}><strong>{minutesToTime(slot.startMinute, lang)}</strong><small>{displayDate(date, lang)}</small></button>)}</div>}
                  {!busy && slots.length === 0 && <div className="time-empty">{searchedSlots ? <Clock3 size={28} /> : <CalendarDays size={28} />}<p>{searchedSlots ? t.noSlots : t.datePrompt}</p></div>}
                  {selectedSlot && <div className="schedule-preview"><h3>{t.schedule}</h3>{selectedSlot.assignments.map((item) => <div key={`${item.guestIndex}-${item.staffId}`}><span>{item.label || `${t.person} ${item.guestIndex + 1}`}<small>{getService(item.serviceId)?.name[lang]}</small></span><strong>{getStaffDisplayName(item.staffId, lang)}<small>{minutesToTime(item.startMinute, lang)} — {minutesToTime(item.endMinute, lang)}</small></strong></div>)}</div>}
                </div>
              )}

              {step === 3 && (
                <div className="customer-details">
                  <div className="form-grid"><label><span>{t.firstName} *</span><input className="booking-input" autoComplete="given-name" required aria-required="true" value={person.firstName} onChange={(event) => { const value = event.target.value; setPerson((current) => ({ ...current, firstName: value })); }} /></label><label><span>{t.lastName} *</span><input className="booking-input" autoComplete="family-name" required aria-required="true" value={person.lastName} onChange={(event) => { const value = event.target.value; setPerson((current) => ({ ...current, lastName: value })); }} /></label><label className="phone-field"><span>{t.phone} *</span><input className="booking-input" inputMode="tel" autoComplete="tel" dir="ltr" required aria-required="true" value={person.phone} onChange={(event) => { const value = event.target.value; setPerson((current) => ({ ...current, phone: value })); }} /></label></div>
                  <div className="secure-note"><ShieldCheck size={21} /><p>{t.phoneHint}<small>{t.policy}</small></p></div>
                </div>
              )}

              {step === 4 && (
                <div className="otp-stage">
                  <div className="whatsapp-seal"><FaWhatsapp size={35} /></div>
                  <p>{t.otpSent} <strong dir="ltr">{person.phone}</strong></p>
                  {!challenge?.delivered && challenge?.devCode && <div className="demo-otp"><span>{t.otpDemo}</span><strong>{challenge.devCode}</strong></div>}
                  <label><span>{t.otp}</span><input className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
                </div>
              )}

              {error && <div className="booking-error" role="alert">{error}</div>}
            </>
          )}
        </div>

        {!result && (
          <footer className="booking-footer">
            <div className="booking-recap"><UsersRound size={18} /><span>{guests.length} {lang === "ar" ? "شخص" : guests.length === 1 ? "guest" : "guests"}</span>{selectedServices[0] && <><i /><span>{selectedServices[0].name[lang]}</span></>}</div>
            <div className="booking-nav">
              {step > 0 && <button type="button" className="booking-back" onClick={navigateBack} disabled={busy}>{t.back}</button>}
              {step < 2 && <button type="button" className="booking-primary" onClick={goNext}>{t.continue}<DirectionArrow size={18} /></button>}
              {step === 2 && <button type="button" className="booking-primary" onClick={goNext} disabled={!selectedSlot}>{t.continue}<DirectionArrow size={18} /></button>}
              {step === 3 && <button type="button" className="booking-primary" onClick={sendOtp} disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <FaWhatsapp size={18} />}{busy ? t.loading : t.sendOtp}</button>}
              {step === 4 && <button type="button" className="booking-primary" onClick={confirmBooking} disabled={busy || otp.length !== 6}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}{busy ? t.loading : t.confirm}</button>}
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}

export function BookingButton({ lang, onClick, compact = false }: { lang: Locale; onClick: () => void; compact?: boolean }) {
  const t = copy[lang];
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;
  return <button type="button" className={`booking-launch ${compact ? "compact" : ""}`} onClick={onClick}><span>{t.cta}</span><Arrow size={17} /></button>;
}
