import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "姑苏寻迹｜苏州全域探索地图",
  description:
    "使用固化本地数据探索苏州园林、古镇、文化场馆、自然景观与城市地点。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
