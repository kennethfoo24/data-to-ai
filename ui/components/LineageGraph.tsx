'use client'

import React, { useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  getBezierPath,
  BaseEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// ─── Logos ───────────────────────────────────────────────────────────────────

const logos: Record<string, React.ReactNode> = {
  postgres: (
    <svg viewBox="0 0 32 32" width="20" height="20">
      <circle cx="16" cy="16" r="14" fill="#336791"/>
      <ellipse cx="16" cy="12" rx="7" ry="4" fill="rgba(255,255,255,0.92)"/>
      <path d="M9 12v7a7 4 0 0014 0v-7" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5"/>
      <path d="M9 15.5a7 4 0 0014 0" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>
    </svg>
  ),
  kafka: (
    <svg viewBox="0 0 32 32" width="20" height="20">
      <rect width="32" height="32" rx="6" fill="#1d1d1d"/>
      <circle cx="16" cy="16" r="3.5" fill="white"/>
      <circle cx="7"  cy="10" r="2.5" fill="white"/>
      <circle cx="25" cy="10" r="2.5" fill="white"/>
      <circle cx="7"  cy="22" r="2.5" fill="white"/>
      <circle cx="25" cy="22" r="2.5" fill="white"/>
      <line x1="16" y1="16" x2="7"  y2="10" stroke="white" strokeWidth="1.5"/>
      <line x1="16" y1="16" x2="25" y2="10" stroke="white" strokeWidth="1.5"/>
      <line x1="16" y1="16" x2="7"  y2="22" stroke="white" strokeWidth="1.5"/>
      <line x1="16" y1="16" x2="25" y2="22" stroke="white" strokeWidth="1.5"/>
    </svg>
  ),
  spark: (
    <svg viewBox="0 0 32 32" width="20" height="20">
      <rect width="32" height="32" rx="6" fill="#E25A1C"/>
      <path d="M16 5l3.5 7.5H27l-6 4.5 2 8L16 21l-7 4 2-8-6-4.5h7.5z" fill="rgba(255,255,255,0.95)"/>
    </svg>
  ),
  airflow: (
    <svg viewBox="0 0 32 32" width="20" height="20">
      <rect width="32" height="32" rx="6" fill="#017CEE"/>
      <circle cx="16" cy="16" r="5" fill="none" stroke="white" strokeWidth="2"/>
      <line x1="16" y1="5"  x2="16" y2="10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <line x1="16" y1="22" x2="16" y2="27" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <line x1="5"  y1="16" x2="10" y2="16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <line x1="22" y1="16" x2="27" y2="16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <line x1="9"  y1="9"  x2="12.5" y2="12.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="23" y1="9"  x2="19.5" y2="12.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="9"  y1="23" x2="12.5" y2="19.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="23" y1="23" x2="19.5" y2="19.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  dbt: (
    <svg viewBox="0 0 32 32" width="20" height="20">
      <rect width="32" height="32" rx="6" fill="#FF694B"/>
      <rect x="6"  y="7"  width="20" height="4" rx="1" fill="rgba(255,255,255,0.95)"/>
      <rect x="6"  y="14" width="13" height="4" rx="1" fill="rgba(255,255,255,0.95)"/>
      <rect x="6"  y="21" width="8"  height="4" rx="1" fill="rgba(255,255,255,0.95)"/>
    </svg>
  ),
  mlflow: (
    <svg viewBox="0 0 32 32" width="20" height="20">
      <rect width="32" height="32" rx="6" fill="#0194E2"/>
      <polyline points="5,24 10,12 16,20 21,10 27,24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  fastapi: (
    <svg viewBox="0 0 32 32" width="20" height="20">
      <rect width="32" height="32" rx="6" fill="#059669"/>
      <path d="M18 5L7 17h9l-3 10 13-14h-9z" fill="rgba(255,255,255,0.95)"/>
    </svg>
  ),
  nextjs: (
    <svg viewBox="0 0 32 32" width="20" height="20">
      <rect width="32" height="32" rx="6" fill="#0a0a0a"/>
      <circle cx="16" cy="16" r="9" fill="white"/>
      <path d="M19 22L13 13v8.5" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round"/>
      <line x1="13" y1="13" x2="18" y2="13" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  iceberg: (
    <svg viewBox="0 0 32 32" width="20" height="20">
      <rect width="32" height="32" rx="6" fill="#1a3a5c"/>
      <polygon points="16,5 26,16 6,16" fill="#7dd3fc" opacity="0.9"/>
      <polygon points="8,16 24,16 21,27 11,27" fill="#38bdf8" opacity="0.7"/>
    </svg>
  ),
}

// ─── Node card ────────────────────────────────────────────────────────────────

interface NodeData {
  label: string
  sublabel?: string
  logoKey: string
  url?: string
  status?: 'active' | 'idle' | 'grey'
  tag?: string
  animDelay?: number
  category?: string
  [key: string]: unknown
}

const categoryColor: Record<string, string> = {
  source:  '#4f46e5',
  ingest:  '#0891b2',
  storage: '#16a34a',
  transform: '#d97706',
  ml:      '#7c3aed',
  serve:   '#be185d',
}

function PipelineNode({ data }: NodeProps) {
  const nd = data as NodeData
  const isGrey   = nd.status === 'grey'
  const isActive = nd.status === 'active'
  const color    = categoryColor[nd.category ?? 'source'] ?? '#4f46e5'

  const handleClick = () => {
    if (nd.url && !isGrey) window.open(nd.url, '_blank')
  }

  return (
    <div
      className={`df-node ${isActive ? 'active' : ''} ${isGrey ? 'greyed' : ''}`}
      style={{ animationDelay: `${(nd.animDelay ?? 0) * 40}ms` }}
      onClick={handleClick}
      title={isGrey ? 'Available in full profile' : nd.url ? `Open ${nd.label}` : nd.label}
    >
      <Handle type="target" position={Position.Left}   id="in"  />
      <Handle type="source" position={Position.Right}  id="out" />
      <Handle type="target" position={Position.Top}    id="top-in"      />
      <Handle type="source" position={Position.Bottom} id="bottom-out"  />

      {/* Category accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 14, right: 14, height: 2,
        borderRadius: '0 0 2px 2px',
        background: isActive
          ? `linear-gradient(90deg, transparent, ${color}, transparent)`
          : 'transparent',
        transition: 'background 200ms ease-out',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        {/* Logo */}
        <div style={{
          flexShrink: 0,
          width: 38, height: 38,
          borderRadius: 10,
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-hairline)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          {logos[nd.logoKey] ?? <span style={{ fontSize: 16 }}>◈</span>}
        </div>

        {/* Text */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: 12.5,
            color: 'var(--ink-primary)',
            lineHeight: 1.25,
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
          }}>{nd.label}</div>
          {nd.sublabel && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: 'var(--ink-tertiary)',
              marginTop: 2,
              letterSpacing: '0.03em',
              whiteSpace: 'nowrap',
            }}>{nd.sublabel}</div>
          )}
        </div>

        {/* Status dot */}
        {!isGrey && (
          <div style={{
            marginLeft: 'auto',
            flexShrink: 0,
            position: 'relative',
            width: 8, height: 8,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isActive ? '#16a34a' : 'var(--ink-ghost)',
              boxShadow: isActive ? '0 0 0 2px rgba(22,163,74,0.2)' : 'none',
            }} />
            {isActive && (
              <div style={{
                position: 'absolute', inset: -2,
                borderRadius: '50%',
                border: '1.5px solid rgba(22,163,74,0.3)',
                animation: 'pulse-ring 2s ease-out infinite',
              }} />
            )}
          </div>
        )}
      </div>

      {nd.tag && (
        <div style={{
          marginTop: 10,
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          borderRadius: 5,
          background: `${color}12`,
          border: `1px solid ${color}28`,
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color,
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
          fontWeight: 500,
        }}>
          {nd.tag}
        </div>
      )}
    </div>
  )
}

// ─── Layer label ──────────────────────────────────────────────────────────────

function LayerLabel({ data }: NodeProps) {
  const d = data as { label: string; [key: string]: unknown }
  return (
    <div style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 9,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      color: 'var(--ink-ghost)',
      padding: '3px 0',
      pointerEvents: 'none',
      userSelect: 'none',
    }}>
      {d.label}
    </div>
  )
}

// ─── Silk thread edge ─────────────────────────────────────────────────────────

function SilkEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  const seed     = parseInt(id.replace(/\D/g, '').slice(0, 4) || '999', 10)
  const dur1     = 2.2 + (seed % 1400) / 1000
  const dur2     = dur1 * 1.35
  const delay1   = (seed % 3000) / 1000
  const delay2   = ((seed * 11) % 2500) / 1000

  return (
    <g>
      {/* Shadow/halo */}
      <path d={edgePath} fill="none" stroke="rgba(79,70,229,0.04)" strokeWidth={6} />

      {/* Base line */}
      <path d={edgePath} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={1.5} />

      {/* Animated silk dashes */}
      <path
        d={edgePath}
        fill="none"
        stroke="rgba(79,70,229,0.5)"
        strokeWidth={1.5}
        strokeDasharray="5 9"
        style={{
          animation: `silk-flow ${dur1}s linear infinite`,
          animationDelay: `${delay1}s`,
        }}
      />

      {/* Droplet 1 — larger, brighter */}
      <circle r={3.5} fill="#4f46e5" style={{ filter: 'drop-shadow(0 0 4px rgba(79,70,229,0.7))' }}>
        <animateMotion dur={`${dur1 * 1.2}s`} repeatCount="indefinite" begin={`${delay1}s`} path={edgePath} />
        <animate attributeName="opacity" values="0;1;1;0" dur={`${dur1 * 1.2}s`} repeatCount="indefinite" begin={`${delay1}s`} />
        <animate attributeName="r" values="2;3.5;2" dur={`${dur1 * 1.2}s`} repeatCount="indefinite" begin={`${delay1}s`} />
      </circle>

      {/* Droplet 2 — smaller, trailing */}
      <circle r={2} fill="#818cf8" style={{ filter: 'drop-shadow(0 0 3px rgba(129,140,248,0.6))' }}>
        <animateMotion dur={`${dur2}s`} repeatCount="indefinite" begin={`${delay2}s`} path={edgePath} />
        <animate attributeName="opacity" values="0;0.7;0.7;0" dur={`${dur2}s`} repeatCount="indefinite" begin={`${delay2}s`} />
      </circle>
    </g>
  )
}

const nodeTypes = { pipeline: PipelineNode, layer: LayerLabel }
const edgeTypes = { silk: SilkEdge }

// ─── Graph data ───────────────────────────────────────────────────────────────

function buildGraph() {
  const nodes: Node[] = [
    // Layer labels
    { id: 'lbl-src',  type: 'layer', position: { x:  50, y: 18 }, data: { label: 'Sources'   }, draggable: false },
    { id: 'lbl-ing',  type: 'layer', position: { x: 300, y: 18 }, data: { label: 'Ingest'    }, draggable: false },
    { id: 'lbl-brz',  type: 'layer', position: { x: 560, y: 18 }, data: { label: 'Bronze'    }, draggable: false },
    { id: 'lbl-slv',  type: 'layer', position: { x: 800, y: 18 }, data: { label: 'Silver'    }, draggable: false },
    { id: 'lbl-gld',  type: 'layer', position: { x:1040, y: 18 }, data: { label: 'Gold'      }, draggable: false },
    { id: 'lbl-ml',   type: 'layer', position: { x:1280, y: 18 }, data: { label: 'ML'        }, draggable: false },
    { id: 'lbl-srv',  type: 'layer', position: { x:1520, y: 18 }, data: { label: 'Serving'   }, draggable: false },

    // Sources
    {
      id: 'postgres', type: 'pipeline', position: { x: 20, y: 100 },
      data: { label: 'PostgreSQL', sublabel: ':5432 · OLTP', logoKey: 'postgres', status: 'active', tag: 'batch', category: 'source', animDelay: 0 },
    },
    {
      id: 'kafka', type: 'pipeline', position: { x: 20, y: 260 },
      data: { label: 'Apache Kafka', sublabel: 'KRaft · :9092', logoKey: 'kafka', url: 'http://localhost:8080', status: 'active', tag: 'streaming', category: 'source', animDelay: 1 },
    },

    // Ingest
    {
      id: 'airflow', type: 'pipeline', position: { x: 270, y: 100 },
      data: { label: 'Apache Airflow', sublabel: 'standalone · :8082', logoKey: 'airflow', url: 'http://localhost:8082', status: 'active', category: 'ingest', animDelay: 2 },
    },
    {
      id: 'spark', type: 'pipeline', position: { x: 270, y: 260 },
      data: { label: 'Apache Spark', sublabel: 'local[2] · :4040', logoKey: 'spark', url: 'http://localhost:4040', status: 'active', category: 'ingest', animDelay: 3 },
    },

    // Bronze
    {
      id: 'bronze', type: 'pipeline', position: { x: 530, y: 182 },
      data: { label: 'Iceberg Bronze', sublabel: '4 tables · raw', logoKey: 'iceberg', status: 'active', tag: 'hadoop catalog', category: 'storage', animDelay: 4 },
    },

    // Silver
    {
      id: 'dbt-silver', type: 'pipeline', position: { x: 760, y: 100 },
      data: { label: 'dbt', sublabel: 'silver · clean', logoKey: 'dbt', status: 'active', category: 'transform', animDelay: 5 },
    },
    {
      id: 'silver', type: 'pipeline', position: { x: 760, y: 260 },
      data: { label: 'Iceberg Silver', sublabel: '3 tables · clean', logoKey: 'iceberg', status: 'active', category: 'storage', animDelay: 6 },
    },

    // Gold
    {
      id: 'dbt-gold', type: 'pipeline', position: { x: 1000, y: 100 },
      data: { label: 'dbt', sublabel: 'gold · features', logoKey: 'dbt', status: 'active', category: 'transform', animDelay: 7 },
    },
    {
      id: 'gold', type: 'pipeline', position: { x: 1000, y: 260 },
      data: { label: 'Iceberg Gold', sublabel: '2 tables · features', logoKey: 'iceberg', status: 'active', category: 'storage', animDelay: 8 },
    },

    // ML
    {
      id: 'mlflow', type: 'pipeline', position: { x: 1240, y: 182 },
      data: { label: 'MLflow', sublabel: 'registry · :5001', logoKey: 'mlflow', url: 'http://localhost:5001', status: 'active', tag: 'PyTorch', category: 'ml', animDelay: 9 },
    },

    // Serving
    {
      id: 'fastapi', type: 'pipeline', position: { x: 1490, y: 100 },
      data: { label: 'FastAPI', sublabel: '/predict · :8001', logoKey: 'fastapi', url: 'http://localhost:8001/docs', status: 'active', category: 'serve', animDelay: 10 },
    },
    {
      id: 'ui', type: 'pipeline', position: { x: 1490, y: 260 },
      data: { label: 'Lineage UI', sublabel: 'Next.js · :3000', logoKey: 'nextjs', url: 'http://localhost:3000', status: 'active', tag: 'you are here', category: 'serve', animDelay: 11 },
    },
  ]

  const e = (id: string, source: string, target: string, sh = 'out', th = 'in'): Edge => ({
    id, source, target, sourceHandle: sh, targetHandle: th,
    type: 'silk',
    markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: 'rgba(79,70,229,0.4)' },
  })

  const edges: Edge[] = [
    e('e1',  'postgres',   'airflow'),
    e('e2',  'kafka',      'spark'),
    e('e3',  'airflow',    'bronze'),
    e('e4',  'spark',      'bronze'),
    e('e5',  'bronze',     'dbt-silver'),
    e('e6',  'dbt-silver', 'silver'),
    e('e7',  'silver',     'dbt-gold'),
    e('e8',  'dbt-gold',   'gold'),
    e('e9',  'gold',       'mlflow'),
    e('e10', 'mlflow',     'fastapi'),
    e('e11', 'fastapi',    'ui'),
  ]

  return { nodes, edges }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function LineageGraph() {
  const { nodes: init, edges: initE } = buildGraph()
  const [nodes, , onNodesChange] = useNodesState(init)
  const [edges, , onEdgesChange] = useEdgesState(initE)

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes as never}
        fitView
        fitViewOptions={{ padding: 0.14, maxZoom: 1.05 }}
        minZoom={0.25}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="rgba(0,0,0,0.07)" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={() => 'rgba(79,70,229,0.2)'}
          maskColor="rgba(247,245,242,0.88)"
          style={{ bottom: 68, right: 14 }}
        />
      </ReactFlow>
    </div>
  )
}
