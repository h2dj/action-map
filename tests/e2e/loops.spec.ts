/**
 * 2단계 검증: 변화 요인·영향(+/−/미정·지연), 순환 보기, 수동 순환 구성과 R/B 판정, 검토 기록.
 * 완료 기준: 요인의 증가 의미와 영향 방향을 명시해 순환을 구성하고, 부호를 고치면 판정이 바뀐다.
 */
import { expect, test, type Page } from '@playwright/test';

async function openLoopView(page: Page) {
  await page.goto('/');
  await expect(page.getByText('첫 활동 추가')).toBeVisible();
  await page.locator('summary', { hasText: '파일' }).click();
  await page.locator('.menu-body').getByRole('button', { name: '예시 불러오기' }).click();
  await page.getByRole('tab', { name: '순환 보기' }).click();
  await expect(page.locator('.react-flow__node-loop')).toHaveCount(3);
}

const list = (page: Page) => page.getByRole('navigation', { name: '기록 목록' });

test('순환 보기: 요인·영향 부호와 R/B 라벨, 순환 선택 시 판정과 경로', async ({ page }) => {
  await openLoopView(page);
  await expect(page.locator('.react-flow__node-entity')).toHaveCount(7);
  await page.locator('.vloop', { hasText: 'B1 성장의 한계' }).click();
  await expect(page.locator('.detail .badge')).toHaveText('균형 순환 (B)');
  await expect(page.locator('.loop-verdict')).toContainText('반대 방향(−) 영향 1개 → 홀수라서 균형');
  await expect(page.locator('.loop-steps li')).toHaveCount(3);
  await expect(page.locator('.loop-steps')).toContainText('‘운영 업무량’이(가) 늘면 ‘교육 적합성’은(는) 줄어든다');

  // 활동 함께 보기
  await page.getByLabel('활동 함께 보기').check();
  await expect(page.locator('.vnode-title', { hasText: /^IT학교$/ })).toBeVisible();
  await expect(page.locator('.vnode-title', { hasText: /^공동체IT 조직 재구성$/ })).toBeVisible();
});

test('수동 순환 구성: 영향이 이어지는 요인만 고를 수 있고, 닫히면 판정을 미리 보여준다', async ({ page }) => {
  await openLoopView(page);
  // 기존 B1을 지우고 다시 구성한다
  await page.locator('.vloop', { hasText: 'B1' }).click();
  await page.locator('.detail-head').getByRole('button', { name: '삭제' }).click();
  await expect(page.locator('.react-flow__node-loop')).toHaveCount(2);

  await page.getByRole('button', { name: '+ 순환 구성' }).click();
  const dialog = page.getByRole('dialog', { name: '순환 구성' });
  await dialog.locator('.chip', { hasText: '운영 업무량' }).click();
  // 운영 업무량에서 영향이 가는 요인만 후보
  await expect(dialog.locator('.candidates .chip')).toHaveText([/나의 시간·주의력·회복 여력/, /교육 적합성/]);
  await dialog.locator('.chip', { hasText: '교육 적합성' }).click();
  await expect(dialog.getByRole('button', { name: '순환 저장' })).toBeDisabled();
  await dialog.locator('.chip', { hasText: '교육 참여자 수' }).click();
  await expect(dialog.locator('.loop-verdict')).toContainText('균형 순환 (B)');
  await dialog.getByRole('button', { name: '순환 저장' }).click();

  await expect(page.locator('.detail .badge')).toHaveText('균형 순환 (B)');
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue('B1'); // 이름을 비우면 번호
  await expect(page.locator('.react-flow__node-loop')).toHaveCount(3);
});

test('영향 부호를 미정으로 바꾸면 판정을 보류하고, 되돌리면 다시 판정한다', async ({ page }) => {
  await openLoopView(page);
  await page.locator('.vloop', { hasText: 'R2 현장 배움' }).click();
  await expect(page.locator('.detail .badge')).toHaveText('강화 순환 (R)');
  // 경로의 첫 영향으로 이동해 방향을 바꾼다
  await page.locator('.loop-steps .link').first().click();
  await expect(page.locator('.sentence')).toContainText('늘어난다');
  await page.getByLabel('방향').selectOption('?');
  await expect(page.locator('.sentence')).toContainText('방향은 아직 정하지 않았다');

  await list(page).locator('.list-item', { hasText: 'R2 현장 배움' }).click();
  await expect(page.locator('.detail .badge')).toHaveText('판정 보류 (부호 미정)');
  await expect(page.locator('.vloop', { hasText: 'R2' })).toContainText('?');

  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(page.locator('.detail .badge')).toHaveText('강화 순환 (R)');
});

test('요인의 증가 의미를 적고, 요인을 지우면 그 요인이 든 순환도 안내 후 함께 사라진다', async ({ page }) => {
  await openLoopView(page);
  await page.locator('.react-flow__node-entity', { hasText: '역할 분담 정도' }).click();
  await expect(page.getByLabel('증가의 의미')).toHaveValue('운영 일을 여러 사람이 나누어 맡는다');
  await expect(page.locator('.detail')).toContainText('순환 1');
  await page.locator('.detail-head').getByRole('button', { name: '삭제' }).click();
  const dialog = page.getByRole('dialog', { name: '삭제 확인' });
  await expect(dialog).toContainText('이 요인이 든 순환 1개도 함께 사라집니다: R1 과부하');
  await dialog.getByRole('button', { name: '삭제' }).click();
  await expect(page.locator('.react-flow__node-loop')).toHaveCount(2);
});

test('검토 기록: 순환에 판단과 후속 질문을 남기고 목록에서 찾아간다', async ({ page }) => {
  await openLoopView(page);
  await page.locator('.vloop', { hasText: 'R1 과부하' }).click();
  const reviews = page.getByRole('region', { name: '검토 기록' });
  await reviews.getByPlaceholder('이어갈 것').fill('운영 역할을 조합원과 나눈다');
  await reviews.getByPlaceholder('확인할 가설').fill('석 달 뒤 회복 여력이 실제로 늘었는가?');
  await reviews.getByRole('button', { name: '+ 검토 기록 추가' }).click();
  await expect(reviews.locator('.review')).toHaveCount(1);

  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  const item = list(page).locator('.list-item', { hasText: '운영 역할을 조합원과 나눈다' });
  await expect(item).toContainText('R1 과부하');
  await item.click();
  await expect(page.getByLabel('이름', { exact: true })).toHaveValue('R1 과부하');
});
