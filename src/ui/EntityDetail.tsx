/** 선택한 주체·활동·변화·목적·요인의 상세 편집 (F01, F02) */
import { entityTypeOf } from '../domain/ids';
import { descendantsOf, setParent, updateEntity } from '../domain/ops';
import type { ActivityStatus, Id, MapDocument, Relation, TimeLayer } from '../domain/schema';
import { timeLayerOf } from '../domain/time';
import { validateActivity } from '../domain/validate';
import { activityStatusLabel, evidenceLabel, relationStatusLabel } from '../domain/vocab';
import { useMap } from '../store/mapStore';
import { analyzeLoop, loopKindLabel } from '../domain/loops';
import { CheckField, DateRangeField, SelectField, TextField } from './fields';
import { ReviewNotes } from './ReviewNotes';
import { nameOf, relationTitle, typeLabelOf } from './labels';
import { tryRun, useUi } from './uiStore';

const layerName: Record<TimeLayer, string> = { past: '해온 일', present: '진행 중인 일', future: '하려는 일' };

export function EntityDetail({ id }: { id: Id }) {
  const doc = useMap((s) => s.doc);
  const justCreated = useUi((s) => s.justCreated === id);
  const open = useUi((s) => s.open);
  const type = entityTypeOf(doc, id);
  if (!type) return null;

  const patch = (label: string, p: Record<string, unknown>) => tryRun(label, (d) => updateEntity(d, id, p));
  const entity = doc.actors[id] ?? doc.activities[id] ?? doc.outcomes[id] ?? doc.factors[id];
  const description = 'description' in entity ? entity.description : undefined;

  return (
    <div className="detail">
      <header className="detail-head">
        <span className="badge">{typeLabelOf(doc, id)}</span>
        <code className="id">{id}</code>
        <button className="danger" onClick={() => open({ type: 'delete', id })}>
          삭제
        </button>
      </header>

      <TextField label="이름" required value={entity.name} autoFocus={justCreated} onCommit={(v) => patch('이름 변경', { name: v })} />

      {type === 'actor' && (
        <SelectField
          label="유형"
          value={doc.actors[id].kind}
          options={[
            ['person', '사람'],
            ['org', '단체'],
          ]}
          onChange={(v) => patch('주체 유형 변경', { kind: v })}
        />
      )}

      {type === 'activity' && <ActivityFields doc={doc} id={id} />}

      {type === 'outcome' && (
        <>
          <SelectField
            label="구분"
            value={doc.outcomes[id].level}
            options={[
              ['change', '직접적인 변화'],
              ['purpose', '목적'],
            ]}
            onChange={(v) => patch('변화·목적 구분 변경', { level: v })}
          />
          <TextField label="대상 (누구에게)" value={doc.outcomes[id].target} onCommit={(v) => patch('대상 변경', { target: v || undefined })} />
        </>
      )}

      {type === 'factor' && (
        <>
          <TextField label="정의" multiline value={doc.factors[id].definition} onCommit={(v) => patch('정의 변경', { definition: v || undefined })} />
          <TextField
            label="증가의 의미"
            placeholder="이 요인이 늘어난다는 것은…"
            value={doc.factors[id].increaseMeans}
            onCommit={(v) => patch('증가의 의미 변경', { increaseMeans: v || undefined })}
          />
          <p className="hint">증가의 의미를 적어 두면 영향 방향(+/−)을 “늘면 늘고, 늘면 준다”는 문장으로 읽을 수 있습니다.</p>
          <CheckField
            label="여러 활동이 함께 쓰는 공통 기반"
            checked={!!doc.factors[id].sharedBase}
            onChange={(v) => patch('공통 기반 표시', { sharedBase: v || undefined })}
          />
        </>
      )}

      {type !== 'factor' && (
        <TextField label="설명" multiline value={description} onCommit={(v) => patch('설명 변경', { description: v || undefined })} />
      )}

      <RelationList doc={doc} id={id} />
      {type === 'factor' && <FactorLoops doc={doc} id={id} />}
      <ReviewNotes targetId={id} />
    </div>
  );
}

function ActivityFields({ doc, id }: { doc: MapDocument; id: Id }) {
  const a = doc.activities[id];
  const select = useUi((s) => s.select);
  const patch = (label: string, p: Record<string, unknown>) => tryRun(label, (d) => updateEntity(d, id, p));
  const blocked = new Set([id, ...descendantsOf(doc, id)]);
  const parentOptions = [
    ['', '(없음 — 최상위)'] as const,
    ...Object.values(doc.activities)
      .filter((p) => !blocked.has(p.id))
      .map((p) => [p.id, p.name] as const),
  ];
  const warnings = validateActivity(doc, a).filter((i) => i.level === 'warning');
  const children = Object.values(doc.activities).filter((c) => c.parentId === id);
  const derived = timeLayerOf({ status: a.status });

  return (
    <>
      <div className="row">
        <SelectField<ActivityStatus>
          label="진행 상태"
          value={a.status}
          options={Object.entries(activityStatusLabel) as [ActivityStatus, string][]}
          onChange={(v) => v && patch('상태 변경', { status: v })}
        />
        <SelectField<TimeLayer>
          label="시간층"
          value={a.timeLayerOverride ?? ''}
          options={[['', `자동 (${layerName[derived]})`], ...(Object.entries(layerName) as [TimeLayer, string][])]}
          onChange={(v) => patch('시간층 지정', { timeLayerOverride: v || undefined })}
        />
      </div>
      <SelectField
        label="상위 활동"
        value={a.parentId ?? ''}
        options={parentOptions}
        onChange={(v) => tryRun('상위 활동 변경', (d) => setParent(d, id, v || undefined))}
      />
      <DateRangeField label="예정 기간" value={a.planned} onCommit={(r) => patch('예정 기간 변경', { planned: r })} />
      <DateRangeField label="실제 기간" value={a.actual} onCommit={(r) => patch('실제 기간 변경', { actual: r })} />
      {warnings.map((w) => (
        <p key={w.code} className="warning" role="status">
          ⚠ {w.message}
        </p>
      ))}
      <TextField
        label="태그 (쉼표로 구분)"
        value={a.tags?.join(', ')}
        onCommit={(v) => {
          const tags = v.split(',').map((t) => t.trim()).filter(Boolean);
          patch('태그 변경', { tags: tags.length ? tags : undefined });
        }}
      />
      {children.length > 0 && (
        <div className="field">
          <span className="label">하위 활동</span>
          <ul className="chips">
            {children.map((c) => (
              <li key={c.id}>
                <button className="chip" onClick={() => select({ kind: 'entity', id: c.id })}>
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function FactorLoops({ doc, id }: { doc: MapDocument; id: Id }) {
  const select = useUi((s) => s.select);
  const open = useUi((s) => s.open);
  const loops = Object.values(doc.loops).filter((l) => l.factorIds.includes(id));
  return (
    <section className="relations" aria-label="이 요인이 든 순환">
      <header>
        <h3>순환 {loops.length}</h3>
        <button onClick={() => open({ type: 'loop', startId: id })}>+ 여기서 순환 구성</button>
      </header>
      <ul className="chips">
        {loops.map((l) => (
          <li key={l.id}>
            <button className="chip" onClick={() => select({ kind: 'loop', id: l.id })}>
              {l.name} <small>({loopKindLabel[analyzeLoop(doc, l.factorIds).kind]})</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RelationList({ doc, id }: { doc: MapDocument; id: Id }) {
  const select = useUi((s) => s.select);
  const open = useUi((s) => s.open);
  const rels = Object.values(doc.relations).filter((r) => r.from === id || r.to === id);

  const row = (r: Relation) => {
    const outgoing = r.from === id;
    const other = outgoing ? r.to : r.from;
    return (
      <li key={r.id} className={`rel-row status-${r.status}`}>
        <button className="rel-main" onClick={() => select({ kind: 'relation', id: r.id })}>
          <span className="rel-title">{relationTitle(r)}</span>
          <span className="rel-end">
            {outgoing ? '→' : '←'} {nameOf(doc, other)} <small>({typeLabelOf(doc, other)})</small>
          </span>
          <span className="rel-tags">
            <span className={`tag status`}>{relationStatusLabel[r.status]}</span>
            <span className={`tag evidence-${r.evidence}`}>{evidenceLabel[r.evidence]}</span>
            {r.influence && <span className="tag">{r.influence.sign === '?' ? '±미정' : r.influence.sign}</span>}
            {r.enabling && <span className="tag">기반 기여</span>}
          </span>
        </button>
        <button className="link" aria-label={`${nameOf(doc, other)}(으)로 이동`} onClick={() => select({ kind: 'entity', id: other })}>
          이동
        </button>
      </li>
    );
  };

  return (
    <section className="relations" aria-label="연결된 관계">
      <header>
        <h3>관계 {rels.length}</h3>
        <button onClick={() => open({ type: 'relation', anchorId: id })}>+ 관계 추가</button>
      </header>
      {rels.length === 0 ? <p className="empty">아직 연결된 관계가 없습니다.</p> : <ul>{rels.map(row)}</ul>}
    </section>
  );
}
