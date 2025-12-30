# Randomizer Wheel App - Architecture Plan

## Overview
A modern Angular-based randomizer wheel application deployed at `wheel.elliott.haus`. This app provides an interactive spinning wheel to randomly select items from a user-provided list.

## Core Features

### 1. Input Management
- **Textarea Input**: Users enter items as newline-separated text
- **Real-time Processing**: Items are parsed and added to the wheel dynamically
- **URL State Management**: Items are encoded in URL query parameters for easy sharing and persistence

### 2. Wheel Visualization & Animation
- **Canvas-based Rendering**: Use HTML5 Canvas for smooth wheel rendering
- **Dynamic Segments**: Automatically divide wheel into equal segments based on item count
- **Color Scheme**: Each segment gets a distinct color for visual clarity
- **Spinning Animation**: Smooth CSS/JavaScript animations with easing functions
- **Random Selection**: Physically accurate deceleration to random selection

### 3. Selection & Removal
- **Result Display**: Modal/popup showing the selected item
- **Removal Option**: Ability to remove the selected item from the list
- **State Update**: Automatically update URL params when items are removed
- **Re-spin Capability**: Continue spinning with remaining items

## Technical Architecture

### Frontend Stack
- **Framework**: Angular 18+ with Zoneless Change Detection
- **Language**: TypeScript
- **Styling**: SCSS with modern CSS animations
- **No External Dependencies**: Pure Angular implementation using:
  - Angular Signals for reactive state management
  - Native Canvas API for wheel rendering
  - CSS animations for visual effects
  - URL SearchParams for state management

### Application Structure
```
apps/wheel/
├── src/
│   ├── app/
│   │   ├── app.component.ts          # Root component with routing
│   │   ├── app.config.ts             # Zoneless Angular configuration
│   │   ├── app.routes.ts             # Route definitions
│   │   ├── wheel/
│   │   │   ├── wheel.component.ts    # Main wheel component
│   │   │   ├── wheel.component.scss  # Wheel styling & animations
│   │   │   └── wheel.service.ts      # State management & logic
│   │   └── shared/
│   │       └── url-state.service.ts  # URL parameter management
│   ├── main.ts                       # Application bootstrap
│   ├── index.html                    # HTML entry point
│   └── styles.scss                   # Global styles
├── public/                           # Static assets
├── Dockerfile                        # Multi-stage Docker build
├── project.json                      # Nx project configuration
└── tsconfig.json                     # TypeScript configuration
```

### Component Architecture

#### WheelComponent
**Responsibilities:**
- Render the wheel using Canvas API
- Handle spin animation and physics
- Display result modal
- Manage user interactions (spin button, remove item)

**Key Methods:**
- `drawWheel()`: Render wheel segments on canvas
- `spinWheel()`: Initiate spinning animation with random outcome
- `selectItem()`: Determine and display selected item
- `removeItem()`: Remove selected item and update state

#### URLStateService
**Responsibilities:**
- Encode/decode items to/from URL query parameters
- Sync application state with URL
- Enable sharing functionality

**State Management:**
- Items stored as base64-encoded query parameter
- Automatic URL updates on item changes
- Browser history integration

### State Flow
```
User Input → Parse Items → Update Signals → Update URL → Render Wheel
                                ↓
                           Spin Animation
                                ↓
                        Select Random Item
                                ↓
                         Show Result Modal
                                ↓
                    [Remove Item?] → Update State → Update URL
```

## Deployment Architecture

### Containerization
- **Base Image**: node:lts-alpine for building
- **Production Image**: nginx:alpine for serving
- **Build Process**: Multi-stage Docker build
  1. Install dependencies with pnpm
  2. Build Angular app with production optimizations
  3. Copy built artifacts to nginx container

### Kubernetes Deployment (Helm Chart)
Located in `deployments/wheel/`

#### Resources:
- **Deployment**: Single replica (can scale if needed)
- **Service**: ClusterIP on port 80
- **IngressRoute**: Traefik-based ingress for HTTPS
- **ConfigMap**: nginx configuration for SPA routing

#### Configuration:
```yaml
hostname: wheel.elliott.haus
image: ethanelliottio/wheel:latest
resources:
  limits: { cpu: 200m, memory: 128Mi }
  requests: { cpu: 100m, memory: 64Mi }
```

### ArgoCD Integration
- App added to `deployments/primary-application.yaml`
- Auto-sync enabled for continuous deployment
- Namespace: `elliott-haus`

## Development Workflow

### Local Development
```bash
# Serve locally
pnpm nx serve wheel

# Build for production
pnpm nx build wheel --prod
```

### Container Build & Deploy
```bash
# Build and push Docker image
pnpm nx container wheel

# ArgoCD will automatically sync and deploy
```

### Versioning
- Git tags follow pattern: `wheel@x.y.z`
- Initial release: `wheel@1.0.0`
- Docker images tagged with version and `latest`

## Key Implementation Details

### Canvas Wheel Rendering
1. Calculate segment angle based on item count
2. Draw each segment with distinct color
3. Add text labels (rotated to match segment angle)
4. Draw pointer/indicator at top

### Spin Animation
1. Use requestAnimationFrame for smooth animation
2. Implement easing function (e.g., cubic-bezier)
3. Random spin duration (3-5 seconds)
4. Random final rotation (multiple full rotations + random offset)
5. Calculate winner based on final rotation angle

### URL State Format
```
?items=base64(item1\nitem2\nitem3)
```
Example:
```
wheel.elliott.haus?items=QXBwbGUKQmFuYW5hCkNoZXJyeQ==
```

## Security & Performance

### Security
- Input sanitization for XSS prevention
- URL length limits (browser-dependent, ~2000 chars)
- CSP headers via nginx configuration

### Performance
- Lazy loading routes (if multiple pages added later)
- Canvas optimization (requestAnimationFrame throttling)
- Minimal bundle size (no external libraries)
- Aggressive caching via nginx

## Future Enhancements (Not in v1.0.0)
- Custom color themes
- Sound effects on spin
- Weighted items (some items more likely)
- Multiple winner selection
- History of past spins
- Preset templates (colors, common lists)

## Success Criteria
- ✅ Functional spinning wheel with smooth animations
- ✅ Items persist in URL for sharing
- ✅ Modal removal functionality
- ✅ Deployed at wheel.elliott.haus via ArgoCD
- ✅ Zero external npm dependencies (Angular only)
- ✅ Mobile responsive design
