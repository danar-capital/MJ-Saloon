"use client";

import { useEffect, useRef, useState } from "react";
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { Eye, EyeOff, Fingerprint, LoaderCircle, LogIn, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import StaffCredentials from "@/components/staff/StaffCredentials";
import StaffDashboard from "@/components/staff/StaffDashboard";
import type { StaffViewer } from "@/lib/staff-auth";
import { findStaffServiceWorker, registerStaffServiceWorker } from "@/lib/staff-pwa-client";

const ACTIVE_SESSION_KEY = "mj-team-active-session";
const REMEMBER_DEVICE_KEY = "mj-team-remember-device";

async function detachDevicePushSubscription() {
  if (!("PushManager" in window) || !("serviceWorker" in navigator)) return null;
  try {
    const registration = await findStaffServiceWorker();
    const subscription = await registration?.pushManager.getSubscription().catch(() => null);
    if (!subscription) return null;
    await subscription.unsubscribe().catch(() => false);
    return subscription.endpoint;
  } catch {
    return null;
  }
}

async function closeStaffSession(pushEndpoint?: string | null, timeoutMs = 3_000) {
  await fetch("/api/staff/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pushEndpoint: pushEndpoint ?? null }),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch(() => undefined);
}

export default function StaffPortal() {
  const [viewer, setViewer] = useState<StaffViewer | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [standalone, setStandalone] = useState<boolean | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const startupCleanupRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const environmentTimer = window.setTimeout(() => {
      const ipadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
      const installed = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      setStandalone(installed);
      if (installed) {
        const url = new URL(window.location.href);
        if (url.searchParams.get("app") !== "1") {
          url.searchParams.set("app", "1");
          window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        }
      }
      setIsMobile(/android|iphone|ipad|ipod/i.test(navigator.userAgent) || ipadDesktopMode);
    }, 0);
    return () => window.clearTimeout(environmentTimer);
  }, []);

  useEffect(() => {
    if (standalone === null) return;
    if (!standalone) return;
    void registerStaffServiceWorker().catch(() => undefined);
    const startedAt = performance.now();
    const remembered = window.localStorage.getItem(REMEMBER_DEVICE_KEY) === "1";
    const activeThisWindow = window.sessionStorage.getItem(ACTIVE_SESSION_KEY) === "1";
    const rememberTimer = window.setTimeout(() => setRememberDevice(remembered), 0);
    void (async () => {
      try {
        if (remembered || activeThisWindow) {
          const response = await fetch("/api/staff/session", { cache: "no-store", signal: AbortSignal.timeout(1_200) });
          if (response.status === 401) {
            const cleanup = (async () => {
              const pushEndpoint = await detachDevicePushSubscription();
              await closeStaffSession(pushEndpoint);
            })();
            startupCleanupRef.current = cleanup;
            void cleanup;
            window.sessionStorage.removeItem(ACTIVE_SESSION_KEY);
            window.localStorage.removeItem(REMEMBER_DEVICE_KEY);
            setRememberDevice(false);
            setViewer(null);
          } else {
            if (!response.ok) throw new Error("SESSION_CHECK_FAILED");
            const payload = await response.json() as { viewer?: StaffViewer };
            if (!payload.viewer) throw new Error("SESSION_CHECK_FAILED");
            setViewer(payload.viewer);
          }
        } else {
          setViewer(null);
          const cleanup = (async () => {
            const pushEndpoint = await detachDevicePushSubscription();
            await closeStaffSession(pushEndpoint);
          })();
          startupCleanupRef.current = cleanup;
          void cleanup;
        }
      } catch {
        setViewer(null);
        setError("تعذر التحقق من الجلسة الآن. تأكد من الإنترنت ثم سجّل الدخول مجددًا.");
      } finally {
        const remaining = Math.max(0, 340 - (performance.now() - startedAt));
        window.setTimeout(() => setChecking(false), remaining);
      }
    })();
    return () => {
      window.clearTimeout(rememberTimer);
    };
  }, [standalone]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (standalone && isMobile && browserSupportsWebAuthn()) void platformAuthenticatorIsAvailable().then(setBiometricSupported).catch(() => setBiometricSupported(false));
      else setBiometricSupported(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [standalone, isMobile]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await startupCleanupRef.current;
      const response = await fetch("/api/staff/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...credentials, remember: rememberDevice }) });
      const payload = await response.json() as { viewer?: StaffViewer; error?: string };
      if (!response.ok || !payload.viewer) throw new Error(payload.error ?? "LOGIN_FAILED");
      await detachDevicePushSubscription();
      window.sessionStorage.setItem(ACTIVE_SESSION_KEY, "1");
      if (rememberDevice) window.localStorage.setItem(REMEMBER_DEVICE_KEY, "1");
      else window.localStorage.removeItem(REMEMBER_DEVICE_KEY);
      setViewer(payload.viewer);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "LOGIN_FAILED";
      setError(message === "ACCOUNT_LOCKED" ? "تم إيقاف المحاولات لمدة 15 دقيقة لحماية الحساب."
        : caught instanceof TypeError ? "تعذر الاتصال بتطبيق MJ. تأكد من الإنترنت وحاول مجددًا."
          : "اسم المستخدم أو كلمة المرور غير صحيحة.");
    } finally { setBusy(false); }
  };

  const logout = async () => {
    window.sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    window.localStorage.removeItem(REMEMBER_DEVICE_KEY);
    setRememberDevice(false);
    setViewer(null);
    setCredentials({ username: "", password: "" });
    const cleanup = (async () => {
      const pushEndpoint = await detachDevicePushSubscription();
      await closeStaffSession(pushEndpoint);
    })();
    startupCleanupRef.current = cleanup;
    await cleanup;
  };

  const passkeyLogin = async () => {
    if (!credentials.username.trim()) return setError("اكتب اسم المستخدم أولًا ثم استخدم البصمة.");
    setBusy(true);
    setError("");
    try {
      await startupCleanupRef.current;
      const optionsResponse = await fetch("/api/staff/passkeys/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: credentials.username }),
      });
      const optionsPayload = await optionsResponse.json() as { options?: PublicKeyCredentialRequestOptionsJSON; challengeId?: string; error?: string };
      if (!optionsResponse.ok || !optionsPayload.options || !optionsPayload.challengeId) throw new Error(optionsPayload.error ?? "PASSKEY_OPTIONS_FAILED");
      const credential = await startAuthentication({ optionsJSON: optionsPayload.options });
      const verifyResponse = await fetch("/api/staff/passkeys/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: optionsPayload.challengeId, response: credential, remember: rememberDevice }),
      });
      const verifyPayload = await verifyResponse.json() as { viewer?: StaffViewer; error?: string };
      if (!verifyResponse.ok || !verifyPayload.viewer) throw new Error(verifyPayload.error ?? "PASSKEY_VERIFY_FAILED");
      await detachDevicePushSubscription();
      window.sessionStorage.setItem(ACTIVE_SESSION_KEY, "1");
      if (rememberDevice) window.localStorage.setItem(REMEMBER_DEVICE_KEY, "1");
      else window.localStorage.removeItem(REMEMBER_DEVICE_KEY);
      setViewer(verifyPayload.viewer);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "PASSKEY_FAILED";
      if ((caught instanceof Error ? caught.name : "") !== "NotAllowedError") setError(message === "PASSKEY_NOT_REGISTERED" ? "هذه البصمة غير مفعلة لهذا الحساب. ادخل بكلمة المرور وفعّلها من معلوماتي." : "تعذر الدخول بالبصمة الآن؛ يمكنك استخدام كلمة المرور.");
    } finally {
      setBusy(false);
    }
  };

  if (standalone === false) return <main className="mj-browser-lock" dir="rtl"><div className="mj-login-atmosphere" aria-hidden="true"><i /><i /><i /></div><section><img src="/assets/mj-control-192.png" alt="MJ Team" /><small>MJ INSTALLED APP ONLY</small><h1>افتح MJ من أيقونة التطبيق.</h1><p>لأمان بيانات العملاء، تسجيل الدخول غير متاح من المتصفح. استخدم تطبيق MJ المثبّت على الهاتف أو كمبيوتر الاستقبال.</p><Link href="/">العودة إلى موقع MJ</Link></section></main>;
  if (checking) return <main className="mj-splash" dir="rtl"><div className="mj-splash-mark"><img src="/assets/mj-control-512.png" alt="MJ Hair Salon" /></div><span>MJ TEAM</span></main>;
  if (viewer?.mustChangeCredentials) return <main className="mj-credential-gate" dir="rtl"><div className="mj-login-atmosphere" aria-hidden="true"><i /><i /><i /></div><div className="mj-gate-brand"><img src="/assets/mj-control-192.png" alt="MJ" /><span><b>{viewer.name}</b><small>تسجيل الدخول الأول</small></span></div><StaffCredentials viewer={viewer} required remembered={rememberDevice} onChanged={setViewer} /><button className="mj-gate-logout" onClick={() => void logout()}><LogOut size={18} />الدخول بحساب آخر</button></main>;
  if (viewer) return <StaffDashboard viewer={viewer} onViewerChange={setViewer} onLogout={logout} biometricEligible={Boolean(standalone && isMobile)} remembered={rememberDevice} />;

  return (
    <main className="mj-login-page" dir="rtl">
      <div className="mj-login-atmosphere" aria-hidden="true"><i /><i /><i /></div>
      <Link href="/" className="mj-login-home" aria-label="العودة إلى موقع MJ"><img src="/assets/mj-logo.svg" alt="MJ Hair Salon" /></Link>
      <section className="mj-login-card">
        <div className="mj-login-brand"><img src="/assets/mj-logo.svg" alt="MJ" /><span><b>MJ</b><small>TEAM APP</small></span></div>
        <p className="mj-login-kicker">PRIVATE TEAM ACCESS</p>
        <h1>يومك،<br />مرتب أمامك.</h1>
        <p className="mj-login-copy">مواعيدك، عملاؤك وحالتك المباشرة في تطبيق واحد سريع وآمن.</p>
        <form onSubmit={login}>
          <label><span>اسم المستخدم</span><input autoComplete="username" autoCapitalize="none" spellCheck={false} value={credentials.username} onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))} required /></label>
          <label><span>كلمة المرور</span><div className="mj-password-control"><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></label>
          <label className="mj-remember-device"><input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} /><span><b>تذكّرني على هذا الجهاز الشخصي</b><small>اتركه مغلقًا إذا كان الهاتف أو الجهاز مشتركًا.</small></span></label>
          {error && <div className="mj-login-error">{error}</div>}
          <button className="mj-login-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={19} /> : <LogIn size={19} />}{busy ? "جارٍ الدخول…" : "دخول آمن"}</button>
        </form>
        <button className="mj-biometric-login" type="button" disabled={!biometricSupported || busy || !credentials.username.trim()} onClick={() => void passkeyLogin()}><Fingerprint size={22} /><span><b>الدخول بالبصمة أو Face ID</b><small>{biometricSupported ? "اكتب اسم المستخدم ثم استخدم بصمة هذا الجهاز" : isMobile ? "غير مدعوم على هذا الجهاز" : "متاح على الهاتف المثبّت عليه MJ"}</small></span></button>
        <div className="mj-login-security"><ShieldCheck size={18} /><span>جلسة مشفرة · حساب مستقل لكل موظف</span></div>
      </section>
    </main>
  );
}
