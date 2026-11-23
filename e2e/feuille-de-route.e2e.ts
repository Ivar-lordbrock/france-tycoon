import { expect, test } from '@playwright/test';

test('un visiteur ouvre la feuille de route, la filtre et déplie une fonctionnalité', async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  await page.goto('/');

  // Sans compte : le lien est sur l'écran de connexion.
  await page.getByRole('link', { name: 'Feuille de route' }).click();
  await expect(page).toHaveURL(/\/roadmap$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Feuille de route' })).toBeVisible();
  const titres = page.getByRole('heading', { level: 2 });
  await expect(titres).toHaveCount(5);

  await page.getByRole('button', { name: /^Social & clans/ }).click();
  await expect(titres).toHaveCount(2);
  await expect(titres.first()).toHaveText(/^Intercommunalité/);

  // Détails repliés, puis dépliés au clic.
  const detail = page.getByText(/^Mutualisation d'un budget/);
  await expect(detail).toBeHidden();
  await titres.first().click();
  await expect(detail).toBeVisible();

  await page.getByRole('link', { name: 'Retour à la carte' }).click();
  await expect(page).toHaveURL(/\/$/);
});
