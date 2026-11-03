import { z } from 'zod';

/**
 * 활동 지도 스키마 v1.
 * 내용(엔티티·관계)과 배치(ViewState)를 분리한다. 모든 대상은 고유 ID로 식별하며
 * 이름이 같아도 자동 병합하지 않는다.
 */
export const SCHEMA_VERSION = 1 as const;

export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

/** 연·월·일 정밀도가 가변인 날짜. 미정이면 필드 자체를 생략한다. */
export const PartialDate = z.object({
  y: z.number().int().min(1900).max(2200),
  m: z.number().int().min(1).max(12).optional(),
  d: z.number().int().min(1).max(31).optional(),
});
export type PartialDate = z.infer<typeof PartialDate>;

export const DateRange = z.object({
  start: PartialDate.optional(),
  end: PartialDate.optional(),
});
export type DateRange = z.infer<typeof DateRange>;

/** 근거 상태: 기대·가설 / 관찰 / 자료로 확인 */
export const Evidence = z.enum(['hypothesis', 'observed', 'confirmed']);
export type Evidence = z.infer<typeof Evidence>;

/** 활동 진행 상태. 근거 상태와 독립이다(완료 ≠ 효과 입증). */
export const ActivityStatus = z.enum(['idea', 'planned', 'active', 'ongoing', 'paused', 'done']);
export type ActivityStatus = z.infer<typeof ActivityStatus>;

export const TimeLayer = z.enum(['past', 'present', 'future']);
export type TimeLayer = z.infer<typeof TimeLayer>;

export const Actor = z.object({
  id: Id,
  name: z.string().min(1),
  kind: z.enum(['person', 'org']),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type Actor = z.infer<typeof Actor>;

export const Activity = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().optional(),
  /** 상위 활동은 하나만. 순환 금지. */
  parentId: Id.optional(),
  status: ActivityStatus,
  /** G2: 기본은 상태에서 시간층을 도출하고, 필요하면 수동 지정 */
  timeLayerOverride: TimeLayer.optional(),
  planned: DateRange.optional(),
  actual: DateRange.optional(),
  tags: z.array(z.string()).optional(),
});
export type Activity = z.infer<typeof Activity>;

/** 변화와 목적 */
export const Outcome = z.object({
  id: Id,
  name: z.string().min(1),
  level: z.enum(['change', 'purpose']),
  description: z.string().optional(),
  target: z.string().optional(),
});
export type Outcome = z.infer<typeof Outcome>;

/** 변화 요인: 증감 방향을 정의할 수 있는 분석 요소 (G3: 공통 기반도 요인으로 기록) */
export const Factor = z.object({
  id: Id,
  name: z.string().min(1),
  definition: z.string().optional(),
  /** "이 요인이 증가한다"는 것이 무엇을 뜻하는지 */
  increaseMeans: z.string().optional(),
  /** 공통 기반처럼 여러 활동이 함께 쓰는 자원이면 true. 시간 보기 하단 띠에 표시 */
  sharedBase: z.boolean().optional(),
});
export type Factor = z.infer<typeof Factor>;

export const ContributionKind = z.enum(['time', 'money', 'space', 'knowledge', 'network']);
export type ContributionKind = z.infer<typeof ContributionKind>;

export const Contribution = z.object({
  kind: ContributionKind,
  amount: z.number().optional(),
  unit: z.string().optional(),
  period: DateRange.optional(),
  /** 내보내기 시 기본 제외 (G6) */
  privateNote: z.string().optional(),
});
export type Contribution = z.infer<typeof Contribution>;

export const RelationKind = z.enum([
  'participation', // 주체 → 활동 (역할·기여)
  'activityLink', // 활동 ↔ 활동
  'contribution', // 활동·변화 → 변화·목적
  'factorLink', // 활동·변화 → 변화 요인
  'influence', // 변화 요인 → 변화 요인
  'actorLink', // 주체 ↔ 주체
]);
export type RelationKind = z.infer<typeof RelationKind>;

export const ActivityLinkSubtype = z.enum([
  'experience', // 경험 제공
  'support', // 지원
  'derive', // 파생
  'utilize', // 활용
  'shareResource', // 자원 공유 (방향 없음)
  'compete', // 시간·자원 경합 (방향 없음)
]);
export type ActivityLinkSubtype = z.infer<typeof ActivityLinkSubtype>;

/** G1: 관계의 진행 상태. 근거 상태와 독립이다. */
export const RelationStatus = z.enum(['planned', 'active', 'ended']);
export type RelationStatus = z.infer<typeof RelationStatus>;

export const InfluenceSign = z.enum(['+', '-', '?']);
export type InfluenceSign = z.infer<typeof InfluenceSign>;

export const Relation = z.object({
  id: Id,
  kind: RelationKind,
  /** activityLink는 ActivityLinkSubtype, actorLink는 자유 입력(소속·협약 등) */
  subtype: z.string().optional(),
  from: Id,
  to: Id,
  description: z.string().optional(),
  status: RelationStatus,
  validity: DateRange.optional(),
  evidence: Evidence,
  evidenceNote: z.string().optional(),
  sources: z.array(z.string()).optional(),
  /** participation 전용 */
  role: z.object({ name: z.string().min(1), description: z.string().optional() }).optional(),
  /** participation, activityLink(support) 전용 */
  contributions: z.array(Contribution).optional(),
  /** contribution 전용 (G4): 다른 활동을 가능하게 하는 기여 */
  enabling: z.boolean().optional(),
  /** influence, factorLink 전용 */
  influence: z
    .object({ sign: InfluenceSign, delayed: z.boolean().optional(), delayNote: z.string().optional() })
    .optional(),
});
export type Relation = z.infer<typeof Relation>;

export const ViewId = z.enum(['time', 'collab', 'purpose', 'loop']);
export type ViewId = z.infer<typeof ViewId>;

export const ViewState = z.object({
  viewId: ViewId,
  positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
  filters: z.record(z.string(), z.unknown()),
  collapsed: z.array(Id),
  selected: Id.optional(),
  focusId: Id.optional(),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).optional(),
});
export type ViewState = z.infer<typeof ViewState>;

export const ReviewNote = z.object({
  id: Id,
  targetIds: z.array(Id),
  question: z.string().optional(),
  judgment: z.string().optional(),
  date: z.string(),
  sources: z.array(z.string()).optional(),
});
export type ReviewNote = z.infer<typeof ReviewNote>;

export const Workspace = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Workspace = z.infer<typeof Workspace>;

/** 하나의 작업공간 문서. 저장·내보내기의 단위. */
export const MapDocument = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  workspace: Workspace,
  actors: z.record(z.string(), Actor),
  activities: z.record(z.string(), Activity),
  outcomes: z.record(z.string(), Outcome),
  factors: z.record(z.string(), Factor),
  relations: z.record(z.string(), Relation),
  views: z.record(z.string(), ViewState),
  reviews: z.record(z.string(), ReviewNote),
});
export type MapDocument = z.infer<typeof MapDocument>;

export type EntityType = 'actor' | 'activity' | 'outcome' | 'factor';
export type Entity = Actor | Activity | Outcome | Factor;
