import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "主动预习地图｜Active Preview Map",
  description: "上传课程课件，自动生成按页码组织、带权重与批注的可编辑思维导图。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
