import "./globals.css";

export const metadata = {
  title: "리마켓 영업관리 시스템",
  description: "사무기기 렌탈 관리 시스템",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-512.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "리마켓 영업관리 시스템",
  },
};

export const viewport = {
  themeColor: "#1C2B3A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        {/* 본문 글씨체로 지정해둔 Pretendard가 실제로는 로드되는 곳이 없어서, 그동안 브라우저 기본 글씨체(윈도우는
            맑은 고딕 등)로만 보이고 있었다. 이 링크로 실제 Pretendard 웹폰트를 불러와야 디자인에서 의도한
            깔끔한 글씨체가 화면에 그대로 적용된다. */}
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
        {/* 화면 곳곳의 제목(상단 로고, "품목 내역" 같은 소제목들)에 쓰는 serif 글씨체("Noto Serif KR")도
            Pretendard와 같은 이유로 실제로 불러오는 곳이 없어서, 그동안 시스템 기본 명조체로만 보이고 있었다.
            특히 상단 "리마켓 영업관리 시스템" 로고를 진하게(굵게) 강조하려면 이 폰트의 굵은 두께(800)가
            실제로 로드돼 있어야 한다. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700;800&display=swap"
        />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function () {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
