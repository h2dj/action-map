import type {
  ActivityLinkSubtype,
  ActivityStatus,
  ContributionKind,
  EntityType,
  Evidence,
  InfluenceSign,
  RelationKind,
  RelationStatus,
} from './schema';

/** 관계 어휘(G8). 기본 종류는 고정하고 역할명·설명은 자유 입력한다. */
export const relationKindLabel: Record<RelationKind, string> = {
  participation: '참여·역할',
  activityLink: '활동 간 연결',
  contribution: '기여',
  factorLink: '요인과의 연결',
  influence: '영향',
  actorLink: '주체 간 관계',
};

export const activityLinkLabel: Record<ActivityLinkSubtype, string> = {
  experience: '경험 제공',
  support: '지원',
  derive: '파생',
  utilize: '활용',
  shareResource: '자원 공유',
  compete: '시간·자원 경합',
};

/** 방향이 없는 활동 간 연결 */
export const undirectedActivityLinks: ReadonlySet<ActivityLinkSubtype> = new Set(['shareResource', 'compete']);

export const contributionKindLabel: Record<ContributionKind, string> = {
  time: '시간·노동',
  money: '돈',
  space: '공간·장비',
  knowledge: '기술·지식',
  network: '사람·접점',
};

export const activityStatusLabel: Record<ActivityStatus, string> = {
  idea: '구상',
  planned: '예정',
  active: '진행',
  ongoing: '지속',
  paused: '중단',
  done: '완료',
};

export const evidenceLabel: Record<Evidence, string> = {
  hypothesis: '기대·가설',
  observed: '관찰',
  confirmed: '자료로 확인',
};

export const relationStatusLabel: Record<RelationStatus, string> = {
  planned: '만들고 싶은 연결',
  active: '현재 연결',
  ended: '종료된 연결',
};

export const influenceSignLabel: Record<InfluenceSign, string> = {
  '+': '같은 방향',
  '-': '반대 방향',
  '?': '미정',
};

/** 관계 종류별로 허용하는 양 끝 대상 */
export const relationEndpoints: Record<RelationKind, { from: EntityType[]; to: EntityType[] }> = {
  participation: { from: ['actor'], to: ['activity'] },
  activityLink: { from: ['activity'], to: ['activity'] },
  contribution: { from: ['activity', 'outcome'], to: ['outcome'] },
  factorLink: { from: ['activity', 'outcome'], to: ['factor'] },
  influence: { from: ['factor'], to: ['factor'] },
  actorLink: { from: ['actor'], to: ['actor'] },
};
