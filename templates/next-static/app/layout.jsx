import "./globals.css";

export const metadata = {
  title: "__DISPLAY_NAME__",
  description: "A Next.js static site on the DIG Network.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
