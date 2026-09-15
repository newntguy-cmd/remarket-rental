# 리마켓 렌탈장부 — 배포 가이드

비개발자도 따라할 수 있도록 순서대로 정리했습니다. 전부 무료 요금제로 진행됩니다.

## 1단계. Supabase 프로젝트 만들기 (데이터베이스 + 로그인)

1. https://supabase.com 접속 → 회원가입 (GitHub 계정으로 가입하면 편합니다)
2. "New project" 클릭 → 프로젝트 이름(예: remarket-rental), 비밀번호 설정, 리전은 Northeast Asia(Seoul) 선택
3. 프로젝트 생성 후 왼쪽 메뉴에서 **SQL Editor** 클릭 → 아래 SQL을 통째로 붙여넣고 "Run" 실행

```sql
-- 프로필 테이블 (역할/소속 회사 구분용)
create table profiles (
  id uuid references auth.users primary key,
  role text not null check (role in ('admin', 'customer')),
  company text,
  name text
);

-- 렌탈 품목 테이블
create table rentals (
  id uuid default gen_random_uuid() primary key,
  customer text not null,
  item text not null,
  qty int not null default 1,
  out_date date not null,
  period_days int not null,
  due_date date not null,
  collected boolean default false,
  collect_date date,
  manager text,
  note text,
  created_at timestamp default now()
);

alter table profiles enable row level security;
alter table rentals enable row level security;

-- 본인 프로필만 조회 가능
create policy "본인 프로필 조회" on profiles
  for select using (auth.uid() = id);

-- 관리자는 전체 렌탈 조회/등록/수정 가능
create policy "관리자 전체 접근" on rentals
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- 고객사는 자기 회사 렌탈만 조회 가능
create policy "고객사 본인 데이터 조회" on rentals
  for select using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'customer' and company = rentals.customer
    )
  );
```

4. 왼쪽 메뉴 **Authentication → Providers** 에서 "Confirm email" 옵션을 꺼주세요 (내부용이라 이메일 인증 절차 생략).
5. 왼쪽 메뉴 **Authentication → Users → Add user** 로 계정을 만듭니다.
   - 예: `admin@remarket.co.kr` / 원하는 비밀번호 → 관리자 계정
   - 예: `hanwoori@remarket.co.kr` / 원하는 비밀번호 → 고객사 계정
   - 생성 후 각 계정의 UUID(id)를 복사해두세요.
6. 왼쪽 메뉴 **Table Editor → profiles** 에서 "Insert row"로 방금 만든 사용자만큼 행을 추가합니다.
   - id: 위에서 복사한 UUID
   - role: `admin` 또는 `customer`
   - company: 고객사 계정이면 회사명(예: 한우리건설), 관리자는 비워둠
   - name: 표시될 이름
7. **Project Settings → API** 에서 `Project URL`과 `anon public key`를 복사해둡니다. (3단계에서 사용)

## 2단계. GitHub에 코드 올리기

1. https://github.com 회원가입
2. 오른쪽 위 "+" → New repository → 이름 `remarket-rental` → Create
3. 이 zip 파일 안의 모든 파일/폴더를 압축 해제 후, 저장소 페이지의 "Add file → Upload files"로 전부 드래그 앤 드롭 업로드 → Commit

## 3단계. Vercel로 배포하기

1. https://vercel.com 접속 → GitHub 계정으로 가입/로그인
2. "Add New → Project" → 방금 만든 `remarket-rental` 저장소 선택 → Import
3. **Environment Variables** 항목에 아래 두 개를 추가
   - `NEXT_PUBLIC_SUPABASE_URL` = 1단계 7번에서 복사한 Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = 1단계 7번에서 복사한 anon public key
4. "Deploy" 클릭 → 1~2분 후 `https://remarket-rental-xxxx.vercel.app` 같은 실제 주소가 발급됩니다.
5. 이 주소를 관리자/고객사에게 공유하면, 만든 계정으로 어디서든 로그인해서 접속할 수 있습니다.

## 이후 관리

- 새 고객사 계정이 필요하면: Supabase Authentication에서 사용자 추가 → profiles 테이블에 행 추가
- 코드를 수정하고 싶으면: GitHub 저장소 파일을 수정(Commit)하면 Vercel이 자동으로 재배포합니다.
- 커스텀 도메인(예: rental.remarket.co.kr)을 쓰고 싶으면 Vercel 프로젝트의 Domains 메뉴에서 연결 가능합니다.
