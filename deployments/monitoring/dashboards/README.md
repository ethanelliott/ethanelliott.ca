# Grafana Dashboards

This folder is mounted into Grafana via the dashboard sidecar. Any change to these JSON files will be picked up automatically by Argo CD and the monitoring release, so they can be treated like code.

## Included Dashboards

- `cluster-overview.json` – high level cluster health including API server latency, aggregate CPU/memory usage, and inventory style statistics for pods and nodes.
- `node-resources.json` – node-by-node drill down with CPU, memory, filesystem saturation, and pod density metrics. Use the node variable to focus on a single machine or a subset (e.g. control plane nodes).
- `test-server-overview.json` – application telemetry for the Fastify test-server including request rate, latency slices, error rate, and container resource consumption.

## Suggestions & Next Steps

1. **Logging / Loki integration** – once a log store is available, add a dashboard juxtaposing request metrics and log volume (e.g. 5xx spikes vs structured logs). This pairs well with Grafana Loki and the Grafana Explore workflow.
2. **Alert drill-downs** – create dashboards per alert family (e.g. node pressure, persistent volume issues) so operators can pivot directly from Alertmanager notifications.
3. **Frontend experience metrics** – if browser RUM data is available, layer it into Grafana using Tempo/Tracing panels so you can correlate backend latency with real user timings.
4. **Database performance** – when databases are added to the cluster, ship dedicated dashboards (connection saturation, slow queries, cache hit ratio) and link them from the cluster overview via dashboard navigation links.

Feel free to export dashboards from a local Grafana instance and drop the JSON in this directory. Keep filenames kebab-case to align with the templated ConfigMap names.
