import { expect, test } from '@playwright/test';

const chiffres = (texte: string | null) => Number((texte ?? '').replace(/\D/g, ''));

test('un nouveau joueur se connecte et achète une commune', async ({ page }) => {
  // Rien vers internet (fond de carte, Google) : l'essai ne dépend que du jeu.
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  await page.goto('/');

  // Connexion de test (AUTH_DEV), sans Google.
  await page.getByPlaceholder('Ton pseudo').fill('Robot Essai');
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByRole('button', { name: /^Encaisser/ })).toBeVisible();
  // Sans le tutoriel : ses récompenses fausseraient le compte du cash.
  await page.getByRole('button', { name: 'Passer le tutoriel' }).click();
  await page.getByRole('button', { name: 'Oui, passer' }).click();
  await expect(page.getByRole('region', { name: 'Tutoriel' })).toBeHidden();

  // Trouver la commune.
  await page.getByRole('combobox', { name: 'Rechercher une commune' }).fill('Testville');
  await page.getByRole('option', { name: /Testville/ }).click();
  await expect(page.getByRole('heading', { name: 'Testville' })).toBeVisible();

  // L'acheter, avec la confirmation.
  const bouton = page.getByRole('button', { name: /^Acheter pour / });
  const prix = chiffres(await bouton.textContent());
  expect(prix).toBeGreaterThan(0);
  await bouton.click();
  await page.getByRole('button', { name: 'Acheter', exact: true }).click();

  // Elle est à moi, et mon cash a baissé du prix (il remonte ensuite un peu avec le revenu).
  await expect(page.getByText(/Testville est à toi/)).toBeVisible();
  const cash = page.locator('dt:has-text("Cash") + dd');
  const attendu = 50_000 - prix;
  await expect.poll(async () => chiffres(await cash.textContent())).toBeLessThan(attendu + 100);
  expect(chiffres(await cash.textContent())).toBeGreaterThanOrEqual(attendu);
});
