# 활동 지도 — 개발 계획 v0.1

> 근거 자료: `docs/planning/문서/활동지도_개념정의.md`, `활동지도_도구_개발기획서_v0.1.docx`(이하 기획서), `docs/planning/샘플이미지/01~03`
> 관련 작업 기록: Mindy ISS-0577(기획서 작성)
> 작성일: 2026-11-03 · 상태: v0.2 (0단계 결정 반영, M1 구현)

이 문서는 기획서의 요구사항(F01~F10)을 구현 단위로 나누고, 기술 선택안과 일정 순서, 개발 전 확정할 사항을 정리합니다. 기술 스택과 저장 방식은 **제안**이며, 0단계에서 확정합니다.

---

## 1. 자료 분석 요약

### 1.1 핵심 요구
| 원칙 | 구현에 주는 의미 |
|---|---|
| 한 번 기록, 여러 보기 | 엔티티·관계 저장소는 하나. 보기는 이를 읽어 배치만 다르게 계산하는 **투영(projection)** |
| 내용과 배치의 분리 | 이름·설명은 공통, 좌표·필터·펼침·선택은 `ViewState`에 보기별로 저장 |
| 관계는 기록이다 | 관계마다 종류, 방향, 설명, 유효 기간, 근거 상태, 기여 내역을 가짐 |
| 사실과 해석의 구분 | 진행 상태(구상~완료)와 근거 상태(가설·관찰·확인)를 별도 필드로 둠. 시간 선후를 인과로 자동 변환하지 않음 |
| 불완전한 기록 허용 | 이름만 필수. 날짜·수량·근거는 모두 선택값(미정 허용) |
| 복잡도 관리 | 선택 대상 주변 강조, 관계 종류·기간·주체 필터, 큰 활동 접기 |

### 1.2 샘플 이미지에서 읽은 화면 요구
- **01 시간층 관계도**: 해온 일 / 진행 중 / 하려는 일 3열. 실선 = 현재 연결, 점선 = 만들고 싶은 연결, 주황 = 부담·시간 경합. 하단에 여러 활동이 함께 쓰는 "공통 기반(시간·주의력·회복 여력)" 노드가 있음.
- **02 활동-목적 연결도**: 활동 → 직접적인 변화 → 목적 3열. 한 활동이 여러 변화로, 여러 변화가 한 목적으로 이어짐. 하단 띠에 "다른 활동을 가능하게 하는 기여"(운영·재원·회복)를 별도 표시.
- **03 보기 전환 화면**: 상단 바(작업공간, 관계 추가, 활동 추가), 시간 보기는 활동별 행 + 시간층 열의 간트형 배치, 목적 보기는 3열 배치, 하단 상세 패널(기본 정보 / 활동과의 관계 / 변화·목적과의 관계). 선택 활동(A02 IT학교)이 두 보기에서 동시에 강조됨.

### 1.3 자료 간 빈틈과 정리가 필요한 부분
구현 전에 결정해야 데이터 구조가 흔들리지 않는 항목입니다.

| # | 발견 내용 | 제안 |
|---|---|---|
| G1 | 샘플의 "현재 연결 / 만들고 싶은 연결"(실선·점선)은 기획서의 근거 상태(가설·관찰·확인)와 다른 축. 관계 자체의 **진행 상태**가 데이터 모델에 없음 | 관계에 `status: planned | active | ended` 추가. 근거 상태와 독립 |
| G2 | 활동 상태(구상·예정·진행·완료)와 시간층(해온·진행 중·하려는)의 대응 규칙이 없음 | 기본은 상태에서 시간층을 도출(완료→해온, 진행→진행 중, 구상·예정→하려는). 필요하면 `timeLayerOverride`로 수동 지정. 지속 중인 오래된 활동(예: 시민단체 IT 지원 "지속")을 위해 `ongoing` 상태 추가 검토 |
| G3 | 샘플 01의 "공통 기반: 시간·주의력·회복 여력"이 네 요소(주체·활동·변화목적·변화요인) 중 어디에 속하는지 불명확 | 1차: 변화 요인(`Factor`)으로 기록하고, 시간 보기 하단 띠에 표시. 활동 간 "시간 경합" 관계로도 표현 가능. 0단계에서 표본 데이터로 확인 |
| G4 | 목적 보기의 "다른 활동을 가능하게 하는 기여"(운영·재원·회복)를 구분하는 필드가 없음 | 기여 관계에 `enabling: boolean` 플래그. 목적 보기 하단 띠에 별도 배치 |
| G5 | "필요하면 중간 변화 단계 추가" → 목적 보기 열 수가 가변 | 변화→변화 기여를 허용하고 열(layer)은 최장 경로 기준으로 계산 |
| G6 | 기여 내역의 "비공개 메모"와 내보내기 공개 범위 | 내보내기 시 "비공개 메모 제외" 옵션을 기본 켬 |
| G7 | "기존 순환 도구"는 사용자가 이전에 만든 시스템 사고 지도 도구를 뜻함. Mindy(케이스·메모리·위키)에는 기록이 없음. GitHub `h2dj/sysmap` 저장소가 후보 | **보류.** 2단계(순환 보기) 착수 전에 해당 도구의 기능·데이터 형식을 확인해 연동·재사용·별도 구현을 결정. 1단계는 영향 없음(변화 요인·영향 관계는 이미 스키마에 포함) |
| G8 | 활동 간 연결의 하위 종류(경험 제공·지원·파생·자원 공유·경합·활용)가 문서마다 조금씩 다름 | 고정 어휘로 확정(§3.2), 역할명·설명은 자유 입력 |

---

## 2. 기술 선택 제안

**전제(0단계 확정 대상)**: 첫 사용 범위는 개인 작업공간, 저장은 **로컬 우선(브라우저) + 파일 백업**. 서버 없이 정적 웹앱으로 배포해 개인정보를 외부에 두지 않습니다. 클라우드 동기화·공동 편집은 후속 단계로 둡니다.

| 영역 | 제안 | 이유 |
|---|---|---|
| 언어·빌드 | TypeScript, Vite | 데이터 모델 타입 안정성, 빠른 개발 |
| UI | React | 상세 패널·목록·폼이 많은 편집형 UI |
| 지도 렌더링 | React Flow(@xyflow/react) | 노드·엣지 편집, 확대·이동, 전체 맞춤, 커스텀 노드 지원. 보기별 좌표만 우리가 계산 |
| 자동 배치 | ELK.js(layered) + 보기별 자체 배치 | 목적 보기의 계층 배치, 시간 보기는 축 기반 자체 배치 |
| 상태 관리 | Zustand + Immer patches | 패치 기반 실행 취소·다시 실행(F09) |
| 스키마 검증 | Zod | 관계 종류별 허용 대상 검증, 가져오기 검증(F08) |
| 저장 | IndexedDB(Dexie) + JSON 내보내기/가져오기 | 재실행 후 복원, 파일 백업(F07) |
| 이미지 출력 | html-to-image(SVG/PNG) | 현재 지도 이미지 출력(F08) |
| 테스트 | Vitest(도메인·검증), Playwright(시나리오) | 기획서 §7 검증 항목을 E2E로 자동화 |

대안: 지도를 직접 SVG로 그리는 방식은 의존성이 줄지만 편집 상호작용 구현량이 커서 1차에는 권하지 않습니다.

---

## 3. 데이터 모델 (스키마 v1)

### 3.1 엔티티
> 실제 정의는 `src/domain/schema.ts`(Zod)가 기준이며, 아래는 요약입니다.

```ts
type ID = string;                       // 접두어_UUID. 이름이 같아도 자동 병합하지 않음
type DateRange = { start?: PartialDate; end?: PartialDate };   // 미정 허용
type PartialDate = { y: number; m?: number; d?: number };      // 날짜 정밀도 가변
type Evidence = 'hypothesis' | 'observed' | 'confirmed';       // 기대·가설 / 관찰 / 자료로 확인

interface Workspace { id; name; description?; schemaVersion: 1; createdAt; updatedAt }
interface Actor     { id; name; kind: 'person' | 'org'; description?; tags?: string[] }
interface Activity  {
  id; name; description?;
  parentId?: ID;                        // 상위 활동 1개. 순환 금지
  status: 'idea' | 'planned' | 'active' | 'ongoing' | 'done' | 'paused';
  timeLayerOverride?: 'past' | 'present' | 'future';
  planned?: DateRange; actual?: DateRange;
  tags?: string[];
}
interface Outcome   { id; name; description?; level: 'change' | 'purpose'; target?: string }  // 변화·목적
interface Factor    { id; name; definition?; increaseMeans?: string; sharedBase?: boolean }  // 변화 요인 (활동과는 factorLink로 연결)
```

### 3.2 관계
```ts
type RelationKind =
  | 'participation'   // 주체 → 활동 (역할)
  | 'activityLink'    // 활동 ↔ 활동 (하위: experience, support, derive, shareResource, compete, utilize)
  | 'contribution'    // 활동/변화 → 변화/목적
  | 'factorLink'      // 활동/변화 → 요인 (G3: 공통 기반 사용·완화)
  | 'influence'       // 요인 → 요인 (2차)
  | 'actorLink';      // 주체 ↔ 주체 (소속·협약)
// 포함 관계는 Activity.parentId로 표현

interface Relation {
  id; kind: RelationKind; subtype?: string;
  from: ID; to: ID; directed: boolean;
  description?: string;
  status: 'planned' | 'active' | 'ended';   // G1: 만들고 싶은 연결 / 현재 연결
  validity?: DateRange;                     // 관계의 유효 기간 (편집 시각과 별개)
  evidence: Evidence;  evidenceNote?: string; sources?: string[];
  role?: { name: string; description?: string };            // participation 전용
  contributions?: Contribution[];                           // participation, activityLink(support) 전용
  enabling?: boolean;                                       // contribution 전용 (G4)
  influence?: { sign: '+' | '-' | '?'; delayed?: boolean; delayNote?: string };  // influence·factorLink 전용
}
interface Contribution {
  kind: 'time' | 'money' | 'space' | 'knowledge' | 'network';  // 시간·노동/돈/공간·장비/기술·지식/사람·접점
  amount?: number; unit?: string; period?: DateRange; privateNote?: string;
}
```

### 3.3 보기 상태와 검토 기록
```ts
interface ViewState { viewId: 'time' | 'collab' | 'purpose' | 'loop'; positions: Record<ID, {x,y}>;
                      filters; collapsed: ID[]; selected?: ID; focusId?: ID; viewport }
interface ReviewNote { id; targetIds: ID[]; question?: string; judgment?: string; date; sources?: string[] }
```

### 3.4 검증 규칙 (도메인 계층)
| 규칙 | 처리 |
|---|---|
| 관계 종류별 허용 끝점 (예: participation은 Actor→Activity만) | 생성·가져오기 시 거부 |
| `parentId` 자기 포함·순환 | 거부 (F02) |
| 같은 주체·활동에 다른 역할의 participation 여러 건 | 허용 |
| `planned.start > planned.end` 등 기간 역전 | 경고 후 저장 허용 (F10 "잘못된 순서 입력 안내") |
| 삭제 대상이 참조 중 | 영향 목록 표시, 자식 처리 방식 선택(함께 삭제 / 상위 연결 해제) (F09) |
| 가져오기 시 중복 ID·잘못된 참조 | 보고서 표시, 기존 기록을 무조건 덮어쓰지 않음 |
| 소속 관계로 조직 기여를 자동 추정 | 하지 않음 |

---

## 4. 보기별 구현 방식

모든 보기는 `(store, viewState) → { nodes, edges, bands }` 형태의 순수 함수로 구현해 단위 테스트합니다. 사용자가 끌어 옮긴 좌표만 `ViewState.positions`에 저장하고, 없는 노드는 자동 배치합니다.

| 보기 | 배치 | 표시 관계 | 주요 상호작용 |
|---|---|---|---|
| 시간 (1차) | 날짜 없음: 시간층 3열. 날짜 있음: 실제 시간축 위 기간 막대(간트형). 행 = 활동(접기 지원) | activityLink, 선택 시 participation 기간 | 시간층/날짜축 전환, 예정·실제 겹쳐 보기, 하단 공통 기반 띠(G3) |
| 협력 (1차) | 초점 대상 중심 방사형 또는 2열(주체–활동) | participation(역할 라벨), 기여 아이콘, 선택 시 actorLink | 활동 중심 ↔ 주체 중심 전환, 역할·기여 종류 필터. 연결 수를 부담 점수로 표시하지 않음 |
| 목적 (1차) | 활동 → 변화(가변 단계) → 목적 계층 배치(ELK) | contribution, enabling 기여는 하단 띠 | 근거 상태를 선 모양으로 구분(가설=점선, 관찰=실선, 확인=굵은 실선+표식) |
| 순환 (2차) | 자유 배치 + 원형 배치 보조 | influence(+/−/?, 지연 표시) | 수동 순환 구성, 부호가 모두 정해진 폐쇄 순환만 R/B 판정(음의 영향 짝수=R, 홀수=B) |

공통: 선택 대상의 1~2단계 이웃 강조, 나머지 흐리게(F06). 상태·근거는 색상 외에 글자·선 모양으로도 구분(접근성). 작은 화면에서는 지도 대신 목록+편집 화면.

---

## 5. 단계별 개발 계획

기간은 1인 개발 기준 추정치입니다. 기획서가 일정·비용을 확정하지 않았으므로 0단계 후 다시 산정합니다.

### 0단계 — 설계 확정 (약 1주)
- [x] §7 결정 항목 확정(저장 방식, 첫 사용 범위, G1~G8 처리)
- [x] 실제 활동 10~15개, 주체, 관계를 표본 JSON으로 작성(관계는 가설로 표시). 샘플 이미지 01~03의 내용을 시드 데이터로 사용
- [x] 스키마 v1 확정, 관계 어휘표 확정
- [ ] 기존 순환 도구 확인(G7) → 보류, 2단계 착수 조건으로 이동
- **완료 조건**: 표본 데이터가 스키마로 모두 표현되고 검증을 통과

### 1단계 — 1차 사용 버전 (약 6~7주)

| 마일스톤 | 내용 | 기능 ID | 기간 |
|---|---|---|---|
| M1 도메인 코어 | 프로젝트 골격, 타입·Zod 스키마, 저장소(CRUD), 검증 규칙, 실행 취소 패치, 단위 테스트 | F01~F04 기반, F09 | 1.5주 |
| M2 저장·복구 | IndexedDB 자동 저장, 실패 알림, 재실행 복원, JSON 내보내기/가져오기(검증 보고서), 비공개 메모 제외 옵션 | F07, F08 | 1주 |
| M3 편집 UI | 앱 셸(상단 바·지도·상세 패널), 활동·주체 생성(이름만으로), 상세 편집, 관계 생성 마법사(종류→허용 대상만 선택), 역할·기여 편집, 삭제 영향 안내 | F01~F04, F09 | 1.5주 |
| M4 세 가지 보기 | 시간·협력·목적 투영 함수, 보기 전환 시 선택 유지, 접기·펼치기, 보기별 좌표 저장 | F02, F05 | 2주 |
| M5 탐색·마감 | 주변 강조, 검색·필터, 전체 맞춤, 이미지 출력, 빈 상태(예시 불러오기), 텍스트 목록 보기, 키보드 조작 | F06, F08, F10 | 1주 |

- **완료 조건(기획서 §7 시나리오, Playwright로 자동화)**
  1. IT학교 이름 수정 후 세 보기에서 동일 내용 확인
  2. 한 활동에 기획·교육·모집 주체를 넣고 활동↔주체 양방향 탐색
  3. 상위 활동 접기/펼치기 후 세부 활동·관계 보존
  4. 예정·실제·날짜 미정 표시, 기간 역전 입력 시 안내
  5. 완료 활동의 기여 관계가 가설로 유지되고 근거 추가 가능
  6. 내보낸 JSON을 새 작업공간에 불러와 ID·관계·속성 보존
  7. 참조 중인 활동 삭제 시 영향 확인, 취소·복원
- **사용성 기준**: 첫 사용자가 지도를 보고 "이전에 놓친 연결 1개"와 "조정할 역할 또는 확인할 가설 1개"를 설명할 수 있음

### 2단계 — 분석 확장 (약 3주)
- **착수 조건**: 기존 시스템 사고 지도 도구(G7)의 기능·데이터 형식 확인 후 연동·재사용·별도 구현 결정
- 변화 요인 편집, 활동·변화와의 연결
- 영향 관계 +/−/? 및 지연 표시, 순환 보기
- 수동 순환 구성과 R/B 판정(부호 미정 포함 시 판정 안 함)
- 검토 기록(판단·후속 질문) 패널
- **완료 조건**: 요인의 "증가의 의미"와 영향 방향을 명시해 순환을 구성하고, 사용자가 부호의 뜻(좋고 나쁨이 아님)을 이해하고 수정 가능

### 3단계 — 후속 고도화 (필요 검증 후)
과거 시점 조회, 노션 등 외부 자료 가져오기, 클라우드 동기화·공동 편집·권한, 자동 순환 탐지, AI 관계 제안, 배치 성능 개선. 각각 별도 기획으로 착수합니다.

---

## 6. 저장소 구조 (제안)

```
src/
  domain/        # 타입, Zod 스키마, 검증 규칙, 순수 함수 (UI 의존 없음)
  store/         # Zustand 스토어, 실행 취소 패치, 영속화(Dexie)
  views/
    time/ collab/ purpose/ loop/   # 투영 함수 + 보기 컴포넌트
  components/    # 상단 바, 상세 패널, 관계 마법사, 목록 보기
  io/            # 내보내기/가져오기, 이미지 출력, 마이그레이션
  fixtures/      # 표본 데이터(샘플 01~03 기반)
tests/
  unit/          # domain, views 투영
  e2e/           # 기획서 §7 시나리오
docs/
  DEVELOPMENT_PLAN.md
  planning/      # 원본 기획자료
```

---

## 7. 결정 사항 (2026-11-03 확정)

| 항목 | 결정 |
|---|---|
| 저장·배포 | 브라우저 저장(IndexedDB) + JSON 파일 백업. 클라우드는 후속 검토 |
| 첫 사용 범위 | 개인 작업공간. 주체(Actor)와 접근 계정은 분리 |
| 관계 진행 상태(G1) | `status: planned / active / ended` 추가 |
| 상태→시간층 규칙(G2) | 완료→해온 일, 진행·지속·중단→진행 중, 구상·예정→하려는 일. `timeLayerOverride`로 수동 지정 |
| 공통 기반 노드(G3) | 변화 요인으로 기록하고 `sharedBase: true` 표시. 활동과는 `factorLink` 관계(영향 부호 선택)로 연결 |
| enabling 기여(G4) | 기여 관계에 `enabling` 플래그 |
| 목적 보기 단계(G5) | 변화→변화 기여 허용, 열은 최장 경로 기준 |
| 비공개 메모(G6) | 내보내기 시 기본 제외 |
| 기존 순환 도구(G7) | 보류. 이전에 만든 시스템 사고 지도 도구(후보: `h2dj/sysmap`)를 2단계 전에 조사 |
| 관계 어휘(G8) | `participation, activityLink(experience·support·derive·utilize·shareResource·compete), contribution, factorLink, influence, actorLink` |
| 시간 표시 | 시간층 우선, 날짜는 연·월·일 정밀도 가변 |
| ID | `종류접두어_UUID`. 표본 데이터는 읽기 쉬운 고정 ID(A01 등) 사용 |
| 성능 목표 | 잠정: 활동 200·관계 1,000에서 보기 전환 1초 이내. 표본 확대 후 재설정 |

## 7-1. 진행 현황

- [x] 0단계: 결정 확정, 스키마 v1, 관계 어휘, 표본 데이터(`src/fixtures/sample.ts`, 활동 12·주체 5·관계 38)
- [x] M1 도메인 코어: Zod 스키마(`src/domain/schema.ts`), 검증 규칙(`validate.ts`), 연산(`ops.ts`), 시간 규칙(`time.ts`), 실행 취소 스토어(`src/store/`), 단위 테스트 27개
- [x] M2 저장·복구: IndexedDB 저장소(`src/persistence/repository.ts`), 자동 저장·실패 알림·다시 저장(`autosave.ts`), 재실행 복원·작업공간 전환(`session.ts`), JSON 내보내기·가져오기와 검사 보고(`src/io/transfer.ts`), 스키마 버전 이전 틀(`migrate.ts`). 단위 테스트 누적 46개
- [ ] M3 편집 UI
- [ ] M4 세 가지 보기
- [ ] M5 탐색·마감

## 8. 위험과 대응

| 위험 | 대응 |
|---|---|
| 연결선이 많아 판단을 방해 | 기본 표시 범위를 선택 주변으로 제한, 관계 종류 필터 기본값 축소 |
| 입력 부담이 커서 사용 중단 | 이름만으로 생성, 상세는 나중에. 표본 입력 시간 측정 |
| 시간 선후를 인과로 오해 | 보기 하단 고지, 시간 보기에서 contribution/influence 미표시 |
| 스키마 변경으로 기존 기록 손상 | `schemaVersion` + 마이그레이션 함수 + 내보내기 왕복 테스트 |
| 개인정보 노출 | 서버 없음, 내보내기 시 비공개 메모 제외 기본값 |

## 9. 바로 이어서 할 작업
1. 표본 데이터를 실제 활동으로 보완(현재는 샘플 이미지 기반 가설)
2. M3 착수: 앱 셸(상단 바·상세 패널), 활동·주체 편집, 관계 생성 마법사, 역할·기여 편집, 삭제 영향 안내
3. 2단계 전: 기존 시스템 사고 지도 도구(G7, 후보 `h2dj/sysmap`) 확인
