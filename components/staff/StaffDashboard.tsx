"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import {
  Activity,
  BellRing,
  CalendarClock,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Clock3,
  Fingerprint,
  Grid2X2,
  KeyRound,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Scissors,
  Search,
  Save,
  Settings2,
  ShieldCheck,
  UserCog,
  UserMinus,
  UserRound,
  UsersRound,
} from "lucide-react";
import { shiftIsoDate } from "@/lib/date-utils";
import { getService, getStaff, minutesToTime } from "@/lib/booking-config";
import StaffCredentials from "@/components/staff/StaffCredentials";
import type { StaffViewer } from "@/lib/staff-auth";
import { getStaffServiceWorker } from "@/lib/staff-pwa-client";

type Status = "available" | "break" | "off_today" | "disabled";
type StaffRow = {
  id: string;
  name: string;
  role_ar: string;
  specialty: string;
  status: Status;
  status_date: string | null;
  status_started_at?: string | null;
  weekly_off_day?: number | null;
  whatsapp_phone?: string | null;
  profile_image_updated_at?: string | null;
};
type ServiceRow = {
  id: string;
  category_id: string;
  name_ar: string;
  duration_minutes: number;
  price_ar: string;
  status: "available" | "off_today" | "disabled";
  status_date: string | null;
};
type BookingRow = {
  id: string;
  booking_code: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  phone: string;
  status: string;
  created_at: string;
};
type ItemRow = {
  id: string;
  booking_id: string;
  guest_index: number;
  guest_label: string;
  service_id: string;
  staff_id: string;
  booking_date: string;
  start_minute: number;
  end_minute: number;
  status: string;
};
type ScheduleRow = {
  staff_id: string;
  weekday: number;
  start_minute: number;
  end_minute: number;
  active: number;
};
type Dashboard = {
  staff: StaffRow[];
  services: ServiceRow[];
  bookings: BookingRow[];
  items: ItemRow[];
  schedules: ScheduleRow[];
  syncVersion?: number;
  upcomingHasMore?: boolean;
};
type AccountRow = {
  staff_id: string;
  name: string;
  whatsapp_phone: string | null;
  username: string | null;
  role: string | null;
  active: number | null;
  profile_image_updated_at?: string | null;
};
type ClientRow = {
  phone: string;
  full_name: string;
  booking_count: number;
  first_booking_date: string;
  last_booking_date: string;
  next_booking_date: string | null;
  staff_ids: string;
};
type Tab = "schedule" | "upcoming" | "clients" | "status" | "profile";

const navItems: Array<{ id: Tab; label: string; icon: typeof Grid2X2 }> = [
  { id: "schedule", label: "مواعيدي", icon: Grid2X2 },
  { id: "upcoming", label: "القادمة", icon: CalendarClock },
  { id: "clients", label: "عملائي", icon: UsersRound },
  { id: "status", label: "حالي", icon: Activity },
  { id: "profile", label: "معلوماتي", icon: UserCog },
];

const weekdayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const UPCOMING_PAGE_SIZE = 50;
const MAX_UPCOMING_ITEMS = 200;
const FULL_LOAD_RETRY_BACKOFF_MS = 15_000;

type PushState = "checking" | "enabled" | "prompt" | "denied" | "unsupported" | "unconfigured" | "personal_device_required";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function subscriptionUsesKey(subscription: PushSubscription, publicKey: string) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const left = new Uint8Array(current);
  const right = urlBase64ToUint8Array(publicKey);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function ammanToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Amman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ammanNowMinutes() {
  const value = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Amman",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function displayDate(date: string, compact = false) {
  return new Intl.DateTimeFormat("ar-JO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(compact ? {} : { year: "numeric" as const }),
    timeZone: "Asia/Amman",
  }).format(new Date(`${date}T12:00:00+03:00`));
}

function statusLabel(status: Status) {
  if (status === "available") return "متاح";
  if (status === "break") return "بريك";
  if (status === "off_today") return "إجازة";
  return "متوقف";
}

function memberImage(staffId: string, imageVersion?: string | null) {
  return imageVersion
    ? `/api/staff/profile/image?staffId=${encodeURIComponent(staffId)}&v=${encodeURIComponent(imageVersion)}`
    : getStaff(staffId)?.image;
}

function rejectedStaffSession(response: Response, error?: string) {
  return response.status === 401 || error === "STAFF_UNAUTHORIZED" || error === "STAFF_CREDENTIAL_CHANGE_REQUIRED";
}

async function cropProfileImage(file: File) {
  const source: ImageBitmap | HTMLImageElement = typeof createImageBitmap === "function"
    ? await createImageBitmap(file)
    : await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("IMAGE_PROCESSING_FAILED")); };
      image.src = url;
    });
  const side = Math.min(source.width, source.height);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("IMAGE_PROCESSING_FAILED");
  const sourceX = (source.width - side) / 2;
  const verticalSpace = source.height - side;
  const sourceY = verticalSpace / 2;
  context.drawImage(source, sourceX, sourceY, side, side, 0, 0, 512, 512);
  if ("close" in source) source.close();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("IMAGE_PROCESSING_FAILED")), "image/webp", 0.88));
}

export default function StaffDashboard({
  viewer,
  onViewerChange,
  onLogout,
  biometricEligible,
  remembered,
}: {
  viewer: StaffViewer;
  onViewerChange: (viewer: StaffViewer) => void;
  onLogout: () => Promise<void>;
  biometricEligible: boolean;
  remembered: boolean;
}) {
  const [data, setData] = useState<Dashboard>({ staff: [], services: [], bookings: [], items: [], schedules: [] });
  const [tab, setTab] = useState<Tab>("schedule");
  const [date, setDate] = useState(ammanToday());
  const [upcomingLimit, setUpcomingLimit] = useState(UPCOMING_PAGE_SIZE);
  const [selectedStaff, setSelectedStaff] = useState(viewer.canViewAllBookings ? "all" : viewer.staffId);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountDrafts, setAccountDrafts] = useState<Record<string, { name: string; username: string; password: string; whatsappPhone: string }>>({});
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsBusy, setClientsBusy] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ name: viewer.name, whatsappPhone: "+962" });
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyCount, setPasskeyCount] = useState(0);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [pushState, setPushState] = useState<PushState>("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileInitialized = useRef(false);
  const dashboardAbortRef = useRef<AbortController | null>(null);
  const syncAbortRef = useRef<AbortController | null>(null);
  const clientsAbortRef = useRef<AbortController | null>(null);
  const initialDashboardLoadRef = useRef(true);
  const syncVersionRef = useRef(0);
  const lastFullLoadAtRef = useRef(0);
  const fullLoadRetryNotBeforeRef = useRef(0);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const sessionInvalidRef = useRef(false);

  const expireSession = useCallback(() => {
    if (sessionInvalidRef.current) return;
    sessionInvalidRef.current = true;
    dashboardAbortRef.current?.abort();
    syncAbortRef.current?.abort();
    clientsAbortRef.current?.abort();
    setData({ staff: [], services: [], bookings: [], items: [], schedules: [] });
    setClients([]);
    setAccounts([]);
    void onLogout();
  }, [onLogout]);

  const load = useCallback(async (silent = false, respectFailureBackoff = false) => {
    if (respectFailureBackoff && Date.now() < fullLoadRetryNotBeforeRef.current) return false;

    syncAbortRef.current?.abort();
    dashboardAbortRef.current?.abort();
    const controller = new AbortController();
    dashboardAbortRef.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10_000);

    if (silent) setDashboardRefreshing(true);
    else {
      setBusy(true);
      setError("");
    }

    try {
      const params = new URLSearchParams({ date, upcomingLimit: String(upcomingLimit) });
      if (viewer.canViewAllBookings && selectedStaff !== "all") params.set("staffId", selectedStaff);
      const response = await fetch(`/api/staff/dashboard?${params}`, { cache: "no-store", signal: controller.signal });
      const payload = await response.json() as Dashboard & { error?: string };
      if (rejectedStaffSession(response, payload.error)) {
        expireSession();
        return false;
      }
      if (!response.ok) throw new Error(payload.error);
      if (dashboardAbortRef.current !== controller) return false;

      setData(payload);
      syncVersionRef.current = Number(payload.syncVersion ?? syncVersionRef.current);
      lastFullLoadAtRef.current = Date.now();
      fullLoadRetryNotBeforeRef.current = 0;
      if (!profileInitialized.current) {
        const member = payload.staff.find((entry) => entry.id === viewer.staffId);
        if (member) {
          profileInitialized.current = true;
          setProfileDraft({ name: member.name, whatsappPhone: member.whatsapp_phone ? `+${member.whatsapp_phone}` : "+962" });
        }
      }
      return true;
    } catch {
      const isCurrent = dashboardAbortRef.current === controller;
      if (isCurrent && (!controller.signal.aborted || timedOut)) {
        fullLoadRetryNotBeforeRef.current = Date.now() + FULL_LOAD_RETRY_BACKOFF_MS;
        if (!silent) setError("تعذر تحميل بيانات تطبيق MJ الآن.");
      }
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (dashboardAbortRef.current === controller) {
        dashboardAbortRef.current = null;
        setBusy(false);
        setDashboardRefreshing(false);
      }
    }
  }, [date, expireSession, selectedStaff, upcomingLimit, viewer.canViewAllBookings, viewer.staffId]);

  const checkForUpdates = useCallback(async () => {
    if (dashboardAbortRef.current) return false;
    syncAbortRef.current?.abort();
    const controller = new AbortController();
    syncAbortRef.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 5_000);
    try {
      const response = await fetch("/api/staff/sync", { cache: "no-store", signal: controller.signal });
      const payload = await response.json() as { version?: number; error?: string };
      if (rejectedStaffSession(response, payload.error)) {
        expireSession();
        return false;
      }
      if (!response.ok) throw new Error("SYNC_FAILED");
      if (syncAbortRef.current !== controller) return false;
      const changed = Number(payload.version ?? 0) > syncVersionRef.current;
      const requiresFullLoad = changed || Date.now() - lastFullLoadAtRef.current >= 5 * 60_000;
      const refreshed = requiresFullLoad ? await load(true, true) : true;
      return changed && refreshed;
    } catch {
      if (syncAbortRef.current === controller && (!controller.signal.aborted || timedOut) && Date.now() - lastFullLoadAtRef.current >= 5 * 60_000) await load(true, true);
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (syncAbortRef.current === controller) syncAbortRef.current = null;
    }
  }, [expireSession, load]);

  const loadClients = useCallback(async (silent = false, search = "", staffId = selectedStaff) => {
    clientsAbortRef.current?.abort();
    const controller = new AbortController();
    clientsAbortRef.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10_000);
    if (!silent) setClientsBusy(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (viewer.canViewAllBookings) params.set("staffId", staffId);
      const response = await fetch(`/api/staff/clients?${params}`, { cache: "no-store", signal: controller.signal });
      const payload = await response.json() as { clients?: ClientRow[]; error?: string };
      if (rejectedStaffSession(response, payload.error)) {
        expireSession();
        return;
      }
      if (!response.ok) throw new Error("CLIENTS_FAILED");
      if (clientsAbortRef.current !== controller) return;
      setClients(payload.clients ?? []);
    } catch {
      if (clientsAbortRef.current === controller && (!controller.signal.aborted || timedOut) && !silent) setError("تعذر تحميل سجل العملاء الآن.");
    } finally {
      window.clearTimeout(timeout);
      if (clientsAbortRef.current === controller) {
        clientsAbortRef.current = null;
        setClientsBusy(false);
      }
    }
  }, [expireSession, selectedStaff, viewer.canViewAllBookings]);

  useEffect(() => {
    let timer = 0;
    const checkExpiry = () => {
      const remaining = viewer.sessionExpiresAt - Date.now();
      if (remaining <= 0) return expireSession();
      timer = window.setTimeout(checkExpiry, Math.min(remaining, 60 * 60_000));
    };
    checkExpiry();
    return () => window.clearTimeout(timer);
  }, [expireSession, viewer.sessionExpiresAt]);

  const loadAccounts = async () => {
    if (!viewer.isOwner) return;
    const response = await fetch("/api/staff/accounts", { cache: "no-store" });
    if (!response.ok) return setError("تعذر تحميل حسابات الفريق.");
    const payload = await response.json() as { accounts: AccountRow[] };
    setAccounts(payload.accounts);
    setAccountDrafts(Object.fromEntries(payload.accounts.map((account) => [
      account.staff_id,
      {
        username: account.username ?? account.name.toLowerCase(),
        name: account.name,
        password: "",
        whatsappPhone: account.whatsapp_phone ? `+${account.whatsapp_phone}` : "+962",
      },
    ])));
  };

  useEffect(() => {
    const silent = !initialDashboardLoadRef.current;
    initialDashboardLoadRef.current = false;
    const timer = window.setTimeout(() => void load(silent), 0);
    return () => {
      window.clearTimeout(timer);
      dashboardAbortRef.current?.abort();
    };
  }, [load]);

  useEffect(() => () => {
    dashboardAbortRef.current?.abort();
    syncAbortRef.current?.abort();
    clientsAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (!requestedTab || !navItems.some((item) => item.id === requestedTab)) return;
    const timer = window.setTimeout(() => setTab(requestedTab), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!remembered) {
      const timer = window.setTimeout(() => setPushState("personal_device_required"), 0);
      return () => window.clearTimeout(timer);
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      const timer = window.setTimeout(() => setPushState("unsupported"), 0);
      return () => window.clearTimeout(timer);
    }
    void (async () => {
      try {
        const response = await fetch("/api/staff/push", { cache: "no-store" });
        const payload = response.ok ? await response.json() as { configured?: boolean; publicKey?: string } : null;
        if (!payload?.configured || !payload.publicKey) return setPushState("unconfigured");
        setVapidPublicKey(payload.publicKey);
        if (Notification.permission === "denied") return setPushState("denied");
        const registration = await getStaffServiceWorker();
        if (!registration) return setPushState("unsupported");
        let subscription = await registration.pushManager.getSubscription();
        if (subscription && !subscriptionUsesKey(subscription, payload.publicKey)) {
          await fetch("/api/staff/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined);
          await subscription.unsubscribe().catch(() => false);
          subscription = null;
        }
        if (subscription && Notification.permission === "granted") {
          const syncResponse = await fetch("/api/staff/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
          if (!syncResponse.ok) throw new Error("PUSH_SYNC_FAILED");
          setPushState("enabled");
        } else {
          setPushState("prompt");
        }
      } catch {
        setPushState(Notification.permission === "denied" ? "denied" : "prompt");
      }
    })();
  }, [remembered, viewer.accountId, viewer.sessionExpiresAt]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === "MJ_BOOKING_UPDATED") void load(true, true);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [load]);

  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const changed = await checkForUpdates();
      if (changed && tab === "clients") await loadClients(true, query, selectedStaff);
    };
    const interval = window.setInterval(() => void refresh(), pushState === "enabled" ? 60_000 : 15_000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      syncAbortRef.current?.abort();
    };
  }, [checkForUpdates, loadClients, pushState, query, selectedStaff, tab]);

  useEffect(() => {
    if (tab !== "clients") return;
    const timer = window.setTimeout(() => void loadClients(false, query, selectedStaff), 220);
    return () => {
      window.clearTimeout(timer);
      clientsAbortRef.current?.abort();
    };
  }, [loadClients, query, selectedStaff, tab]);

  useEffect(() => {
    if (!biometricEligible || !browserSupportsWebAuthn()) return;
    void platformAuthenticatorIsAvailable().then(setPasskeySupported).catch(() => setPasskeySupported(false));
    void fetch("/api/staff/passkeys", { cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<{ count: number }> : null).then((payload) => setPasskeyCount(payload?.count ?? 0));
  }, [biometricEligible]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const focusTimer = window.setTimeout(() => profileMenuRef.current?.querySelector<HTMLButtonElement>(".mj-member-popover button")?.focus(), 0);
    const closeOutside = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileMenuOpen(false);
    };
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setProfileMenuOpen(false);
      profileMenuTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, [profileMenuOpen]);

  const visibleItems = useMemo(() => data.items
    .filter((item) => item.status !== "cancelled")
    .filter((item) => !viewer.canViewAllBookings || selectedStaff === "all" || item.staff_id === selectedStaff),
  [data.items, selectedStaff, viewer.canViewAllBookings]);

  const bookingsById = useMemo(() => new Map(data.bookings.map((booking) => [booking.id, booking])), [data.bookings]);

  const selectedDateItems = useMemo(() => visibleItems
    .filter((item) => item.booking_date === date)
    .filter((item) => {
      if (!query.trim()) return true;
      const booking = bookingsById.get(item.booking_id);
      return `${booking?.first_name ?? ""} ${booking?.last_name ?? ""} ${booking?.phone ?? ""} ${booking?.booking_code ?? ""}`
        .toLowerCase().includes(query.toLowerCase());
    })
    .sort((left, right) => left.start_minute - right.start_minute),
  [visibleItems, date, query, bookingsById]);

  const todayIso = ammanToday();
  const futureItems = useMemo(() => visibleItems
    .filter((item) => ["confirmed", "arrived", "in_service"].includes(item.status))
    .filter((item) => item.booking_date > todayIso || (item.booking_date === todayIso && item.end_minute > ammanNowMinutes()))
    .sort((left, right) => left.booking_date.localeCompare(right.booking_date) || left.start_minute - right.start_minute),
  [todayIso, visibleItems]);

  const currentMember = data.staff.find((member) => member.id === viewer.staffId);
  const statusMember = data.staff.find((member) => member.id === (selectedStaff === "all" ? viewer.staffId : selectedStaff)) ?? currentMember;
  const todayCount = visibleItems.filter((item) => item.booking_date === todayIso).length;
  const completedCount = visibleItems.filter((item) => item.booking_date === todayIso && item.status === "completed").length;
  const nextItem = futureItems[0];
  const nextBooking = nextItem ? bookingsById.get(nextItem.booking_id) : undefined;
  const canLoadMoreUpcoming = Boolean(data.upcomingHasMore) && upcomingLimit < MAX_UPCOMING_ITEMS;
  const upcomingLimitReached = Boolean(data.upcomingHasMore) && upcomingLimit >= MAX_UPCOMING_ITEMS;

  const updateStatus = async (staffId: string, status: Status) => {
    setActionBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/staff/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "staff", id: staffId, status }),
      });
      if (!response.ok) throw new Error("STATUS_FAILED");
      setNotice(status === "available" ? "تم فتح جدولك واستقبال الحجوزات مباشرة." : status === "break" ? "تم تفعيل البريك وإيقاف الحجوزات لهذا اليوم." : status === "off_today" ? "تم تسجيل إجازة اليوم." : "تم إيقاف التوفر حتى إعادة التفعيل.");
      await load();
    } catch {
      setError("تعذر تحديث حالتك الآن.");
    } finally {
      setActionBusy(false);
    }
  };

  const updateWeeklyOffDay = async (staffId: string, weeklyOffDay: number | null) => {
    setActionBusy(true);
    setError("");
    setNotice("");
    const previous = data.staff.find((member) => member.id === staffId)?.weekly_off_day ?? null;
    setData((current) => ({ ...current, staff: current.staff.map((member) => member.id === staffId ? { ...member, weekly_off_day: weeklyOffDay } : member) }));
    try {
      const response = await fetch("/api/staff/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "staff", id: staffId, weeklyOffDay }),
      });
      if (!response.ok) throw new Error("WEEKLY_DAY_FAILED");
      setNotice("تم حفظ يوم الإجازة الأسبوعية وتحديث الحجز مباشرة.");
      await load();
    } catch {
      setData((current) => ({ ...current, staff: current.staff.map((member) => member.id === staffId ? { ...member, weekly_off_day: previous } : member) }));
      setError("تعذر حفظ يوم الإجازة الأسبوعية.");
    } finally {
      setActionBusy(false);
    }
  };

  const updateService = async (id: string, status: ServiceRow["status"]) => {
    const response = await fetch("/api/staff/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "service", id, status }),
    });
    if (!response.ok) return setError("تعذر تغيير حالة الخدمة.");
    setNotice("تم تحديث ظهور الخدمة في الحجز.");
    await load();
  };

  const updateBookingStatus = async (itemId: string, status: "arrived" | "in_service" | "completed" | "cancelled" | "no_show") => {
    setActionBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/staff/bookings/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, status }),
      });
      if (!response.ok) throw new Error("BOOKING_STATUS_FAILED");
      setNotice(status === "arrived" ? "تم تسجيل وصول العميل." : status === "in_service" ? "بدأ تنفيذ الخدمة." : status === "completed" ? "تم إكمال الموعد وحفظه في سجل العميل." : status === "no_show" ? "تم تسجيل عدم حضور العميل." : "تم إلغاء الموعد وتحرير الوقت.");
      await load(true);
      if (tab === "clients") await loadClients(true, query, selectedStaff);
    } catch {
      setError("تعذر تحديث حالة الموعد؛ حدّث الصفحة وحاول مجددًا.");
    } finally {
      setActionBusy(false);
    }
  };

  const saveAccount = async (staffId: string) => {
    const draft = accountDrafts[staffId];
    if (!draft?.password) return setError("اكتب كلمة مرور جديدة من 10 أحرف على الأقل.");
    setError("");
    setNotice("");
    const response = await fetch("/api/staff/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, ...draft }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return setError(payload.error === "USERNAME_TAKEN" ? "اسم المستخدم مستخدم لحساب آخر." : payload.error === "WEAK_PASSWORD" ? "كلمة المرور يجب أن تكون 10 أحرف على الأقل." : "تعذر حفظ الحساب.");
    setNotice("تم حفظ الحساب وكلمة المرور المشفرة.");
    await loadAccounts();
  };

  const saveProfile = async (staffId: string, draft: { name: string; whatsappPhone: string }) => {
    setActionBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/staff/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, name: draft.name, whatsappPhone: draft.whatsappPhone }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "PROFILE_FAILED");
      setNotice("تم حفظ الاسم ورقم واتساب في ملف تطبيق الفريق.");
      await load(true);
      if (viewer.isOwner) await loadAccounts();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "PROFILE_FAILED";
      setError(message === "INVALID_PHONE" ? "اكتب رقم واتساب صحيحًا مع رمز الدولة." : "تعذر حفظ معلومات الملف الشخصي.");
    } finally {
      setActionBusy(false);
    }
  };

  const uploadProfileImage = async (staffId: string, file?: File) => {
    if (!file) return;
    setActionBusy(true);
    setError("");
    setNotice("");
    try {
      if (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) throw new Error("INVALID_PROFILE_IMAGE");
      const image = await cropProfileImage(file);
      const form = new FormData();
      form.set("staffId", staffId);
      form.set("image", image, `${staffId}.webp`);
      const response = await fetch("/api/staff/profile/image", { method: "POST", body: form });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "PROFILE_IMAGE_FAILED");
      setNotice("تم ضبط الصورة بمقاس مربع وحفظها لتطبيق الفريق فقط.");
      await load(true);
      if (viewer.isOwner) await loadAccounts();
    } catch {
      setError("تعذر معالجة الصورة. استخدم JPG أو PNG أو WebP واضحة.");
    } finally {
      setActionBusy(false);
    }
  };

  const registerPasskey = async () => {
    if (!passkeySupported) return setError("هذا المتصفح أو الجهاز لا يدعم دخول البصمة حاليًا.");
    setPasskeyBusy(true);
    setError("");
    setNotice("");
    try {
      const optionsResponse = await fetch("/api/staff/passkeys/register/options", { method: "POST" });
      const optionsPayload = await optionsResponse.json() as { options?: PublicKeyCredentialCreationOptionsJSON; challengeId?: string; error?: string };
      if (!optionsResponse.ok || !optionsPayload.options || !optionsPayload.challengeId) throw new Error(optionsPayload.error ?? "PASSKEY_OPTIONS_FAILED");
      const credential = await startRegistration({ optionsJSON: optionsPayload.options });
      const verifyResponse = await fetch("/api/staff/passkeys/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: optionsPayload.challengeId, response: credential }),
      });
      const verifyPayload = await verifyResponse.json() as { count?: number; error?: string };
      if (!verifyResponse.ok) throw new Error(verifyPayload.error ?? "PASSKEY_VERIFY_FAILED");
      setPasskeyCount(verifyPayload.count ?? 1);
      setNotice("تم تفعيل الدخول الآمن على هذا الجهاز. نوع البصمة يحدده نظام الهاتف.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.name : "";
      if (message !== "NotAllowedError") setError("تعذر تفعيل البصمة أو Face ID على هذا الجهاز.");
    } finally {
      setPasskeyBusy(false);
    }
  };

  const enablePushNotifications = async () => {
    if (!remembered) {
      setPushState("personal_device_required");
      return setError("الإشعارات تحتوي تفاصيل حجوزات؛ سجّل الدخول مع خيار «تذكّرني» على جهازك الشخصي أولًا.");
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushState("unsupported");
      return setError("هذا الجهاز لا يدعم إشعارات تطبيقات الويب.");
    }
    setPushBusy(true);
    setError("");
    setNotice("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "prompt");
        return setError(permission === "denied" ? "الإشعارات محظورة من إعدادات الجهاز. فعّلها لتطبيق MJ ثم حاول مجددًا." : "لم يتم منح إذن الإشعارات.");
      }
      let publicKey = vapidPublicKey;
      if (!publicKey) {
        const response = await fetch("/api/staff/push", { cache: "no-store" });
        const payload = await response.json() as { configured?: boolean; publicKey?: string };
        if (!response.ok || !payload.configured || !payload.publicKey) throw new Error("PUSH_NOT_CONFIGURED");
        publicKey = payload.publicKey;
        setVapidPublicKey(publicKey);
      }
      const registration = await getStaffServiceWorker();
      if (!registration) throw new Error("SERVICE_WORKER_UNAVAILABLE");
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !subscriptionUsesKey(subscription, publicKey)) {
        await fetch("/api/staff/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined);
        await subscription.unsubscribe().catch(() => false);
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const response = await fetch("/api/staff/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!response.ok) throw new Error("PUSH_SAVE_FAILED");
      setPushState("enabled");
      setNotice("إشعارات حجوزات MJ مفعّلة على هذا الجهاز.");
      await registration.showNotification("MJ Team", {
        body: "تم تفعيل إشعارات الحجوزات بنجاح.",
        icon: "/assets/mj-notification-192.png",
        badge: "/assets/mj-notification-badge.png",
        tag: "mj-push-enabled",
        data: { url: "/staff" },
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "PUSH_FAILED";
      setPushState(message === "PUSH_NOT_CONFIGURED" ? "unconfigured" : "prompt");
      setError(message === "PUSH_NOT_CONFIGURED" ? "خدمة الإشعارات لم تُجهّز على الخادم بعد." : "تعذر تفعيل الإشعارات الآن. تأكد من تثبيت MJ واتصال الإنترنت.");
    } finally {
      setPushBusy(false);
    }
  };

  const disablePushNotifications = async () => {
    if (!("serviceWorker" in navigator)) return;
    setPushBusy(true);
    setError("");
    try {
      const registration = await getStaffServiceWorker();
      if (!registration) throw new Error("SERVICE_WORKER_UNAVAILABLE");
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/staff/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setPushState(Notification.permission === "denied" ? "denied" : "prompt");
      setNotice("تم إيقاف إشعارات MJ على هذا الجهاز فقط.");
    } catch {
      setError("تعذر إيقاف الإشعارات الآن.");
    } finally {
      setPushBusy(false);
    }
  };

  const testPushNotifications = async () => {
    setPushBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/staff/push/test", { method: "POST" });
      const payload = await response.json() as { delivered?: number; error?: string };
      if (!response.ok || !payload.delivered) throw new Error(payload.error ?? "PUSH_TEST_FAILED");
      setNotice("تم إرسال إشعار تجريبي حقيقي من خادم MJ إلى هذا الجهاز.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "PUSH_TEST_FAILED";
      setError(message === "PUSH_SUBSCRIPTION_REQUIRED"
        ? "لم يُسجّل هذا الجهاز بعد؛ أوقف الإشعارات ثم فعّلها مرة أخرى."
        : "لم يصل الاختبار من الخادم. تأكد من اتصال الإنترنت وسماح الجهاز بالإشعارات.");
    } finally {
      setPushBusy(false);
    }
  };

  const changeTab = (next: Tab) => {
    if (next === "status" && selectedStaff === "all") setSelectedStaff(viewer.staffId);
    if (next === "profile" && viewer.isOwner && !accounts.length) void loadAccounts();
    setTab(next);
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openProfile = () => {
    setProfileMenuOpen(false);
    changeTab("profile");
  };

  const logoutFromMenu = () => {
    setProfileMenuOpen(false);
    void onLogout();
  };

  const title = navItems.find((item) => item.id === tab)?.label ?? "مواعيدي";
  const headerImage = memberImage(viewer.staffId, currentMember?.profile_image_updated_at);
  const currentStatus = currentMember?.status ?? "available";
  const liveLabel = currentStatus === "available" ? "LIVE" : currentStatus === "break" ? "BREAK" : currentStatus === "off_today" ? "OFF" : "OFFLINE";
  const displayName = currentMember?.name ?? viewer.name;

  const appointmentCard = (item: ItemRow, showDate = false) => {
    const booking = bookingsById.get(item.booking_id);
    const service = getService(item.service_id);
    const staff = getStaff(item.staff_id);
    const staffRow = data.staff.find((member) => member.id === item.staff_id);
    const staffImage = memberImage(item.staff_id, staffRow?.profile_image_updated_at);
    const statusText = item.status === "arrived" ? "وصل" : item.status === "in_service" ? "قيد الخدمة" : item.status === "completed" ? "مكتمل" : item.status === "no_show" ? "لم يحضر" : "مؤكد";
    return (
      <article className="mj-appointment" key={item.id}>
        <div className="mj-appointment-time">{showDate && <small>{displayDate(item.booking_date, true)}</small>}<strong>{minutesToTime(item.start_minute, "ar")}</strong><span>{minutesToTime(item.end_minute, "ar")}</span></div>
        <i />
        <div className="mj-appointment-person"><span className="mj-mini-avatar">{staffImage ? <img className={staffRow?.profile_image_updated_at ? "profile-image" : `poster-image staff-${item.staff_id}`} src={staffImage} alt="" /> : staff?.name.slice(0, 2)}</span><div><small>{service?.name.ar}</small><strong>{booking?.full_name ?? `${booking?.first_name ?? ""} ${booking?.last_name ?? ""}`}</strong><span>{booking?.booking_code} · <b className={`status-${item.status}`}>{statusText}</b></span></div></div>
        {booking?.phone && <a href={`https://wa.me/${booking.phone}`} target="_blank" rel="noreferrer" aria-label={`مراسلة ${booking.first_name} عبر واتساب`}><MessageCircle size={18} /></a>}
        {["confirmed", "arrived", "in_service"].includes(item.status) && <div className="mj-appointment-ops">
          {item.status === "confirmed" && <button disabled={actionBusy} onClick={() => void updateBookingStatus(item.id, "arrived")}>تسجيل الوصول</button>}
          {item.status === "arrived" && <button disabled={actionBusy} onClick={() => void updateBookingStatus(item.id, "in_service")}>بدء الخدمة</button>}
          {item.status === "in_service" && <button disabled={actionBusy} onClick={() => void updateBookingStatus(item.id, "completed")}>إكمال الموعد</button>}
          {item.status !== "in_service" && <button className="muted" disabled={actionBusy} onClick={() => void updateBookingStatus(item.id, "no_show")}>لم يحضر</button>}
          {item.status !== "in_service" && <button className="danger" disabled={actionBusy} onClick={() => void updateBookingStatus(item.id, "cancelled")}>إلغاء</button>}
        </div>}
      </article>
    );
  };

  return (
    <main className="mj-staff-app" dir="rtl">
      <div className="mj-staff-atmosphere" aria-hidden="true"><i /><i /><i /></div>
      <header className="mj-staff-header">
        <div className={`mj-live ${currentStatus}`} aria-label={`الحالة الحالية: ${statusLabel(currentStatus)}`}><span>{liveLabel}</span><i /></div>
        <div className="mj-member-menu" ref={profileMenuRef}>
          <button
            ref={profileMenuTriggerRef}
            className="mj-member-chip"
            type="button"
            aria-expanded={profileMenuOpen}
            aria-controls="mj-member-popover"
            aria-label={`خيارات حساب ${displayName}`}
            onClick={() => setProfileMenuOpen((open) => !open)}
          >
            <span className={`mj-member-avatar ${currentStatus}`}>{headerImage ? <img className={currentMember?.profile_image_updated_at ? "profile-image" : `poster-image staff-${viewer.staffId}`} src={headerImage} alt="" /> : displayName.slice(0, 2)}</span>
            <span><small>TEAM MEMBER</small><strong>{displayName}</strong><em>{currentMember?.role_ar ?? (viewer.isOwner ? "المدير" : "عضو الفريق")}</em></span>
            <ChevronDown className={profileMenuOpen ? "open" : ""} size={18} />
          </button>
          {profileMenuOpen && <div className="mj-member-popover" id="mj-member-popover" aria-label="خيارات حساب الموظف">
            <button type="button" onClick={openProfile}><UserCog size={20} /><span><strong>معلوماتي</strong><small>الملف الشخصي والأمان والإشعارات</small></span></button>
            <button className="logout" type="button" onClick={logoutFromMenu}><LogOut size={20} /><span><strong>تسجيل الخروج</strong><small>الخروج الآمن من هذا الجهاز</small></span></button>
          </div>}
        </div>
      </header>

      <section className="mj-staff-content">
        <header className="mj-screen-heading"><p>MJ OPERATIONS</p><h1>{title}</h1></header>
        <label className="mj-screen-select"><span className="sr-only">القسم الحالي</span><select value={tab} onChange={(event) => changeTab(event.target.value as Tab)}>{navItems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><ChevronDown size={18} /></label>
        {viewer.canViewAllBookings && tab !== "profile" && (viewer.isOwner || tab !== "status") && <label className="mj-owner-filter"><span>عرض بيانات</span><select value={selectedStaff} onChange={(event) => { setSelectedStaff(event.target.value); setUpcomingLimit(UPCOMING_PAGE_SIZE); }}>{tab !== "status" && <option value="all">فريق MJ كامل</option>}{data.staff.filter((member) => member.id !== "reception").map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}

        {error && <div className="mj-app-alert error">{error}</div>}
        {notice && <div className="mj-app-alert success"><Check size={18} />{notice}</div>}

        {busy ? <div className="mj-app-loading"><LoaderCircle className="spin" size={34} /><span>جارٍ ترتيب يومك…</span></div> : tab === "schedule" ? <>
          <section className="mj-next-card">
            <div className="mj-card-kicker"><span>الموعد التالي</span><Scissors size={18} /></div>
            {nextItem ? <div className="mj-next-content"><span className="mj-next-check"><CalendarClock size={28} /></span><div><small>{displayDate(nextItem.booking_date, true)} · {minutesToTime(nextItem.start_minute, "ar")}</small><h2>{nextBooking?.first_name} {nextBooking?.last_name}</h2><p>{getService(nextItem.service_id)?.name.ar}</p></div></div> : <div className="mj-empty-next"><span><Check size={32} /></span><h2>لا يوجد موعد قادم.</h2><p>اليوم مرتب، وستظهر أي حجز جديد هنا لحظيًا.</p></div>}
          </section>

          <div className="mj-stat-grid"><article><small>مواعيد اليوم</small><strong>{todayCount}</strong></article><article><small>القادمة</small><strong>{futureItems.length}{data.upcomingHasMore ? "+" : ""}</strong></article><article><small>مكتمل اليوم</small><strong>{completedCount}</strong></article></div>

          <section className="mj-timeline-card">
            <div className="mj-section-title"><div><small>TODAY TIMELINE</small><h2>{displayDate(date)}</h2></div><CalendarDays size={27} /></div>
            <div className="mj-date-controls"><button onClick={() => setDate(shiftIsoDate(date, 1))} aria-label="اليوم التالي"><ChevronRight size={20} /></button><button onClick={() => setDate(ammanToday())}>اليوم</button><button onClick={() => setDate(shiftIsoDate(date, -1))} aria-label="اليوم السابق"><ChevronLeft size={20} /></button></div>
            <label className="mj-search"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم، الرقم أو رقم الحجز" /></label>
            <div className="mj-list">{selectedDateItems.map((item) => appointmentCard(item))}{!selectedDateItems.length && <div className="mj-list-empty"><CalendarDays size={40} /><h3>لا توجد مواعيد في هذا اليوم</h3><p>ستظهر المواعيد هنا فور تأكيدها.</p></div>}</div>
          </section>
        </> : tab === "upcoming" ? <section className="mj-panel-card">
          <div className="mj-section-title"><div><small>UPCOMING BOOKINGS</small><h2>الحجوزات القادمة</h2></div><CalendarClock size={28} /></div>
          <div className="mj-list">
            {futureItems.map((item) => appointmentCard(item, true))}
            {!futureItems.length && <div className="mj-list-empty tall"><CalendarDays size={44} /><h3>لا توجد حجوزات قادمة</h3><p>ستظهر المواعيد الجديدة هنا تلقائيًا.</p></div>}
            {canLoadMoreUpcoming && <button
              type="button"
              disabled={dashboardRefreshing}
              onClick={() => setUpcomingLimit((current) => Math.min(MAX_UPCOMING_ITEMS, current + UPCOMING_PAGE_SIZE))}
              className="mj-load-more"
            >{dashboardRefreshing ? "جارٍ التحميل…" : "عرض المزيد من الحجوزات"}</button>}
            {upcomingLimitReached && <p className="mj-pagination-note">تم عرض أقرب {MAX_UPCOMING_ITEMS} حجز قادم. استخدم شاشة اليوم للوصول إلى تاريخ محدد.</p>}
          </div>
        </section> : tab === "clients" ? <section className="mj-panel-card">
          <div className="mj-section-title"><div><small>CLIENT HISTORY</small><h2>سجل العملاء</h2></div><UsersRound size={28} /></div>
          <label className="mj-search"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم الكامل أو رقم الجوال" /></label>
          {clientsBusy ? <div className="mj-client-refresh"><LoaderCircle className="spin" size={20} />جارٍ تحديث السجل…</div> : <div className="mj-client-list">{clients.map((client) => { const initials = client.full_name.split(/\s+/).filter(Boolean); return <article key={client.phone}><span className="mj-client-avatar">{initials[0]?.slice(0, 1)}{initials.at(-1)?.slice(0, 1)}</span><div><strong>{client.full_name}</strong><small>{client.booking_count} {client.booking_count === 1 ? "زيارة" : "زيارات"}{client.next_booking_date ? ` · القادم ${displayDate(client.next_booking_date, true)}` : ` · آخر زيارة ${displayDate(client.last_booking_date, true)}`}</small><em dir="ltr">+{client.phone}</em></div><a href={`https://wa.me/${client.phone}`} target="_blank" rel="noreferrer" aria-label={`مراسلة ${client.full_name} عبر واتساب`}><MessageCircle size={18} /></a></article>; })}{!clients.length && <div className="mj-list-empty tall"><UserRound size={44} /><h3>سجل العملاء سيبدأ هنا</h3><p>يُحفظ العميل بعد أول حجز مرتبط بالحلاق، ومصطفى يرى السجل الكامل.</p></div>}</div>}
        </section> : tab === "status" ? <>
          <section className="mj-status-card">
            <div className={`mj-status-photo ${statusMember?.status ?? "available"}`}>{memberImage(statusMember?.id ?? "", statusMember?.profile_image_updated_at) ? <img className={statusMember?.profile_image_updated_at ? "profile-image" : `poster-image staff-${statusMember?.id ?? ""}`} src={memberImage(statusMember?.id ?? "", statusMember?.profile_image_updated_at)} alt={statusMember?.name ?? ""} /> : <span>{statusMember?.name.slice(0, 2)}</span>}</div>
            <small>LIVE AVAILABILITY</small><h2>{statusMember?.name ?? viewer.name}</h2><p className={`mj-current-status ${statusMember?.status ?? "available"}`}>{statusLabel(statusMember?.status ?? "available")}</p>
            <div className="mj-status-actions">
              <button className={statusMember?.status === "available" ? "active available" : ""} disabled={actionBusy || !statusMember} onClick={() => statusMember && void updateStatus(statusMember.id, "available")}><CirclePlay size={28} /><strong>متاح</strong><span>فتح الحجوزات</span></button>
              <button className={statusMember?.status === "break" ? "active break" : ""} disabled={actionBusy || !statusMember} onClick={() => statusMember && void updateStatus(statusMember.id, "break")}><CirclePause size={27} /><strong>بريك</strong><span>إغلاق مؤقت</span></button>
              <button className={statusMember?.status === "off_today" ? "active off" : ""} disabled={actionBusy || !statusMember} onClick={() => statusMember && void updateStatus(statusMember.id, "off_today")}><UserMinus size={27} /><strong>إجازة</strong><span>إغلاق اليوم</span></button>
            </div>
            <p className="mj-status-note">التغيير يُحفظ مباشرة، والتطبيق يحدّث الحجوزات بالإشعارات؛ وعند غيابها يفحصها احتياطيًا كل 15 ثانية.</p>
          </section>

          <section className="mj-hours-card">
            <div className="mj-section-title"><div><small>WORKING HOURS</small><h2>الدوام الأسبوعي</h2></div><Clock3 size={30} /></div>
            <label className="mj-day-off"><span>يوم الإجازة الأسبوعية</span><select value={statusMember?.weekly_off_day ?? -1} disabled={!statusMember || actionBusy} onChange={(event) => statusMember && void updateWeeklyOffDay(statusMember.id, Number(event.target.value) < 0 ? null : Number(event.target.value))}><option value={-1}>بدون يوم ثابت</option>{weekdayNames.map((day, index) => <option key={day} value={index}>{day}</option>)}</select><ChevronDown size={17} /></label>
            <div className="mj-week-list">{weekdayNames.map((day, weekday) => { const schedule = data.schedules.find((entry) => entry.staff_id === statusMember?.id && entry.weekday === weekday); const off = statusMember?.weekly_off_day === weekday || schedule?.active === 0; return <article className={off ? "off" : ""} key={day}><div><strong>{day}</strong><small>{off ? "إجازة أسبوعية" : "دوام"}</small></div><span>{off ? "—" : `${minutesToTime(schedule?.start_minute ?? 12 * 60, "ar")} — ${minutesToTime(schedule?.end_minute ?? 23 * 60, "ar")}`}</span></article>; })}</div>
          </section>
        </> : <>
          <section className="mj-profile-card">
            <div className="mj-section-title"><div><small>MY MJ PROFILE</small><h2>معلوماتي</h2><p>بيانات حسابك ورقم واتساب المسجّل لاستلام إشعارات الحجوزات.</p></div><span className="mj-round-icon"><UserCog size={31} /></span></div>
            <div className="mj-profile-member"><span className={`mj-member-avatar ${currentStatus}`}>{headerImage ? <img className={currentMember?.profile_image_updated_at ? "profile-image" : `poster-image staff-${viewer.staffId}`} src={headerImage} alt="" /> : displayName.slice(0, 2)}</span><div><small>TEAM MEMBER</small><strong>{displayName}</strong><em>{currentMember?.role_ar ?? "عضو الفريق"}</em></div></div>
            <div className="mj-profile-editor">
              <label><span>الاسم الظاهر داخل التطبيق</span><input value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label><span>رقم واتساب</span><input dir="ltr" inputMode="tel" value={profileDraft.whatsappPhone} onChange={(event) => setProfileDraft((current) => ({ ...current, whatsappPhone: event.target.value }))} /></label>
              <label className="mj-photo-upload"><Camera size={18} /><span>اختيار صورة بروفايل جديدة</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void uploadProfileImage(viewer.staffId, file); }} /></label>
              <button type="button" disabled={actionBusy} onClick={() => void saveProfile(viewer.staffId, profileDraft)}><Save size={17} />حفظ معلوماتي</button>
            </div>
            <dl><div><dt>اسم المستخدم للدخول</dt><dd dir="ltr">{viewer.username}</dd></div><div><dt>صورة بروفايل التطبيق</dt><dd>{currentMember?.profile_image_updated_at ? "خاصة بتطبيق الفريق — لا تغيّر صورة الموقع" : "الصورة الافتراضية — يمكنك استبدالها للتطبيق فقط"}</dd></div></dl>
          </section>

          <StaffCredentials viewer={viewer} remembered={remembered} onChanged={onViewerChange} />

          <section className="mj-device-card"><span className="mj-round-icon"><Fingerprint size={34} /></span><div><small>DEVICE SIGN-IN</small><h2>الدخول بالبصمة أو Face ID</h2><p>{passkeyCount ? `مفعّل (${passkeyCount}) — يمكنك إضافة مفتاح آخر لهذا الجهاز.` : biometricEligible ? "يُخزّن الهاتف مفتاح الدخول؛ التطبيق لا يرى بيانات بصمتك." : "يتاح التفعيل عند فتح MJ كتطبيق مثبت على الهاتف."}</p></div><button type="button" disabled={!passkeySupported || passkeyBusy} onClick={() => void registerPasskey()}>{passkeyBusy ? "جارٍ التفعيل…" : passkeyCount ? "إضافة/تحديث" : passkeySupported ? "تفعيل الآن" : biometricEligible ? "غير مدعوم" : "ثبّت التطبيق أولًا"}</button></section>

          <section className="mj-profile-actions">
            <article className={`mj-push-status ${pushState}`}><BellRing size={23} /><div><strong>إشعارات حجوزات MJ</strong><span>{pushState === "enabled" ? "فعّالة على هذا الجهاز وتصل حتى عند إغلاق التطبيق." : pushState === "denied" ? "محظورة من إعدادات الجهاز." : pushState === "unsupported" ? "غير مدعومة على هذا الجهاز." : pushState === "unconfigured" ? "الخدمة غير مهيأة على الخادم." : pushState === "personal_device_required" ? "متاحة عند اختيار «تذكّرني» على جهاز شخصي فقط." : pushState === "checking" ? "جارٍ فحص حالة الإشعارات…" : "فعّلها مرة واحدة لتصلك الحجوزات بشعار MJ."}</span></div>{pushState === "enabled" ? <ShieldCheck size={20} /> : <BellRing size={20} />}</article>
            {pushState === "enabled" && <button className="mj-push-test" disabled={pushBusy} onClick={() => void testPushNotifications()}><BellRing size={19} />{pushBusy ? "جارٍ إرسال الاختبار…" : "اختبار إشعار حقيقي الآن"}</button>}
            {pushState === "enabled" ? <button className="mj-push-toggle disable" disabled={pushBusy} onClick={() => void disablePushNotifications()}><BellRing size={19} />{pushBusy ? "جارٍ الإيقاف…" : "إيقاف إشعارات هذا الجهاز"}</button> : <button className="mj-push-toggle" disabled={pushBusy || ["checking", "unsupported", "unconfigured", "personal_device_required"].includes(pushState)} onClick={() => void enablePushNotifications()}><BellRing size={19} />{pushBusy ? "جارٍ التفعيل…" : pushState === "denied" ? "أعد السماح من إعدادات الجهاز" : "تفعيل إشعارات الحجوزات"}</button>}
          </section>

          {viewer.isOwner && <details className="mj-owner-tools"><summary><span><KeyRound size={20} />حسابات وملفات الفريق</span><ChevronDown size={18} /></summary><div className="mj-account-grid">{accounts.map((account) => { const draft = accountDrafts[account.staff_id] ?? { name: account.name, username: "", password: "", whatsappPhone: "+962" }; const accountImage = memberImage(account.staff_id, account.profile_image_updated_at); return <article key={account.staff_id}><header><span className="mj-mini-avatar">{accountImage ? <img className={account.profile_image_updated_at ? "profile-image" : `poster-image staff-${account.staff_id}`} src={accountImage} alt="" /> : account.name.slice(0, 2)}</span><div><strong>{account.name}</strong><small>{account.username ? "الحساب مفعّل" : "بانتظار الإنشاء"}</small></div></header><label><span>الاسم الظاهر</span><input value={draft.name} onChange={(event) => setAccountDrafts((current) => ({ ...current, [account.staff_id]: { ...draft, name: event.target.value } }))} /></label><label><span>اسم المستخدم</span><input dir="ltr" value={draft.username} onChange={(event) => setAccountDrafts((current) => ({ ...current, [account.staff_id]: { ...draft, username: event.target.value } }))} /></label><label><span>رقم واتساب</span><input dir="ltr" value={draft.whatsappPhone} onChange={(event) => setAccountDrafts((current) => ({ ...current, [account.staff_id]: { ...draft, whatsappPhone: event.target.value } }))} /></label><label className="mj-photo-upload"><Camera size={16} /><span>تغيير صورة تطبيق الفريق</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void uploadProfileImage(account.staff_id, file); }} /></label><button className="secondary" onClick={() => void saveProfile(account.staff_id, { name: draft.name, whatsappPhone: draft.whatsappPhone })}><Save size={16} />حفظ الملف</button><label><span>كلمة مرور جديدة</span><input type="password" placeholder="10 أحرف على الأقل" value={draft.password} onChange={(event) => setAccountDrafts((current) => ({ ...current, [account.staff_id]: { ...draft, password: event.target.value } }))} /></label><button onClick={() => void saveAccount(account.staff_id)}><KeyRound size={16} />حفظ بيانات الدخول</button></article>; })}</div></details>}

          {viewer.isOwner && <details className="mj-owner-tools"><summary><span><Settings2 size={20} />إدارة الخدمات</span><ChevronDown size={18} /></summary><div className="mj-service-list">{data.services.map((service) => <article key={service.id}><div><strong>{service.name_ar}</strong><small>{service.duration_minutes} دقيقة · {service.price_ar}</small></div><select value={service.status} onChange={(event) => void updateService(service.id, event.target.value as ServiceRow["status"])}><option value="available">متاحة</option><option value="off_today">مخفية اليوم</option><option value="disabled">متوقفة</option></select></article>)}</div></details>}

          <button className="mj-logout" onClick={() => void onLogout()}><LogOut size={19} />تسجيل الخروج من MJ</button>
        </>}
      </section>

      <nav className="mj-bottom-nav" aria-label="أقسام تطبيق MJ">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => changeTab(item.id)}><Icon size={24} /><span>{item.label}</span></button>; })}</nav>
    </main>
  );
}
