/**
 * 3단계 검증: 과거 시점 조회, 순환 후보 찾기, 표(CSV·노션) 가져오기, 대규모 데이터 보기 전환 성능.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLargeDocument } from '../../src/fixtures/large';
import { exportDocument } from '../../src/io/transfer';

async function openSample(page: Page) {
  await page.goto('/');
  await expect(page.getByText('첫 활동 추가')).toBeVisible();
  await page.locator('summary', { hasText: '파일' }).click();
  await page.locator('.menu-body').getByRole('button', { name: '예시 불러오기' }).click();
  await expect(page.locator('.react-flow__node-entity').first()).toBeVisible();
}

const list = (page: Page) => page.getByRole('navigation', { name: '기록 목록' });
const pick = (page: Page, name: string) => list(page).locator('.list-item').filter({ has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) }).first();

async function setDate(page: Page, legend: string, index: 0 | 1, value: string) {
  const input = page.locator('fieldset', { has: page.getByText(legend, { exact: true }) }).locator('input').nth(index);
  await input.fill(value);
  await input.press('Enter');
}

test('과거 시점 조회: 그때 진행하지 않은 활동을 숨기고 해제하면 돌아온다', async ({ page }) => {
  await openSample(page);
  await pick(page, '역량진단·박람회 경험').click();
  await setDate(page, '실제 기간', 0, '2021');
  await setDate(page, '실제 기간', 1, '2022');
  await pick(page, 'IT학교').click();
  await setDate(page, '실제 기간', 0, '2024-03');

  await page.getByLabel('기준 시점 (연-월)').fill('2022-06');
  await page.getByLabel('기준 시점 (연-월)').press('Enter');
  await expect(page.locator('.vnode-title', { hasText: /^역량진단·박람회 경험$/ })).toBeVisible();
  await expect(page.locator('.vnode-title', { hasText: /^IT학교$/ })).toHaveCount(0);
  await expect(page.locator('.legend')).toContainText('2022년 6월 기준');

  // 다른 보기에서도 같은 기준이 적용된다
  await page.getByRole('tab', { name: '목적 보기' }).click();
  await expect(page.locator('.vnode-title', { hasText: /^IT학교$/ })).toHaveCount(0);

  await page.getByRole('button', { name: '2022년 6월 기준 해제' }).click();
  await expect(page.locator('.vnode-title', { hasText: /^IT학교$/ })).toBeVisible();
});

test('순환 후보 찾기: 저장하지 않은 순환을 제안하고 골라 저장한다', async ({ page }) => {
  await openSample(page);
  await page.getByRole('tab', { name: '순환 보기' }).click();
  await page.locator('.vloop', { hasText: 'R2 현장 배움' }).click();
  await page.locator('.detail-head').getByRole('button', { name: '삭제' }).click();
  await expect(page.locator('.react-flow__node-loop')).toHaveCount(2);

  await page.getByRole('button', { name: '순환 후보 찾기' }).click();
  const dialog = page.getByRole('dialog', { name: '순환 후보' });
  await expect(dialog.locator('.candidate-list li')).toHaveCount(1);
  await expect(dialog.locator('.candidate-list li')).toContainText('강화 순환 (R)');
  await dialog.getByRole('button', { name: '이 순환 저장' }).click();
  await expect(dialog.getByText('새로 찾은 순환이 없습니다.')).toBeVisible();
  await dialog.locator('.actions').getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('.react-flow__node-loop')).toHaveCount(3);
});

test('표 가져오기: 노션 CSV의 열을 짐작하고 미리 본 뒤 새 기록으로 만든다', async ({ page }) => {
  await page.goto('/');
  await page.locator('summary', { hasText: '파일' }).click();
  await page.getByRole('button', { name: '표 가져오기 (CSV·노션·스프레드시트)' }).click();
  const dialog = page.getByRole('dialog', { name: /표 가져오기/ });
  const csv = [
    'Name,Status,Date,Parent,Tags',
    'IT학교,진행 중,2024년 3월 1일 →,,교육',
    '박람회 참여,완료,"May 1, 2024 → June 30, 2024",IT학교,',
    '역량진단 운영,예정,2025-09,박람회 참여,',
  ].join('\n');
  await dialog.getByPlaceholder(/^이름,상태/).fill(csv);
  await expect(dialog.locator('.mapping select').nth(0)).toHaveValue('name');
  await expect(dialog.locator('.mapping select').nth(2)).toHaveValue('period');
  await expect(dialog.locator('.preview tbody tr')).toHaveCount(3);
  await expect(dialog.locator('.preview tbody tr').nth(1)).toContainText('2024.05.01 ~ 2024.06.30');
  // 상위 열은 "Parent"라 직접 지정
  await dialog.locator('.mapping select').nth(3).selectOption('parent');
  await dialog.getByRole('button', { name: '3개 가져오기' }).click();

  await expect(page.locator('.notice')).toContainText('3개 기록을 새로 만들었습니다');
  await pick(page, '역량진단 운영').click();
  await expect(page.getByLabel('상위 활동').locator('option:checked')).toHaveText('박람회 참여');
  // 실행 취소 한 번으로 모두 되돌린다
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect(page.getByText('첫 활동 추가')).toBeVisible();
});

test('성능: 활동 200·관계 약 1,000에서 보기 전환이 1초 안에 끝난다', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'action-map-'));
  const file = join(dir, 'large.action-map.json');
  await writeFile(file, exportDocument(buildLargeDocument()));
  await page.goto('/');
  await page.locator('summary', { hasText: '파일' }).click();
  await page.locator('input[type=file]').first().setInputFiles(file);
  await expect(page.locator('.notice')).toContainText('새 작업공간으로 불러왔습니다');
  await expect(page.locator('.react-flow__node-entity').first()).toBeVisible();

  for (const tab of ['협력 보기', '목적 보기', '순환 보기', '시간 보기']) {
    const t0 = Date.now();
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.react-flow__node-entity').first()).toBeVisible();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const ms = Date.now() - t0;
    console.log(`${tab}: ${ms}ms`);
    expect(ms).toBeLessThan(1000);
  }
});
