import type { Metadata } from "next";
import "./globals.css";

const publicUrl = "https://black-sky-bound-playtest.kerrypain.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(publicUrl),
  title: "Black Sky Bound · Early Playtest",
  description:
    "Play the Three.js early build of Black Sky Bound: hold the Crown of Cinders as a young wyvern.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  openGraph: {
    title: "Black Sky Bound",
    description: "Early 3D playtest · Tooth. Claw. Smoke. Survive.",
    images: [{ url: "/og.png", width: 1680, height: 945 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Black Sky Bound",
    description: "Early 3D playtest · Tooth. Claw. Smoke. Survive.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
