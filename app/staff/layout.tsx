import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MJ Team",
  description: "تطبيق مواعيد وحالة فريق MJ Hair Salon",
  icons: {
    icon: "/assets/mj-control-192.png",
    shortcut: "/assets/mj-control-192.png",
    apple: "/assets/mj-apple-touch-180.png",
  },
};

export default function StaffLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
