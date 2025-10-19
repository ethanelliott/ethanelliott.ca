{{/*
Expand the name of the chart.
*/}}
{{- define "monitoring.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "monitoring.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "monitoring.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "monitoring.labels" -}}
helm.sh/chart: {{ include "monitoring.chart" . }}
{{ include "monitoring.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels
*/}}
{{- define "monitoring.selectorLabels" -}}
app.kubernetes.io/name: {{ include "monitoring.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Normalize user provided names into a DNS-safe slug.
*/}}
{{- define "monitoring.slugify" -}}
{{- regexReplaceAll "[^a-z0-9-]+" (lower .) "-" | trimSuffix "-" | trimPrefix "-" -}}
{{- end -}}

{{/*
Build a release-scoped resource name.
*/}}
{{- define "monitoring.resourceName" -}}
{{- $name := .name -}}
{{- $ctx := .context -}}
{{- if $name -}}
{{- $slug := include "monitoring.slugify" $name -}}
{{- printf "%s-%s" (include "monitoring.fullname" $ctx) $slug | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- include "monitoring.fullname" $ctx -}}
{{- end -}}
{{- end -}}

{{/*
Generate a deterministic ConfigMap name for a dashboard file.
*/}}
{{- define "monitoring.dashboardConfigMapName" -}}
{{- $file := .file -}}
{{- $base := regexReplaceAll "\\.json$" $file "" -}}
{{- $slug := regexReplaceAll "[^a-z0-9]+" (lower $base) "-" -}}
{{- printf "%s-dashboard-%s" (include "monitoring.fullname" .context) $slug | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Default additional scrape configuration when users do not override it.
*/}}
{{- define "monitoring.defaultScrapeConfig" -}}
- job_name: 'kubernetes-annotation-services'
	honor_labels: true
	kubernetes_sd_configs:
		- role: endpoints
	relabel_configs:
		- source_labels: [__meta_kubernetes_service_annotation_prometheus_io_scrape]
			action: keep
			regex: true
		- source_labels: [__meta_kubernetes_service_annotation_prometheus_io_scheme]
			action: replace
			regex: (https?)
			target_label: __scheme__
		- source_labels: [__meta_kubernetes_service_annotation_prometheus_io_path]
			action: replace
			regex: (.+)
			target_label: __metrics_path__
		- source_labels: [__address__, __meta_kubernetes_service_annotation_prometheus_io_port]
			action: replace
			regex: ([^:]+)(?::\d+)?;(\d+)
			replacement: $1:$2
			target_label: __address__
		- source_labels: [__meta_kubernetes_namespace]
			target_label: namespace
		- source_labels: [__meta_kubernetes_service_name]
			target_label: service
		- source_labels: [__meta_kubernetes_pod_node_name]
			target_label: node
- job_name: 'kubernetes-annotation-pods'
	honor_labels: true
	kubernetes_sd_configs:
		- role: pod
	relabel_configs:
		- source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
			action: keep
			regex: true
		- source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scheme]
			action: replace
			regex: (https?)
			target_label: __scheme__
		- source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
			action: replace
			regex: (.+)
			target_label: __metrics_path__
		- source_labels: [__meta_kubernetes_pod_ip, __meta_kubernetes_pod_annotation_prometheus_io_port]
			action: replace
			regex: ([^:]+);(\d+)
			replacement: $1:$2
			target_label: __address__
		- source_labels: [__meta_kubernetes_namespace]
			target_label: namespace
		- source_labels: [__meta_kubernetes_pod_name]
			target_label: pod
		- source_labels: [__meta_kubernetes_pod_container_name]
			target_label: container
{{- end -}}
