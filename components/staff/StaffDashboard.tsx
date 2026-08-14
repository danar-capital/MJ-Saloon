"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Download,
  KeyRound,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Plus,
  Scissors,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCog,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { BOOKING_RULES, getService, getStaff, minutesToTime } from "@/lib/booking-config";
import type { StaffViewer } from "@/lib/staff-auth";

type Status = "available" | "off_today" | "disabled";
type StaffRow = { id: string; name: string; role_ar: string; specialty: string; status: Status; status_date: string | null; whatsapp_phone?: string | null };
type ServiceRow = { id: string; category_id: string; name_ar: string; duration_minutes: number; price_ar: string; status: Status; status_date: string | null };
type BookingRow = { id: string; booking_code: string; first_name: string; last_name: string; phone: string; status: string; created_at: string };
type ItemRow = { id: string; booking_id: string; guest_index: number; guest_label: string; service_id: string; staff_id: string; booking_date: string; start_minute: number; end_minute: number; status: string };
type BreakRow = { id: string; staff_id: string; break_date: string; start_minute: number; end_minute: number; note: string | null; status: string };
type Dashboard = { staff: StaffRow[]; services: ServiceRow[]; bookings: BookingRow[]; items: ItemRow[]; breaks: BreakRow[] };
type AccountRow = { staff_id: string; name: string; whatsapp_phone: string | null; username: string | null; role: string | null; active: number | null };
type Tab = "schedule" | "status" | "services" | "accounts";

function ammanToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function shiftDate(date: string, days: number) { const value = new Date(`${date}T00:00:00+03:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); }
function displayDate(date: string) { return new Intl.DateTimeFormat("ar-JO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Amman" }).format(new Date(`${date}T12:00:00+03:00`)); }
const timeOptions = Array.from({ length: ((BOOKING_RULES.closingMinutes - BOOKING_RULES.openingMinutes) / 30) + 1 }, (_, index) => BOOKING_RULES.openingMinutes + index * 30);

export default function StaffDashboard({ viewer, onLogout, installAvailable, onInstall }: { viewer: StaffViewer; onLogout: () => Promise<void>; installAvailable: boolean; onInstall: () => Promise<void> }) {
  const [data, setData] = useState<Dashboard>({ staff: [], services: [], bookings: [], items: [], breaks: [] });
  const [tab, setTab] = useState<Tab>("schedule");
  const [date, setDate] = useState(ammanToday());
  const [selectedStaff, setSelectedStaff] = useState(viewer.isOwner ? "all" : viewer.staffId);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [breakForm, setBreakForm] = useState({ staffId: viewer.staffId, startMinute: 14 * 60, endMinute: 15 * 60, note: "" });
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountDrafts, setAccountDrafts] = useState<Record<string, { username: string; password: string; whatsappPhone: string }>>({});

  const load = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/staff/dashboard", { cache: "no-store" });
      const payload = await response.json() as Dashboard & { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setData(payload);
    } catch { setError("تعذر تحميل لوحة المواعيد."); }
    finally { setBusy(false); }
  };

  const loadAccounts = async () => {
    if (!viewer.isOwner) return;
    const response = await fetch("/api/staff/accounts", { cache: "no-store" });
    if (!response.ok) return setError("تعذر تحميل الحسابات.");
    const payload = await response.json() as { accounts: AccountRow[] };
    setAccounts(payload.accounts);
    setAccountDrafts(Object.fromEntries(payload.accounts.map((account) => [account.staff_id, { username: account.username ?? account.name.toLowerCase(), password: "", whatsappPhone: account.whatsapp_phone ? `+${account.whatsapp_phone}` : "+962" }])));
  };

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);

  const dayItems = useMemo(() => data.items.filter((item) => item.booking_date === date && item.status === "confirmed" && (selectedStaff === "all" || item.staff_id === selectedStaff)).filter((item) => {
    if (!query.trim()) return true;
    const booking = data.bookings.find((entry) => entry.id === item.booking_id);
    return `${booking?.first_name} ${booking?.last_name} ${booking?.phone} ${booking?.booking_code}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => a.start_minute - b.start_minute), [data, date, selectedStaff, query]);
  const dayBreaks = data.breaks.filter((entry) => entry.break_date === date && (selectedStaff === "all" || entry.staff_id === selectedStaff)).sort((a, b) => a.start_minute - b.start_minute);
  const activeStaff = data.staff.filter((member) => member.status === "available").length;

  const updateStatus = async (target: "staff" | "service", id: string, status: Status) => {
    setError(""); setNotice("");
    const response = await fetch("/api/staff/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, id, status }) });
    if (!response.ok) return setError("تعذر تغيير الحالة.");
    setNotice(status === "available" ? "تم تفعيل الحالة فورًا." : status === "off_today" ? "تم تسجيل إجازة اليوم." : "تم إيقاف التوفر حتى إعادة التفعيل.");
    await load();
  };

  const addBreak = async () => {
    setError(""); setNotice("");
    const response = await fetch("/api/staff/breaks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffId: viewer.isOwner ? breakForm.staffId : viewer.staffId, date, startMinute: breakForm.startMinute, endMinute: breakForm.endMinute, note: breakForm.note }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return setError(payload.error === "BREAK_CONFLICT" ? "يوجد موعد مؤكد داخل هذه الفترة، اختر وقتًا آخر." : payload.error === "BREAK_OVERLAP" ? "هذه الفترة تتداخل مع بريك مسجل." : "تعذر تسجيل البريك.");
    setNotice("تم تثبيت البريك وإغلاق هذه الفترة أمام الحجوزات.");
    await load();
  };

  const removeBreak = async (id: string) => {
    const response = await fetch("/api/staff/breaks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!response.ok) return setError("تعذر حذف البريك.");
    setNotice("تم إلغاء البريك وإعادة فتح الوقت.");
    await load();
  };

  const saveAccount = async (staffId: string) => {
    const draft = accountDrafts[staffId];
    if (!draft?.password) return setError("اكتب كلمة مرور جديدة من 10 أحرف على الأقل.");
    setError(""); setNotice("");
    const response = await fetch("/api/staff/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffId, ...draft }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return setError(payload.error === "USERNAME_TAKEN" ? "اسم المستخدم مستخدم لحساب آخر." : payload.error === "WEAK_PASSWORD" ? "كلمة المرور يجب أن تكون 10 أحرف على الأقل." : "تعذر حفظ الحساب.");
    setNotice("تم حفظ الحساب وكلمة المرور المشفرة.");
    await loadAccounts();
  };

  const tabTitle = tab === "schedule" ? "المواعيد" : tab === "status" ? "الحالة والبريك" : tab === "services" ? "إدارة الخدمات" : "حسابات الفريق";

  return (
    <main className="staff-page" dir="rtl">
      <aside className="staff-sidebar">
        <Link href="/" className="staff-logo"><img src="/assets/mj-logo.svg" alt="MJ" /><span>MJ CONTROL</span></Link>
        <nav>
          <button className={tab === "schedule" ? "active" : ""} onClick={() => setTab("schedule")}><CalendarDays size={19} />مواعيدي</button>
          <button className={tab === "status" ? "active" : ""} onClick={() => setTab("status")}><Coffee size={19} />الحالة والبريك</button>
          {viewer.isOwner && <button className={tab === "services" ? "active" : ""} onClick={() => setTab("services")}><Settings2 size={19} />الخدمات</button>}
          {viewer.isOwner && <button className={tab === "accounts" ? "active" : ""} onClick={() => { setTab("accounts"); void loadAccounts(); }}><UserCog size={19} />حسابات الفريق</button>}
        </nav>
        <div className="staff-user"><span>{viewer.name.slice(0, 1).toUpperCase()}</span><div><strong>{viewer.name}</strong><small>{viewer.isOwner ? "المدير · كامل الصلاحيات" : "حساب موظف خاص"}</small></div></div>
        {installAvailable && <button className="staff-install" onClick={() => void onInstall()}><Download size={17} />تثبيت التطبيق</button>}
        <button className="staff-signout" onClick={() => void onLogout()}><LogOut size={17} />تسجيل الخروج</button>
      </aside>
      <section className="staff-workspace">
        <header className="staff-top"><div><p>MJ OPERATIONS</p><h1>{tabTitle}</h1></div><div className="staff-metrics"><span><b>{dayItems.length}</b><small>موعد في اليوم المختار</small></span><span><b>{dayBreaks.length}</b><small>فترات بريك</small></span>{viewer.isOwner && <span><b>{activeStaff}</b><small>موظفون متاحون</small></span>}</div></header>
        {error && <div className="staff-alert error">{error}</div>}
        {notice && <div className="staff-alert success"><Check size={17} />{notice}</div>}
        {busy ? <div className="staff-loading"><LoaderCircle className="spin" size={34} />جارٍ تحميل نظام MJ…</div> : tab === "schedule" ? <>
          <div className="schedule-toolbar"><div className="date-switch"><button onClick={() => setDate(shiftDate(date, -1))}><ChevronRight size={18} /></button><div><strong>{displayDate(date)}</strong><small>{date}</small></div><button onClick={() => setDate(shiftDate(date, 1))}><ChevronLeft size={18} /></button></div>{viewer.isOwner && <select value={selectedStaff} onChange={(event) => setSelectedStaff(event.target.value)}><option value="all">جميع المختصين</option>{data.staff.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select>}<label className="dashboard-search"><Search size={17} /><input placeholder="ابحث بالاسم، الرقم أو رقم الحجز" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
          <div className="day-agenda">
            {[...dayItems.map((item) => ({ kind: "booking" as const, minute: item.start_minute, item })), ...dayBreaks.map((entry) => ({ kind: "break" as const, minute: entry.start_minute, entry }))].sort((a, b) => a.minute - b.minute).map((row) => row.kind === "booking" ? (() => { const item = row.item; const booking = data.bookings.find((entry) => entry.id === item.booking_id); const member = getStaff(item.staff_id); const service = getService(item.service_id); return <article className="agenda-item" key={item.id}><time><strong>{minutesToTime(item.start_minute, "ar")}</strong><small>{minutesToTime(item.end_minute, "ar")}</small></time><span className="agenda-line" /><div className="agenda-main"><div className="agenda-avatar">{member?.image ? <img src={member.image} alt="" /> : member?.name.slice(0, 2)}</div><div><p>{member?.name}</p><h2>{booking?.first_name} {booking?.last_name}</h2><span>{service?.name.ar} · {item.guest_label || `الشخص ${item.guest_index + 1}`}</span></div></div><div className="agenda-contact"><strong dir="ltr">+{booking?.phone}</strong><small>{booking?.booking_code}</small></div><a className="agenda-whatsapp" href={`https://wa.me/${booking?.phone}`} target="_blank" rel="noreferrer"><MessageCircle size={17} />واتساب</a></article>; })() : <article className="agenda-item break-agenda" key={row.entry.id}><time><strong>{minutesToTime(row.entry.start_minute, "ar")}</strong><small>{minutesToTime(row.entry.end_minute, "ar")}</small></time><span className="agenda-line" /><div className="agenda-main"><div className="agenda-avatar"><Coffee size={20} /></div><div><p>{getStaff(row.entry.staff_id)?.name}</p><h2>بريك</h2><span>{row.entry.note || "فترة غير متاحة للحجز"}</span></div></div><div /><button className="break-remove-inline" onClick={() => void removeBreak(row.entry.id)}><Trash2 size={16} />إلغاء</button></article>)}
            {!dayItems.length && !dayBreaks.length && <div className="agenda-empty"><Scissors size={40} /><h2>اليوم مرتب وهادئ.</h2><p>لا توجد مواعيد أو فترات بريك في هذا اليوم.</p></div>}
          </div>
        </> : tab === "status" ? <div className="status-control-layout"><section className="availability-panel"><div className="availability-head"><div><p>LIVE STATUS</p><h2>{viewer.isOwner ? "حالة الفريق" : "حالتي"}</h2></div><UsersRound size={24} /></div><div className="status-list">{data.staff.map((member) => <article key={member.id}><div className={`tiny-avatar ${member.status}`}>{getStaff(member.id)?.image ? <img src={getStaff(member.id)?.image} alt="" /> : member.name.slice(0, 2)}</div><div><strong>{member.name}</strong><small>{member.role_ar}</small></div><select value={member.status} onChange={(event) => void updateStatus("staff", member.id, event.target.value as Status)}><option value="available">متاح</option><option value="off_today">إجازة اليوم</option><option value="disabled">متوقف حتى التفعيل</option></select></article>)}</div></section><section className="break-panel"><div className="availability-head"><div><p>TIME BLOCK</p><h2>إضافة بريك</h2></div><Coffee size={24} /></div><div className="break-form">{viewer.isOwner && <label><span>الموظف</span><select value={breakForm.staffId} onChange={(event) => setBreakForm((current) => ({ ...current, staffId: event.target.value }))}>{data.staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}<label><span>اليوم</span><div className="break-date"><strong>{displayDate(date)}</strong><small>{date}</small></div></label><div className="break-time-grid"><label><span>من</span><select value={breakForm.startMinute} onChange={(event) => setBreakForm((current) => ({ ...current, startMinute: Number(event.target.value) }))}>{timeOptions.slice(0, -1).map((minute) => <option key={minute} value={minute}>{minutesToTime(minute, "ar")}</option>)}</select></label><label><span>إلى</span><select value={breakForm.endMinute} onChange={(event) => setBreakForm((current) => ({ ...current, endMinute: Number(event.target.value) }))}>{timeOptions.slice(1).map((minute) => <option key={minute} value={minute}>{minutesToTime(minute, "ar")}</option>)}</select></label></div><label><span>ملاحظة اختيارية</span><input value={breakForm.note} onChange={(event) => setBreakForm((current) => ({ ...current, note: event.target.value }))} placeholder="مثال: مشوار خارجي" /></label><button onClick={() => void addBreak()}><Plus size={17} />تثبيت البريك وإغلاق الوقت</button></div><div className="break-list"><h3>بريك اليوم المختار</h3>{data.breaks.filter((entry) => entry.break_date === date && (viewer.isOwner ? entry.staff_id === breakForm.staffId : entry.staff_id === viewer.staffId)).map((entry) => <article key={entry.id}><span><Coffee size={16} /><b>{minutesToTime(entry.start_minute, "ar")} — {minutesToTime(entry.end_minute, "ar")}</b><small>{entry.note || "بريك"}</small></span><button onClick={() => void removeBreak(entry.id)}><Trash2 size={15} /></button></article>)}</div></section></div> : tab === "services" ? <section className="availability-panel service-management"><div className="availability-head"><div><p>SERVICE STATUS</p><h2>إظهار وإخفاء الخدمات</h2></div><Settings2 size={24} /></div><div className="status-list service-status">{data.services.map((service) => <article key={service.id}><span className={`service-status-dot ${service.status}`} /><div><strong>{service.name_ar}</strong><small>{service.duration_minutes} دقيقة · {service.price_ar}</small></div><select value={service.status} onChange={(event) => void updateStatus("service", service.id, event.target.value as Status)}><option value="available">متاحة</option><option value="off_today">مخفية اليوم</option><option value="disabled">متوقفة حتى التفعيل</option></select></article>)}</div></section> : <section className="accounts-panel"><div className="accounts-intro"><div><p>PRIVATE ACCESS</p><h2>حساب مستقل لكل موظف</h2><span>مصطفى فقط يستطيع إنشاء الحسابات أو إعادة ضبط كلمات المرور. كلمة المرور لا تظهر بعد الحفظ.</span></div><ShieldCheck size={34} /></div><div className="account-grid">{accounts.map((account) => { const draft = accountDrafts[account.staff_id] ?? { username: "", password: "", whatsappPhone: "+962" }; return <article className="account-card" key={account.staff_id}><div className="account-head"><div className="tiny-avatar">{getStaff(account.staff_id)?.image ? <img src={getStaff(account.staff_id)?.image} alt="" /> : account.name.slice(0, 2)}</div><div><h3>{account.name}</h3><span className={account.username ? "ready" : "pending"}>{account.username ? "الحساب مفعّل" : "بانتظار الإنشاء"}</span></div><KeyRound size={20} /></div><label><span>اسم المستخدم</span><input dir="ltr" value={draft.username} onChange={(event) => setAccountDrafts((current) => ({ ...current, [account.staff_id]: { ...draft, username: event.target.value } }))} /></label><label><span>رقم واتساب للتنبيهات</span><input dir="ltr" value={draft.whatsappPhone} onChange={(event) => setAccountDrafts((current) => ({ ...current, [account.staff_id]: { ...draft, whatsappPhone: event.target.value } }))} /></label><label><span>{account.username ? "كلمة مرور جديدة" : "كلمة المرور"}</span><input type="password" value={draft.password} placeholder="10 أحرف على الأقل" onChange={(event) => setAccountDrafts((current) => ({ ...current, [account.staff_id]: { ...draft, password: event.target.value } }))} /></label><button onClick={() => void saveAccount(account.staff_id)}><KeyRound size={16} />{account.username ? "حفظ وإعادة ضبط الدخول" : "إنشاء الحساب"}</button></article>; })}</div></section>}
      </section>
      <div className="staff-mobile-install-hint"><Smartphone size={15} />يمكن تثبيت هذه اللوحة كتطبيق على الهاتف والكمبيوتر</div>
    </main>
  );
}
