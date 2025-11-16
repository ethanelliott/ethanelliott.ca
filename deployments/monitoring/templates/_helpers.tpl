{{- define "monitoring.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "monitoring.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- printf "%s" $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "monitoring.selectorLabels" -}}
app.kubernetes.io/name: {{ include "monitoring.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "monitoring.grafana.labels" -}}
app: grafana
{{ include "monitoring.selectorLabels" . }}
{{- end -}}

{{- define "monitoring.prometheus.labels" -}}
app: prometheus
{{ include "monitoring.selectorLabels" . }}
{{- end -}}

{{- define "monitoring.kubeStateMetrics.labels" -}}
app: kube-state-metrics
{{ include "monitoring.selectorLabels" . }}
{{- end -}}

{{- define "monitoring.nodeExporter.labels" -}}
app: node-exporter
{{ include "monitoring.selectorLabels" . }}
{{- end -}}

{{- define "monitoring.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{ include "monitoring.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
