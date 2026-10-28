import { Page, expect, test } from '@playwright/test';

const API_ORIGIN = 'http://localhost:8080';
const ALLOWED_ORIGIN = 'http://localhost:4200';

async function bridgeCors(page: Page, origin: string): Promise<void> {
  if (origin === ALLOWED_ORIGIN) return;
  await page.route(`${API_ORIGIN}/**`, async route => {
    const response = await route.fetch({ headers: { ...route.request().headers(), origin: ALLOWED_ORIGIN } });
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': origin } });
  });
}

async function acceptConsentIfAsked(page: Page): Promise<boolean> {
  const gate = page.getByRole('dialog', { name: 'Before you continue' });
  const shown = await gate.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false);
  if (!shown) return false;
  const accept = gate.getByRole('button', { name: 'Accept' });
  await expect(accept).toBeDisabled();
  await gate.getByLabel("I'm 18 or older").check();
  await accept.click();
  await expect(gate).toBeHidden();
  return true;
}

test('signs in with dev login, accepts the terms, finishes onboarding and lands on Today', async ({ page, baseURL }) => {
  await bridgeCors(page, new URL(baseURL!).origin);
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome/);

  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await page.waitForURL(url => url.pathname !== '/welcome');
  const consented = await acceptConsentIfAsked(page);

  const visited: string[] = [];
  for (let i = 0; i < 12; i++) {
    const path = new URL(page.url()).pathname;
    if (path === '/today') break;
    visited.push(path);
    if (path === '/onboarding/lock') await page.getByRole('button', { name: 'Lock it in' }).click();
    else if (path.startsWith('/onboarding/')) await page.getByRole('button', { name: 'Continue', exact: true }).click();
    else if (path === '/trial') await page.getByRole('button', { name: "Let's go" }).click();
    else if (path === '/trial-ended' || path === '/pro-ended') await page.getByRole('button', { name: 'Continue with Free' }).click();
    else throw new Error(`Unexpected screen ${path}`);
    await page.waitForURL(url => url.pathname !== path);
  }

  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('.h', { hasText: /^\s*Today\s*$/ })).toBeVisible();
  await expect(page.getByText("Today's quests")).toBeVisible();
  test.info().annotations.push({ type: 'flow', description: `consent: ${consented ? 'accepted' : 'already accepted'}; screens: ${visited.join(' → ') || 'none (already onboarded)'}` });
});
