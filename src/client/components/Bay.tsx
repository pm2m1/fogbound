import { memo, useMemo, type KeyboardEvent } from 'react';
import { CELLS, LOST, N, RETURNED, tracePath } from '../../shared/beam';
import type { Lamp, Run } from '../../shared/api';
import { fogTexture } from '../lib/fogTexture';
import {
  ALL_PORTS,
  PAIR_COLORS,
  UNITS,
  cellXY,
  lampName,
  lampXY,
  pointXY,
} from '../lib/geometry';

export type Flash = { port: number; outcome: number; key: number };

type Marker = {
  kind: 'lost' | 'returned' | 'pair';
  pair: number;
  partner?: number;
};

/** Number every landed beam; both ends share the number. */
export const markersFor = (shots: Run['shots']): Map<number, Marker> => {
  const m = new Map<number, Marker>();
  let pair = 0;
  for (const s of shots) {
    if (s.outcome === LOST) m.set(s.port, { kind: 'lost', pair: -1 });
    else if (s.outcome === RETURNED)
      m.set(s.port, { kind: 'returned', pair: -1 });
    else {
      pair++;
      m.set(s.port, { kind: 'pair', pair, partner: s.outcome });
      if (!m.has(s.outcome))
        m.set(s.outcome, { kind: 'pair', pair, partner: s.port });
    }
  }
  return m;
};

export const pairColor = (pair: number) =>
  PAIR_COLORS[(pair - 1) % PAIR_COLORS.length]!;

const onKey = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

/** inward unit direction for a lamp */
const inward = (port: number): [number, number] => {
  const side = Math.floor(port / N);
  return side === 0
    ? [0, 1]
    : side === 1
      ? [-1, 0]
      : side === 2
        ? [0, -1]
        : [1, 0];
};

/* ------------------------------------------------------------------ */

const Fog = memo(
  ({ thin, clear }: { thin: boolean; clear: Uint8Array | null }) => {
    const tex = fogTexture();
    return (
      <>
        <defs>
          <filter id="clearBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.1" />
          </filter>
          <mask
            id="fogMask"
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="10"
            height="10"
          >
            <rect x="0" y="0" width="10" height="10" fill="white" />
            <g filter="url(#clearBlur)">
              {Array.from({ length: N * N }, (_, c) => {
                const [x, y] = cellXY(c);
                return (
                  <rect
                    key={c}
                    className={`clear-cell ${clear?.[c] ? 'on' : ''}`}
                    x={x - 0.02}
                    y={y - 0.02}
                    width={1.04}
                    height={1.04}
                    fill="black"
                  />
                );
              })}
            </g>
          </mask>
        </defs>
        <g
          className={`fog ${thin ? 'fog-thin' : ''}`}
          pointerEvents="none"
          clipPath="url(#water)"
          mask="url(#fogMask)"
        >
          <rect className="fog-base" x="1" y="1" width={N} height={N} />
          {tex ? (
            <>
              <image
                className="fog-layer l1"
                href={tex}
                x="-1"
                y="-1"
                width="12"
                height="12"
                preserveAspectRatio="none"
              />
              <image
                className="fog-layer l2"
                href={tex}
                x="-1.5"
                y="-1.5"
                width="13"
                height="13"
                preserveAspectRatio="none"
                transform="rotate(90 5 5)"
              />
            </>
          ) : (
            <ellipse cx="5" cy="5" rx="4.2" ry="2.6" fill="url(#fogPuff)" />
          )}
          <rect x="1" y="1" width={N} height={N} fill="url(#vignette)" />
        </g>
      </>
    );
  }
);
Fog.displayName = 'Fog';

const Rock = ({ cell, delay }: { cell: number; delay: number }) => {
  const [x, y] = cellXY(cell);
  return (
    <g
      transform={`translate(${x + 0.5} ${y + 0.5})`}
      className="rock"
      style={{ animationDelay: `${delay}ms` }}
    >
      <ellipse
        className="foam"
        rx=".44"
        ry=".2"
        cy=".22"
        fill="none"
        stroke="#d6eef8"
        strokeWidth=".04"
        strokeDasharray=".09 .07"
        opacity=".7"
      />
      <path
        d="M-.34 .2 L-.31 -.06 L-.14 -.3 L.08 -.34 L.3 -.12 L.35 .12 L.2 .26 L-.12 .28 Z"
        fill="#3b4652"
      />
      <path d="M-.31 -.06 L-.14 -.3 L.08 -.34 L.02 -.08 Z" fill="#6e7f8e" />
      <path d="M.08 -.34 L.3 -.12 L.12 -.02 L.02 -.08 Z" fill="#53626f" />
      <path d="M-.12 .28 L.2 .26 L.35 .12 L.1 .08 Z" fill="#2b343d" />
    </g>
  );
};

const RockRing = ({ cell }: { cell: number }) => {
  const [x, y] = cellXY(cell);
  return (
    <rect
      x={x + 0.04}
      y={y + 0.04}
      width=".92"
      height=".92"
      rx=".18"
      fill="none"
      stroke="#a6e36b"
      strokeWidth=".06"
      strokeDasharray=".12 .08"
      pointerEvents="none"
    />
  );
};

const Buoy = ({
  cell,
  state,
}: {
  cell: number;
  state: 'plain' | 'right' | 'wrong';
}) => {
  const [x, y] = cellXY(cell);
  return (
    <g transform={`translate(${x + 0.5} ${y + 0.55})`} pointerEvents="none">
      <g className={`buoy ${state}`}>
        <ellipse
          className="ripple"
          cy=".18"
          rx=".3"
          ry=".09"
          fill="none"
          stroke="#9fd0e6"
          strokeWidth=".03"
        />
        <ellipse cy=".18" rx=".22" ry=".06" fill="#08121b" opacity=".55" />
        <path
          d="M-.2 .1 A.2 .2 0 0 1 .2 .1 L.16 .16 L-.16 .16 Z"
          fill="#e8513d"
        />
        <path d="M-.19 .02 L.19 .02 L.2 .09 L-.2 .09 Z" fill="#f6efe6" />
        <rect x="-.02" y="-.38" width=".04" height=".22" fill="#cfd8de" />
        <circle cy="-.4" r=".07" fill="#ffd27a" className="buoy-light" />
      </g>
      {state !== 'plain' && (
        <g
          transform={
            state === 'right'
              ? 'translate(.3 -.5) scale(1.4)'
              : 'translate(.25 -.28)'
          }
        >
          <circle
            r=".15"
            fill={state === 'right' ? '#a6e36b' : '#ff6b5e'}
            stroke="#0d1822"
            strokeWidth=".03"
          />
          <text
            y=".055"
            textAnchor="middle"
            fontSize=".2"
            fontWeight="800"
            fill="#0f1a24"
          >
            {state === 'right' ? '✓' : '✗'}
          </text>
        </g>
      )}
    </g>
  );
};

/** A small lighthouse lantern. dark = unlit, lit = burning with another keeper's oil. */
const Lantern = ({ lit }: { lit: boolean }) => (
  <g className="lantern">
    <path
      d="M-.13 -.24 L0 -.33 L.13 -.24 Z"
      fill={lit ? '#e8513d' : '#2c4458'}
    />
    <rect
      x="-.15"
      y="-.24"
      width=".3"
      height=".36"
      rx=".07"
      fill={lit ? '#ffcf73' : '#14263a'}
      stroke={lit ? '#fff0c9' : '#4f7189'}
      strokeWidth=".045"
    />
    {lit ? (
      <path
        className="flame"
        d="M0 .06 C-.07 .0 -.05 -.08 0 -.15 C.05 -.08 .07 0 0 .06 Z"
        fill="#fff6dc"
      />
    ) : (
      <line
        x1="-.15"
        y1="-.06"
        x2=".15"
        y2="-.06"
        stroke="#4f7189"
        strokeWidth=".03"
      />
    )}
    <rect
      x="-.18"
      y=".12"
      width=".36"
      height=".07"
      rx=".03"
      fill={lit ? '#c98a2c' : '#2c4458'}
    />
  </g>
);

const MarkerBadge = ({ mk, fresh }: { mk: Marker; fresh: boolean }) => {
  const ring =
    mk.kind === 'pair'
      ? pairColor(mk.pair)
      : mk.kind === 'lost'
        ? '#ff8a7a'
        : '#ffd27a';
  return (
    <g className={`marker ${fresh ? 'pop' : ''}`}>
      <circle r=".31" fill="#16293a" stroke={ring} strokeWidth=".06" />
      {mk.kind === 'pair' && (
        <text
          y=".115"
          textAnchor="middle"
          fontSize=".33"
          fontWeight="800"
          fill={ring}
        >
          {mk.pair}
        </text>
      )}
      {mk.kind === 'lost' && (
        <path
          d="M-.12 -.12 L.12 .12 M.12 -.12 L-.12 .12"
          stroke={ring}
          strokeWidth=".075"
          strokeLinecap="round"
        />
      )}
      {mk.kind === 'returned' && (
        <g fill="none" stroke={ring} strokeWidth=".065" strokeLinecap="round">
          <path d="M.13 .02 A.13 .13 0 1 1 .03 -.13" />
          <path d="M.03 -.13 L.1 -.2 M.03 -.13 L.11 -.07" />
        </g>
      )}
    </g>
  );
};

/* ------------------------------------------------------------------ */

type Props = {
  lamps: Lamp[];
  shots: Run['shots'];
  buoys: number[];
  selected?: number | null;
  /** reveal these rocks (fog lifts) */
  rocks?: number[] | null;
  /** draw true beam paths through these rocks without revealing them (practice fog) */
  pathRocks?: number[] | null;
  heat?: Record<string, number> | null;
  heatTotal?: number;
  showPaths?: boolean;
  flash?: Flash | null;
  interactive?: boolean;
  onLamp?: (port: number) => void;
  onCell?: (cell: number) => void;
  /** theory check: does the player's chart explain each beam they used? */
  checks?: Map<number, boolean> | null;
  /** show where the player's chart would send this lamp's beam */
  ghost?: number | null;
  /** pulse this lamp to draw the eye (tutorial) */
  beckon?: number | null;
  /** cells proven rock-free: the fog burns off there */
  clear?: Uint8Array | null;
  /** only draw true paths for the first N beams (guided practice) */
  pathLimit?: number;
  label: string;
};

export const Bay = ({
  lamps,
  shots,
  buoys,
  selected = null,
  rocks = null,
  pathRocks = null,
  heat = null,
  heatTotal = 0,
  showPaths = false,
  flash = null,
  interactive = false,
  onLamp,
  onCell,
  checks = null,
  ghost = null,
  beckon = null,
  clear = null,
  pathLimit = Infinity,
  label,
}: Props) => {
  const markers = useMemo(() => markersFor(shots), [shots]);
  const revealed = Boolean(rocks);
  const buoySet = useMemo(() => new Set(buoys), [buoys]);
  const rockSet = useMemo(() => new Set(rocks ?? []), [rocks]);
  const traceRocks = rocks ?? pathRocks;
  const paths = useMemo(
    () =>
      (showPaths || pathRocks) && traceRocks
        ? shots.slice(0, pathLimit).map((s) => ({
            s,
            pts: tracePath(s.port, traceRocks).path.map(pointXY),
          }))
        : [],
    [showPaths, pathRocks, traceRocks, shots, pathLimit]
  );
  const ghostPts = useMemo(
    () =>
      ghost !== null && !rocks
        ? tracePath(ghost, buoys).path.map(pointXY)
        : null,
    [ghost, buoys, rocks]
  );
  const heatMax = useMemo(
    () => Math.max(1, ...Object.values(heat ?? {})),
    [heat]
  );
  const freshPorts = useMemo(() => {
    if (!flash) return new Set<number>();
    return new Set([
      flash.port,
      ...(flash.outcome >= 0 ? [flash.outcome] : []),
    ]);
  }, [flash]);
  const aim = selected !== null && interactive ? selected : null;

  return (
    <svg
      className="bay"
      viewBox={`-0.15 -0.15 ${UNITS + 0.3} ${UNITS + 0.3}`}
      role="group"
      aria-label={label}
    >
      <defs>
        <clipPath id="water">
          <rect x="1" y="1" width={N} height={N} rx=".3" />
        </clipPath>
        <radialGradient id="fogPuff">
          <stop offset="0" stopColor="#c9d8e2" stopOpacity=".55" />
          <stop offset="1" stopColor="#b8cad6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="vignette" cx=".5" cy=".5" r=".7">
          <stop offset=".55" stopColor="#0b1823" stopOpacity="0" />
          <stop offset="1" stopColor="#0b1823" stopOpacity=".55" />
        </radialGradient>
        <radialGradient id="lampGlow">
          <stop offset="0" stopColor="#ffd27a" stopOpacity=".95" />
          <stop offset=".45" stopColor="#ffb547" stopOpacity=".35" />
          <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dullGlow">
          <stop offset="0" stopColor="#ff8a7a" stopOpacity=".8" />
          <stop offset="1" stopColor="#ff8a7a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="beamGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff4d6" />
          <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#173448" />
          <stop offset="1" stopColor="#0f2536" />
        </linearGradient>
        <pattern id="waves" width="1" height="1" patternUnits="userSpaceOnUse">
          <path
            d="M.12 .62 q.1 -.06 .2 0 t.2 0"
            stroke="#2d5470"
            strokeWidth=".025"
            fill="none"
            opacity=".7"
          />
        </pattern>
      </defs>

      {/* shore frame + water */}
      <rect
        x=".55"
        y=".55"
        width={N + 0.9}
        height={N + 0.9}
        rx=".55"
        fill="#0f1c27"
        stroke="#1e3446"
        strokeWidth=".04"
      />
      <rect x="1" y="1" width={N} height={N} rx=".3" fill="url(#sea)" />
      <rect
        x="1"
        y="1"
        width={N}
        height={N}
        rx=".3"
        fill="url(#waves)"
        className="waves"
        pointerEvents="none"
      />
      <g stroke="#26475e" strokeWidth=".018" opacity=".8" pointerEvents="none">
        {Array.from({ length: N - 1 }, (_, i) => (
          <g key={i}>
            <line x1={i + 2} y1="1" x2={i + 2} y2={N + 1} />
            <line x1="1" y1={i + 2} x2={N + 1} y2={i + 2} />
          </g>
        ))}
      </g>

      {/* aim: the straight line this lamp would follow if the bay were empty */}
      {aim !== null && (
        <line
          className="aimline"
          x1={lampXY(aim)[0] + 0.5}
          y1={lampXY(aim)[1] + 0.5}
          x2={lampXY(aim)[0] + 0.5 + inward(aim)[0] * (N + 1)}
          y2={lampXY(aim)[1] + 0.5 + inward(aim)[1] * (N + 1)}
          stroke="#ffe3a8"
          strokeWidth=".05"
          strokeDasharray=".1 .14"
          strokeLinecap="round"
          pointerEvents="none"
        />
      )}

      {/* crowd buoys heat (after charting): only cells that drew real attention */}
      {heat &&
        Array.from({ length: CELLS }, (_, c) => {
          const v = heat[String(c)] ?? 0;
          const pct = heatTotal ? Math.round((100 * v) / heatTotal) : 0;
          if (pct < 2) return null;
          const [x, y] = cellXY(c);
          return (
            <g key={c} pointerEvents="none">
              <rect
                x={x + 0.05}
                y={y + 0.05}
                width=".9"
                height=".9"
                rx=".14"
                fill="#ffb547"
                opacity={0.18 + 0.62 * Math.sqrt(v / heatMax)}
              />
              <text
                x={x + 0.5}
                y={y + 0.62}
                textAnchor="middle"
                fontSize=".27"
                fill="#1a1205"
                className="heat-num"
              >
                {pct}%
              </text>
            </g>
          );
        })}

      {revealed &&
        !heat &&
        [...rockSet].map((c, i) => (
          <Rock key={c} cell={c} delay={200 + i * 160} />
        ))}
      {revealed &&
        heat &&
        [...rockSet].map((c) => <RockRing key={c} cell={c} />)}

      {/* true beam paths (fog lifted, or practice fog) */}
      {paths.map(({ s, pts }, i) => {
        const mk = markers.get(s.port);
        const color =
          mk?.kind === 'pair'
            ? pairColor(mk.pair)
            : s.outcome === LOST
              ? '#ff8a7a'
              : '#ffd27a';
        return (
          <polyline
            key={s.port}
            className="truepath"
            style={{
              animationDelay: `${pathRocks && !rocks ? 250 : 500 + i * 260}ms`,
            }}
            points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth=".09"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
          />
        );
      })}

      {!heat &&
        buoys.map((c) => (
          <Buoy
            key={c}
            cell={c}
            state={revealed ? (rockSet.has(c) ? 'right' : 'wrong') : 'plain'}
          />
        ))}

      <Fog thin={revealed} clear={revealed ? null : clear} />

      {/* water tap targets */}
      {interactive &&
        Array.from({ length: CELLS }, (_, c) => {
          const [x, y] = cellXY(c);
          const r = Math.floor(c / N) + 1;
          const col = (c % N) + 1;
          return (
            <rect
              key={c}
              x={x}
              y={y}
              width="1"
              height="1"
              className="cell-hit"
              role="button"
              tabIndex={0}
              aria-pressed={buoySet.has(c)}
              aria-label={`Water row ${r} column ${col}${buoySet.has(c) ? ', buoy placed' : ''}`}
              onClick={() => onCell?.(c)}
              onKeyDown={onKey(() => onCell?.(c))}
            />
          );
        })}

      {ghostPts && (
        <polyline
          className="ghostpath"
          points={ghostPts.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke="#e9f3ff"
          strokeWidth=".07"
          strokeDasharray=".18 .12"
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}

      {/* the latest beam leaving its lamp */}
      {flash && <FlashBeam key={flash.key} flash={flash} markers={markers} />}

      {/* lamps on the shore */}
      {ALL_PORTS.map((p) => {
        const [x, y] = lampXY(p);
        const lamp = lamps[p];
        const mk = markers.get(p);
        const litByOthers = !mk && lamp && lamp.by !== null && lamp.fuel > 0;
        const isSel = selected === p;
        const state = mk ? mk.kind : litByOthers ? 'lit' : 'dark';
        const chk = checks?.get(p);
        const desc0 =
          mk?.kind === 'lost'
            ? 'beam lost'
            : mk?.kind === 'returned'
              ? 'beam came back'
              : mk?.kind === 'pair'
                ? `beam ${mk.pair}, pairs with ${lampName(mk.partner!)}`
                : litByOthers
                  ? `lit by ${lamp.by}, ${lamp.fuel} oil left`
                  : 'dark';
        const desc =
          chk === undefined
            ? desc0
            : `${desc0}, ${chk ? 'your chart explains it' : 'your chart does not explain it'}`;
        return (
          <g
            key={p}
            className={`lamp ${state} ${isSel ? 'selected' : ''} ${beckon === p ? 'beckon' : ''}`}
            transform={`translate(${x + 0.5} ${y + 0.5})`}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? `${lampName(p)}, ${desc}` : undefined}
            onClick={interactive ? () => onLamp?.(p) : undefined}
            onKeyDown={interactive ? onKey(() => onLamp?.(p)) : undefined}
          >
            <rect x="-.5" y="-.5" width="1" height="1" fill="transparent" />
            {(litByOthers || isSel || beckon === p) && (
              <circle r=".66" fill="url(#lampGlow)" className="glow" />
            )}
            {(isSel || beckon === p) && (
              <circle
                r=".44"
                fill="none"
                stroke="#ffe3a8"
                strokeWidth=".05"
                className="sel-ring"
              />
            )}
            {mk ? (
              <MarkerBadge mk={mk} fresh={freshPorts.has(p)} />
            ) : (
              <Lantern lit={Boolean(litByOthers) || isSel} />
            )}
            {checks?.has(p) && (
              <g transform="translate(.26 -.26)" className="check">
                <circle
                  r=".15"
                  fill={checks.get(p) ? '#a6e36b' : '#ff6b5e'}
                  stroke="#0d1822"
                  strokeWidth=".03"
                />
                <text
                  y=".055"
                  textAnchor="middle"
                  fontSize=".19"
                  fontWeight="800"
                  fill="#0d1822"
                >
                  {checks.get(p) ? '✓' : '✗'}
                </text>
              </g>
            )}
            {litByOthers && (
              <g className="fuel">
                {Array.from({ length: lamp.fuel }, (_, i) => (
                  <path
                    key={i}
                    transform={`translate(${-0.13 + i * 0.13} .4)`}
                    d="M0 -.06 C.035 -.02 .045 .01 .045 .025 A.045 .045 0 0 1 -.045 .025 C-.045 .01 -.035 -.02 0 -.06 Z"
                    fill="#ffd27a"
                  />
                ))}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
};

/**
 * The firing moment: the lamp charges, the beam plunges into the fog and the fog
 * ripples, then the light either bursts out of another lamp, dies on a rock, or
 * snaps back. The true path inside the fog stays secret.
 */
const FlashBeam = ({
  flash,
  markers,
}: {
  flash: Flash;
  markers: Map<number, Marker>;
}) => {
  const [x, y] = lampXY(flash.port);
  const [dx, dy] = inward(flash.port);
  const x0 = x + 0.5;
  const y0 = y + 0.5;
  const len = flash.outcome === RETURNED ? 1.4 : 2.8;
  const x1 = x0 + dx * len;
  const y1 = y0 + dy * len;
  const exit = flash.outcome >= 0 ? lampXY(flash.outcome) : null;
  const mk = markers.get(flash.port);
  const color = mk?.kind === 'pair' ? pairColor(mk.pair) : '#ffd27a';
  const [ex, ey] = exit ? [exit[0] + 0.5, exit[1] + 0.5] : [0, 0];
  const [odx, ody] = exit ? inward(flash.outcome).map((v) => -v) : [0, 0];
  return (
    <g pointerEvents="none" className="flashbeam">
      <circle
        className="charge"
        cx={x0}
        cy={y0}
        r=".55"
        fill="url(#lampGlow)"
      />
      <line
        className={`plunge ${flash.outcome === RETURNED ? 'back' : ''} ${flash.outcome === LOST ? 'dies' : ''}`}
        x1={x0}
        y1={y0}
        x2={x1}
        y2={y1}
        stroke="#fff0c9"
        strokeWidth=".2"
        strokeLinecap="round"
        pathLength={1}
      />
      <circle
        className="fog-ripple"
        cx={x0 + dx * 1.1}
        cy={y0 + dy * 1.1}
        r=".5"
        fill="none"
        stroke="#e6f1f7"
        strokeWidth=".05"
      />
      {exit && (
        <>
          <circle
            className="burst"
            cx={ex}
            cy={ey}
            r=".75"
            fill="url(#lampGlow)"
          />
          <circle
            className="burst-ring"
            cx={ex}
            cy={ey}
            r=".45"
            fill="none"
            stroke={color}
            strokeWidth=".07"
          />
          <line
            className="escape"
            x1={ex}
            y1={ey}
            x2={ex + odx! * 1.1}
            y2={ey + ody! * 1.1}
            stroke={color}
            strokeWidth=".14"
            strokeLinecap="round"
            pathLength={1}
          />
        </>
      )}
      {flash.outcome === LOST && (
        <circle className="thud" cx={x1} cy={y1} r=".6" fill="url(#dullGlow)" />
      )}
      {flash.outcome === RETURNED && (
        <circle
          className="bounce-ring"
          cx={x0}
          cy={y0}
          r=".45"
          fill="none"
          stroke="#ffd27a"
          strokeWidth=".07"
        />
      )}
    </g>
  );
};
