import type { Metadata } from "next";
import { validStaffInstallToken } from "@/lib/staff-install-server";

export const dynamic = "force-dynamic";

type InstallLayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}>;

export async function generateMetadata({ params }: InstallLayoutProps): Promise<Metadata> {
  const { token } = await params;
  if (!validStaffInstallToken(token)) {
    return {
      title: "رابط تثبيت غير صالح · MJ Team",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: "تثبيت MJ Team",
    description: "بوابة الإدارة الخاصة لتثبيت تطبيق فريق MJ",
    manifest: "/manifest.webmanifest",
    robots: { index: false, follow: false },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "MJ Team",
    },
  };
}

export default function StaffInstallLayout({ children }: InstallLayoutProps) {
  return children;
}
