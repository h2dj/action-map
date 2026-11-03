/** 선택한 관계 편집: 상태·근거·기간·역할·기여·영향 (F03, F04) */
import { deleteRelation, updateRelation } from '../domain/ops';
import type { Contribution, ContributionKind, Evidence, Id, InfluenceSign, Relation, RelationStatus } from '../domain/schema';
import {
  activityLinkLabel,
  contributionKindLabel,
  evidenceLabel,
  influenceSignLabel,
  relationKindLabel,
  relationStatusLabel,
} from '../domain/vocab';
import { useMap } from '../store/mapStore';
import { CheckField, DateRangeField, SelectField, TextField } from './fields';
import { nameOf, typeLabelOf } from './labels';
import { tryRun, useUi } from './uiStore';

export function RelationEditor({ id }: { id: Id }) {
  const doc = useMap((s) => s.doc);
  const select = useUi((s) => s.select);
  const r = doc.relations[id];
  if (!r) return null;
  const patch = (label: string, p: Partial<Relation>) => tryRun(label, (d) => updateRelation(d, id, p));
  const canContribute = r.kind === 'participation' || (r.kind === 'activityLink' && r.subtype === 'support');

  const end = (eid: Id) => (
    <button className="chip" onClick={() => select({ kind: 'entity', id: eid })}>
      {nameOf(doc, eid)} <small>({typeLabelOf(doc, eid)})</small>
    </button>
  );

  return (
    <div className="detail">
      <header className="detail-head">
        <span className="badge">{relationKindLabel[r.kind]}</span>
        <code className="id">{id}</code>
        <button
          className="danger"
          onClick={() => {
            const from = r.from;
            const ok = tryRun('관계 삭제', (d) => {
              deleteRelation(d, id);
              return true;
            });
            if (ok) select({ kind: 'entity', id: from });
          }}
        >
          삭제
        </button>
      </header>
      <p className="rel-ends">
        {end(r.from)} <span aria-label="에서">→</span> {end(r.to)}
      </p>

      {r.kind === 'activityLink' && (
        <SelectField
          label="연결 종류"
          value={(r.subtype ?? '') as keyof typeof activityLinkLabel}
          options={Object.entries(activityLinkLabel) as [keyof typeof activityLinkLabel, string][]}
          onChange={(v) => v && patch('연결 종류 변경', { subtype: v, ...(v !== 'support' ? { contributions: undefined } : {}) })}
        />
      )}
      {r.kind === 'actorLink' && (
        <TextField label="관계 (소속·협약 등)" value={r.subtype} onCommit={(v) => patch('주체 관계 변경', { subtype: v || undefined })} />
      )}
      {r.kind === 'participation' && (
        <>
          <TextField label="역할" required value={r.role?.name} onCommit={(v) => patch('역할 변경', { role: { ...r.role, name: v } })} />
          <TextField
            label="역할 설명"
            multiline
            value={r.role?.description}
            onCommit={(v) => patch('역할 설명 변경', { role: { name: r.role?.name ?? '참여', description: v || undefined } })}
          />
        </>
      )}

      <div className="row">
        <SelectField<RelationStatus>
          label="진행 상태"
          value={r.status}
          options={Object.entries(relationStatusLabel) as [RelationStatus, string][]}
          onChange={(v) => v && patch('관계 상태 변경', { status: v })}
        />
        <SelectField<Evidence>
          label="근거 상태"
          value={r.evidence}
          options={Object.entries(evidenceLabel) as [Evidence, string][]}
          onChange={(v) => v && patch('근거 상태 변경', { evidence: v })}
        />
      </div>
      <TextField label="근거 메모" multiline value={r.evidenceNote} onCommit={(v) => patch('근거 메모 변경', { evidenceNote: v || undefined })} />
      <TextField label="설명" multiline value={r.description} onCommit={(v) => patch('관계 설명 변경', { description: v || undefined })} />
      <DateRangeField label="유효 기간" value={r.validity} onCommit={(v) => patch('유효 기간 변경', { validity: v })} />

      {r.kind === 'contribution' && (
        <CheckField
          label="다른 활동을 가능하게 하는 기여 (운영·재원·회복 등)"
          checked={!!r.enabling}
          onChange={(v) => patch('기반 기여 표시', { enabling: v || undefined })}
        />
      )}

      {(r.kind === 'influence' || r.kind === 'factorLink') && (
        <fieldset className="field">
          <legend>영향</legend>
          <SelectField<InfluenceSign>
            label="방향"
            value={r.influence?.sign ?? ''}
            options={[
              ...(r.kind === 'factorLink' ? ([['', '표시 안 함']] as const) : []),
              ...(Object.entries(influenceSignLabel).map(([k, l]) => [k, `${k === '?' ? '?' : k} ${l}`]) as [InfluenceSign, string][]),
            ]}
            onChange={(v) => patch('영향 방향 변경', { influence: v ? { ...r.influence, sign: v } : undefined })}
          />
          <p className="hint">+는 한쪽이 늘 때 다른 쪽도 느는 방향, −는 반대 방향입니다. 좋고 나쁨의 표시가 아닙니다.</p>
          {r.influence && (
            <>
              <CheckField
                label="지연 (영향이 늦게 나타남)"
                checked={!!r.influence.delayed}
                onChange={(v) => patch('지연 표시', { influence: { ...r.influence!, delayed: v || undefined } })}
              />
              {r.influence.delayed && (
                <TextField
                  label="지연 설명"
                  value={r.influence.delayNote}
                  onCommit={(v) => patch('지연 설명 변경', { influence: { ...r.influence!, delayNote: v || undefined } })}
                />
              )}
            </>
          )}
        </fieldset>
      )}

      {canContribute && <ContributionsEditor relation={r} onChange={(c) => patch('기여 내역 변경', { contributions: c.length ? c : undefined })} />}
    </div>
  );
}

function ContributionsEditor({ relation, onChange }: { relation: Relation; onChange: (c: Contribution[]) => void }) {
  const list = relation.contributions ?? [];
  const set = (i: number, p: Partial<Contribution>) => {
    const next = list.map((c, n) => {
      if (n !== i) return c;
      const merged = { ...c, ...p };
      for (const k of Object.keys(merged) as (keyof Contribution)[]) if (merged[k] === undefined) delete merged[k];
      return merged;
    });
    onChange(next);
  };
  return (
    <fieldset className="field contributions">
      <legend>기여 내역</legend>
      <p className="hint">양과 단위는 선택입니다. 서로 다른 자원을 하나의 점수로 합치지 않습니다.</p>
      {list.map((c, i) => (
        <div key={i} className="contribution-row">
          <select
            aria-label="기여 종류"
            value={c.kind}
            onChange={(e) => set(i, { kind: e.target.value as ContributionKind })}
          >
            {Object.entries(contributionKindLabel).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <input
            aria-label="양"
            type="number"
            placeholder="양"
            defaultValue={c.amount ?? ''}
            onBlur={(e) => {
              const v = e.target.value === '' ? undefined : Number(e.target.value);
              if (v !== c.amount) set(i, { amount: v });
            }}
          />
          <input
            aria-label="단위"
            placeholder="단위"
            defaultValue={c.unit ?? ''}
            onBlur={(e) => e.target.value !== (c.unit ?? '') && set(i, { unit: e.target.value || undefined })}
          />
          <input
            aria-label="비공개 메모"
            placeholder="비공개 메모"
            title="내보내기 시 기본으로 제외됩니다"
            defaultValue={c.privateNote ?? ''}
            onBlur={(e) => e.target.value !== (c.privateNote ?? '') && set(i, { privateNote: e.target.value || undefined })}
          />
          <button aria-label="기여 삭제" onClick={() => onChange(list.filter((_, n) => n !== i))}>
            ×
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...list, { kind: 'time' }])}>+ 기여 추가</button>
    </fieldset>
  );
}
