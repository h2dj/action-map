import { describe, expect, it } from 'vitest';
import { updateRelation } from '../../src/domain/ops';
import { asNewWorkspace, exportDocument, exportFileName, parseImport } from '../../src/io/transfer';
import { buildSampleDocument } from '../../src/fixtures/sample';

function withPrivateNote() {
  const doc = buildSampleDocument();
  updateRelation(doc, 'E07', { contributions: [{ kind: 'money', amount: 10000, unit: '원/월', privateNote: '개인 후원액' }] });
  return doc;
}

describe('F08 내보내기·가져오기', () => {
  it('왕복해도 ID·관계·속성이 보존된다 (검증 시나리오 6)', () => {
    const doc = buildSampleDocument();
    const result = parseImport(exportDocument(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc).toEqual(doc);
  });

  it('새 작업공간으로 불러오면 작업공간 ID만 바뀐다', () => {
    const doc = buildSampleDocument();
    const imported = asNewWorkspace(doc, '2027-01-01T00:00:00.000Z');
    expect(imported.workspace.id).not.toBe(doc.workspace.id);
    expect(imported.activities).toEqual(doc.activities);
    expect(imported.relations).toEqual(doc.relations);
  });

  it('비공개 메모는 기본으로 빠지고, 선택하면 포함된다 (G6)', () => {
    const doc = withPrivateNote();
    expect(exportDocument(doc)).not.toContain('개인 후원액');
    expect(exportDocument(doc)).toContain('10000');
    expect(exportDocument(doc, { includePrivateNotes: true })).toContain('개인 후원액');
    // 원본 문서는 바뀌지 않는다
    expect(doc.relations.E07.contributions?.[0].privateNote).toBe('개인 후원액');
  });

  it('JSON이 아니면 거부한다', () => {
    const r = parseImport('{not json');
    expect(r).toMatchObject({ ok: false, issues: [{ code: 'import.json' }] });
  });

  it('더 새로운 스키마 버전은 거부한다', () => {
    const env = JSON.parse(exportDocument(buildSampleDocument()));
    env.document.schemaVersion = 99;
    expect(parseImport(JSON.stringify(env))).toMatchObject({ ok: false, issues: [{ code: 'import.version' }] });
  });

  it('스키마 위반은 위치와 함께 보고한다', () => {
    const env = JSON.parse(exportDocument(buildSampleDocument()));
    env.document.activities.A02.status = 'unknown';
    const r = parseImport(JSON.stringify(env));
    expect(r.ok).toBe(false);
    expect(r.issues[0].message).toContain('activities.A02.status');
  });

  it('잘못된 참조와 포함 순환은 불러오지 않는다', () => {
    const env = JSON.parse(exportDocument(buildSampleDocument()));
    env.document.relations.R01.to = 'NOPE';
    env.document.activities.A02.parentId = 'A12';
    const r = parseImport(JSON.stringify(env));
    expect(r.ok).toBe(false);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain('relation.missingTo');
    expect(codes).toContain('activity.parentCycle');
  });

  it('경고만 있으면 불러오고 경고를 함께 돌려준다', () => {
    const env = JSON.parse(exportDocument(buildSampleDocument()));
    env.document.activities.A02.planned = { start: { y: 2026, m: 9 }, end: { y: 2026, m: 3 } };
    const r = parseImport(JSON.stringify(env));
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toEqual(['activity.plannedReversed']);
  });

  it('봉투 없이 문서만 있어도 불러온다', () => {
    const doc = buildSampleDocument();
    expect(parseImport(JSON.stringify(doc)).ok).toBe(true);
  });

  it('파일 이름에 쓸 수 없는 문자를 바꾼다', () => {
    const doc = buildSampleDocument();
    doc.workspace.name = '나의/활동: 지도';
    expect(exportFileName(doc, new Date('2026-11-03T00:00:00Z'))).toBe('나의_활동_지도_2026-11-03.action-map.json');
  });
});
