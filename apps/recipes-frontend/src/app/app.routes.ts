import { Route } from '@angular/router';
import { MainLayout } from './layout/main-layout.component';

export const appRoutes: Route[] = [
  {
    path: '',
    component: MainLayout,
    children: [
      {
        path: '',
        redirectTo: 'recipes',
        pathMatch: 'full',
      },
      {
        path: 'recipes',
        loadComponent: () =>
          import('./pages/recipe-list/recipe-list.component').then(
            (m) => m.RecipeListComponent
          ),
      },
      {
        path: 'recipes/new',
        loadComponent: () =>
          import('./pages/recipe-form/recipe-form.component').then(
            (m) => m.RecipeFormComponent
          ),
      },
      {
        path: 'recipes/:id',
        loadComponent: () =>
          import('./pages/recipe-detail/recipe-detail.component').then(
            (m) => m.RecipeDetailComponent
          ),
      },
      {
        path: 'recipes/:id/edit',
        loadComponent: () =>
          import('./pages/recipe-form/recipe-form.component').then(
            (m) => m.RecipeFormComponent
          ),
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./pages/categories/categories.component').then(
            (m) => m.CategoriesComponent
          ),
      },
      {
        path: 'tags',
        loadComponent: () =>
          import('./pages/tags/tags.component').then((m) => m.TagsComponent),
      },
      {
        path: 'grocery-list',
        loadComponent: () =>
          import('./pages/grocery-list/grocery-list.component').then(
            (m) => m.GroceryListComponent
          ),
      },
      {
        path: 'random',
        loadComponent: () =>
          import('./pages/random-recipe/random-recipe.component').then(
            (m) => m.RandomRecipeComponent
          ),
      },
    ],
  },
];
