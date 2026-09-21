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
