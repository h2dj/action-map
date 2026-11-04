/**
 * 표본 데이터 (0단계). 기획자료 샘플 이미지 01~03의 활동·변화·목적을 옮겼다.
 * 모든 관계는 검토용 가설(evidence: hypothesis)이며 실제 효과를 확인한 자료가 아니다.
 * 개인 이름은 쓰지 않고 '나'로 표기한다.
 */
import { addActivity, addActor, addFactor, addOutcome, addRelation, createEmptyDocument } from '../domain/ops';
import { addLoop } from '../domain/loops';
import type { MapDocument } from '../domain/schema';

export function buildSampleDocument(now = '2026-11-03T00:00:00.000Z'): MapDocument {
  const doc = createEmptyDocument('예시: 나의 활동 지도', now);
  doc.workspace.id = 'ws_sample';
  doc.workspace.description = '샘플 이미지 01~03 기반 표본. 관계와 효과는 검토용 가설입니다.';

  // 주체
  addActor(doc, { id: 'P01', name: '나', kind: 'person' });
  addActor(doc, { id: 'O01', name: '공동체IT', kind: 'org' });
  addActor(doc, { id: 'O02', name: 'IT학교 추진위원회', kind: 'org' });
  addActor(doc, { id: 'O03', name: '협력 단체', kind: 'org' });
  addActor(doc, { id: 'O04', name: '조합원', kind: 'org', description: '공동체IT 조합원 모임' });

  // 활동 — 해온 일
  addActivity(doc, { id: 'A01', name: '시민단체 IT 지원', status: 'ongoing', timeLayerOverride: 'past', description: '기술지원·컨설팅·현장 경험' });
  addActivity(doc, { id: 'A05', name: '역량진단·박람회 경험', status: 'done', description: '참여자 접점·유형화·콘텐츠' });
  addActivity(doc, { id: 'A06', name: '노동인권 활동·교육', status: 'done', description: '센터 운영·노동 현장과의 연결' });
  // 진행 중인 일
  addActivity(doc, { id: 'A02', name: 'IT학교', status: 'active', description: '디지털역량 교육·교육체계 개발' });
  addActivity(doc, { id: 'A11', name: '박람회 참여', status: 'active', parentId: 'A02' });
  addActivity(doc, { id: 'A12', name: '역량진단 프로그램 운영', status: 'planned', parentId: 'A11' });
  addActivity(doc, { id: 'A03', name: 'AI 오픈랩·도구 실험', status: 'active', description: '생산자 참여·시연·활용 실험' });
  addActivity(doc, { id: 'A07', name: '공동체IT 조직 재구성', status: 'active', description: '역할 분담·조합원 참여·운영' });
  addActivity(doc, { id: 'A10', name: '소득을 만드는 일·학습·회복', status: 'ongoing', description: '수익 활동·자기 학습·휴식' });
  // 하려는 일
  addActivity(doc, { id: 'A04', name: 'IT학교 추진체계 확대', status: 'idea', description: '추진위원회·다양한 주체의 참여' });
  addActivity(doc, { id: 'A08', name: '교육·지원 모델 확장', status: 'idea', description: '현장에 적용할 프로그램과 도구' });
  addActivity(doc, { id: 'A09', name: '지속가능한 활동 기반', status: 'idea', description: '협력자·후원·역할 분산' });

  // 직접적인 변화
  addOutcome(doc, { id: 'C01', level: 'change', name: '일상에서 기술을 다룰 힘 향상', target: '디지털 활용에 어려움을 겪는 시민' });
  addOutcome(doc, { id: 'C02', level: 'change', name: '활동가·조직의 자율성 향상', description: '문제해결 능력 향상·기술 부담 완화' });
  addOutcome(doc, { id: 'C03', level: 'change', name: '권리 이해·대응 능력 향상', target: '노동자' });
  addOutcome(doc, { id: 'C04', level: 'change', name: '활동을 함께 지속할 기반 강화', description: '역할 분산·참여·재원 확보' });
  addOutcome(doc, { id: 'C05', level: 'change', name: '개인의 생활·활동 여력 확보', description: '생활 안정·배움·회복' });
  addOutcome(doc, { id: 'C06', level: 'change', name: '참여 주체와 협력 기반 확대' });
  // 목적
  addOutcome(doc, { id: 'G01', level: 'purpose', name: '디지털로 인한 배제 감소' });
  addOutcome(doc, { id: 'G02', level: 'purpose', name: '시민사회의 자율성과 지속가능성' });
  addOutcome(doc, { id: 'G03', level: 'purpose', name: '노동자의 권리와 존엄' });
  addOutcome(doc, { id: 'G04', level: 'purpose', name: '함께 일하는 조직의 지속' });
  addOutcome(doc, { id: 'G05', level: 'purpose', name: '나의 생활과 활동의 지속' });

  // 변화 요인 (G3: 공통 기반을 요인으로 기록)
  addFactor(doc, {
    id: 'F01',
    name: '나의 시간·주의력·회복 여력',
    sharedBase: true,
    increaseMeans: '여러 활동에 쓸 수 있는 여유가 늘어난다',
    definition: '여러 활동이 함께 쓰며, 역할 분담과 협력으로 보완할 자원',
  });
  addFactor(doc, { id: 'F02', name: '운영 업무량', increaseMeans: '조직 운영에 드는 일이 늘어난다' });
  addFactor(doc, { id: 'F03', name: '현장 피드백의 양', increaseMeans: '교육 현장에서 돌아오는 의견이 늘어난다' });
  addFactor(doc, { id: 'F04', name: '교육 적합성', increaseMeans: '교육 내용이 참여자의 실제 필요에 더 잘 맞는다' });
  addFactor(doc, { id: 'F05', name: '역할 분담 정도', increaseMeans: '운영 일을 여러 사람이 나누어 맡는다' });
  addFactor(doc, { id: 'F06', name: '참여자의 활용 경험', increaseMeans: '배운 기술을 일상과 활동에서 실제로 써 본 경험이 쌓인다' });
  addFactor(doc, { id: 'F07', name: '교육 참여자 수', increaseMeans: 'IT학교에 참여하는 사람이 늘어난다' });

  // 활동 간 연결 (샘플 01)
  const link = (id: string, from: string, to: string, subtype: string, description: string, status: 'active' | 'planned' = 'active') =>
    addRelation(doc, { id, kind: 'activityLink', subtype, from, to, description, status });
  link('R01', 'A01', 'A02', 'experience', '현장 수요·경험');
  link('R02', 'A05', 'A02', 'experience', '교육 설계 근거');
  link('R03', 'A02', 'A03', 'support', '현장 과제 제공');
  link('R04', 'A03', 'A02', 'utilize', '교육에 기술 실험 반영');
  link('R05', 'A06', 'A07', 'experience', '대상·현장 이해');
  link('R06', 'A02', 'A04', 'derive', '비전·참여 기반', 'planned');
  link('R07', 'A03', 'A08', 'derive', '기술·실험 경험', 'planned');
  link('R08', 'A07', 'A09', 'derive', '역할·운영 기반', 'planned');
  link('R09', 'A04', 'A09', 'support', '재원·협력 확대', 'planned');

  // 요인과의 연결 (샘플 01 하단)
  addRelation(doc, { id: 'R10', kind: 'factorLink', from: 'A07', to: 'F01', description: '운영 업무가 여력을 사용', influence: { sign: '-' } });
  addRelation(doc, { id: 'R11', kind: 'factorLink', from: 'A04', to: 'F01', description: '미래 준비와 시간 경합', influence: { sign: '-' }, status: 'planned' });
  addRelation(doc, { id: 'R12', kind: 'factorLink', from: 'A09', to: 'F01', description: '역할 분산으로 부담 완화', influence: { sign: '+' }, status: 'planned' });
  addRelation(doc, { id: 'R13', kind: 'influence', from: 'F02', to: 'F01', description: '업무량이 늘면 회복 여력이 줄어든다', influence: { sign: '-' } });

  // 영향 관계 (2단계 순환 분석 표본). 모두 검토용 가설이다.
  const inf = (id: string, from: string, to: string, sign: '+' | '-', description: string, delayed = false) =>
    addRelation(doc, { id, kind: 'influence', from, to, description, influence: { sign, ...(delayed ? { delayed: true } : {}) } });
  inf('R14', 'F01', 'F05', '+', '여력이 있어야 역할을 나누는 일에도 힘을 쓸 수 있다');
  inf('R15', 'F05', 'F02', '-', '역할을 나누면 한 사람의 운영 업무가 줄어든다', true);
  inf('R16', 'F03', 'F04', '+', '현장 의견을 반영하면 교육이 필요에 더 맞는다');
  inf('R17', 'F04', 'F06', '+', '맞는 교육일수록 배운 것을 실제로 써 본다');
  inf('R18', 'F06', 'F03', '+', '써 본 경험이 다시 현장 의견으로 돌아온다');
  inf('R19', 'F04', 'F07', '+', '교육이 알려지면 참여자가 는다', true);
  inf('R20', 'F07', 'F02', '+', '참여자가 늘면 운영 업무도 는다');
  inf('R21', 'F02', 'F04', '-', '업무에 쫓기면 교육을 다듬을 여유가 줄어든다', true);
  addRelation(doc, { id: 'R22', kind: 'factorLink', from: 'A02', to: 'F07', description: '참여자 모집', influence: { sign: '+' } });
  addRelation(doc, { id: 'R23', kind: 'factorLink', from: 'A02', to: 'F03', description: '교육 현장', influence: { sign: '+' } });

  // 순환 (사용자가 구성한 예시)
  addLoop(doc, { id: 'L_R1', name: 'R1 과부하', factorIds: ['F02', 'F01', 'F05'], description: '업무가 늘면 여력이 줄고, 역할을 나눌 힘도 줄어 업무가 더 몰린다' });
  addLoop(doc, { id: 'L_R2', name: 'R2 현장 배움', factorIds: ['F03', 'F04', 'F06'], description: '현장 의견이 교육을 다듬고, 쓸모 있는 교육이 다시 의견을 낳는다' });
  addLoop(doc, { id: 'L_B1', name: 'B1 성장의 한계', factorIds: ['F04', 'F07', 'F02'], description: '좋은 교육이 참여자를 늘리지만, 늘어난 업무가 교육의 질을 다시 낮춘다' });

  // 기여 (샘플 02)
  const contrib = (id: string, from: string, to: string, extra: { description?: string; enabling?: boolean; status?: 'planned' } = {}) =>
    addRelation(doc, { id, kind: 'contribution', from, to, ...extra });
  contrib('K01', 'A02', 'C01');
  contrib('K02', 'A02', 'C02', { description: '문제해결 역량' });
  contrib('K03', 'A01', 'C02');
  contrib('K04', 'A03', 'C01');
  contrib('K05', 'A06', 'C03');
  contrib('K06', 'A07', 'C04', { enabling: true });
  contrib('K07', 'A10', 'C05', { enabling: true });
  contrib('K08', 'A04', 'C06', { status: 'planned' });
  contrib('K09', 'C01', 'G01');
  contrib('K10', 'C02', 'G02');
  contrib('K11', 'C03', 'G03');
  contrib('K12', 'C04', 'G04');
  contrib('K13', 'C04', 'G02', { description: '조직 기반도 기여' });
  contrib('K14', 'C05', 'G05');
  contrib('K15', 'C06', 'G01', { status: 'planned' });

  // 참여·역할 (검증 시나리오: 한 활동에 기획·교육·모집 주체)
  const part = (id: string, from: string, to: string, role: string, kinds: ('time' | 'money' | 'space' | 'knowledge' | 'network')[] = []) =>
    addRelation(doc, { id, kind: 'participation', from, to, role: { name: role }, contributions: kinds.map((kind) => ({ kind })) });
  part('E01', 'P01', 'A02', '기획', ['time', 'knowledge']);
  part('E02', 'P01', 'A02', '교육', ['time', 'knowledge']);
  part('E03', 'O03', 'A02', '모집', ['network']);
  part('E04', 'O01', 'A02', '운영', ['time', 'space']);
  part('E05', 'O02', 'A04', '추진', ['network']);
  part('E06', 'P01', 'A07', '운영', ['time']);
  part('E07', 'O04', 'A07', '참여', ['time', 'money']);
  part('E08', 'P01', 'A01', '기술지원', ['time', 'knowledge']);
  part('E09', 'P01', 'A03', '실험', ['time', 'knowledge']);
  addRelation(doc, { id: 'L01', kind: 'actorLink', subtype: '소속', from: 'P01', to: 'O01' });

  return doc;
}
