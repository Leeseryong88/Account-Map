# 거래처 관리 지도

영업 담당자가 거래처를 지도에서 관리하고, 직접 만든 양식으로 방문 내용을 기록하며, 방문 현황과 후속 일정을 확인하는 웹서비스입니다.

이 저장소는 실행 가능한 Next.js 앱, Firestore 보안 규칙, 인덱스, Cloud Functions, 에뮬레이터 설정을 포함합니다. 프로덕션 Firebase 프로젝트와 Kakao Maps 키는 들어 있지 않습니다. 키가 없어도 에뮬레이터와 목록 화면으로 가입, 템플릿, 거래처, 방문 기록, 알림까지 확인할 수 있습니다.

## 동작하는 범위

- 이메일·비밀번호 회원가입과 로그인
- 가입 시 기본 템플릿(방문 목적, 거래처명, 전 방문일자, 메모, 다음 연락일) 자동 제공(`templates/tdefault`), 사용자별 수정 가능
- 템플릿 작성(추천 항목·자동 입력 항목), 항목 순서 변경, 복제, 새 버전 저장, 보관
- 날짜 항목 알림과 방문 후 N일 재방문 규칙
- 주소·장소 검색 또는 좌표 입력으로 거래처 등록, 마커 이동으로 위치 보정
- 담당자 여러 명, 대표 담당자, 전화번호 링크
- 거래처와 템플릿 연결, 기본 템플릿
- 방문 기록 저장·수정·삭제와 초안
- 방문 타임라인, 최근 방문일·방문 횟수 갱신
- 재방문 알림과 날짜 항목 후속 업무, 수동 알림
- 지도 마커의 방문 색과 알림 배지, 클러스터
- 필터, 검색, 알림함
- 사용자별 데이터 격리

이번 버전에 없는 것: 조직·초대, 결제, 브라우저 푸시, 문자, 이메일 발송, 전문 검색.

## 기술 구성

- 프런트엔드: Next.js App Router, TypeScript, Tailwind CSS, Zod
- 데이터 조회와 거래처·템플릿·담당자 편집: Firebase Client SDK
- 방문 기록 저장·삭제, 알림 생성·완료·날짜 변경, 거래처 보관: 인증된 Cloud Functions 트랜잭션
- 지도: Kakao Maps JavaScript SDK. 키가 없거나 로딩에 실패해도 목록·기록·알림은 동작합니다.
- 배포: Next.js는 Node 서버(`next start`) 또는 Firebase App Hosting. Cloud Functions는 `asia-northeast3`에 따로 배포합니다.

정적 Firebase Hosting만으로는 `/accounts/[id]` 같은 동적 경로를 제공할 수 없어 `output: 'export'`를 쓰지 않았습니다. Next.js 서버에는 비밀 키가 없고, 브라우저가 Firebase와 함수를 직접 호출합니다.

## 로컬 실행

필요 조건: Node.js 20 이상, JDK 21 이상. Firebase 에뮬레이터는 Java가 있어야 Firestore를 띄웁니다.

```powershell
cd D:\coding\sales
copy .env.example .env.local
npm install
npm --prefix functions install
```

터미널 두 개를 사용합니다.

```powershell
npm run emulators
```

```powershell
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. 화면 상단에 로컬 에뮬레이터 연결 안내가 보이면 회원가입부터 진행할 수 있습니다.

에뮬레이터 UI는 http://localhost:4000 입니다.

기본 프로젝트 ID는 `demo-salesmap`입니다. `demo-`로 시작하는 ID는 에뮬레이터에서 서비스 계정 없이 동작합니다.

## 테스트

업무 규칙은 단위 테스트로 확인합니다.

```powershell
npm test
```

포함 내용: 알림의 오늘·지연·임박 경계, 방문 색 구간, 과거 방문이 재방문 일정을 당기지 않는 조건, 새 방문의 일정 갱신, 완료 회차, 삭제 후 재계산, 필터의 AND/OR, 템플릿 검증.

보안 규칙과 저장 재시도는 에뮬레이터가 켜진 상태에서 실행합니다. Java가 없으면 이 명령은 실패합니다.

```powershell
npm run test:rules
npm run test:integration
```

`test:integration`은 같은 요청의 중복 저장, 최근 방문일, 재방문 갱신, 기존 후속 업무 유지, 템플릿 수정 후 과거 기록, 삭제 후 집계, 다른 사용자 경로 차단을 확인합니다.

에뮬레이터와 개발 서버가 켜져 있을 때 클라이언트 SDK와 함수를 한 번에 확인하려면 `node scripts/verify-local.mjs`를 실행합니다. 회원가입, 템플릿 버전, 거래처, 담당자 두 명, 방문 저장, 저장 재시도를 순서대로 호출합니다.

## Firebase 프로덕션 연결

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트를 만듭니다. Blaze 요금제가 있어야 Cloud Functions를 배포할 수 있습니다.
2. Authentication에서 이메일/비밀번호 제공업체를 켭니다.
3. Firestore 데이터베이스를 만듭니다. 위치는 `asia-northeast3`(서울)을 권장합니다. 규칙과 인덱스는 아래 배포 명령으로 올립니다.
4. 프로젝트 설정에서 웹 앱을 추가하고 구성값을 `.env.local` 또는 배포 환경 변수에 넣습니다.
5. `.firebaserc`의 `demo-salesmap`을 실제 프로젝트 ID로 바꿉니다.

```powershell
npx -y firebase-tools@latest login
npx -y firebase-tools@latest use PROJECT_ID
```

환경 변수:

```
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=false
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_KAKAO_MAP_KEY=
```

`NEXT_PUBLIC_` 값은 빌드 시점에 브라우저 번들에 들어갑니다. 서비스 계정 키나 Functions 비밀은 프런트엔드에 두지 않습니다. 이 앱의 함수는 Admin SDK 기본 자격 증명만 사용합니다.

배포:

```powershell
npm --prefix functions run build
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes,functions
```

함수 리전은 `asia-northeast3`입니다. 클라이언트도 같은 리전으로 호출합니다.

## Next.js 배포

로컬 또는 VM:

```powershell
npm run build
npm start
```

Firebase App Hosting을 쓰는 경우 이 저장소의 `apphosting.yaml`을 기준으로 연결하고, 위의 `NEXT_PUBLIC_` 값을 빌드 환경 변수로 넣습니다. `NEXT_PUBLIC_USE_FIREBASE_EMULATOR`는 `false`여야 합니다. App Hosting이 Next.js 서버를 띄우고, 방문 기록용 Cloud Functions는 위의 `firebase deploy`로 별도 배포합니다.

## Kakao Maps

1. [Kakao Developers](https://developers.kakao.com)에서 애플리케이션을 만듭니다.
2. 플랫폼에 Web을 추가하고 사이트 도메인에 `http://localhost:3000`과 운영 도메인을 등록합니다.
3. JavaScript 키를 `NEXT_PUBLIC_KAKAO_MAP_KEY`에 넣습니다.
4. 지도 JavaScript SDK를 사용할 수 있는 상태인지 확인합니다.

키가 없으면 거래처 등록 화면에서 위도·경도를 직접 입력합니다. 좌표가 있으면 주소 변환에 실패해도 저장됩니다.

## 데이터와 한계

경로는 `users/{uid}` 아래입니다.

- `accounts`, `contacts`
- `templates`, `templates/{id}/versions`
- `accountTemplateLinks`
- `visits`, `reminders`, `revisitStates`
- `drafts`, `settings/preferences`, `idempotency`

방문 기록 본문은 지도 로딩 때 받지 않습니다. 지도는 거래처 요약과 미완료 알림만 사용합니다.

1차 버전은 클라이언트에서 걸러 검색합니다. 한 사용자가 한 번에 불러오는 상한은 거래처 500곳(이름순), 미완료 알림 500건(예정일순), 템플릿 100개입니다. 상한에 걸리면 화면에 잘렸다고 표시하며, 그 숫자를 전체인 것처럼 합산하지 않습니다. 담당자 이름은 담당자를 저장할 때 거래처의 `contactSearchText`에 반영합니다.

방문 시각과 문서 생성 시각은 따로 저장합니다. 최근 방문일과 방문 횟수는 방문 저장·삭제 트랜잭션에서만 바뀝니다. 과거 방문 기록에는 당시 템플릿과 담당자 스냅샷이 들어가 템플릿을 고쳐도 이전 기록이 바뀌지 않습니다.

알림의 예정·임박·오늘·지연은 저장된 문자열이 아니라 화면을 열 때마다 한국 시간 기준으로 계산합니다. 날짜만 있는 알림은 그 날짜가 끝난 뒤 지연이고, 시각이 있는 알림은 그 시각이 지난 뒤 지연입니다. 우선순위는 지연, 오늘, 임박입니다.

재방문 알림은 거래처와 템플릿마다 미완료 1건입니다. 더 최근 방문이 저장되면 그 날짜로 갱신하고, 더 과거 방문을 나중에 넣어도 기존 일정을 당기지 않습니다. 완료한 회차는 다시 열지 않고, 그보다 새로운 방문이 있을 때 다음 회차를 만듭니다. 다른 방문의 후속 업무와 수동 알림은 새 방문 때문에 완료되거나 삭제되지 않습니다.

필터는 그룹 안에서는 OR, 그룹 사이에는 AND입니다. 검색은 불러온 거래처의 이름, 주소, 담당자 이름만 대상입니다.

## 보안

`firestore.rules`는 로그인한 사용자 자신의 `users/{uid}`만 허용합니다. 방문 기록, 알림 생성, 재방문 상태, 멱등 키는 클라이언트 쓰기를 막습니다. 알림은 읽음 표시만 클라이언트가 바꿀 수 있고, 완료는 함수가 처리합니다. 거래처의 방문 횟수, 최근 방문일, 보관 여부는 클라이언트가 직접 바꾸지 못합니다. 템플릿 버전 문서는 만든 뒤 수정할 수 없습니다.

Cloud Functions는 Admin SDK가 규칙을 우회하므로 토큰의 `uid`로만 경로를 만들고, 입력값과 소유 문서를 트랜잭션에서 다시 확인합니다. 같은 `clientRequestId`로 다시 호출하면 기존 결과를 반환합니다.
