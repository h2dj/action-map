/**
 * 외부 자료 가져오기 (3단계): CSV·TSV 표, 노션 데이터베이스 내보내기(CSV), 스프레드시트 붙여넣기.
 * - 원본은 바꾸지 않고, 명시적으로 가져온 행만 새 기록으로 만든다(자동 동기화 없음).
 * - 이름이 같은 기존 기록과 합치지 않는다. 상위 활동은 같은 표 안의 이름을 먼저, 없으면
 *   기존 활동 중 이름이 하나뿐일 때만 연결한다.
 * - 날짜는 아는 정밀도만 남긴다. 노션의 기간("2025년 3월 1일 → 2025년 6월 30일")도 읽는다.
 */
import { addActivity, addActor, addFactor, addOutcome } from '../domain/ops';
import type { ActivityStatus, DateRange, EntityType, Id, MapDocument, PartialDate } from '../domain/schema';
import type { Issue } from '../domain/validate';

/** 따옴표·줄바꿈을 지원하는 CSV/TSV 파서. 구분자는 첫 줄로 추정한다. */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export type Field = 'name' | 'type' | 'status' | 'start' | 'end' | 'period' | 'parent' | 'description' | 'tags' | 'kind' | 'ignore';

export const fieldLabel: Record<Field, string> = {
  name: '이름',
  type: '기록 종류',
  status: '진행 상태',
  start: '시작일',
  end: '종료일',
  period: '기간(시작 → 종료)',
  parent: '상위 활동',
  description: '설명',
  tags: '태그',
  kind: '사람·단체 구분',
  ignore: '가져오지 않음',
};

const headerHints: [Field, RegExp][] = [
  ['name', /^(이름|name|title|제목|활동|활동명|항목)$/i],
  ['type', /^(종류|유형|구분|type|category|분류)$/i],
  ['status', /^(상태|진행|진행 ?상태|status)$/i],
  ['start', /^(시작|시작일|시작 ?날짜|start|start ?date|from)$/i],
  ['end', /^(종료|종료일|끝|마감|end|end ?date|due|to)$/i],
  ['period', /^(기간|날짜|일정|date|dates|period|timeline)$/i],
  ['parent', /^(상위|상위 ?활동|상위 ?사업|parent|사업|프로젝트|project)$/i],
  ['description', /^(설명|내용|메모|비고|description|notes?)$/i],
  ['tags', /^(태그|tags?|키워드|label|labels)$/i],
  ['kind', /^(사람\/단체|주체 ?유형|person\/org)$/i],
];

export function guessMapping(header: string[]): Field[] {
  const used = new Set<Field>();
  return header.map((h) => {
    const hit = headerHints.find(([f, re]) => !used.has(f) && re.test(h.trim()));
    if (!hit) return 'ignore';
    used.add(hit[0]);
    return hit[0];
  });
}

const typeWords: [EntityType | 'change' | 'purpose', RegExp][] = [
  ['activity', /^(활동|사업|프로그램|activity|project|task)$/i],
  ['actor', /^(주체|사람|단체|기관|조직|actor|person|org|organization)$/i],
  ['change', /^(변화|직접 ?변화|change|outcome)$/i],
  ['purpose', /^(목적|목표|가치|purpose|goal|impact)$/i],
  ['factor', /^(요인|변화 ?요인|factor|variable)$/i],
];

const statusWords: [ActivityStatus, RegExp][] = [
  ['idea', /^(구상|아이디어|idea|backlog|검토)$/i],
  ['planned', /^(예정|계획|planned|not started|시작 ?전|todo|to do)$/i],
  ['active', /^(진행|진행 ?중|active|in progress|doing)$/i],
  ['ongoing', /^(지속|상시|ongoing|continuous)$/i],
  ['paused', /^(중단|보류|paused|on hold|blocked)$/i],
  ['done', /^(완료|종료|끝|done|completed?|finished)$/i],
];

const months: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** 2025, 2025-03, 2025.3.1, 2025/03/01, 2025년 3월 1일, March 1, 2025 */
export function parseLooseDate(text: string): PartialDate | undefined {
  const t = text.trim();
  if (!t) return undefined;
  // 한국어 표기를 먼저 본다 ("2025년 3월"의 "2025"만 읽지 않도록)
  let m = /^(\d{4})\s*년(?:\s*(\d{1,2})\s*월(?:\s*(\d{1,2})\s*일)?)?/.exec(t);
  if (!m) m = /^(\d{4})(?:[-./]\s*(\d{1,2})(?:[-./]\s*(\d{1,2}))?)?(?![\d])/.exec(t);
  if (m) return build(Number(m[1]), m[2] ? Number(m[2]) : undefined, m[3] ? Number(m[3]) : undefined);
  const en = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(t) ?? /^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/.exec(t);
  if (en) {
    const mo = months[en[1].toLowerCase()];
    if (!mo) return undefined;
    return en.length === 4 ? build(Number(en[3]), mo, Number(en[2])) : build(Number(en[2]), mo);
  }
  return undefined;
}

function build(y: number, m?: number, d?: number): PartialDate | undefined {
  if (y < 1900 || y > 2200 || (m && (m < 1 || m > 12)) || (d && (d < 1 || d > 31))) return undefined;
  return { y, ...(m ? { m } : {}), ...(m && d ? { d } : {}) };
}

/** "A → B", "A ~ B", "A - B"(공백 포함), "A to B" */
export function parsePeriod(text: string): DateRange | undefined {
  const parts = text.split(/\s*(?:→|->|~|–|—|\sto\s|\s-\s)\s*/);
  const start = parseLooseDate(parts[0] ?? '');
  const end = parts[1] ? parseLooseDate(parts[1]) : undefined;
  if (!start && !end) return undefined;
  return { ...(start ? { start } : {}), ...(end ? { end } : {}) };
}

export type ImportPlanRow = {
  line: number;
  name: string;
  target: EntityType | 'change' | 'purpose';
  status?: ActivityStatus;
  dates?: DateRange;
  parentName?: string;
  description?: string;
  tags?: string[];
  actorKind?: 'person' | 'org';
};

export type TableImportPlan = { rows: ImportPlanRow[]; issues: Issue[] };

/**
 * 표를 가져오기 계획으로 바꾼다. 종류 열이 없거나 읽을 수 없는 행은 defaultType으로 만든다.
 * 날짜는 활동의 실제 기간(완료·진행·지속) 또는 예정 기간(구상·예정)에 넣는다.
 */
export function planTableImport(rows: string[][], mapping: Field[], defaultType: ImportPlanRow['target'] = 'activity'): TableImportPlan {
  const issues: Issue[] = [];
  const out: ImportPlanRow[] = [];
  const col = (f: Field) => mapping.indexOf(f);
  if (col('name') < 0) return { rows: [], issues: [{ level: 'error', code: 'table.noName', message: '“이름” 열을 지정해야 합니다.' }] };

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (f: Field) => (col(f) >= 0 ? (r[col(f)] ?? '').trim() : '');
    const name = get('name');
    if (!name) {
      issues.push({ level: 'warning', code: 'table.emptyName', message: `${line}행: 이름이 없어 건너뛰었습니다.` });
      return;
    }
    const typeText = get('type');
    const target = typeText ? typeWords.find(([, re]) => re.test(typeText))?.[0] : undefined;
    if (typeText && !target)
      issues.push({ level: 'warning', code: 'table.unknownType', message: `${line}행: 종류 “${typeText}”를 알 수 없어 기본 종류로 만듭니다.` });
    const statusText = get('status');
    const status = statusText ? statusWords.find(([, re]) => re.test(statusText))?.[0] : undefined;
    if (statusText && !status)
      issues.push({ level: 'warning', code: 'table.unknownStatus', message: `${line}행: 상태 “${statusText}”를 알 수 없어 ‘구상’으로 둡니다.` });

    let dates: DateRange | undefined;
    const period = get('period');
    if (period) dates = parsePeriod(period);
    const start = get('start') ? parseLooseDate(get('start')) : undefined;
    const end = get('end') ? parseLooseDate(get('end')) : undefined;
    if (start || end) dates = { ...dates, ...(start ? { start } : {}), ...(end ? { end } : {}) };
    if ((period || get('start') || get('end')) && !dates)
      issues.push({ level: 'warning', code: 'table.badDate', message: `${line}행: 날짜를 읽지 못해 비워 두었습니다.` });

    const kindText = get('kind') || typeText;
    const actorKind = /단체|기관|조직|org/i.test(kindText) ? 'org' : /사람|개인|person/i.test(kindText) ? 'person' : undefined;
    const tags = get('tags') ? get('tags').split(/[,;]/).map((t) => t.trim()).filter(Boolean) : undefined;

    out.push({
      line,
      name,
      target: target ?? defaultType,
      ...(status ? { status } : {}),
      ...(dates ? { dates } : {}),
      ...(get('parent') ? { parentName: get('parent') } : {}),
      ...(get('description') ? { description: get('description') } : {}),
      ...(tags?.length ? { tags } : {}),
      ...(actorKind ? { actorKind } : {}),
    });
  });
  return { rows: out, issues };
}

/** 계획을 문서에 적용한다 (스토어 run 안에서 호출). 만든 ID 목록과 안내를 돌려준다. */
export function applyTableImport(doc: MapDocument, plan: TableImportPlan): { created: Id[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const created: Id[] = [];
  const byName = new Map<string, Id>();
  const pendingParents: { id: Id; parentName: string; line: number }[] = [];

  for (const r of plan.rows) {
    const base = { name: r.name, ...(r.description ? { description: r.description } : {}) };
    let id: Id;
    if (r.target === 'activity') {
      const status = r.status ?? 'idea';
      const future = status === 'idea' || status === 'planned';
      id = addActivity(doc, {
        ...base,
        status,
        ...(r.dates ? (future ? { planned: r.dates } : { actual: r.dates }) : {}),
        ...(r.tags ? { tags: r.tags } : {}),
      });
      if (!byName.has(r.name)) byName.set(r.name, id);
      if (r.parentName) pendingParents.push({ id, parentName: r.parentName, line: r.line });
    } else if (r.target === 'actor') id = addActor(doc, { ...base, kind: r.actorKind ?? 'person', ...(r.tags ? { tags: r.tags } : {}) });
    else if (r.target === 'factor') id = addFactor(doc, { name: r.name, ...(r.description ? { definition: r.description } : {}) });
    else id = addOutcome(doc, { ...base, level: r.target === 'purpose' ? 'purpose' : 'change' });
    created.push(id);
  }

  for (const p of pendingParents) {
    let parent = byName.get(p.parentName);
    if (!parent) {
      const existing = Object.values(doc.activities).filter((a) => a.name === p.parentName && !created.includes(a.id));
      if (existing.length === 1) parent = existing[0].id;
      else if (existing.length > 1)
        issues.push({ level: 'warning', code: 'table.ambiguousParent', message: `${p.line}행: 상위 활동 “${p.parentName}”이 여러 개라 연결하지 않았습니다.` });
    }
    if (!parent) {
      if (!issues.some((i) => i.message.startsWith(`${p.line}행`)))
        issues.push({ level: 'warning', code: 'table.missingParent', message: `${p.line}행: 상위 활동 “${p.parentName}”을 찾지 못해 연결하지 않았습니다.` });
      continue;
    }
    if (parent === p.id) continue;
    // 순환이 생기면 연결하지 않는다
    let cur: Id | undefined = parent;
    let cycle = false;
    while (cur) {
      if (cur === p.id) {
        cycle = true;
        break;
      }
      cur = doc.activities[cur]?.parentId;
    }
    if (cycle) issues.push({ level: 'warning', code: 'table.parentCycle', message: `${p.line}행: 상위 활동 연결이 순환을 만들어 건너뛰었습니다.` });
    else doc.activities[p.id].parentId = parent;
  }
  return { created, issues };
}
