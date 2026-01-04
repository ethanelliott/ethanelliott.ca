# Quick Release Guide

## 🚀 Creating a Release

### 1. Trigger Release Preparation

**Via GitHub UI:**
1. Go to [Actions](../../actions)
2. Select "Prepare Release" workflow
3. Click "Run workflow"
4. Choose:
   - **Release Type**: `patch` | `minor` | `major` | `prerelease`
   - **Pre-ID** (optional): `rc` | `alpha` | `beta` (only for prerelease)
5. Click "Run workflow" button

### 2. Review and Merge PR

1. Wait for workflow to create PR (usually < 1 minute)
2. Review the PR:
   - Check version bumps in `package.json` files
   - Review `CHANGELOG.md` updates
3. Approve and merge using **"Squash and merge"**

### 3. Release is Published Automatically

After merging, the "Execute Release" workflow will:
- ✅ Create git tags
- ✅ Build and push Docker images
- ✅ Create GitHub Release

---

## 📋 Quick Commands

### Test Release Locally (Dry Run)
```bash
# Preview patch release
npm run release:prepare:dry-run -- --type=patch

# Preview minor release
npm run release:prepare:dry-run -- --type=minor

# Preview pre-release
npm run release:prepare:dry-run -- --type=prerelease --preid=rc
```

### Build Docker Image with Custom Tag
```bash
# Single project
npx nx run finances:container --tag=1.2.3

# All projects with latest tag
npx nx run-many -t container --tag=latest
```

---

## 🏷️ Commit Message Format

Use conventional commits to automatically determine version bumps:

| Commit Type                     | Version Bump  | Example                      |
| ------------------------------- | ------------- | ---------------------------- |
| `fix:`                          | Patch (0.0.X) | `fix: resolve login issue`   |
| `feat:`                         | Minor (0.X.0) | `feat: add dark mode`        |
| `feat!:` or `BREAKING CHANGE:`  | Major (X.0.0) | `feat!: redesign API`        |
| Other (`chore:`, `docs:`, etc.) | None          | `chore: update dependencies` |

---

## 🎯 Release Types

| Type           | When to Use                        | Example Version        |
| -------------- | ---------------------------------- | ---------------------- |
| **patch**      | Bug fixes, small changes           | `1.0.0` → `1.0.1`      |
| **minor**      | New features (backward compatible) | `1.0.0` → `1.1.0`      |
| **major**      | Breaking changes                   | `1.0.0` → `2.0.0`      |
| **prerelease** | Testing releases (RC, alpha, beta) | `1.0.0` → `1.1.0-rc.1` |

---

## ⚠️ Important Notes

1. **Always use "Squash and merge"** when merging release PRs
2. The PR title must have format: `chore(release): publish {version}`
3. Docker images are tagged with both `{version}` and `latest`
4. Each app is versioned independently

---

## 🔍 Troubleshooting

| Issue                           | Solution                                            |
| ------------------------------- | --------------------------------------------------- |
| No version changes detected     | Ensure commits follow conventional format           |
| Release workflow didn't trigger | Check PR title format, verify squash and merge used |
| Docker build fails              | Verify Dockerfile exists and builds locally         |
| PR not created                  | Check workflow logs in GitHub Actions               |

---

## 📚 Full Documentation

See [RELEASE.md](./RELEASE.md) for comprehensive documentation.

---

**Need Help?** Check the [GitHub Actions](../../actions) page for workflow runs and logs.
