import "./globals.css";

export const metadata = {
  title: "리마켓 렌탈장부",
  description: "사무기기 렌탈 관리 시스템",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
