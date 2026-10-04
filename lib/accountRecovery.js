// "아이디/비밀번호를 잊으셨나요?" 화면에서 이름+휴대전화번호를 입력하면, 두 값이 profiles 테이블에
// 등록된 값과 정확히 일치하는 직원 1명을 찾아 로그인 아이디를 알려주고 임시 비밀번호를 새로 발급한다.
//
// ★ 이 기능을 쓰려면 Vercel 프로젝트 설정에 환경변수 SUPABASE_SERVICE_ROLE_KEY를 등록해야 한다.
//   (Supabase 대시보드 -> Settings -> API -> "service_role" 키 복사 -> Vercel 프로젝트 -> Settings ->
//    Environment Variables에 등록. 이 키는 절대 NEXT_PUBLIC_ 접두사를 붙이면 안 된다 — 브라우저에
//    노출되면 전체 데이터베이스에 누구나 접근할 수 있게 되는 아주 위험한 키다. 이 코드처럼 서버에서만
//    쓰는 곳에만 넣어야 한다.)
// ★ 직원별로 profiles 테이블에 phone(휴대전화번호, 숫자만)이 미리 등록돼 있어야 찾을 수 있다.
//   (등록 방법은 profiles_phone_column.sql 참고)
//
// 서버(Route Handler)에서만 실행되는 코드라 service_role 키가 브라우저에 노출되지 않는다.
import { createClient } from "@supabase/supabase-js";
import { deriveLoginId, generateTempPassword, normalizePhone } from "../../../lib/accountRecovery";

export async function POST(request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return Response.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았어요. Vercel 환경변수에 등록한 뒤 다시 시도해주세요." },
        { status: 500 }
      );
    }

    const { name, phone } = await request.json();
    const cleanName = (name || "").trim();
    const cleanPhone = normalizePhone(phone);
    if (!cleanName || !cleanPhone) {
      return Response.json({ error: "이름과 휴대전화번호를 모두 입력해주세요." }, { status: 400 });
    }

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: matches, error: qErr } = await admin
      .from("profiles")
      .select("id")
      .eq("name", cleanName)
      .eq("phone", cleanPhone);

    if (qErr) {
      console.error("계정 찾기 조회 오류:", qErr);
      return Response.json({ error: "조회 중 오류가 발생했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
    }
    // 일치하는 계정이 하나도 없거나, 둘 이상(이름이 같은 직원이 있는 경우) 모두 안전하게 같은
    // 안내만 보여준다 — "그런 이름 없음" 같은 식으로 계정 존재 여부를 구체적으로 알려주지 않기 위함.
    if (!matches || matches.length !== 1) {
      return Response.json(
        { error: "입력한 이름과 휴대전화번호로 일치하는 계정을 찾을 수 없어요. 관리자에게 문의해주세요." },
        { status: 404 }
      );
    }

    const userId = matches[0].id;
    const { data: userData, error: getErr } = await admin.auth.admin.getUserById(userId);
    if (getErr || !userData?.user?.email) {
      console.error("사용자 조회 오류:", getErr);
      return Response.json({ error: "계정 정보를 불러오지 못했어요. 관리자에게 문의해주세요." }, { status: 500 });
    }

    const loginId = deriveLoginId(userData.user.email);
    const tempPassword = generateTempPassword();

    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
    if (updateErr) {
      console.error("임시 비밀번호 발급 오류:", updateErr);
      return Response.json({ error: "임시 비밀번호 발급에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
    }

    return Response.json({ loginId, tempPassword });
  } catch (err) {
    console.error("계정 찾기/비밀번호 재발급 오류:", err);
    return Response.json({ error: "처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
