"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Check, Clock3, LoaderCircle, Scissors, ShieldCheck, X } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BOOKING_RULES, getService, getStaff, minutesToTime } from "@/lib/booking-config";

type Item = { id: string; guest_index: number; guest_label: string; service_id: string; staff_id: string; booking_date: string; start_minute: number; end_minute: number; status: string };
type Details = {
  booking: { booking_code: string; first_name: string; last_name: string; phone: string; locale: "ar" | "en"; status: string };
  items: Item[];
  requests: Array<{ id: string; type: string; status: string; requested_date?: string; requested_start_minute?: number; created_at: string }>;
};

function todayInAmman() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00+03:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function ManageBookingPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [stage, setStage] = useState<"request" | "verify" | "manage" | "done">("request");
  const [challenge, setChallenge] = useState<{ id: string; devCode?: string; delivered: boolean } | null>(null);
  const [maskedPhone, setMaskedPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [session, setSession] = useState("");
  const [details, setDetails] = useState<Details | null>(null);
  const [mode, setMode] = useState<"cancel" | "reschedule" | null>(null);
  const [date, setDate] = useState(todayInAmman());
  const [slots, setSlots] = useState<Array<{ startMinute: number }>>([]);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const requestOtp = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/manage/request-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manageToken: token }) });
      const data = await response.json() as { error?: string; challenge: { id: string; devCode?: string; delivered: boolean }; maskedPhone: string };
      if (!response.ok) throw new Error(data.error);
      setChallenge(data.challenge); setMaskedPhone(data.maskedPhone); setStage("verify");
    } catch { setError("تعذر العثور على الحجز أو إرسال رمز التأكيد."); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!token || stage !== "request") return;
    const timer = window.setTimeout(() => void requestOtp(), 0);
    return () => window.clearTimeout(timer);
    // The request is intentionally made once for this manage token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const verify = async () => {
    if (!challenge || otp.length !== 6) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/manage/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: challenge.id, code: otp }) });
      const data = await response.json() as { error?: string; session: { token: string }; details: Details };
      if (!response.ok) throw new Error(data.error);
      setSession(data.session.token); setDetails(data.details); setStage("manage");
    } catch { setError("رمز التأكيد غير صحيح أو انتهت صلاحيته."); }
    finally { setBusy(false); }
  };

  const getSlots = async () => {
    setBusy(true); setError(""); setSelectedTime(null);
    try {
      const response = await fetch("/api/manage/availability", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session}` }, body: JSON.stringify({ date }) });
      const data = await response.json() as { error?: string; slots?: Array<{ startMinute: number }> };
      if (!response.ok) throw new Error(data.error);
      setSlots(data.slots ?? []);
    } catch { setError("لا توجد أوقات مناسبة لهذا الحجز في اليوم المختار."); }
    finally { setBusy(false); }
  };

  const submitRequest = async () => {
    if (!mode || (mode === "reschedule" && selectedTime === null)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/manage/request", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session}` }, body: JSON.stringify({ type: mode, date: mode === "reschedule" ? date : undefined, startMinute: mode === "reschedule" ? selectedTime : undefined }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error);
      setStage("done");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(message === "CHANGE_CUTOFF" ? "لا يمكن إرسال طلب قبل الموعد بأقل من ساعة." : "تعذر إرسال الطلب. قد يوجد طلب سابق قيد المراجعة.");
    } finally { setBusy(false); }
  };

  return (
    <main className="manage-page" dir="rtl">
      <div className="manage-ambient"><i /><i /></div>
      <header className="manage-header"><Link href="/"><img src="/assets/mj-logo.svg" alt="MJ Hair Salon" /></Link><span>إدارة الموعد</span><Link href="/">العودة للموقع <ArrowRight size={16} /></Link></header>
      <section className="manage-shell">
        {stage === "request" && <div className="manage-loading"><LoaderCircle className="spin" size={34} /><p>نجهز بوابة الحجز الآمنة…</p></div>}
        {stage === "verify" && <div className="manage-card verify-card"><div className="manage-icon whatsapp"><FaWhatsapp size={32} /></div><p className="booking-kicker">SECURE ACCESS</p><h1>أكد رقم واتساب</h1><p>أرسلنا رمزًا جديدًا إلى <strong dir="ltr">{maskedPhone}</strong></p>{!challenge?.delivered && challenge?.devCode && <div className="demo-otp"><span>وضع التجربة — استخدم هذا الرمز:</span><strong>{challenge.devCode}</strong></div>}<input className="otp-input" inputMode="numeric" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} />{error && <div className="booking-error">{error}</div>}<button className="booking-primary" onClick={verify} disabled={busy || otp.length !== 6}>{busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}عرض حجزي</button></div>}
        {stage === "manage" && details && <div className="manage-grid"><div className="manage-card booking-overview"><p className="booking-kicker">{details.booking.booking_code}</p><h1>أهلًا {details.booking.first_name}</h1><div className={`status-pill ${details.booking.status}`}>{details.booking.status === "confirmed" ? "موعد مؤكد" : details.booking.status}</div><div className="manage-items">{details.items.map((item) => <article key={item.id}><span className="manage-service-icon"><Scissors size={18} /></span><div><strong>{getService(item.service_id)?.name.ar}</strong><small>{getStaff(item.staff_id)?.name} · {item.booking_date}</small></div><b>{minutesToTime(item.start_minute, "ar")}</b></article>)}</div><div className="manage-policy"><Clock3 size={18} />التعديل أو الإلغاء متاح حتى ساعة قبل الموعد، ويثبت فقط بعد موافقة الصالون.</div></div><div className="manage-card manage-actions"><h2>ماذا تود أن تفعل؟</h2><button className={`manage-action ${mode === "reschedule" ? "active" : ""}`} onClick={() => setMode("reschedule")}><CalendarDays size={22} /><span><strong>طلب تغيير الموعد</strong><small>اختر موعدًا متاحًا وسنرسله للمراجعة</small></span></button><button className={`manage-action danger ${mode === "cancel" ? "active" : ""}`} onClick={() => setMode("cancel")}><X size={22} /><span><strong>طلب إلغاء الموعد</strong><small>يبقى الحجز مؤكدًا حتى اعتماد الطلب</small></span></button>{mode === "reschedule" && <div className="reschedule-panel"><label><span>التاريخ الجديد</span><input type="date" min={todayInAmman()} max={addDays(todayInAmman(), BOOKING_RULES.bookingHorizonDays)} value={date} onChange={(event) => { setDate(event.target.value); setSlots([]); }} /></label><button className="booking-secondary" onClick={getSlots} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Clock3 size={16} />}عرض الأوقات</button>{slots.length > 0 && <div className="mini-slots">{slots.map((slot) => <button key={slot.startMinute} className={selectedTime === slot.startMinute ? "active" : ""} onClick={() => setSelectedTime(slot.startMinute)}>{minutesToTime(slot.startMinute, "ar")}</button>)}</div>}</div>}{error && <div className="booking-error">{error}</div>}{mode && <button className="booking-primary submit-manage" onClick={submitRequest} disabled={busy || (mode === "reschedule" && selectedTime === null)}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}إرسال الطلب للصالون</button>}</div></div>}
        {stage === "done" && <div className="manage-card manage-done"><div className="manage-icon"><Check size={30} /></div><p className="booking-kicker">REQUEST RECEIVED</p><h1>وصل طلبك للصالون.</h1><p>موعدك الأصلي ما زال مؤكدًا. سنعتمد التغيير أو الإلغاء من لوحة MJ ثم يصلك القرار.</p><Link href="/" className="booking-primary">العودة إلى MJ</Link></div>}
      </section>
    </main>
  );
}
