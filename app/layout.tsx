import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BookMap - 내 주변 도서관 찾기",
  description: "책을 검색하고, 가장 가까운 동작구 도서관에서 빠르게 빌리세요.",
  applicationName: "BookMap",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // 핀치줌 방지 (지도 UX)
  userScalable: false,
  themeColor: "#16a34a",
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
