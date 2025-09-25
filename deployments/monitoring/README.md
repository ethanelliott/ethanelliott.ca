# OpenTelemetry Monitoring Stack

This deployment provides a comprehensive observability solution using OpenTelemetry, optimized for small self-hosted clusters.

## 🚀 What This Gives You

### Complete Observability Stack:
- **📊 Metrics**: Prometheus + Grafana dashboards
- **🔍 Traces**: Jaeger for distributed tracing  
- **📝 Logs**: Fluent Bit log collection (with OTEL integration)
- **🎛️ Orchestration**: OpenTelemetry Operator + Collector

### 🌐 Access Points (after deployment):

**External Access (via Ingress with SSL):**
- **Grafana Dashboard**: `https://grafana.elliott.haus` (admin/admin123)
- **Jaeger Tracing**: `https://jaeger.elliott.haus`
- **OTEL Collector**: `https://otel.elliott.haus` (for frontend apps)
- **Prometheus**: `https://prometheus.elliott.haus` (direct access)

**Internal Access (ClusterIP services):**
- **Grafana**: `http://monitoring-kube-prometheus-stack-grafana.monitoring.svc.cluster.local`
- **Jaeger Query**: `http://monitoring-jaeger-query.monitoring.svc.cluster.local:16686`
- **Prometheus**: `http://monitoring-kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090`
- **OTEL Collector**: `http://otel-collector.monitoring.svc.cluster.local:4318`

## 📦 Components Deployed

1. **OpenTelemetry Operator** - Manages OTEL components
2. **OpenTelemetry Collector** - Central telemetry pipeline
3. **Jaeger All-in-One** - Trace storage and UI
4. **Prometheus Stack** - Metrics storage, AlertManager, Grafana
5. **Fluent Bit** - Log collection
6. **Node Exporter** - Host metrics
7. **kube-state-metrics** - Kubernetes object metrics

## 🔧 Optimizations for Small Clusters

- **Resource Limits**: All components have CPU/memory limits
- **Short Retention**: 7 days for metrics, limited trace storage
- **Efficient Storage**: Uses memory storage where possible
- **Batch Processing**: Optimized data pipelines
- **Single Replicas**: Reduced resource footprint

## 🎯 What You'll Monitor

### Kubernetes Infrastructure:
- Cluster CPU, memory, disk usage
- Pod status and resource consumption  
- Node health and performance
- Network traffic and storage

### Your Applications:
- HTTP request traces and latencies
- Database query performance
- Error rates and success metrics
- Custom business metrics (once instrumented)

### System Metrics:
- Host-level CPU, memory, disk I/O
- Container resource usage
- Kubernetes API server performance

## 📈 Pre-configured Dashboards

The stack includes several ready-to-use Grafana dashboards:
- **OpenTelemetry Collector**: Monitor the OTEL pipeline itself
- **Kubernetes Overview**: Cluster health and resource usage
- **Node Metrics**: Individual server performance
- **Application Metrics**: Once you instrument your apps

## 🛠️ Next Steps After Deployment

### 1. Access the UIs

**External Access (Recommended):**
```bash
# Access Grafana with SSL (admin/admin123)
https://grafana.elliott.haus

# Access Jaeger with SSL
https://jaeger.elliott.haus

# OTEL Collector endpoint for frontend apps
https://otel.elliott.haus

# Prometheus direct access
https://prometheus.elliott.haus
```

**Port Forwarding (Alternative):**
```bash
# Forward Grafana port
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-stack-grafana 3000:80

# Forward Jaeger port  
kubectl port-forward -n monitoring svc/monitoring-jaeger-query 16686:16686

# Then access via localhost:
# http://localhost:3000 (Grafana)
# http://localhost:16686 (Jaeger)
```

**DNS Requirements:**
Make sure your DNS points these domains to your cluster:
- `grafana.elliott.haus` → Your cluster IP
- `jaeger.elliott.haus` → Your cluster IP  
- `otel.elliott.haus` → Your cluster IP
- `prometheus.elliott.haus` → Your cluster IP

Or add to your `/etc/hosts` file:
```
<your-cluster-ip> grafana.elliott.haus jaeger.elliott.haus otel.elliott.haus prometheus.elliott.haus
```

### 2. Instrument Your Applications

#### **Backend Applications (Server-side):**
For Node.js/TypeScript apps running in Kubernetes:
```bash
# In your app directory  
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

Use internal cluster endpoint:
```typescript
// tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://otel-collector.monitoring.svc.cluster.local:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```

#### **Frontend Applications (Browser-side):**
For Angular/React/Vue apps:
```bash
npm install @opentelemetry/api @opentelemetry/sdk-web @opentelemetry/auto-instrumentations-web
```

Use external HTTPS endpoint:
```typescript
// tracing.ts
import { WebSDK } from '@opentelemetry/sdk-web';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';

const sdk = new WebSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'https://otel.elliott.haus/v1/traces', // External endpoint!
  }),
  instrumentations: [getWebAutoInstrumentations()],
});
sdk.start();
```

#### **Automatic Instrumentation (Kubernetes only):**
Add this annotation to backend deployment YAML:
```yaml
metadata:
  annotations:
    instrumentation.opentelemetry.io/inject-nodejs: "monitoring/nodejs-instrumentation"
```

### 3. Explore the Data
- **Traces**: Make requests to your apps and see them in Jaeger
- **Metrics**: View resource usage in Grafana dashboards
- **Logs**: Check aggregated logs in the OTEL collector

### 4. Create Custom Dashboards
Use Grafana to create dashboards specific to your applications and business metrics.

## � Security & SSL Configuration

### SSL Certificates
The ingresses use your existing `elliott-haus-wildcard-tls` certificate. Make sure:
1. The certificate covers `*.elliott.haus` domains
2. The certificate secret exists in the `monitoring` namespace (or configure cert-manager to sync it)

### Security Considerations
- **Grafana**: Contains sensitive cluster information - consider network-level access restrictions
- **Jaeger**: Shows application traces - may contain sensitive data  
- **Prometheus**: Raw metrics access - usually kept internal (disabled by default)

## �🔍 Troubleshooting

### Check if everything is running:
```bash
kubectl get pods -n monitoring
kubectl get svc -n monitoring
```

### View OTEL Collector logs:
```bash
kubectl logs -n monitoring deployment/otel-collector -f
```

### Test OTLP endpoint:
```bash
kubectl port-forward -n monitoring svc/otel-collector 4318:4318
curl -X POST http://localhost:4318/v1/traces -d '{"resourceSpans":[]}'
```

### Check ingress status:
```bash
kubectl get ingress -n monitoring
kubectl describe ingress -n monitoring monitoring-grafana
```

### Test SSL certificates:
```bash
curl -I https://grafana.elliott.haus
openssl s_client -connect grafana.elliott.haus:443 -servername grafana.elliott.haus
```

### Check nginx ingress logs:
```bash
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx -f
```

## 🎚️ Configuration

All configuration is in `values.yaml`. Key settings:
- **Retention periods**: Adjust for your storage capacity
- **Resource limits**: Scale up/down based on your cluster
- **Data sources**: Pre-configured to work together
- **External access**: NodePort services for home lab use

## 📊 Expected Resource Usage

**Total Stack Usage** (approximate):
- **CPU**: ~1.5 cores total
- **Memory**: ~3GB total  
- **Storage**: ~15GB for PVCs (adjust retention as needed)

This is optimized for your old laptop setup while still providing comprehensive monitoring!

## 🔄 Data Flow

```
Your Apps → OTEL Collector → [Prometheus, Jaeger, Logs]
                ↓
Kubernetes Metrics → Prometheus ← Grafana (Dashboards)
                ↓
Host Metrics → Node Exporter
                ↓  
Logs → Fluent Bit → OTEL Collector
```

Once deployed, you'll have full visibility into everything running on your cluster! 🎉
