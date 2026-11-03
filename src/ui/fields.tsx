/**
 * 입력 필드. 글자마다 실행 취소 기록이 쌓이지 않도록 초점을 잃거나 Enter를 누를 때 반영한다.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { DateRange, PartialDate } from '../domain/schema';
import { formatPartialDate } from '../domain/time';

export function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

type TextProps = {
  label: string;
  value: string | undefined;
  onCommit: (v: string) => void;
  multiline?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
};

export function TextField({ label, value, onCommit, multiline, required, autoFocus, placeholder }: TextProps) {
  const [draft, setDraft] = useState(value ?? '');
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => setDraft(value ?? ''), [value]);
  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [autoFocus]);
  const commit = () => {
    const v = draft.trim();
    if (required && !v) {
      setDraft(value ?? '');
      return;
    }
    if (v !== (value ?? '')) onCommit(v);
  };
  const common = {
    ref,
    value: draft,
    placeholder,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') setDraft(value ?? '');
      if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commit();
      }
    },
  };
  return (
    <Field label={label}>
      {(id) => (multiline ? <textarea id={id} rows={3} {...common} /> : <input id={id} type="text" {...common} />)}
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | '';
  options: readonly (readonly [T | '', string])[];
  onChange: (v: T | '') => void;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T | '')}>
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

/** "2026", "2026-03", "2026.03.15" 형식을 읽는다. 빈 값은 미정(undefined). */
export function parsePartialDate(text: string): PartialDate | undefined | 'invalid' {
  const t = text.trim();
  if (!t) return undefined;
  const m = /^(\d{4})(?:[-./](\d{1,2})(?:[-./](\d{1,2}))?)?$/.exec(t);
  if (!m) return 'invalid';
  const y = Number(m[1]);
  const mo = m[2] ? Number(m[2]) : undefined;
  const d = m[3] ? Number(m[3]) : undefined;
  if (y < 1900 || y > 2200 || (mo !== undefined && (mo < 1 || mo > 12)) || (d !== undefined && (d < 1 || d > 31))) return 'invalid';
  return { y, ...(mo ? { m: mo } : {}), ...(d ? { d } : {}) };
}

const fmt = (d: PartialDate | undefined) => (d ? formatPartialDate(d) : '');

function DateInput({ label, value, onCommit }: { label: string; value?: PartialDate; onCommit: (d: PartialDate | undefined) => void }) {
  const [draft, setDraft] = useState(fmt(value));
  const [error, setError] = useState(false);
  useEffect(() => setDraft(fmt(value)), [value]);
  const commit = () => {
    const parsed = parsePartialDate(draft);
    if (parsed === 'invalid') {
      setError(true);
      return;
    }
    setError(false);
    if (fmt(parsed) !== fmt(value)) onCommit(parsed);
  };
  return (
    <label className="date-input">
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="미정"
        value={draft}
        aria-invalid={error}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  );
}

export function DateRangeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: DateRange | undefined;
  onCommit: (r: DateRange | undefined) => void;
}) {
  const update = (key: 'start' | 'end', d: PartialDate | undefined) => {
    const next: DateRange = { ...value };
    if (d) next[key] = d;
    else delete next[key];
    onCommit(next.start || next.end ? next : undefined);
  };
  return (
    <fieldset className="field date-range">
      <legend>{label}</legend>
      <DateInput label="시작" value={value?.start} onCommit={(d) => update('start', d)} />
      <span aria-hidden>~</span>
      <DateInput label="종료" value={value?.end} onCommit={(d) => update('end', d)} />
      <div className="hint">연도, 연-월, 연-월-일 중 아는 만큼 입력 (예: 2026, 2026-03)</div>
    </fieldset>
  );
}
