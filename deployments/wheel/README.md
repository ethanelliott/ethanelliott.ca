# Wheel backend deployment

Helm chart for the Wheel backend API (saved wheels, tags, passkey auth).
Mirrors the `split` chart: a Fastify service backed by the shared `postgres`
instance, fronted by a Traefik `IngressRoute` at `wheel-api.elliott.haus`.

## Required secret (one-time)

The Deployment and the DB-init Job read two values from a secret named
`wheel-db-secrets` (keys `db-password` and `jwt-secret`). This secret is **not**
committed. Create it once before the app can come up, using either option:

### Option A — SealedSecret (production)

Keep `createSecret: false` in `values.yaml` and seal real values against the
cluster's controller:

```sh
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 48)

kubectl create secret generic wheel-db-secrets \
  --namespace elliott-haus \
  --from-literal=db-password="$DB_PASSWORD" \
  --from-literal=jwt-secret="$JWT_SECRET" \
  --dry-run=client -o yaml \
| kubeseal --format yaml \
    --controller-namespace kube-system \
    --controller-name sealed-secrets \
> templates/sealed-secret.yaml
```

Commit the generated `templates/sealed-secret.yaml`. The SealedSecrets
controller decrypts it into the `wheel-db-secrets` Secret in-cluster.

### Option B — Helm-managed (quick bring-up only)

Set `createSecret: true` and fill in `secrets.dbPassword` / `secrets.jwtSecret`
in `values.yaml`. Helm creates the secret as a pre-sync hook. Do not use real
credentials this way in a shared repo.

## Postgres role / database

The `db-init` pre-sync Job creates the `wheel` role and `wheel` database in the
shared postgres instance using the admin credentials from the existing
`postgres-secrets` secret. No manual DB setup is required.
