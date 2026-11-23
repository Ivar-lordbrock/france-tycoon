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

test('un admin trouve un joueur, le suspend, et le joueur voit le motif', async ({ browser }) => {
  // Le joueur s'inscrit dans son propre navigateur.
  const cible = await browser.newPage();
  await cible.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  await entrer(cible, 'Cible Suspendue');

  const page = await browser.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  await entrer(page, 'Chef');
  await page.goto('/admin');
  await page.getByRole('navigation', { name: 'Vues du dashboard' }).getByRole('button', { name: 'Joueurs' }).click();
  await page.getByRole('searchbox', { name: 'Chercher un joueur' }).fill('Cible');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await page.getByRole('button', { name: 'Cible Suspendue' }).click();

  await page.getByRole('button', { name: 'Suspendre' }).click();
  await page.getByPlaceholder('Pourquoi ?').fill('Essai e2e');
  await page.getByRole('button', { name: 'Suspendre' }).last().click();
  await expect(page.getByText('Motif : Essai e2e')).toBeVisible();
  await page.getByText('Journal d’audit').click();
  await expect(page.getByRole('cell', { name: 'Suspension' })).toBeVisible();

  // Côté joueur : il regarde, mais encaisser est refusé avec le motif.
  await cible.reload();
  await cible.getByRole('button', { name: /^Encaisser/ }).click();
  await expect(cible.getByText(/Ton compte est suspendu.*Motif : Essai e2e/)).toBeVisible();
});

test('un admin force le prix d’une commune libre, et le joueur paie ce prix', async ({ browser }) => {
  const page = await browser.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  await entrer(page, 'Chef');
  await page.goto('/admin');
  await page
    .getByRole('navigation', { name: 'Vues du dashboard' })
    .getByRole('button', { name: 'Territoires & OPA' })
    .click();
  await page.getByRole('combobox', { name: 'Filtre' }).selectOption('free');
  await page.getByRole('searchbox', { name: 'Chercher une commune' }).fill('Essaibourg');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await page
    .getByRole('row', { name: /Essaibourg/ })
    .getByRole('button', { name: 'Prix' })
    .click();
  await page.getByLabel('Prix forcé (₮)').fill('12345');
  await page.getByPlaceholder('Pourquoi ?').fill('Essai e2e');
  await page.getByRole('button', { name: 'Forcer le prix' }).click();
  await expect(page.getByRole('row', { name: /Essaibourg/ }).getByText('forcé')).toBeVisible();

  const joueur = await browser.newPage();
  await joueur.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  await entrer(joueur, 'Acheteur Curieux');
  await joueur.getByRole('combobox', { name: 'Rechercher une commune' }).fill('Essaibourg');
  await joueur.getByRole('option', { name: /Essaibourg/ }).click();
  const bouton = joueur.getByRole('button', { name: /^Acheter pour / });
  await expect.poll(async () => Number(((await bouton.textContent()) ?? '').replace(/\D/g, ''))).toBe(12345);
});

test('un joueur signale un bug, l’équipe le règle, et une bannière s’affiche puis se retire', async ({ browser }) => {
  // Pas de maintenance ici : elle bloquerait les essais lancés en même temps (vitest la couvre).
  const joueur = await browser.newPage();
  await joueur.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  await entrer(joueur, 'Rapporteur');
  await joueur.getByRole('button', { name: 'Mon profil (Rapporteur)' }).click();
  await joueur.getByRole('button', { name: 'Signaler un bug…' }).click();
  await joueur.getByLabel('Qu’est-ce qui ne marche pas ?').fill('Le bouton Encaisser clignote en essai.');
  await joueur.getByRole('button', { name: 'Envoyer' }).click();
  await expect(joueur.getByText('Merci ! L’équipe va lire ton message.', { exact: false })).toBeVisible();

  const page = await browser.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  await entrer(page, 'Chef');
  await page.goto('/admin');
  const menu = page.getByRole('navigation', { name: 'Vues du dashboard' });
  await menu.getByRole('button', { name: /Sauvegardes & signalements/ }).click();
  const carte = page.getByRole('listitem').filter({ hasText: 'Le bouton Encaisser clignote' });
  await carte.getByRole('combobox', { name: 'Nouveau statut' }).selectOption('resolved');
  await carte.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Le bouton Encaisser clignote')).toBeHidden();

  await menu.getByRole('button', { name: 'Live config & events' }).click();
  await page.getByLabel('Texte').fill('Annonce de l’essai e2e');
  await page.getByRole('button', { name: 'Afficher', exact: true }).click();
  await expect(page.getByText(/Affichée jusqu’au/)).toBeVisible();

  await joueur.reload();
  await expect(joueur.getByRole('status').filter({ hasText: 'Annonce de l’essai e2e' })).toBeVisible();
  await joueur.getByRole('button', { name: /^Messages/ }).click();
  await expect(joueur.getByText(/Ton signalement « Le bouton Encaisser.* est réglé/)).toBeVisible();

  await page.getByRole('button', { name: 'Retirer la bannière' }).click();
  await expect(page.getByText('Aucune bannière.')).toBeVisible();
});

test('un admin sauvegarde la base et voit la copie dans la liste', async ({ page }) => {
  await entrer(page, 'Chef');
  await page.goto('/admin');
  await page
    .getByRole('navigation', { name: 'Vues du dashboard' })
    .getByRole('button', { name: /Sauvegardes & signalements/ })
    .click();
  await page.getByRole('button', { name: 'Sauvegarder maintenant' }).click();
  await expect(page.getByText(/^Copie faite/)).toBeVisible();
  // Le dossier des copies survit aux essais sur le PC : on vérifie seulement qu'il y en a au moins une.
  await expect(page.getByRole('cell', { name: /^kadastr-\d{8}-\d{6}-\d{3}\.sqlite$/ }).first()).toBeVisible();
});
