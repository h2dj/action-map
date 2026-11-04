/**
 * 기획서 7장 검증 시나리오를 실제 브라우저에서 확인한다.
 * 각 테스트는 새 브라우저 컨텍스트(빈 IndexedDB)에서 시작한다.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function openSample(page: Page) {
  await page.goto('/');
  await expect(page.getByText('첫 활동 추가')).toBeVisible();
  await page.locator('summary', { hasText: '파일' }).click();
  await page.locator('.menu-body').getByRole('button', { name: '예시 불러오기' }).click();
  await expect(page.locator('.react-flow__node-entity').first()).toBeVisible();
}

const list = (page: Page) => page.getByRole('navigation', { name: '기록 목록' });
/** 목록에서 이름이 정확히 같은 항목 */
const pick = (page: Page, name: string) =>
  list(page)
    .locator('.list-item')
    .filter({ has: page.locator('.name', { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) })
    .first();
const mapNode = (page: Page, name: string) => page.locator('.react-flow__node-entity', { hasText: name }).first();
const nameField = (page: Page) => page.getByLabel('이름', { exact: true });

async function rename(page: Page, value: string) {
  await nameField(page).fill(value);
  await nameField(page).press('Enter');
}

test('빈 상태에서 이름만으로 첫 활동을 만든다 (F01·F10)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ 첫 활동 추가' }).click();
  await expect(nameField(page)).toBeFocused();
  await rename(page, '동네 모임');
  await expect(mapNode(page, '동네 모임')).toBeVisible();
});

test('시나리오 1: 이름을 바꾸면 세 보기에 같은 내용이 보인다', async ({ page }) => {
  await openSample(page);
  await pick(page, 'IT학교').click();
  await rename(page, '디지털 IT학교');
  for (const tab of ['시간 보기', '협력 보기', '목적 보기']) {
    await page.getByRole('tab', { name: tab }).click();
    await expect(mapNode(page, '디지털 IT학교')).toBeVisible();
    await expect(page.locator('.vnode.selected')).toContainText('디지털 IT학교'); // 선택 유지
  }
});

test('시나리오 2: 한 활동에 여러 주체·역할을 넣고 양방향으로 탐색한다', async ({ page }) => {
  await openSample(page);
  await pick(page, 'IT학교 추진체계 확대').click();
  await page.getByRole('button', { name: '+ 관계 추가' }).click();
  const dialog = page.getByRole('dialog', { name: '관계 추가' });
  await dialog.getByText('참여·역할').click();
  await dialog.getByPlaceholder('예: 기획').fill('재원 확보');
  await dialog.locator('.candidates').getByText('공동체IT').click();
  await dialog.getByRole('button', { name: '추가' }).click();
  await expect(page.locator('.detail .badge')).toHaveText('참여·역할');

  // 협력 보기: 활동 중심 → 주체 중심
  await page.getByRole('tab', { name: '협력 보기' }).click();
  await pick(page, 'IT학교 추진체계 확대').click();
  await page.getByLabel('선택 중심').check();
  await expect(page.locator('.react-flow__node-entity')).toHaveCount(3); // 활동 + 추진위원회 + 공동체IT
  await pick(page, '공동체IT').click();
  await expect(mapNode(page, 'IT학교 추진체계 확대')).toBeVisible();
  await expect(mapNode(page, 'IT학교')).toBeVisible();
});

test('시나리오 3: 상위 활동을 접고 펼쳐도 세부 활동과 관계가 보존된다', async ({ page }) => {
  await openSample(page);
  const before = await page.locator('.react-flow__node-entity').count();
  await page.getByRole('button', { name: '지도에서 IT학교 하위 활동 접기' }).click();
  await expect(page.locator('.react-flow__node-entity')).toHaveCount(before - 2);
  await page.getByRole('button', { name: '지도에서 IT학교 하위 활동 펼치기' }).click();
  await expect(page.locator('.react-flow__node-entity')).toHaveCount(before);
  await pick(page, '역량진단 프로그램 운영').click();
  await expect(page.getByLabel('상위 활동')).toHaveValue('A11');
});

test('시나리오 4: 예정·실제·미정 기간과 잘못된 순서 안내', async ({ page }) => {
  await openSample(page);
  await pick(page, '교육·지원 모델 확장').click();
  const planned = page.locator('fieldset', { has: page.getByText('예정 기간', { exact: true }) }).locator('input');
  await planned.nth(0).fill('2027-05');
  await planned.nth(0).press('Enter');
  await planned.nth(1).fill('2027-02');
  await planned.nth(1).press('Enter');
  await expect(page.locator('.warning')).toContainText('예정 기간의 시작이 종료보다 늦습니다');
  await planned.nth(1).fill('2027-13');
  await planned.nth(1).press('Enter');
  await expect(planned.nth(1)).toHaveAttribute('aria-invalid', 'true');

  // 날짜 배치: 예정만 있는 활동은 점선 테두리
  await page.getByRole('combobox', { name: '배치' }).selectOption('date');
  await expect(page.locator('.vnode.tentative', { hasText: '교육·지원 모델 확장' })).toBeVisible();
});

test('시나리오 5: 완료 활동의 기여는 가설로 남고 근거를 추가할 수 있다', async ({ page }) => {
  await openSample(page);
  await pick(page, '노동인권 활동·교육').click();
  const row = page.locator('.rel-row', { hasText: '권리 이해·대응 능력 향상' });
  await expect(row).toContainText('기대·가설');
  await row.locator('.rel-main').click();
  await page.getByLabel('근거 상태').selectOption('observed');
  await page.getByLabel('근거 메모').fill('상담 기록에서 확인');
  await page.getByLabel('근거 메모').blur();
  // 목적 보기에서 '관찰 이상'만 보면 이 관계만 남는다
  await page.getByRole('tab', { name: '목적 보기' }).click();
  await page.locator('summary', { hasText: '표시' }).click();
  await page.locator('.view-menu select').nth(1).selectOption('observed');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});

test('시나리오 6: 내보낸 데이터를 새 작업공간으로 불러와도 ID·관계·속성이 보존된다', async ({ page }) => {
  await openSample(page);
  await page.locator('summary', { hasText: '파일' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '내보내기 (JSON)' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.action-map\.json$/);
  const original = JSON.parse(await readFile((await download.path())!, 'utf8')).document;

  await page.locator('summary', { hasText: '파일' }).click();
  await page.locator('input[type=file]').first().setInputFiles((await download.path())!);
  await expect(page.locator('.notice')).toContainText('새 작업공간으로 불러왔습니다');
  await expect(page.getByLabel('작업공간').locator('option')).toHaveCount(3);

  // 화면으로 확인: 같은 ID, 같은 관계 수
  await pick(page, 'IT학교').click();
  await expect(page.locator('.detail .id')).toHaveText('A02');
  const relCount = Object.values(original.relations as Record<string, { from: string; to: string }>).filter((r) => r.from === 'A02' || r.to === 'A02').length;
  await expect(page.locator('.relations h3')).toHaveText(`관계 ${relCount}`);
});

test('시나리오 7: 참조 중인 활동 삭제의 영향을 확인하고 되돌린다', async ({ page }) => {
  await openSample(page);
  await pick(page, 'IT학교').click();
  await page.locator('.detail-head').getByRole('button', { name: '삭제' }).click();
  const dialog = page.getByRole('dialog', { name: '삭제 확인' });
  await expect(dialog).toContainText('하위 활동 2개');
  await expect(dialog).toContainText('함께 사라지는 관계');
  await dialog.getByRole('radio').nth(1).check();
  await dialog.getByRole('button', { name: '삭제' }).click();
  await expect(mapNode(page, '박람회 참여')).toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(mapNode(page, 'IT학교')).toBeVisible();
  await expect(mapNode(page, '박람회 참여')).toBeVisible();
});

test('재실행 후 복원과 보기별 배치 저장 (F07)', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: '지도에서 IT학교 하위 활동 접기' }).click();
  await expect(page.getByText('저장됨')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '지도에서 IT학교 하위 활동 펼치기' })).toBeVisible();
  // 목적 보기의 접기 상태는 따로
  await page.getByRole('tab', { name: '목적 보기' }).click();
  await expect(page.getByRole('button', { name: /지도에서 IT학교 하위 활동/ })).toHaveText('▾ 접기');
});

test('지도 검색·방향키 이동·이미지 저장 (F06·F08·F10)', async ({ page }) => {
  await openSample(page);
  await page.getByRole('tab', { name: '목적 보기' }).click();
  await page.getByLabel('지도에서 찾기').fill('자율성');
  await expect(page.locator('.vnode.match')).toHaveCount(2);
  await page.getByLabel('지도에서 찾기').fill('시민사회 자율성');
  await page.getByLabel('지도에서 찾기').press('Enter');
  await expect(page.locator('.detail .id')).toHaveText('G02');

  // 방향키: 목적 열에서 왼쪽으로 가면 변화 열의 대상이 선택된다
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await mapNode(page, '시민사회의 자율성').click();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.detail .badge')).toHaveText('변화');

  await page.locator('summary', { hasText: '표시' }).click();
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '이미지로 저장 (PNG)' }).click()]);
  expect(png.suggestedFilename()).toMatch(/목적보기\.png$/);
  const bytes = await readFile((await png.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.length).toBeGreaterThan(10_000);
});

test('좁은 화면에서 가로 스크롤이 생기지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSample(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
