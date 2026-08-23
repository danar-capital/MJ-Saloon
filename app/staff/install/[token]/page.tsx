import StaffInstaller, { type InstallPlatform } from "@/components/staff/StaffInstaller";
import { validStaffInstallToken } from "@/lib/staff-install-server";

export const dynamic = "force-dynamic";

type InstallPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ platform?: string | string[] }>;
};

function platformHint(value: string | string[] | undefined): InstallPlatform {
  const platform = Array.isArray(value) ? value[0] : value;
  return platform === "ios" || platform === "windows" ? platform : "android";
}

export default async function StaffInstallPage({ params, searchParams }: InstallPageProps) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  if (!validStaffInstallToken(token)) {
    return (
      <main className="mj-install-denied" dir="rtl">
        <img src="/assets/mj-control-192.png" alt="MJ Team" />
        <small>MJ PRIVATE INSTALL</small>
        <h1>رابط التثبيت غير صالح.</h1>
        <p>اطلب رابطًا جديدًا من إدارة MJ. لا يمكن تثبيت تطبيق الفريق من رابط عام.</p>
      </main>
    );
  }
  return <StaffInstaller platformHint={platformHint(query.platform)} />;
}
