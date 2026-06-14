import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "지금 어디서 빌릴 수 있지?",
  description: "나랑 가까운 동작구 도서관에서 지금 빌릴 수 있는지 바로 확인해 드려요.",
  applicationName: "지금빌려",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // 핀치줌 방지 (지도 UX)
  userScalable: false,
  themeColor: "#16a34a",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
