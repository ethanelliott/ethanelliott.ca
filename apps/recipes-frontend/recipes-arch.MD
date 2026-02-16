# Recipes Frontend — Architecture & Feature Specification

This document describes all features and functionality required for the recipes frontend application, to be rebuilt using Angular with PrimeNG.

---

## 1. Application Shell & Layout

### 1.1 Main Layout
- Responsive sidebar + main content area layout
- Sidebar contains app logo ("Recipe Book" with restaurant icon) and navigation links
- **Desktop**: Fixed sidebar (220px wide) with scrollable main content area
- **Mobile** (< 768px): Sidebar hidden by default, accessible via hamburger menu button in a top mobile header bar
- Sidebar overlay on mobile (click overlay to close)
- Sidebar auto-closes on navigation on mobile

### 1.2 Navigation
- **Main section**: Recipes, Random Recipe, Grocery List
- **Organize section**: Categories, Tags
- Active route highlighting
- All routes are lazy-loaded

### 1.3 Routing Structure
| Route               | Page                    |
| ------------------- | ----------------------- |
| `/`                 | Redirects to `/recipes` |
| `/recipes`          | Recipe List             |
| `/recipes/new`      | Recipe Form (create)    |
| `/recipes/:id`      | Recipe Detail           |
| `/recipes/:id/edit` | Recipe Form (edit)      |
| `/categories`       | Categories Management   |
| `/tags`             | Tags Management         |
| `/grocery-list`     | Grocery List Generator  |
| `/random`           | Random Recipe Picker    |

---

## 2. Recipe List Page

### 2.1 Header
- Page title "Recipes" with subtitle showing count of filtered recipes
- "Import with AI" FAB button — opens the AI import dialog
- "Add Recipe" FAB button — navigates to `/recipes/new`

### 2.2 Filters
- Search input (text search by title or description, client-side filtering)
- Category multi-select dropdown
- Tag multi-select dropdown
- "Clear" button visible when any filter is active

### 2.3 Recipe Cards Grid
- Responsive grid layout (auto-fill, min 300px per card)
- Each card shows:
  - Title
  - Description (2-line clamp)
  - Metadata row: total time (prep + cook), servings, photo count
  - Category chips (colored background)
  - Tag chips (colored border, outline style)
- Cards are clickable → navigate to recipe detail
- Staggered fade-in animation on load
- Hover effects (lift, glow border)

### 2.4 Empty State
- Shows when no recipes exist or no results match filters
- Different messaging for "no recipes at all" vs "no filter matches"
- CTA button to add first recipe when collection is empty

---

## 3. Recipe Detail Page

### 3.1 Header
- Back button to return to `/recipes`
- Recipe title and description
- Edit button → navigate to edit form
- Delete button with confirmation dialog

### 3.2 Metadata Strip
- Prep time badge (with icon)
- Cook time badge (with icon)
- Servings badge (with icon)
- Each badge is a card-like element with icon + value + label

### 3.3 Category & Tag Chips
- Category chips with their assigned color as background
- Tag chips with their assigned color as border (outline style)

### 3.4 Photos Section
- Horizontal scrollable photo gallery
- Displays recipe photos fetched by photo ID

### 3.5 Ingredients Section
- Servings adjuster (increment/decrement buttons with display of current servings)
- Ingredient list showing quantity, unit, name, and optional notes
- Scaled ingredients fetched from API when servings are adjusted
- Quantity formatting (integers shown without decimals, decimals trimmed)

### 3.6 Instructions Section
- Markdown-rendered instructions (supports headings, bold, italic, lists, blockquotes, code, hr)
- Uses `marked` library for markdown parsing

### 3.7 Personal Notes Section
- Displayed if the recipe has notes

### 3.8 AI Assistant Section (Expandable Panel)
- Collapsible/expandable panel with tabbed interface

#### 3.8.1 Chat Tab ("Ask")
- Chat interface to ask questions about the recipe
- Message history displayed with user/assistant bubbles
- Text input with enter-to-send
- Loading spinner during AI response
- Empty state with example prompts
- Uses conversation history for context

#### 3.8.2 Cooking Tips Tab ("Tips")
- On-demand generation button
- Loading state while AI processes
- Displays "Pro Tips" list
- Displays "Common Mistakes to Avoid" list

#### 3.8.3 Flavor Profile Tab ("Flavor")
- On-demand generation button
- Loading state while AI processes
- Primary flavor chips
- Taste profile description text
- Pairing recommendations list

### 3.9 Source
- Displays recipe source URL/text if provided

---

## 4. Recipe Form Page (Create & Edit)

### 4.1 Header
- Back button to `/recipes`
- Title: "New Recipe" or "Edit Recipe" depending on mode

### 4.2 Basic Information Card
- Title input (required, validated)
- Description textarea
- Servings number input (min 1, required)
- Prep time number input (minutes)
- Cook time number input (minutes)
- Categories multi-select dropdown
- Tags multi-select dropdown
- Source text input

### 4.3 Ingredients Card
- Dynamic list of ingredient rows (FormArray)
- Each row: quantity (number), unit (text), name (text), notes (text), delete button
- "Add Ingredient" button
- Empty state message when no ingredients
- Ingredients are reorderable by index

### 4.4 Instructions Card
- Textarea for instructions (supports Markdown)
- Hint about Markdown support

### 4.5 Notes Card
- Textarea for personal notes

### 4.6 Photos Card (Edit mode only)
- Grid of existing photo thumbnails
- Delete button on each photo (with confirmation)
- File upload button (accepts images, reads as base64, uploads to API)

### 4.7 Actions
- Cancel button → navigates back
- Submit button ("Create Recipe" / "Save Changes")
- Loading spinner on submit button while saving
- Button disabled when form is invalid or saving

---

## 5. Categories Management Page

### 5.1 Header
- Page title "Categories" with subtitle
- "Add Category" FAB button

### 5.2 Categories Grid
- Responsive card grid (min 260px per card)
- Each card shows:
  - Color indicator bar on the left edge
  - Category name
  - Description (if present)
  - Edit and delete action buttons (visible on hover, always visible on mobile)
- Staggered fade-in animation
- Hover glow effect using category color

### 5.3 Create/Edit Form Modal
- Overlay with backdrop blur
- Fields: Name (text), Description (textarea), Color (color picker with preview swatch)
- Cancel and Save/Create buttons
- Click outside to close

### 5.4 Delete
- Confirmation dialog before deletion
- Refreshes list after deletion

---

## 6. Tags Management Page

### 6.1 Header
- Page title "Tags" with subtitle
- "Add Tag" FAB button

### 6.2 Tags Grid
- Responsive card grid (min 260px per card)
- Each card shows:
  - Tag preview chip (pill shape with tag color as border)
  - Description (if present)
  - Edit and delete action buttons (visible on hover, always visible on mobile)
- Staggered fade-in animation

### 6.3 Create/Edit Form Modal
- Overlay with backdrop blur
- Fields: Name (text), Description (textarea), Color (color picker with preview swatch showing tag-style border)
- Cancel and Save/Create buttons
- Click outside to close

### 6.4 Delete
- Confirmation dialog before deletion
- Refreshes list after deletion

---

## 7. Grocery List Page

### 7.1 Layout
- Two-column grid layout (side by side on desktop, stacked on mobile)

### 7.2 Recipe Selection Panel (Left)
- List of all recipes with checkboxes
- When selected, a servings input appears per recipe (defaults to recipe's original servings)
- "Generate List" button (disabled when no recipes selected)
- Loading spinner on the button during generation

### 7.3 Shopping List Panel (Right)
- Empty state when no list generated
- Summary header: recipe count and total servings
- List of grocery items:
  - Each item shows: quantity, unit, name
  - Sub-text showing which recipes use the item
  - Checkbox to mark items as checked (strikethrough + dimmed)
- "Copy" button — copies unchecked items to clipboard as text
- "Uncheck All" button — resets all checkboxes

---

## 8. Random Recipe Page

### 8.1 Hero Section
- Animated pulsing icon
- Title "Random Recipe"
- Subtitle text

### 8.2 Controls
- Category filter multi-select
- Tag filter multi-select
- "Spin the Wheel" button with loading state

### 8.3 Result Display
- Animated card (slide-in) showing the random recipe:
  - Title, description
  - Metadata badges (prep time, cook time, servings)
  - Category and tag chips
- "View Recipe" button → navigates to recipe detail
- "Try Again" button → fetches another random recipe

### 8.4 Empty State
- Shown when no recipes match filters
- Different message depending on whether filters are applied

---

## 9. AI Import Recipe Dialog

### 9.1 Input Phase
- Modal dialog
- Introductory text explaining the feature
- Large textarea to paste recipe text
- "Parse Recipe" button with loading spinner

### 9.2 Preview Phase
- Success indicator
- Parsed recipe preview showing:
  - Title
  - Description
  - First 5 ingredients with "...and X more" indicator
  - Instructions preview (first 200 chars)
  - Metadata (prep time, cook time, servings) if detected
- "Try Again" button to go back to input
- "Create Recipe" button to save and navigate to the new recipe

### 9.3 Error Handling
- Error message banner with icon
- Ability to retry

---

## 10. API Service

A centralized service (`RecipesApiService`) handles all HTTP communication. The following API capabilities must be supported:

### 10.1 Categories
- List all categories
- Get single category
- Create category (name, description, color, icon)
- Update category
- Delete category

### 10.2 Tags
- List all tags
- Get single tag
- Create tag (name, description, color)
- Update tag
- Delete tag

### 10.3 Recipes
- List recipes (with optional search, category, and tag filters via query params)
- Get single recipe (full detail including ingredients, categories, tags, photos)
- Get random recipe (with optional category/tag filters)
- Create recipe
- Update recipe
- Delete recipe
- Get scaled ingredients (for a given servings count)

### 10.4 Photos
- Upload photo (base64 encoded, with filename and mimeType)
- Get photo URL (by photo ID)
- Delete photo

### 10.5 Grocery List
- Generate grocery list from array of recipe/servings pairs

### 10.6 AI Features
- Suggest tags and categories for a recipe
- Chat about a recipe (with conversation history)
- Get cooking tips for a recipe
- Analyze flavor profile of a recipe
- Parse recipe from pasted text

---

## 11. Data Models

### Category
- id, name, description (nullable), color (nullable), icon (nullable), createdAt, updatedAt

### Tag
- id, name, description (nullable), color (nullable), createdAt, updatedAt

### Ingredient
- id, name, quantity, unit, notes (nullable), orderIndex, createdAt, updatedAt

### Recipe (Full)
- id, title, description, instructions, servings, prepTimeMinutes, cookTimeMinutes, notes, source, ingredients[], categories[], tags[], photos[], createdAt, updatedAt

### RecipeSummary (List view)
- id, title, description, servings, prepTimeMinutes, cookTimeMinutes, categories[], tags[], photoCount, createdAt, updatedAt

### RecipePhoto
- id, filename, mimeType, orderIndex, createdAt, updatedAt

### GroceryItem
- name, quantity, unit, recipes[]

### GroceryList
- items[], recipeCount, totalServings

### AI Types
- Message (role, content)
- TagsAndCategoriesSuggestion
- ChatRequest / ChatResponse
- CookingTipsResponse (tips[], commonMistakes[])
- FlavorProfileResponse (primaryFlavors[], tasteProfile, pairingRecommendations[])
- ParsedIngredient / ParsedRecipe

---

## 12. Cross-Cutting Concerns

### 12.1 Theming
- Dark theme with warm orange (#f97316) as primary accent
- All CSS variables defined in a variables file: colors, text, backgrounds, borders, shadows, gradients
- PrimeNG will be configured with a theme (Aura) and customized to match the dark/orange aesthetic

### 12.2 Responsive Design
- Mobile breakpoint at 768px (sidebar collapse) and 640px (form layout changes)
- All grids, forms, and layouts adapt to mobile
- Touch-friendly tap targets on mobile (min 44px)
- Safe area inset support for mobile devices

### 12.3 Animations
- Staggered fade-in on list/grid items
- Slide-in for result cards
- Pulsing animation on random recipe icon
- Hover lift and glow effects on cards

### 12.4 State Management
- Angular signals for component-level state
- Zoneless change detection (`provideZonelessChangeDetection`)
- OnPush change detection strategy on all components

### 12.5 Performance
- Lazy-loaded route components
- `trackBy` on all `@for` loops

### 12.6 Environment Configuration
- Environment files for production and development
- API base URL configured per environment
