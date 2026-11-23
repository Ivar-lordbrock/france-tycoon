import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Rien vers internet (fond de carte, Google) : l'essai ne dépend que du jeu.
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
});

async function entrer(page: import('@playwright/test').Page, pseudo: string) {
  await page.goto('/');
  await page.getByPlaceholder('Ton pseudo').fill(pseudo);
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByRole('button', { name: /^Encaisser/ })).toBeVisible();
}

test('sans compte puis en simple joueur, /admin refuse l’entrée', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Connecte-toi d’abord' })).toBeVisible();

  await entrer(page, 'Simple Joueur');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Accès réservé' })).toBeVisible();
});

test('un admin (ADMIN_EMAILS) voit les 6 vues et la vue d’ensemble', async ({ page }) => {
  await entrer(page, 'Chef');
  await page.goto('/admin');

  await expect(page.getByRole('heading', { level: 1, name: 'Vue d’ensemble' })).toBeVisible();
  await expect(page.getByText('Inscrits')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Vues du dashboard' }).getByRole('button')).toHaveCount(6);

  await page.getByRole('button', { name: 'Joueurs' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Joueurs' })).toBeVisible();
});
