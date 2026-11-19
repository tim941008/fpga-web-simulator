import React from 'react';
import { LedColorTheme, SevenSegmentBitMap, SignalPolarity } from '../types/hardwareConfig';
import { isRawBitActive } from '../config/hardwareMapping';

interface SevenSegmentDisplayProps {
  label: string;
  signalName: string;
  value: bigint;
  width: number;
  polarity: SignalPolarity;
  segmentMap: SevenSegmentBitMap;
  showDecimalPoint: boolean;
  color: LedColorTheme;
  hasIssue?: boolean;
}

const COLOR_HEX: Record<LedColorTheme, string> = {
  rose: '#ef4444',
  emerald: '#34d399',
  amber: '#fbbf24',
  cyan: '#22d3ee',
  violet: '#a78bfa',
};

export const SevenSegmentDisplay: React.FC<SevenSegmentDisplayProps> = ({
  label,
  signalName,
  value,
  width,
  polarity,
  segmentMap,
  showDecimalPoint,
  color,
  hasIssue = false,
}) => {
  const isSegmentOn = (bitIdx: number | null): boolean => {
    if (bitIdx === null || bitIdx < 0 || bitIdx >= width) return false;
    return isRawBitActive(value, bitIdx, polarity);
  };

  const onColor = COLOR_HEX[color] ?? COLOR_HEX.rose;
  const offColor = '#1e293b';
  const mask = (1n << BigInt(Math.max(1, Math.min(64, width)))) - 1n;
  const maskedVal = value & mask;

  const glowStyle = (on: boolean) =>
    on ? { filter: `drop-shadow(0 0 4px ${onColor})` } : undefined;

  return (
    <div
      title={`${label} → ${signalName} (${polarity})`}
      className={`flex flex-col items-center bg-slate-950 border rounded-lg p-2.5 shadow-inner ${
        hasIssue ? 'border-amber-500/70' : 'border-slate-800'
      }`}
    >
      <div className="text-[10px] font-mono text-slate-400 mb-1 flex items-center gap-1">
        <span className="font-semibold text-slate-200">{label}</span>
        <span className="text-slate-500">
          (0x{maskedVal.toString(16).toUpperCase().padStart(2, '0')})
        </span>
      </div>

      <svg
        width="58"
        height="84"
        viewBox="0 0 64 90"
        className="bg-black/80 rounded px-1.5 py-1 border border-slate-900"
      >
        {/* Segment A */}
        <polygon
          points="14,8 46,8 42,14 18,14"
          fill={isSegmentOn(segmentMap.a) ? onColor : offColor}
          style={glowStyle(isSegmentOn(segmentMap.a))}
        />
        {/* Segment B */}
        <polygon
          points="48,10 52,42 46,40 43,15"
          fill={isSegmentOn(segmentMap.b) ? onColor : offColor}
          style={glowStyle(isSegmentOn(segmentMap.b))}
        />
        {/* Segment C */}
        <polygon
          points="51,46 47,78 41,73 45,48"
          fill={isSegmentOn(segmentMap.c) ? onColor : offColor}
          style={glowStyle(isSegmentOn(segmentMap.c))}
        />
        {/* Segment D */}
        <polygon
          points="12,80 45,80 40,74 17,74"
          fill={isSegmentOn(segmentMap.d) ? onColor : offColor}
          style={glowStyle(isSegmentOn(segmentMap.d))}
        />
        {/* Segment E */}
        <polygon
          points="10,46 16,48 13,73 7,78"
          fill={isSegmentOn(segmentMap.e) ? onColor : offColor}
          style={glowStyle(isSegmentOn(segmentMap.e))}
        />
        {/* Segment F */}
        <polygon
          points="13,10 19,15 16,40 9,42"
          fill={isSegmentOn(segmentMap.f) ? onColor : offColor}
          style={glowStyle(isSegmentOn(segmentMap.f))}
        />
        {/* Segment G */}
        <polygon
          points="16,44 20,40 43,40 47,44 42,48 19,48"
          fill={isSegmentOn(segmentMap.g) ? onColor : offColor}
          style={glowStyle(isSegmentOn(segmentMap.g))}
        />
        {/* Decimal Point (DP) */}
        {showDecimalPoint && (
          <circle
            cx="57"
            cy="77"
            r="3.5"
            fill={isSegmentOn(segmentMap.dp) ? onColor : offColor}
            style={glowStyle(isSegmentOn(segmentMap.dp))}
          />
        )}
      </svg>

      <div className="mt-1 text-[9px] font-mono text-slate-500 truncate max-w-[74px]">
        {signalName || 'unmapped'}
      </div>
    </div>
  );
};
