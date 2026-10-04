// 이 파일의 함수들은 외부 서비스(Supabase 등)를 전혀 호출하지 않는 순수 함수라, 화면(app/page.js)과
// 서버 API(app/api/account-recovery/route.js) 양쪽에서 똑같이 가져다 쓸 수 있고 테스트도 간단하다.

// 직원 로그인용 가짜 도메인 — app/page.js의 STAFF_LOGIN_DOMAIN과 반드시 같은 값이어야 한다.
export const STAFF_LOGIN_DOMAIN = "remarket-staff.local";

// 실제 Supabase Auth 이메일(예: re001@remarket-staff.local)에서 화면에 보여줄 "로그인 아이디"만 뽑아낸다.
// 진짜 이메일(예: hong@remarket.co.kr)이면 손대지 않고 그대로 돌려준다.
export function deriveLoginId(email) {
  const v = (email || "").trim();
  if (!v) return "";
  const suffix = "@" + STAFF_LOGIN_DOMAIN;
  return v.endsWith(suffix) ? v.slice(0, v.length - suffix.length) : v;
}

// 비밀번호를 잊어버린 직원에게 한 번만 보여줄 임시 비밀번호를 만든다.
// 0/O, 1/l/I처럼 헷갈리기 쉬운 글자는 일부러 빼서, 화면에 적힌 걸 손으로 옮겨 입력하다 실수할 일을 줄였다.
const TEMP_PW_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export function generateTempPassword(length = 10) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PW_CHARS[Math.floor(Math.random() * TEMP_PW_CHARS.length)];
  }
  return out;
}

// 계정 찾기 폼에 입력한 전화번호를 숫자만 남겨 정규화한다("010-1234-5678" -> "01012345678").
// DB에 저장해둔 값도 같은 방식(숫자만)으로 맞춰둬야 비교가 정확하다(profiles_phone_column.sql 참고).
export function normalizePhone(phone) {
  return (phone || "").replace(/[^0-9]/g, "");}
