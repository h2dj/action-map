/**
 * 보기 투영의 공통 모델. 각 보기는 (문서, 보기 상태, 옵션) → { nodes, edges } 순수 함수다.
 * 같은 엔티티는 어느 보기에서든 같은 ID의 노드로 나타난다 (F05).
 */
import type { EntityType, Evidence, Id, MapDocument, Relation, RelationStatus, ViewId, ViewState } from '../domain/schema';

export type NodeTone = 'past' | 'present' | 'future' | 'actor' | 'change' | 'purpose' | 'factor' | 'base';

export type VNode =
  | {
      kind: 'entity';
      id: Id;
      entityType: EntityType;
      label: string;
      sub?: string;
      tone: NodeTone;
      x: number;
      y: number;
      w: number;
      h: number;
      /** 접을 수 있는 하위 활동 수 (0이면 표시 안 함) */
      childCount?: number;
      collapsed?: boolean;
      /** 예정만 있고 실제 기간이 없는 등, 점선 테두리로 표시 */
      tentative?: boolean;
    }
  | { kind: 'lane'; id: string; label: string; sub?: string; tone: NodeTone; x: number; y: number; w: number; h: number }
  /** 순환 라벨 (R1 ↻ / B1 ↺): 순환에 속한 요인들의 가운데에 놓는다 */
  | { kind: 'loop'; id: Id; label: string; loopKind: 'R' | 'B' | 'undetermined' | 'broken'; x: number; y: number; w: number; h: number };

export type VEdge = {
  id: string;
  relationId: Id;
  source: Id;
  target: Id;
  label?: string;
  status: RelationStatus;
  evidence: Evidence;
  /** 색 구분용 */
  tone: 'link' | 'role' | 'contribution' | 'enabling' | 'factor' | 'actor' | 'influence';
  /** 영향 방향 (순환 보기) */
  sign?: '+' | '-' | '?';
  delayed?: boolean;
  /** 접힌 하위 활동의 관계를 상위 활동으로 모아 그린 선 */
  aggregated?: boolean;
  directed: boolean;
};

export type Projection = { nodes: VNode[]; edges: VEdge[]; notes: string[] };

export const NODE_W = 220;
export const NODE_H = 64;

export const emptyView = (viewId: ViewId): ViewState => ({ viewId, positions: {}, filters: {}, collapsed: [] });

/** 저장된 위치(사용자가 끌어 옮긴 좌표)가 있으면 자동 배치보다 우선한다 */
export function applySavedPositions(nodes: VNode[], view: ViewState | undefined): VNode[] {
  if (!view) return nodes;
  return nodes.map((n) => {
    const p = n.kind !== 'lane' ? view.positions[n.id] : undefined;
    return p ? { ...n, x: p.x, y: p.y } : n;
  });
}

/**
 * 접힌 활동 처리: 접힌 활동의 자손은 숨기고, 자손의 관계는 가장 가까운 보이는 조상으로 모은다.
 * 반환: id → 보이는 대표 id (숨겨지지 않은 대상은 자기 자신)
 */
export function visibleRepresentative(doc: MapDocument, collapsed: Iterable<Id>): (id: Id) => Id {
  const set = new Set(collapsed);
  const cache = new Map<Id, Id>();
  return (id: Id) => {
    const hit = cache.get(id);
    if (hit) return hit;
    let rep = id;
    let cur = doc.activities[id]?.parentId;
    const seen = new Set<Id>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (set.has(cur)) rep = cur; // 가장 바깥의 접힌 조상까지 올라간다
      cur = doc.activities[cur]?.parentId;
    }
    cache.set(id, rep);
    return rep;
  };
}

/** 관계 목록을 보이는 대표 노드 사이의 선으로 바꾼다. 같은 끝점·종류의 모은 선은 하나로 합친다. */
export function edgesFor(
  rels: Relation[],
  rep: (id: Id) => Id,
  visible: Set<Id>,
  style: (r: Relation) => Pick<VEdge, 'tone' | 'label' | 'directed'>,
): VEdge[] {
  const out: VEdge[] = [];
  const seen = new Set<string>();
  for (const r of rels) {
    const source = rep(r.from);
    const target = rep(r.to);
    if (source === target || !visible.has(source) || !visible.has(target)) continue;
    const aggregated = source !== r.from || target !== r.to;
    const s = style(r);
    if (aggregated) {
      const key = `${source}>${target}:${s.tone}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: `agg:${key}`, relationId: r.id, source, target, status: r.status, evidence: r.evidence, ...s, label: undefined, aggregated });
    } else {
      out.push({ id: r.id, relationId: r.id, source, target, status: r.status, evidence: r.evidence, ...s });
    }
  }
  return out;
}

/** 활동을 포함 관계 트리 순서(부모 → 자식)로 정렬 */
export function activitiesInTreeOrder(doc: MapDocument): { id: Id; depth: number }[] {
  const all = Object.values(doc.activities);
  const kids = new Map<Id | undefined, Id[]>();
  for (const a of all) {
    const p = a.parentId && doc.activities[a.parentId] ? a.parentId : undefined;
    kids.set(p, [...(kids.get(p) ?? []), a.id]);
  }
  const out: { id: Id; depth: number }[] = [];
  const seen = new Set<Id>();
  const walk = (p: Id | undefined, depth: number) => {
    for (const id of kids.get(p) ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, depth });
      walk(id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}

export function childCounts(doc: MapDocument): Map<Id, number> {
  const m = new Map<Id, number>();
  for (const a of Object.values(doc.activities)) if (a.parentId) m.set(a.parentId, (m.get(a.parentId) ?? 0) + 1);
  return m;
}
