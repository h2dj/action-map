/**
 * 왼쪽 목록: 지도 대신 텍스트로 모든 기록을 확인·선택하는 대체 수단 (F10).
 * 활동은 포함 관계에 따라 접고 펼친다 (F02).
 */
import { useMemo, useState } from 'react';
import type { Activity, Id } from '../domain/schema';
import { timeLayerOf } from '../domain/time';
import { activityStatusLabel } from '../domain/vocab';
import { useMap } from '../store/mapStore';
import { useUi } from './uiStore';

const layerLabel = { past: '해온', present: '진행', future: '하려는' } as const;

function Item({ id, name, meta, depth = 0 }: { id: Id; name: string; meta?: string; depth?: number }) {
  const selected = useUi((s) => s.selection?.kind === 'entity' && s.selection.id === id);
  const select = useUi((s) => s.select);
  return (
    <button
      className={`list-item${selected ? ' selected' : ''}`}
      style={{ paddingLeft: 8 + depth * 16 }}
      aria-current={selected || undefined}
      onClick={() => select({ kind: 'entity', id })}
    >
      <span className="name">{name}</span>
      {meta && <span className="meta">{meta}</span>}
    </button>
  );
}

function ActivityTree({ activities, query }: { activities: Activity[]; query: string }) {
  const [collapsed, setCollapsed] = useState<Set<Id>>(new Set());
  const children = useMemo(() => {
    const m = new Map<Id | undefined, Activity[]>();
    for (const a of activities) {
      const key = a.parentId && activities.some((p) => p.id === a.parentId) ? a.parentId : undefined;
      m.set(key, [...(m.get(key) ?? []), a]);
    }
    return m;
  }, [activities]);

  if (query) {
    const hits = activities.filter((a) => a.name.toLowerCase().includes(query));
    if (!hits.length) return <p className="empty">일치하는 활동 없음</p>;
    return (
      <ul>
        {hits.map((a) => (
          <li key={a.id}>
            <Item id={a.id} name={a.name} meta={activityStatusLabel[a.status]} />
          </li>
        ))}
      </ul>
    );
  }

  const toggle = (id: Id) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const render = (parent: Id | undefined, depth: number): React.ReactNode => {
    const list = children.get(parent);
    if (!list?.length) return null;
    return (
      <ul role={depth === 0 ? undefined : 'group'}>
        {list.map((a) => {
          const kids = children.get(a.id)?.length ?? 0;
          const isCollapsed = collapsed.has(a.id);
          return (
            <li key={a.id}>
              <div className="tree-row" style={{ paddingLeft: depth * 16 }}>
                {kids > 0 ? (
                  <button
                    className="twisty"
                    aria-expanded={!isCollapsed}
                    aria-label={`${a.name} 하위 활동 ${isCollapsed ? '펼치기' : '접기'}`}
                    onClick={() => toggle(a.id)}
                  >
                    {isCollapsed ? '▸' : '▾'}
                  </button>
                ) : (
                  <span className="twisty" aria-hidden />
                )}
                <Item
                  id={a.id}
                  name={a.name}
                  meta={`${layerLabel[timeLayerOf(a)]} · ${activityStatusLabel[a.status]}${isCollapsed ? ` · 하위 ${kids}` : ''}`}
                />
              </div>
              {!isCollapsed && render(a.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };
  return <>{render(undefined, 0)}</>;
}

export function EntityList() {
  const doc = useMap((s) => s.doc);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const match = (name: string) => !q || name.toLowerCase().includes(q);

  const actors = Object.values(doc.actors).filter((a) => match(a.name));
  const changes = Object.values(doc.outcomes).filter((o) => o.level === 'change' && match(o.name));
  const purposes = Object.values(doc.outcomes).filter((o) => o.level === 'purpose' && match(o.name));
  const factors = Object.values(doc.factors).filter((f) => match(f.name));

  const section = (title: string, count: number, body: React.ReactNode) => (
    <section className="list-section" aria-label={title}>
      <h3>
        {title} <span className="count">{count}</span>
      </h3>
      {body}
    </section>
  );

  return (
    <nav className="entity-list" aria-label="기록 목록">
      <input
        type="search"
        className="search"
        placeholder="이름으로 찾기"
        aria-label="이름으로 찾기"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {section('활동', Object.keys(doc.activities).length, <ActivityTree activities={Object.values(doc.activities)} query={q} />)}
      {section(
        '주체',
        actors.length,
        <ul>
          {actors.map((a) => (
            <li key={a.id}>
              <Item id={a.id} name={a.name} meta={a.kind === 'person' ? '사람' : '단체'} />
            </li>
          ))}
        </ul>,
      )}
      {section(
        '변화',
        changes.length,
        <ul>
          {changes.map((o) => (
            <li key={o.id}>
              <Item id={o.id} name={o.name} />
            </li>
          ))}
        </ul>,
      )}
      {section(
        '목적',
        purposes.length,
        <ul>
          {purposes.map((o) => (
            <li key={o.id}>
              <Item id={o.id} name={o.name} />
            </li>
          ))}
        </ul>,
      )}
      {section(
        '변화 요인',
        factors.length,
        <ul>
          {factors.map((f) => (
            <li key={f.id}>
              <Item id={f.id} name={f.name} meta={f.sharedBase ? '공통 기반' : undefined} />
            </li>
          ))}
        </ul>,
      )}
    </nav>
  );
}
