# AI Gateway - Horizontal Scaling Architecture

## Current Architecture Analysis

The current AI Gateway is a **stateful monolith** with the following characteristics:

### Components
```
┌─────────────────────────────────────────────────────────────┐
│                     AI Gateway (Monolith)                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Chat Router │  │ Tool Router │  │  Agent/Orchestrator │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Tool        │  │ Service     │  │  Approval Manager   │  │
│  │ Registry    │  │ Registry    │  │  (In-Memory)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │         Conversation Cache (In-Memory LRU)              ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Ollama Server  │
                    │  (LLM Backend)  │
                    └─────────────────┘
```

### Scalability Bottlenecks
1. **Stateful Conversations**: Conversations stored in-memory can't be shared across instances
2. **Approval Manager State**: Pending approvals are instance-specific
3. **Tool/Service Registry**: Synchronized dynamically but not distributed
4. **Single Ollama Connection**: No load balancing across LLM instances

---

## Proposed Horizontally Scalable Architecture

### Target Architecture
```
                         ┌─────────────────┐
                         │  Load Balancer  │
                         │   (Nginx/K8s)   │
                         └────────┬────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Gateway Pod 1  │     │  Gateway Pod 2  │     │  Gateway Pod N  │
│  (Stateless)    │     │  (Stateless)    │     │  (Stateless)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Redis        │     │   PostgreSQL    │     │  Message Queue  │
│ (Session/Cache) │     │ (Conversations) │     │  (NATS/Redis)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Ollama Pod 1   │     │  Ollama Pod 2   │     │  Ollama Pod N   │
│  (GPU Worker)   │     │  (GPU Worker)   │     │  (GPU Worker)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Implementation Phases

### Phase 1: State Externalization

#### 1.1 Conversation Storage (Redis/PostgreSQL)
```typescript
// New: Distributed Conversation Store
interface ConversationStore {
  save(id: string, messages: OllamaMessage[]): Promise<void>;
  load(id: string): Promise<OllamaMessage[] | null>;
  delete(id: string): Promise<void>;
  setTTL(id: string, ttlSeconds: number): Promise<void>;
}

// Redis implementation for fast access + TTL
class RedisConversationStore implements ConversationStore {
  private redis: Redis;
  
  async save(id: string, messages: OllamaMessage[]): Promise<void> {
    await this.redis.setex(
      `conv:${id}`,
      1800, // 30 min TTL
      JSON.stringify(messages)
    );
  }
}
```

#### 1.2 Distributed Approval Manager
```typescript
// Move approval state to Redis with pub/sub for notifications
interface DistributedApprovalManager {
  // Store approval request in Redis
  createApproval(request: ApprovalRequest): Promise<string>;
  
  // Subscribe to approval responses (any pod can receive)
  subscribeToApproval(id: string): Promise<ApprovalResponse>;
  
  // Any pod can submit approval
  submitApproval(response: ApprovalResponse): Promise<boolean>;
}

// Redis pub/sub for cross-pod communication
class RedisApprovalManager implements DistributedApprovalManager {
  private redis: Redis;
  private subscriber: Redis;
  
  async subscribeToApproval(id: string): Promise<ApprovalResponse> {
    return new Promise((resolve, reject) => {
      const channel = `approval:${id}`;
      const timeout = setTimeout(() => {
        this.subscriber.unsubscribe(channel);
        reject(new Error('Approval timeout'));
      }, 300000);
      
      this.subscriber.subscribe(channel, (response) => {
        clearTimeout(timeout);
        resolve(JSON.parse(response));
      });
    });
  }
}
```

#### 1.3 Shared Tool Registry
```typescript
// Tool definitions in Redis, synchronized across pods
interface DistributedToolRegistry {
  register(tool: MCPTool): Promise<void>;
  unregister(name: string): Promise<void>;
  getAll(): Promise<MCPTool[]>;
  subscribeToChanges(callback: (event: ToolEvent) => void): void;
}
```

### Phase 2: LLM Load Balancing

#### 2.1 Ollama Pool Manager
```typescript
interface OllamaPool {
  endpoints: OllamaEndpoint[];
  strategy: 'round-robin' | 'least-connections' | 'weighted';
}

interface OllamaEndpoint {
  url: string;
  weight: number;
  healthy: boolean;
  activeConnections: number;
  models: string[]; // Available models on this endpoint
}

class OllamaPoolManager {
  private endpoints: Map<string, OllamaEndpoint> = new Map();
  private healthCheckInterval: NodeJS.Timeout;
  
  // Get best endpoint for a specific model
  async getEndpoint(model: string): Promise<OllamaEndpoint> {
    const available = Array.from(this.endpoints.values())
      .filter(e => e.healthy && e.models.includes(model))
      .sort((a, b) => a.activeConnections - b.activeConnections);
    
    if (available.length === 0) {
      throw new Error(`No healthy endpoints for model: ${model}`);
    }
    
    return available[0];
  }
  
  // Health check all endpoints periodically
  private async healthCheck(): Promise<void> {
    for (const [url, endpoint] of this.endpoints) {
      try {
        const response = await fetch(`${url}/api/tags`);
        endpoint.healthy = response.ok;
        if (response.ok) {
          const data = await response.json();
          endpoint.models = data.models.map((m: any) => m.name);
        }
      } catch {
        endpoint.healthy = false;
      }
    }
  }
}
```

#### 2.2 Request Routing
```typescript
// Route requests to appropriate Ollama instance
class SmartOllamaRouter {
  private pool: OllamaPoolManager;
  
  async chat(request: OllamaChatRequest): Promise<OllamaChatResponse> {
    const endpoint = await this.pool.getEndpoint(request.model);
    endpoint.activeConnections++;
    
    try {
      const client = new OllamaClient(endpoint.url);
      return await client.chat(request);
    } finally {
      endpoint.activeConnections--;
    }
  }
}
```

### Phase 3: Message Queue Integration

#### 3.1 Async Agent Execution
```typescript
// Long-running agent tasks via message queue
interface AgentTask {
  id: string;
  type: 'orchestrator' | 'agent';
  input: {
    query: string;
    conversationId: string;
    config?: SessionConfig;
  };
  callbackUrl?: string; // Webhook for completion
}

class AgentTaskQueue {
  private queue: MessageQueue; // NATS, Redis Streams, or RabbitMQ
  
  // Submit task and get immediate response
  async submit(task: AgentTask): Promise<string> {
    await this.queue.publish('agent-tasks', task);
    return task.id;
  }
  
  // Worker processes tasks
  async processTask(task: AgentTask): Promise<void> {
    const orchestrator = getOrchestrator();
    const emitter = new StreamEmitter();
    
    // Stream results back via Redis pub/sub
    emitter.on((event) => {
      this.redis.publish(`task:${task.id}:events`, JSON.stringify(event));
    });
    
    const result = await orchestrator.run(task.input.query, emitter);
    
    // Store final result
    await this.redis.setex(
      `task:${task.id}:result`,
      3600,
      JSON.stringify(result)
    );
    
    // Optional webhook callback
    if (task.callbackUrl) {
      await fetch(task.callbackUrl, {
        method: 'POST',
        body: JSON.stringify(result),
      });
    }
  }
}
```

### Phase 4: Kubernetes Deployment

#### 4.1 Deployment Configuration
```yaml
# ai-gateway-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-gateway
spec:
  replicas: 3  # Horizontal scaling
  selector:
    matchLabels:
      app: ai-gateway
  template:
    spec:
      containers:
      - name: ai-gateway
        image: ai-gateway:latest
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        env:
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: url
        - name: OLLAMA_POOL
          value: "ollama-1:11434,ollama-2:11434,ollama-3:11434"
        livenessProbe:
          httpGet:
            path: /metrics/health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        readinessProbe:
          httpGet:
            path: /metrics/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 3
---
# Horizontal Pod Autoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ai-gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ai-gateway
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

#### 4.2 Ollama Worker Pool
```yaml
# ollama-workers.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ollama-workers
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ollama
  template:
    spec:
      containers:
      - name: ollama
        image: ollama/ollama:latest
        resources:
          limits:
            nvidia.com/gpu: 1  # GPU allocation
        ports:
        - containerPort: 11434
        volumeMounts:
        - name: models
          mountPath: /root/.ollama
      nodeSelector:
        gpu: "true"  # Schedule on GPU nodes
      volumes:
      - name: models
        persistentVolumeClaim:
          claimName: ollama-models-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: ollama-pool
spec:
  selector:
    app: ollama
  ports:
  - port: 11434
    targetPort: 11434
  type: ClusterIP
```

---

## Data Flow: Scalable Request Handling

```
User Request
      │
      ▼
┌─────────────────┐
│  Load Balancer  │  (Sticky sessions optional)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Gateway Pod    │
│  (Any replica)  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐  ┌─────────┐
│ Redis │  │ Postgres │  Load conversation history
│ Cache │  │  (Cold)  │
└───┬───┘  └─────────┘
    │
    ▼
┌─────────────────┐
│  Ollama Pool    │  Route to least-loaded GPU worker
│  (Round Robin)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Ollama Worker  │  Process LLM request
│  (GPU-enabled)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Gateway Pod    │  Process tools, format response
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Redis          │  Save conversation + stream events
└─────────────────┘
```

---

## Capacity Planning

### Expected Throughput (per pod)
| Metric | Single Pod | 3 Pods | 10 Pods |
|--------|-----------|--------|---------|
| Concurrent Users | 50-100 | 150-300 | 500-1000 |
| Requests/min | 100-200 | 300-600 | 1000-2000 |
| Memory (base) | 512MB | 1.5GB | 5GB |
| LLM Latency | 2-30s | 2-30s | 2-30s |

### Bottleneck Analysis
1. **LLM Inference**: Primary bottleneck - scale Ollama workers
2. **Network I/O**: Streaming adds overhead - consider WebSockets
3. **Redis**: Single Redis can handle 100K+ ops/sec - not a bottleneck
4. **CPU**: Tool execution is lightweight - not a bottleneck

### Recommended Starting Configuration
- **Gateway Pods**: 3 (min 2 for HA)
- **Ollama Workers**: 2-4 (depends on GPU availability)
- **Redis**: Single instance (Redis Cluster for >100K users)
- **PostgreSQL**: Single instance with read replicas

---

## Migration Path

### Step 1: Add Redis (Week 1)
- Install Redis dependency
- Implement `RedisConversationStore`
- Add feature flag for Redis vs in-memory
- Deploy with both enabled, monitor

### Step 2: Externalize Approvals (Week 2)
- Implement `RedisApprovalManager`
- Add pub/sub for cross-pod approval sync
- Test approval flow across pods

### Step 3: Ollama Pool (Week 3)
- Implement `OllamaPoolManager`
- Add health checks and load balancing
- Configure multiple Ollama endpoints

### Step 4: Kubernetes Migration (Week 4)
- Create Helm charts
- Set up HPA and PDB
- Configure monitoring (Prometheus/Grafana)
- Load test and tune

---

## Summary

The key changes for horizontal scalability:

1. **Externalize all state** to Redis/PostgreSQL
2. **Make gateway pods stateless** - any pod can handle any request
3. **Pool LLM backends** - distribute load across multiple Ollama instances
4. **Use message queues** for long-running async tasks
5. **Implement proper health checks** for Kubernetes orchestration

This architecture can scale to thousands of concurrent users while maintaining reliability and performance.
