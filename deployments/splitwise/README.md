# Splitwise backend deployment

Helm chart for the Splitwise API. Deployed automatically by ArgoCD (see
`application.yaml`). Uses the shared in-cluster PostgreSQL instance, following
the same pattern as `ip-monitor`.

## How the database is provisioned

- A `pre-install`/`pre-upgrade` Job (`templates/init-job.yaml`) connects to the
  shared `postgres` service as the admin user (from `postgres-secrets`) and
  creates the `splitwise` role and `splitwise` database if they don't exist.
- The app then connects with `DB_*` env vars; TypeORM `synchronize: true`
  creates the tables on first boot.

## Secrets

The app reads two secret values from `splitwise-splitwise-db-secrets`:

| key           | used for                          |
| ------------- | --------------------------------- |
| `db-password` | PostgreSQL password for the app   |
| `jwt-secret`  | signing key for access tokens     |

### Quick bring-up (default)

`values.yaml` ships with `createSecret: true` and placeholder values. Helm
creates the secret as a pre-sync hook. **Change the placeholders before any
real use.**

### Production (recommended): SealedSecret

1. Set `createSecret: false` in `values.yaml`.
2. Seal real values and commit the SealedSecret to this folder, e.g.:

   ```sh
   kubectl create secret generic splitwise-splitwise-db-secrets \
     --namespace elliott-haus \
     --from-literal=db-password='<strong-password>' \
     --from-literal=jwt-secret="$(openssl rand -hex 32)" \
     --dry-run=client -o yaml \
   | kubeseal --format yaml \
       --controller-namespace sealed-secrets \
       > templates/sealed-secret.yaml
   ```

   Add the `pre-install,pre-upgrade` / `hook-weight: "-10"` annotations to the
   sealed secret so it is created before the init Job (mirroring `ip-monitor`).

## WebAuthn / passkeys

`RP_ID` and `ORIGIN` must match the **frontend** domain
(`splitwise.elliott.haus`) because that is where passkeys are created and used.
