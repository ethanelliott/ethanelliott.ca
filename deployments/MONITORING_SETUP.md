# K3s Cluster Monitoring Setup Guide

This guide explains how to set up and use the Prometheus and Grafana monitoring stack for your k3s cluster.

## Overview

The monitoring stack consists of three components:

1. **Prometheus** - Time-series database that collects and stores metrics
2. **Grafana** - Visualization platform for creating dashboards
3. **kube-state-metrics** - Service that generates metrics about the state of Kubernetes objects

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        K3s Cluster                               │
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐ │
│  │   Grafana    │────▶│  Prometheus  │◀────│ kube-state-      │ │
│  │  Dashboard   │     │   (Scraper)  │     │    metrics       │ │
│  └──────────────┘     └──────────────┘     └──────────────────┘ │
│         │                    │                                   │
│         │                    ▼                                   │
│         │             ┌──────────────┐                          │
│         │             │   kubelet    │                          │
│         │             │  (cadvisor)  │                          │
│         │             └──────────────┘                          │
│         │                    │                                   │
│         │                    ▼                                   │
│         │             ┌──────────────┐                          │
│         │             │    Nodes     │                          │
│         │             │    Pods      │                          │
│         │             │    PVCs      │                          │
│         └─────────────┴──────────────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Metrics Collected

### From kubelet/cadvisor (built into k3s)
- **CPU Usage**: Per-node and per-container CPU utilization
- **Memory Usage**: Working set, RSS, cache memory per container
- **Network I/O**: Bytes sent/received per container
- **Filesystem I/O**: Disk read/write per container

### From kube-state-metrics
- **Pod Status**: Running, pending, failed pods
- **Deployment Status**: Desired vs available replicas
- **Node Status**: Ready, not-ready, unschedulable nodes
- **PVC Status**: Bound, pending, lost claims
- **Resource Quotas**: Used vs allocated resources

## Deployment

### Prerequisites
- k3s cluster running
- ArgoCD installed (your deployments use ArgoCD)
- Traefik ingress controller (for external access)
- DNS configured for `prometheus.elliott.haus` and `grafana.elliott.haus`

### Deploy via ArgoCD

The deployments will be automatically picked up by ArgoCD since they follow your existing pattern with `application.yaml` files.

After pushing to main, ArgoCD will deploy:
1. `kube-state-metrics` (no external access needed)
2. `prometheus` at `https://prometheus.elliott.haus`
3. `grafana` at `https://grafana.elliott.haus`

### Manual Deployment (if needed)

```bash
# Deploy kube-state-metrics first (Prometheus depends on it)
cd deployments/kube-state-metrics
helm upgrade --install kube-state-metrics . -n elliott-haus

# Deploy Prometheus
cd ../prometheus
helm upgrade --install prometheus . -n elliott-haus

# Deploy Grafana
cd ../grafana
helm upgrade --install grafana . -n elliott-haus
```

## Accessing the Services

### Grafana

1. Navigate to `https://grafana.elliott.haus`
2. Default login credentials:
   - **Username**: `admin`
   - **Password**: `admin`
3. **⚠️ IMPORTANT**: Change the admin password immediately after first login!

### Prometheus

Navigate to `https://prometheus.elliott.haus` to access the Prometheus UI for:
- Running ad-hoc queries
- Checking target health
- Viewing alerts (if configured)

## Using Grafana

### Pre-configured Dashboard

A "Kubernetes Cluster Overview" dashboard is automatically provisioned with:

| Panel                           | Description                                  |
| ------------------------------- | -------------------------------------------- |
| Total Pods                      | Count of all pods in the cluster             |
| Running Pods                    | Count of pods in Running state               |
| Nodes                           | Number of nodes in the cluster               |
| Namespaces                      | Count of namespaces                          |
| CPU Usage by Node               | Time series graph of node CPU utilization    |
| Memory Usage by Node            | Time series graph of node memory utilization |
| Container Memory Usage (Top 10) | Memory usage of top 10 containers            |
| Container CPU Usage (Top 10)    | CPU usage of top 10 containers               |
| PVC Usage                       | Bar gauge showing PVC capacity utilization   |
| Network Receive (Top 10 Pods)   | Network ingress by pod                       |
| Network Transmit (Top 10 Pods)  | Network egress by pod                        |

### Importing Additional Dashboards

Grafana has thousands of community dashboards. Here are some recommended ones:

1. Go to **Dashboards** → **Import**
2. Enter the dashboard ID and click **Load**
3. Select "Prometheus" as the data source

**Recommended Dashboard IDs:**

| ID    | Name                                       | Description                                    |
| ----- | ------------------------------------------ | ---------------------------------------------- |
| 315   | Kubernetes cluster monitoring              | Comprehensive cluster overview                 |
| 1860  | Node Exporter Full                         | Detailed node metrics (requires node-exporter) |
| 13770 | 1 Kubernetes All-in-one Cluster Monitoring | Modern K8s dashboard                           |
| 6417  | Kubernetes Cluster (Prometheus)            | Clean cluster overview                         |
| 747   | Kubernetes Pod Metrics                     | Detailed pod-level metrics                     |

### Creating Custom Dashboards

1. Click **+ → Dashboard**
2. Add a new panel
3. In the query editor, select **Prometheus** as data source
4. Write your PromQL query (examples below)

## Useful PromQL Queries

### Cluster-wide Metrics

```promql
# Total CPU usage across all nodes
sum(rate(container_cpu_usage_seconds_total{container!=""}[5m]))

# Total memory usage across all containers
sum(container_memory_working_set_bytes{container!=""})

# Number of running pods
count(kube_pod_status_phase{phase="Running"})

# Number of pending pods (potential issues)
count(kube_pod_status_phase{phase="Pending"})
```

### Node Metrics

```promql
# CPU usage percentage per node
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory usage percentage per node
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

# Disk usage percentage
(1 - (node_filesystem_avail_bytes{fstype!="tmpfs"} / node_filesystem_size_bytes{fstype!="tmpfs"})) * 100
```

### Pod/Container Metrics

```promql
# Memory usage by pod
sum by (pod) (container_memory_working_set_bytes{container!="", container!="POD"})

# CPU usage by pod
sum by (pod) (rate(container_cpu_usage_seconds_total{container!="", container!="POD"}[5m]))

# Container restarts (indicates instability)
increase(kube_pod_container_status_restarts_total[1h])

# OOMKilled containers
kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}
```

### PVC Metrics

```promql
# PVC usage percentage
(kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes) * 100

# Available space on PVCs
kubelet_volume_stats_available_bytes

# PVCs close to full (>80% used)
(kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes) > 0.8
```

### Network Metrics

```promql
# Network receive rate by pod
sum by (pod) (rate(container_network_receive_bytes_total[5m]))

# Network transmit rate by pod
sum by (pod) (rate(container_network_transmit_bytes_total[5m]))

# Total cluster network throughput
sum(rate(container_network_receive_bytes_total[5m])) + sum(rate(container_network_transmit_bytes_total[5m]))
```

## Alerting (Optional Enhancement)

### Adding Alert Rules to Prometheus

Edit the Prometheus ConfigMap to add alerting rules:

```yaml
# In prometheus configmap, add:
rule_files:
  - /etc/prometheus/rules/*.yml

# Create a new configmap for rules
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-rules
data:
  alerts.yml: |
    groups:
      - name: kubernetes
        rules:
          - alert: PodCrashLooping
            expr: increase(kube_pod_container_status_restarts_total[1h]) > 3
            for: 5m
            labels:
              severity: warning
            annotations:
              summary: "Pod {{ $labels.pod }} is crash looping"
              
          - alert: HighMemoryUsage
            expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 0.9
            for: 5m
            labels:
              severity: critical
            annotations:
              summary: "Node {{ $labels.instance }} memory usage > 90%"
              
          - alert: PVCAlmostFull
            expr: (kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes) > 0.85
            for: 5m
            labels:
              severity: warning
            annotations:
              summary: "PVC {{ $labels.persistentvolumeclaim }} is > 85% full"
```

### Setting up Grafana Alerting

1. Go to **Alerting** → **Alert Rules**
2. Click **Create alert rule**
3. Configure the query condition
4. Set up notification channels (Slack, Email, etc.)

## Troubleshooting

### Prometheus not scraping targets

1. Check Prometheus targets: `https://prometheus.elliott.haus/targets`
2. Look for targets in "Down" state
3. Check Prometheus logs:
   ```bash
   kubectl logs -n elliott-haus -l app.kubernetes.io/name=prometheus
   ```

### No kube-state-metrics data

1. Verify kube-state-metrics is running:
   ```bash
   kubectl get pods -n elliott-haus -l app.kubernetes.io/name=kube-state-metrics
   ```
2. Check service discovery:
   ```bash
   kubectl get svc -n elliott-haus kube-state-metrics
   ```

### Grafana can't connect to Prometheus

1. Check the datasource configuration in Grafana
2. Verify the Prometheus URL: `http://prometheus.elliott-haus.svc.cluster.local:9090`
3. Test connectivity from Grafana pod:
   ```bash
   kubectl exec -n elliott-haus -it <grafana-pod> -- wget -qO- http://prometheus.elliott-haus.svc.cluster.local:9090/api/v1/status/config
   ```

### Missing container metrics

Container metrics come from kubelet's built-in cAdvisor. If missing:

1. Check if Prometheus can access the kubelet metrics endpoint
2. Verify RBAC permissions are correctly applied:
   ```bash
   kubectl get clusterrolebinding prometheus
   ```

## Resource Considerations

### Storage

| Component  | Default Size | Recommendation                |
| ---------- | ------------ | ----------------------------- |
| Prometheus | 50Gi         | Increase for longer retention |
| Grafana    | 10Gi         | Usually sufficient            |

### Retention

Prometheus is configured with:
- **Time retention**: 15 days
- **Size retention**: 45GB

Adjust in `values.yaml` if needed:
```yaml
retention:
  time: 30d    # Keep metrics for 30 days
  size: 45GB   # But don't exceed 45GB
```

## Security Recommendations

1. **Change Grafana admin password** immediately after deployment
2. Consider adding **authentication** to Prometheus ingress (basic auth via Traefik middleware)
3. Use **network policies** to restrict access to monitoring components
4. Consider deploying to a dedicated **monitoring namespace** for isolation

## Upgrading

### Prometheus
```bash
# Update image tag in values.yaml
image:
  tag: v2.49.0

# ArgoCD will automatically sync, or manually:
kubectl rollout restart deployment/prometheus -n elliott-haus
```

### Grafana
```bash
# Update image tag in values.yaml
image:
  tag: 10.3.0

# ArgoCD will automatically sync
```

## Additional Components (Future Enhancements)

Consider adding these for more comprehensive monitoring:

1. **Node Exporter** - Detailed node-level metrics (hardware, OS)
2. **Alertmanager** - Alert routing and notification management
3. **Loki** - Log aggregation (pairs well with Grafana)
4. **Tempo** - Distributed tracing

## Quick Reference

| Service            | Internal URL                                                    | External URL                      |
| ------------------ | --------------------------------------------------------------- | --------------------------------- |
| Prometheus         | `http://prometheus.elliott-haus.svc.cluster.local:9090`         | `https://prometheus.elliott.haus` |
| Grafana            | `http://grafana.elliott-haus.svc.cluster.local:3000`            | `https://grafana.elliott.haus`    |
| kube-state-metrics | `http://kube-state-metrics.elliott-haus.svc.cluster.local:8080` | N/A                               |

---

**Questions or issues?** Check the logs first, then the Prometheus targets page. Most issues are related to RBAC permissions or service discovery.
