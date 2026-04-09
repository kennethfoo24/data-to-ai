'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
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
  getStraightPath,
  BaseEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import CatalogModal, { type ModalTarget } from './CatalogModal'

// ─── Logos ───────────────────────────────────────────────────────────────────

const logos: Record<string, React.ReactNode> = {
  postgres: (
    <svg viewBox="0 0 32 32" width="24" height="24">
      <circle cx="16" cy="16" r="14" fill="#336791"/>
      <ellipse cx="16" cy="12" rx="7" ry="4" fill="rgba(255,255,255,0.92)"/>
      <path d="M9 12v7a7 4 0 0014 0v-7" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5"/>
      <path d="M9 15.5a7 4 0 0014 0" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>
    </svg>
  ),
  kafka: (
    <svg viewBox="0 0 32 32" width="24" height="24">
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
    <svg viewBox="0 0 32 32" width="24" height="24">
      <rect width="32" height="32" rx="6" fill="#E25A1C"/>
      <path d="M16 5l3.5 7.5H27l-6 4.5 2 8L16 21l-7 4 2-8-6-4.5h7.5z" fill="rgba(255,255,255,0.95)"/>
    </svg>
  ),
  airflow: (
    <svg viewBox="0 0 32 32" width="24" height="24">
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
    <svg viewBox="0 0 32 32" width="24" height="24">
      <rect width="32" height="32" rx="6" fill="#FF694B"/>
      <rect x="6"  y="7"  width="20" height="4" rx="1" fill="rgba(255,255,255,0.95)"/>
      <rect x="6"  y="14" width="13" height="4" rx="1" fill="rgba(255,255,255,0.95)"/>
      <rect x="6"  y="21" width="8"  height="4" rx="1" fill="rgba(255,255,255,0.95)"/>
    </svg>
  ),
  mlflow: (
    <svg viewBox="0 0 32 32" width="24" height="24">
      <rect width="32" height="32" rx="6" fill="#0194E2"/>
      <polyline points="5,24 10,12 16,20 21,10 27,24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  fastapi: (
    <svg viewBox="0 0 32 32" width="24" height="24">
      <rect width="32" height="32" rx="6" fill="#059669"/>
      <path d="M18 5L7 17h9l-3 10 13-14h-9z" fill="rgba(255,255,255,0.95)"/>
    </svg>
  ),
  nextjs: (
    <svg viewBox="0 0 32 32" width="24" height="24">
      <rect width="32" height="32" rx="6" fill="#0a0a0a"/>
      <circle cx="16" cy="16" r="9" fill="white"/>
      <path d="M19 22L13 13v8.5" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round"/>
      <line x1="13" y1="13" x2="18" y2="13" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  iceberg: (
    <svg viewBox="0 0 32 32" width="24" height="24">
      <rect width="32" height="32" rx="6" fill="#1a3a5c"/>
      <polygon points="16,5 26,16 6,16" fill="#7dd3fc" opacity="0.9"/>
      <polygon points="8,16 24,16 21,27 11,27" fill="#38bdf8" opacity="0.7"/>
    </svg>
  ),
  minio: (
    <svg viewBox="0 0 32 32" width="24" height="24">
      <rect width="32" height="32" rx="6" fill="#C72C48"/>
      <path d="M7 22V10l9 6 9-6v12" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="16" cy="16" r="2.5" fill="white"/>
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
  onCatalogClick?: () => void
  [key: string]: unknown
}

const categoryColor: Record<string, string> = {
  source:    '#6366f1',
  ingest:    '#0891b2',
  storage:   '#16a34a',
  transform: '#f59e0b',
  ml:        '#8b5cf6',
  serve:     '#ec4899',
}

function PipelineNode({ data }: NodeProps) {
  const nd = data as NodeData
  const isGrey   = nd.status === 'grey'
  const isActive = nd.status === 'active'
  const color    = categoryColor[nd.category ?? 'source'] ?? '#6366f1'

  const handleClick = () => {
    if (nd.onCatalogClick && !isGrey) {
      ;(nd.onCatalogClick as () => void)()
    } else if (nd.url && !isGrey) {
      window.open(nd.url, '_blank')
    }
  }

  return (
    <div
      className={`df-node ${isActive ? 'active' : ''} ${isGrey ? 'greyed' : ''}`}
      style={{ animationDelay: `${(nd.animDelay ?? 0) * 45}ms` }}
      onClick={handleClick}
      title={nd.url ? `Open ${nd.label}` : nd.label}
    >
      <Handle type="target" position={Position.Left}   id="in"  />
      <Handle type="source" position={Position.Right}  id="out" />
      <Handle type="target" position={Position.Top}    id="top-in"     />
      <Handle type="source" position={Position.Bottom} id="bottom-out" />

      {/* Category accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 20, right: 20, height: 3,
        borderRadius: '0 0 2px 2px',
        background: isActive
          ? `linear-gradient(90deg, transparent, ${color}, transparent)`
          : 'transparent',
        transition: 'background 200ms ease-out',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        {/* Logo */}
        <div style={{
          flexShrink: 0,
          width: 46, height: 46,
          borderRadius: 12,
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-hairline)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(30,27,75,0.07)',
        }}>
          {logos[nd.logoKey] ?? <span style={{ fontSize: 20 }}>◈</span>}
        </div>

        {/* Text */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: 15,
            color: 'var(--ink-primary)',
            lineHeight: 1.25,
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
          }}>{nd.label}</div>
          {nd.sublabel && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--ink-tertiary)',
              marginTop: 3,
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
            }}>{nd.sublabel}</div>
          )}
        </div>

        {/* Status dot */}
        {!isGrey && (
          <div style={{
            flexShrink: 0,
            position: 'relative',
            width: 9, height: 9,
          }}>
            <div style={{
              width: 9, height: 9, borderRadius: '50%',
              background: isActive ? '#16a34a' : 'var(--ink-ghost)',
              boxShadow: isActive ? '0 0 0 2px rgba(22,163,74,0.22)' : 'none',
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
          marginTop: 11,
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 10px',
          borderRadius: 5,
          background: `${color}14`,
          border: `1px solid ${color}30`,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color,
          letterSpacing: '0.07em',
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
      fontSize: 10.5,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: 'var(--ink-secondary)',
      fontWeight: 500,
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

  const seed   = parseInt(id.replace(/\D/g, '').slice(0, 4) || '999', 10)
  const dur1   = 2.0 + (seed % 1400) / 1000
  const dur2   = dur1 * 1.35
  const delay1 = (seed % 2800) / 1000
  const delay2 = ((seed * 11) % 2200) / 1000

  return (
    <g>
      {/* Halo */}
      <path d={edgePath} fill="none" stroke="rgba(99,102,241,0.06)" strokeWidth={7} />

      {/* Base line */}
      <path d={edgePath} fill="none" stroke="rgba(99,102,241,0.16)" strokeWidth={1.5} />

      {/* Animated dashes */}
      <path
        d={edgePath}
        fill="none"
        stroke="rgba(99,102,241,0.48)"
        strokeWidth={1.5}
        strokeDasharray="5 9"
        style={{
          animation: `silk-flow ${dur1}s linear infinite`,
          animationDelay: `${delay1}s`,
        }}
      />

      {/* Droplet 1 — larger, bright indigo */}
      <circle r={3.5} fill="#6366f1" style={{ filter: 'drop-shadow(0 0 4px rgba(99,102,241,0.75))' }}>
        <animateMotion dur={`${dur1 * 1.2}s`} repeatCount="indefinite" begin={`${delay1}s`} path={edgePath} />
        <animate attributeName="opacity" values="0;1;1;0" dur={`${dur1 * 1.2}s`} repeatCount="indefinite" begin={`${delay1}s`} />
        <animate attributeName="r" values="2;3.5;2" dur={`${dur1 * 1.2}s`} repeatCount="indefinite" begin={`${delay1}s`} />
      </circle>

      {/* Droplet 2 — smaller, periwinkle */}
      <circle r={2} fill="#a5b4fc" style={{ filter: 'drop-shadow(0 0 3px rgba(165,180,252,0.65))' }}>
        <animateMotion dur={`${dur2}s`} repeatCount="indefinite" begin={`${delay2}s`} path={edgePath} />
        <animate attributeName="opacity" values="0;0.75;0.75;0" dur={`${dur2}s`} repeatCount="indefinite" begin={`${delay2}s`} />
      </circle>
    </g>
  )
}

// ─── Straight silk edge (for within-column vertical drops) ───────────────────

function SilkStraightEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY } = props
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY })

  const seed   = parseInt(id.replace(/\D/g, '').slice(0, 4) || '999', 10)
  const dur1   = 1.6 + (seed % 1000) / 1000
  const dur2   = dur1 * 1.3
  const delay1 = (seed % 2000) / 1000
  const delay2 = ((seed * 7) % 1800) / 1000

  return (
    <g>
      <path d={edgePath} fill="none" stroke="rgba(99,102,241,0.06)" strokeWidth={7} />
      <path d={edgePath} fill="none" stroke="rgba(99,102,241,0.16)" strokeWidth={1.5} />
      <path
        d={edgePath}
        fill="none"
        stroke="rgba(99,102,241,0.48)"
        strokeWidth={1.5}
        strokeDasharray="5 9"
        style={{ animation: `silk-flow ${dur1}s linear infinite`, animationDelay: `${delay1}s` }}
      />
      <circle r={3.5} fill="#6366f1" style={{ filter: 'drop-shadow(0 0 4px rgba(99,102,241,0.75))' }}>
        <animateMotion dur={`${dur1 * 1.2}s`} repeatCount="indefinite" begin={`${delay1}s`} path={edgePath} />
        <animate attributeName="opacity" values="0;1;1;0" dur={`${dur1 * 1.2}s`} repeatCount="indefinite" begin={`${delay1}s`} />
        <animate attributeName="r" values="2;3.5;2" dur={`${dur1 * 1.2}s`} repeatCount="indefinite" begin={`${delay1}s`} />
      </circle>
      <circle r={2} fill="#a5b4fc" style={{ filter: 'drop-shadow(0 0 3px rgba(165,180,252,0.65))' }}>
        <animateMotion dur={`${dur2}s`} repeatCount="indefinite" begin={`${delay2}s`} path={edgePath} />
        <animate attributeName="opacity" values="0;0.75;0.75;0" dur={`${dur2}s`} repeatCount="indefinite" begin={`${delay2}s`} />
      </circle>
    </g>
  )
}

const nodeTypes = { pipeline: PipelineNode, layer: LayerLabel }
const edgeTypes = { silk: SilkEdge, 'silk-straight': SilkStraightEdge }

// ─── Graph data ───────────────────────────────────────────────────────────────
//
// Layout: 7 columns — same horizontal footprint as original, but with
// clean connections. Key trick: dbt→storage edges within the same column
// use bottom-out → top-in (straight vertical drop), avoiding backward
// S-curves. Cross-column edges all move left→right.
//
//  Sources  Ingest   Bronze   Silver    Gold     ML    Serving
//  [PG]    [AFlow]           [dbt-s]  [dbt-g]         [FAPI]
//                   [mid]    [silver] [gold]   [mid]
//  [Kafka] [Spark]                                      [UI]
//

// Column x positions — 280px apart (218px node + 62px breathing room)
const COL = {
  src:  20,
  ing:  300,
  brz:  580,
  slv:  860,    // dbt-silver (top) + silver (bot) share this column
  gld:  1145,   // dbt-gold (top) + gold (bot) share this column
  ml:   1425,
  srv:  1705,
}

// Row y positions — 80px vertical gap between stacked nodes (~105px tall with tag)
const ROW = {
  top: 90,
  mid: 200,   // centred between top and bot row centres
  bot: 310,
}

function buildGraph() {
  const nodes: Node[] = [
    // ── Layer labels ──────────────────────────────────────────────
    { id: 'lbl-src', type: 'layer', position: { x: COL.src, y: 28 }, data: { label: 'Sources'  }, draggable: false },
    { id: 'lbl-ing', type: 'layer', position: { x: COL.ing, y: 28 }, data: { label: 'Ingest'   }, draggable: false },
    { id: 'lbl-brz', type: 'layer', position: { x: COL.brz, y: 28 }, data: { label: 'Bronze'   }, draggable: false },
    { id: 'lbl-slv', type: 'layer', position: { x: COL.slv, y: 28 }, data: { label: 'Silver'   }, draggable: false },
    { id: 'lbl-gld', type: 'layer', position: { x: COL.gld, y: 28 }, data: { label: 'Gold'     }, draggable: false },
    { id: 'lbl-ml',  type: 'layer', position: { x: COL.ml,  y: 28 }, data: { label: 'ML'       }, draggable: false },
    { id: 'lbl-srv', type: 'layer', position: { x: COL.srv, y: 28 }, data: { label: 'Serving'  }, draggable: false },

    // ── Sources ───────────────────────────────────────────────────
    {
      id: 'postgres', type: 'pipeline', position: { x: COL.src, y: ROW.top },
      data: { label: 'PostgreSQL', sublabel: ':5432 · OLTP', logoKey: 'postgres',
              url: 'http://localhost:5050', status: 'active', tag: 'batch',
              category: 'source', animDelay: 0 },
    },
    {
      id: 'kafka', type: 'pipeline', position: { x: COL.src, y: ROW.bot },
      data: { label: 'Apache Kafka', sublabel: 'KRaft · :9092', logoKey: 'kafka',
              url: 'http://localhost:8080', status: 'active', tag: 'streaming',
              category: 'source', animDelay: 1 },
    },

    // ── Ingest ────────────────────────────────────────────────────
    {
      id: 'airflow', type: 'pipeline', position: { x: COL.ing, y: ROW.top },
      data: { label: 'Apache Airflow', sublabel: 'standalone · :8082', logoKey: 'airflow',
              url: 'http://localhost:8082', status: 'active',
              category: 'ingest', animDelay: 2 },
    },
    {
      id: 'spark', type: 'pipeline', position: { x: COL.ing, y: ROW.bot },
      data: { label: 'Apache Spark', sublabel: 'local[2] · :4040', logoKey: 'spark',
              url: 'http://localhost:4040', status: 'active',
              category: 'ingest', animDelay: 3 },
    },

    // ── Bronze (centred between the two ingest rows) ──────────────
    {
      id: 'bronze', type: 'pipeline', position: { x: COL.brz, y: ROW.mid },
      data: { label: 'Iceberg Bronze', sublabel: '4 tables · raw', logoKey: 'iceberg',
              status: 'active', tag: 'hadoop catalog',
              category: 'storage', animDelay: 4 },
    },

    // ── Silver column: dbt on top, Iceberg below ──────────────────
    {
      id: 'dbt-silver', type: 'pipeline', position: { x: COL.slv, y: ROW.top },
      data: { label: 'dbt', sublabel: 'silver · clean', logoKey: 'dbt',
              status: 'active', category: 'transform', animDelay: 5 },
    },
    {
      id: 'silver', type: 'pipeline', position: { x: COL.slv, y: ROW.bot },
      data: { label: 'Iceberg Silver', sublabel: '3 tables · clean', logoKey: 'iceberg',
              status: 'active', category: 'storage', animDelay: 6 },
    },

    // ── Gold column: dbt on top, Iceberg below ────────────────────
    {
      id: 'dbt-gold', type: 'pipeline', position: { x: COL.gld, y: ROW.top },
      data: { label: 'dbt', sublabel: 'gold · features', logoKey: 'dbt',
              status: 'active', category: 'transform', animDelay: 7 },
    },
    {
      id: 'gold', type: 'pipeline', position: { x: COL.gld, y: ROW.bot },
      data: { label: 'Iceberg Gold', sublabel: '2 tables · features', logoKey: 'iceberg',
              status: 'active', category: 'storage', animDelay: 8 },
    },

    // ── ML (centred) ──────────────────────────────────────────────
    {
      id: 'mlflow', type: 'pipeline', position: { x: COL.ml, y: ROW.mid },
      data: { label: 'MLflow', sublabel: 'registry · :5001', logoKey: 'mlflow',
              url: 'http://localhost:5001', status: 'active', tag: 'PyTorch',
              category: 'ml', animDelay: 9 },
    },

    // ── Serving ───────────────────────────────────────────────────
    {
      id: 'fastapi', type: 'pipeline', position: { x: COL.srv, y: ROW.top },
      data: { label: 'FastAPI', sublabel: '/predict · :8001', logoKey: 'fastapi',
              url: 'http://localhost:8001/docs', status: 'active',
              category: 'serve', animDelay: 10 },
    },
    {
      id: 'ui', type: 'pipeline', position: { x: COL.srv, y: ROW.bot },
      data: { label: 'Lineage UI', sublabel: 'Next.js · :3000', logoKey: 'nextjs',
              url: 'http://localhost:3000', status: 'active', tag: 'you are here',
              category: 'serve', animDelay: 11 },
    },
  ]

  const e = (id: string, source: string, target: string, sh = 'out', th = 'in'): Edge => ({
    id, source, target, sourceHandle: sh, targetHandle: th,
    type: 'silk',
    markerEnd: { type: MarkerType.ArrowClosed, width: 11, height: 11, color: 'rgba(99,102,241,0.45)' },
  })

  const edges: Edge[] = [
    // Sources → Ingest  (same row — clean horizontal)
    e('e1', 'postgres', 'airflow'),
    e('e2', 'kafka',    'spark'),

    // Ingest → Bronze  (gentle diagonals converging to mid row)
    e('e3', 'airflow', 'bronze'),
    e('e4', 'spark',   'bronze'),

    // Bronze → dbt-silver  (slight upward diagonal — bronze is mid, dbt is top)
    e('e5', 'bronze', 'dbt-silver'),

    // dbt-silver → silver  (same column: straight vertical drop)
    { ...e('e6', 'dbt-silver', 'silver', 'bottom-out', 'top-in'), type: 'silk-straight' },

    // silver → dbt-gold  (silver is bot row, dbt-gold is top row of next col → flowing arc)
    e('e7', 'silver', 'dbt-gold'),

    // dbt-gold → gold  (same column: straight vertical drop)
    { ...e('e8', 'dbt-gold', 'gold', 'bottom-out', 'top-in'), type: 'silk-straight' },

    // gold → mlflow  (slight upward diagonal — gold is bot, mlflow is mid)
    e('e9', 'gold', 'mlflow'),

    // mlflow → fastapi  (slight upward diagonal — mlflow is mid, fastapi is top)
    e('e10', 'mlflow', 'fastapi'),

    // fastapi → ui  (same column: straight vertical drop)
    { ...e('e11', 'fastapi', 'ui', 'bottom-out', 'top-in'), type: 'silk-straight' },
  ]

  return { nodes, edges }
}

// ─── Catalog-clickable node IDs ───────────────────────────────────────────────

const CATALOG_NODES: Record<string, ModalTarget> = {
  bronze:     { nodeId: 'bronze',     label: 'Iceberg Bronze', layer: 'bronze', isDbt: false },
  silver:     { nodeId: 'silver',     label: 'Iceberg Silver', layer: 'silver', isDbt: false },
  gold:       { nodeId: 'gold',       label: 'Iceberg Gold',   layer: 'gold',   isDbt: false },
  'dbt-silver': { nodeId: 'dbt-silver', label: 'dbt · Silver',  layer: 'silver', isDbt: true  },
  'dbt-gold':   { nodeId: 'dbt-gold',   label: 'dbt · Gold',    layer: 'gold',   isDbt: true  },
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001'

// ─── Export ───────────────────────────────────────────────────────────────────

export default function LineageGraph() {
  const [modalTarget, setModalTarget] = useState<ModalTarget | null>(null)

  const openModal = useCallback((target: ModalTarget) => {
    setModalTarget(target)
  }, [])

  const { nodes: init, edges: initE } = buildGraph()

  const initWithHandlers = init.map(n => {
    const catalogTarget = CATALOG_NODES[n.id]
    if (!catalogTarget) return n
    return {
      ...n,
      data: {
        ...n.data,
        onCatalogClick: () => openModal(catalogTarget),
      },
    }
  })

  const [nodes, , onNodesChange] = useNodesState(initWithHandlers)
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
        fitViewOptions={{ padding: 0.12, maxZoom: 1.0 }}
        minZoom={0.2}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.3} color="rgba(99,102,241,0.10)" />
        <Controls showInteractive={false} />
      </ReactFlow>

      <CatalogModal
        target={modalTarget}
        onClose={() => setModalTarget(null)}
        apiUrl={API_URL}
      />
    </div>
  )
}
