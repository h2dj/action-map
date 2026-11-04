/**
 * 지도 상호작용을 위한 순수 함수: 연결선 접점 선택, 방향키 이동, 관계 필터, 이름 검색.
 */
import type { Evidence, Id, RelationStatus } from '../domain/schema';
import type { VEdge, VNode } from './model';

type Box = { x: number; y: number; w: number; h: number };
export type Side = 'l' | 'r' | 't' | 'b';

/**
 * 두 노드 사이 선의 접점. 옆으로 떨어져 있으면 좌우, 같은 열(가로로 겹침)이면 위아래를 쓴다.
 * 같은 열에서 사이에 다른 노드가 있으면 오른쪽 바깥으로 돌아 노드를 가로지르지 않게 한다.
 */
export function chooseSides(a: Box, b: Box): { source: Side; target: Side } {
  const acx = a.x + a.w / 2;
  const bcx = b.x + b.w / 2;
  const overlapX = Math.abs(acx - bcx) < (a.w + b.w) / 2 - 20;
  if (overlapX) {
    const dy = b.y + b.h / 2 - (a.y + a.h / 2);
    // 사이에 다른 노드가 들어갈 만큼 떨어져 있으면 오른쪽 바깥으로 돌아간다
    if (Math.abs(dy) > Math.max(a.h, b.h) * 1.5) return { source: 'r', target: 'r' };
    return dy >= 0 ? { source: 'b', target: 't' } : { source: 't', target: 'b' };
  }
  return bcx >= acx ? { source: 'r', target: 'l' } : { source: 'l', target: 'r' };
}

export type Direction = 'left' | 'right' | 'up' | 'down';

/** 방향키 이동: 그 방향으로 가장 가까운 노드 (방향 축 거리 + 옆 축 거리 가중) */
export function nearestInDirection(nodes: VNode[], fromId: Id, dir: Direction): Id | undefined {
  const entities = nodes.filter((n) => n.kind === 'entity');
  const from = entities.find((n) => n.id === fromId);
  if (!from) return entities[0]?.id;
  const c = (n: Box) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
  const o = c(from);
  let best: { id: Id; score: number } | undefined;
  for (const n of entities) {
    if (n.id === fromId) continue;
    const p = c(n);
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 5) continue;
    const score = along + across * 2;
    if (!best || score < best.score) best = { id: n.id, score };
  }
  return best?.id;
}

export type EdgeFilter = {
  /** 'all' | 현재만 | 만들고 싶은 것만 */
  status: 'all' | RelationStatus;
  /** 이 근거 수준 이상만 */
  minEvidence: Evidence;
};

const evidenceRank: Record<Evidence, number> = { hypothesis: 0, observed: 1, confirmed: 2 };

export function filterEdges(edges: VEdge[], f: EdgeFilter): VEdge[] {
  return edges.filter(
    (e) => (f.status === 'all' || e.status === f.status) && evidenceRank[e.evidence] >= evidenceRank[f.minEvidence],
  );
}

/** 이름(과 보조 설명)에 검색어가 들어간 노드 ID. 공백으로 나눈 여러 단어는 모두 포함해야 한다. */
export function searchNodes(nodes: VNode[], query: string): Id[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return nodes
    .filter((n) => n.kind === 'entity')
    .filter((n) => {
      const text = `${n.label} ${n.sub ?? ''}`.toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .map((n) => n.id);
}
