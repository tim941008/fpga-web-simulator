import React from 'react';

interface SevenSegmentDisplayProps {
  slotLabel: string;
  portName: string;
  value: bigint;
  activeLow: boolean;
}

/**
 * Standard 7-segment display bit mapping:
 * Bit 0 = Segment A (Top)
 * Bit 1 = Segment B (Top Right)
 * Bit 2 = Segment C (Bottom Right)
 * Bit 3 = Segment D (Bottom)
 * Bit 4 = Segment E (Bottom Left)
 * Bit 5 = Segment F (Top Left)
 * Bit 6 = Segment G (Middle)
 */
export const SevenSegmentDisplay: React.FC<SevenSegmentDisplayProps> = ({
  slotLabel,
  portName,
  value,
  activeLow,
}) => {
  const isSegmentOn = (bit: number): boolean => {
    const rawBit = Number((value >> BigInt(bit)) & 1n);
    return activeLow ? rawBit === 0 : rawBit === 1;
  };

  const onColor = '#ef4444'; // Bright red LED segment
  const offColor = '#1e293b'; // Dim slate segment

  return (
    <div
      title={`${slotLabel} ← ${portName}[6:0]`}
      className="flex flex-col items-center bg-slate-950 border border-slate-800 rounded-lg p-2.5 shadow-inner min-w-[78px]"
    >
      <div className="text-[10px] font-mono text-slate-400 mb-1 flex items-center gap-1">
        <span className="font-semibold text-slate-200">{slotLabel}</span>
        <span className="text-slate-600">
          (0x{Number(value & 0x7fn).toString(16).toUpperCase().padStart(2, '0')})
        </span>
      </div>

      <svg
        width="54"
        height="82"
        viewBox="0 0 60 90"
        className="bg-black/80 rounded px-1.5 py-1 border border-slate-900"
      >
        {/* Segment A (0) */}
        <polygon
          points="14,8 46,8 42,14 18,14"
          fill={isSegmentOn(0) ? onColor : offColor}
          style={isSegmentOn(0) ? { filter: 'drop-shadow(0 0 4px #ef4444)' } : undefined}
        />
        {/* Segment B (1) */}
        <polygon
          points="48,10 52,42 46,40 43,15"
          fill={isSegmentOn(1) ? onColor : offColor}
          style={isSegmentOn(1) ? { filter: 'drop-shadow(0 0 4px #ef4444)' } : undefined}
        />
        {/* Segment C (2) */}
        <polygon
          points="51,46 47,78 41,73 45,48"
          fill={isSegmentOn(2) ? onColor : offColor}
          style={isSegmentOn(2) ? { filter: 'drop-shadow(0 0 4px #ef4444)' } : undefined}
        />
        {/* Segment D (3) */}
        <polygon
          points="12,80 45,80 40,74 17,74"
          fill={isSegmentOn(3) ? onColor : offColor}
          style={isSegmentOn(3) ? { filter: 'drop-shadow(0 0 4px #ef4444)' } : undefined}
        />
        {/* Segment E (4) */}
        <polygon
          points="10,46 16,48 13,73 7,78"
          fill={isSegmentOn(4) ? onColor : offColor}
          style={isSegmentOn(4) ? { filter: 'drop-shadow(0 0 4px #ef4444)' } : undefined}
        />
        {/* Segment F (5) */}
        <polygon
          points="13,10 19,15 16,40 9,42"
          fill={isSegmentOn(5) ? onColor : offColor}
          style={isSegmentOn(5) ? { filter: 'drop-shadow(0 0 4px #ef4444)' } : undefined}
        />
        {/* Segment G (6) */}
        <polygon
          points="16,44 20,40 43,40 47,44 42,48 19,48"
          fill={isSegmentOn(6) ? onColor : offColor}
          style={isSegmentOn(6) ? { filter: 'drop-shadow(0 0 4px #ef4444)' } : undefined}
        />
      </svg>

      {portName !== slotLabel && (
        <div className="mt-1 text-[9px] font-mono text-cyan-400/80 truncate max-w-[74px]">
          {portName}
        </div>
      )}
    </div>
  );
};
