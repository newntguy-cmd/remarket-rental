// 가구배치(시뮬레이션) 화면 전용 앱 정보(이름·아이콘·시작주소). 메인 시스템(app/layout.js)의
// manifest("리마켓 영업관리 시스템", 시작주소 "/")와는 별도로 이 화면만의 정보를 여기 따로 둬서,
// 브라우저의 "앱으로 설치"를 이 화면에서 누르면 메인 시스템과는 다른 별도의 앱으로(이름도
// "가구배치(시뮬레이션)"로, 열었을 때도 이 화면이 바로 뜨도록) 설치된다.
export const metadata = {
  title: "가구배치(시뮬레이션)",
  description: "리마켓 가구배치 시뮬레이션",
  manifest: "/manifest-gagu-layout.json",
  icons: {
    icon: "/icons/icon-512.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "가구배치(시뮬레이션)",
  },
};

export const viewport = {
  themeColor: "#1C2B3A",
};

export default function GaguLayoutSegmentLayout({ children }) {
  return children;
}
