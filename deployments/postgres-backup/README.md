# postgres-backup

Nightly logical backups of the in-cluster PostgreSQL (`postgres` chart).

## What it does

- A `CronJob` runs `pg_dumpall` every night at **03:00 `America/Toronto`**, gzips the
  output, and writes it to a dedicated PVC.
- `pg_dumpall` captures **every database plus global objects (roles/permissions)** in a
  single file — a full logical snapshot of the server.
- Retention: keeps the newest **{{ retention.count }} = 2** dumps (2 days of history).
- The PVC is pinned via `nodeName` to an **always-on node that is not the WSL/Postgres
  node**, so the backup lives on separate hardware from the only live copy of the data.

Files are named `pg_dumpall-YYYYmmdd-HHMMSS.sql.gz`. They are written to a `.partial`
file first and atomically renamed, so an interrupted run never leaves a truncated file
that looks valid.

> This is **Tier 0**: local, single-location backups (no offsite yet). It protects
> against the immediate risk — losing the single copy of the DB on a flaky node — but a
> house fire / ransomware event on the LAN would still take out both copies. Add an
> offsite target (restic → Backblaze B2/S3) when ready.

## Configuration

See [values.yaml](values.yaml). Key knobs: `schedule`, `timeZone`, `retention.count`,
`storage.size`, and **`nodeName`** (must be set to skynet's Kubernetes node name).

## Manually trigger a backup now

```sh
kubectl -n elliott-haus create job --from=cronjob/postgres-backup postgres-backup-manual
kubectl -n elliott-haus logs -f job/postgres-backup-manual
```

## List existing backups

```sh
kubectl -n elliott-haus get pvc postgres-backup
# inspect files via a throwaway pod that mounts the backup volume:
kubectl -n elliott-haus run pg-peek --rm -it --restart=Never --image=busybox \
  --overrides='{"spec":{"nodeName":"NODE","containers":[{"name":"p","image":"busybox","stdin":true,"tty":true,"command":["ls","-lh","/backups"],"volumeMounts":[{"name":"b","mountPath":"/backups"}]}],"volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"postgres-backup"}}]}}'
```

(Replace `NODE` with the pinned node name.)

## Restore

An untested backup is not a backup. To restore the whole server from a dump:

```sh
# 1. Start a throwaway client pod on the node holding the backup PVC:
kubectl -n elliott-haus run pg-restore --rm -it --restart=Never --image=postgres:17.5-alpine \
  --overrides='{"spec":{"nodeName":"NODE","containers":[{"name":"r","image":"postgres:17.5-alpine","stdin":true,"tty":true,"command":["/bin/sh"],"env":[{"name":"PGPASSWORD","valueFrom":{"secretKeyRef":{"name":"postgres-secrets","key":"postgres-password"}}}],"volumeMounts":[{"name":"b","mountPath":"/backups"}]}],"volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"postgres-backup"}}]}}'

# 2. Inside the pod, replay the dump against the live server:
gunzip -c /backups/pg_dumpall-YYYYmmdd-HHMMSS.sql.gz | psql -h postgres -U postgres -d postgres
```

Because the dump uses `--clean --if-exists`, it drops and recreates objects as it goes, so
it restores cleanly over an existing (or empty) server.
