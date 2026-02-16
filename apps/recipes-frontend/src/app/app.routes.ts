import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/layout.component').then((m) => m.LayoutComponent),
    children: [
      { path: '', redirectTo: 'recipes', pathMatch: 'full' },
      {
        path: 'recipes',
        loadComponent: () =>
          import('./pages/recipes/recipes.component').then(
            (m) => m.RecipesComponent
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
        path: 'random',
        loadComponent: () =>
          import('./pages/random/random.component').then(
            (m) => m.RandomRecipeComponent
          ),
      },
      {
        path: 'grocery-list',
        loadComponent: () =>
          import('./pages/grocery-list/grocery-list.component').then(
            (m) => m.GroceryListComponent
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
    ],
  },
  { path: '**', redirectTo: 'recipes' },
];
