/**
 * 관계 추가 대화상자 (F03). 관계 종류를 고르면 허용되는 대상만 보여준다.
 */
import { useMemo, useState } from 'react';
import { entityTypeOf } from '../domain/ids';
import { influenceSentence } from '../domain/loops';
import { addRelation, type NewRelation } from '../domain/ops';
import { ActivityLinkSubtype, type EntityType, type Id, type InfluenceSign, type RelationKind } from '../domain/schema';
import { activityLinkLabel, influenceSignLabel, relationEndpoints, relationKindLabel } from '../domain/vocab';
import { useMap } from '../store/mapStore';
import { Modal } from './Modal';
import { nameOf, typeLabelOf } from './labels';
import { tryRun, useUi } from './uiStore';

const kindHelp: Record<RelationKind, string> = {
  participation: '주체가 활동에서 맡는 역할',
  activityLink: '활동 사이의 경험 제공·지원·파생·활용·자원 공유·경합',
  contribution: '활동·변화가 변화·목적에 기여',
  factorLink: '활동·변화가 변화 요인을 늘리거나 줄임',
  influence: '변화 요인 사이의 영향 (+/−)',
  actorLink: '주체 사이의 소속·협약',
};

type Option = { kind: RelationKind; anchorIsFrom: boolean };

export function RelationDialog({ anchorId }: { anchorId?: Id }) {
  const doc = useMap((s) => s.doc);
  const close = () => useUi.getState().open(null);
  const select = useUi((s) => s.select);

  const [anchor, setAnchor] = useState<Id | ''>(anchorId ?? '');
  const anchorType = anchor ? entityTypeOf(doc, anchor) : undefined;
  const options: Option[] = useMemo(() => {
    if (!anchorType) return [];
    const out: Option[] = [];
    for (const kind of Object.keys(relationEndpoints) as RelationKind[]) {
      const ep = relationEndpoints[kind];
      if (ep.from.includes(anchorType)) out.push({ kind, anchorIsFrom: true });
      else if (ep.to.includes(anchorType)) out.push({ kind, anchorIsFrom: false });
    }
    return out;
  }, [anchorType]);

  const [choice, setChoice] = useState<Option | null>(null);
  const [other, setOther] = useState<Id | ''>('');
  const [subtype, setSubtype] = useState<string>('experience');
  const [role, setRole] = useState('');
  const [sign, setSign] = useState<InfluenceSign | ''>('?');
  const [planned, setPlanned] = useState(false);
  const [query, setQuery] = useState('');

  const option = choice && options.some((o) => o.kind === choice.kind) ? choice : options[0] ?? null;
  const otherTypes: EntityType[] = option ? relationEndpoints[option.kind][option.anchorIsFrom ? 'to' : 'from'] : [];
  const candidates = Object.values({ ...doc.actors, ...doc.activities, ...doc.outcomes, ...doc.factors })
    .filter((e) => e.id !== anchor && otherTypes.includes(entityTypeOf(doc, e.id)!))
    .filter((e) => !query || e.name.toLowerCase().includes(query.trim().toLowerCase()));

  const allEntities = Object.values({ ...doc.activities, ...doc.actors, ...doc.outcomes, ...doc.factors });

  const submit = () => {
    if (!option || !anchor || !other) return;
    const from = option.anchorIsFrom ? anchor : other;
    const to = option.anchorIsFrom ? other : anchor;
    const input: NewRelation = { kind: option.kind, from, to, status: planned ? 'planned' : 'active' };
    if (option.kind === 'activityLink') input.subtype = subtype;
    if (option.kind === 'participation') input.role = { name: role.trim() };
    if (option.kind === 'influence' || (option.kind === 'factorLink' && sign)) input.influence = { sign: (sign || '?') as InfluenceSign };
    const id = tryRun('관계 추가', (d) => addRelation(d, input));
    if (id) {
      close();
      select({ kind: 'relation', id });
    }
  };

  const ready = !!option && !!anchor && !!other && (option.kind !== 'participation' || role.trim());

  return (
    <Modal title="관계 추가" onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!anchorId && (
          <label className="field">
            <span className="label">시작 대상</span>
            <select value={anchor} onChange={(e) => setAnchor(e.target.value)}>
              <option value="">선택하세요</option>
              {allEntities.map((e) => (
                <option key={e.id} value={e.id}>
                  [{typeLabelOf(doc, e.id)}] {e.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {anchorId && (
          <p>
            <strong>{nameOf(doc, anchorId)}</strong> <small>({typeLabelOf(doc, anchorId)})</small>
          </p>
        )}

        {options.length > 0 && (
          <fieldset className="field">
            <legend>관계 종류</legend>
            {options.map((o) => (
              <label key={o.kind} className="radio">
                <input
                  type="radio"
                  name="kind"
                  checked={option?.kind === o.kind}
                  onChange={() => {
                    setChoice(o);
                    setOther('');
                  }}
                />
                <span>
                  {relationKindLabel[o.kind]} <small>— {kindHelp[o.kind]}</small>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {option?.kind === 'activityLink' && (
          <label className="field">
            <span className="label">연결 종류</span>
            <select value={subtype} onChange={(e) => setSubtype(e.target.value)}>
              {ActivityLinkSubtype.options.map((s) => (
                <option key={s} value={s}>
                  {activityLinkLabel[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        {option?.kind === 'participation' && (
          <label className="field">
            <span className="label">역할 (필수)</span>
            <input value={role} placeholder="예: 기획, 교육, 모집" onChange={(e) => setRole(e.target.value)} />
          </label>
        )}
        {(option?.kind === 'influence' || option?.kind === 'factorLink') && (
          <label className="field">
            <span className="label">영향 방향</span>
            <select value={sign} onChange={(e) => setSign(e.target.value as InfluenceSign | '')}>
              {option.kind === 'factorLink' && <option value="">표시 안 함</option>}
              {Object.entries(influenceSignLabel).map(([k, l]) => (
                <option key={k} value={k}>
                  {k} {l}
                </option>
              ))}
            </select>
          </label>
        )}
        {(option?.kind === 'influence' || option?.kind === 'factorLink') && anchor && other && sign && (
          <p className="sentence" role="status">
            {option.anchorIsFrom ? influenceSentence(doc, anchor, other, sign) : influenceSentence(doc, other, anchor, sign)}
          </p>
        )}

        {option && (
          <fieldset className="field">
            <legend>
              {option.anchorIsFrom ? '연결할 대상' : '시작 대상'} ({otherTypes.map((t) => ({ actor: '주체', activity: '활동', outcome: '변화·목적', factor: '변화 요인' })[t]).join('·')})
            </legend>
            <input type="search" placeholder="이름으로 찾기" aria-label="대상 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="candidates" role="radiogroup">
              {candidates.length === 0 && <p className="empty">연결할 수 있는 대상이 없습니다. 먼저 추가해 주세요.</p>}
              {candidates.map((c) => (
                <label key={c.id} className="radio">
                  <input type="radio" name="other" checked={other === c.id} onChange={() => setOther(c.id)} />
                  <span>
                    {c.name} <small>({typeLabelOf(doc, c.id)})</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label className="check">
          <input type="checkbox" checked={planned} onChange={(e) => setPlanned(e.target.checked)} /> 아직 없는, 만들고 싶은 연결
        </label>
        <p className="hint">새 관계의 근거 상태는 ‘기대·가설’로 시작합니다.</p>

        <div className="actions">
          <button type="button" onClick={close}>
            취소
          </button>
          <button type="submit" className="primary" disabled={!ready}>
            추가
          </button>
        </div>
      </form>
    </Modal>
  );
}
