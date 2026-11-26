import { useEffect, useRef } from 'react';
import type { BakedTrackData, PlayerTelemetry } from '../shared/types';

interface TrackMinimapProps {
  track: BakedTrackData;
  localPos: { x: number; z: number; yaw: number; color: string };
  remotes: PlayerTelemetry[];
}

export function TrackMinimap({ track, localPos, remotes }: TrackMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const pad = 16;
    const spanX = Math.max(1, track.maxX - track.minX);
    const spanZ = Math.max(1, track.maxZ - track.minZ);
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
    const offsetX = (w - spanX * scale) * 0.5 - track.minX * scale;
    const offsetZ = (h - spanZ * scale) * 0.5 - track.minZ * scale;

    const toX = (wx: number) => wx * scale + offsetX;
    const toY = (wz: number) => wz * scale + offsetZ;

    // Draw road first, then tunnels, then bridges on top so Figure-8 overpasses read cleanly
    const samples = track.samples;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const passes: Array<{ type: 'road' | 'tunnel' | 'bridge'; color: string; width: number }> = [
      { type: 'road', color: 'rgba(226, 232, 240, 0.58)', width: 5 },
      { type: 'tunnel', color: '#f59e0b', width: 5.5 },
      { type: 'bridge', color: '#38bdf8', width: 5.8 },
    ];

    for (const pass of passes) {
      ctx.strokeStyle = pass.color;
      ctx.lineWidth = pass.width;
      for (let i = 0; i < samples.length; i++) {
        const a = samples[i];
        if (a.segmentType !== pass.type) continue;
        const b = samples[(i + 1) % samples.length];
        ctx.beginPath();
        ctx.moveTo(toX(a.x), toY(a.z));
        ctx.lineTo(toX(b.x), toY(b.z));
        ctx.stroke();
      }
    }

    // Start/finish line marker
    const s0 = samples[0];
    ctx.beginPath();
    ctx.moveTo(toX(s0.x - s0.rx * 8), toY(s0.z - s0.rz * 8));
    ctx.lineTo(toX(s0.x + s0.rx * 8), toY(s0.z + s0.rz * 8));
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Remote cars
    for (const r of remotes) {
      ctx.beginPath();
      ctx.arc(toX(r.x), toY(r.z), 4.2, 0, Math.PI * 2);
      ctx.fillStyle = r.color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
    }

    // Local player directional marker
    const lx = toX(localPos.x);
    const ly = toY(localPos.z);
    ctx.save();
    ctx.translate(lx, ly);
    // yaw = atan2(tx, tz); canvas +Y is +Z, +X is +X
    ctx.rotate(-localPos.yaw);
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.lineTo(-4.5, -5);
    ctx.lineTo(4.5, -5);
    ctx.closePath();
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
    ctx.restore();
  }, [track, localPos, remotes]);

  return (
    <div
      className="rounded-lg border border-white/15 p-2"
      style={{ backgroundColor: 'rgba(11, 15, 23, 0.86)' }}
    >
      <canvas
        ref={canvasRef}
        width={156}
        height={132}
        className="block"
        aria-label="Track minimap"
      />
      <div className="mt-1 flex items-center justify-between px-1 text-[10px] font-medium text-slate-300">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 rounded-sm bg-sky-400" />
          Bridge
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 rounded-sm bg-amber-400" />
          Tunnel
        </span>
      </div>
    </div>
  );
}
