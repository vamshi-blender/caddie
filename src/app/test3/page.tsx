'use client';

import { arc as d3Arc } from 'd3';

const TAU = Math.PI * 2;
const DEGREE = Math.PI / 180;

type ArcShape = {
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  fill: string;
  cornerRadius?: number;
  opacity?: number;
};

function arcPath({
  startAngle,
  endAngle,
  innerRadius,
  outerRadius,
  cornerRadius = 0,
}: Omit<ArcShape, 'fill' | 'opacity'>) {
  return (
    d3Arc()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(cornerRadius)
      .startAngle(startAngle)
      .endAngle(endAngle)() ?? ''
  );
}

// Chart 1: Horizontal Bar Chart - Stacked bars with stepped corners
function HorizontalBarChart() {
  const data = [
    { name: 'Noruega', width: 310, color: '#03045e', textColor: 'text-white' },
    { name: 'Australia', width: 280, color: '#023e8a', textColor: 'text-white' },
    { name: 'Suiza', width: 251, color: '#0077b6', textColor: 'text-white' },
    { name: 'PaÃ­ses Bajos', width: 224, color: '#0096c7', textColor: 'text-white' },
    { name: 'Estados Unidos', width: 195, color: '#00b4d8', textColor: 'text-black' },
    { name: 'Alemania', width: 187, color: '#48cae4', textColor: 'text-black' },
    { name: 'Nueva Zelanda', width: 133, color: '#8aebff', textColor: 'text-black' },
    { name: 'CanadÃ¡', width: 101, color: '#caf0f8', textColor: 'text-black' },
  ];

  return (
    <div className="flex flex-col gap-0">
      {data.map((item, idx) => (
        <div
          key={item.name}
          className={`flex items-center overflow-clip px-4 py-2.5 ${
            idx === 0 ? 'rounded-tl-[6px] rounded-tr-[6px]' : 'rounded-br-[6px]'
          } ${idx === data.length - 1 ? 'rounded-bl-[6px]' : ''}`}
          style={{
            backgroundColor: item.color,
            width: `${item.width}px`,
            height: '40px',
          }}
        >
          <p className={`text-sm font-medium whitespace-nowrap ${item.textColor}`}>
            {item.name}
          </p>
        </div>
      ))}
    </div>
  );
}

// Chart 2: Rounded Progress Bars
function ProgressBarsChart() {
  const data = [
    { filled: 160, total: 260 },
    { filled: 190, total: 260 },
    { filled: 175, total: 260 },
    { filled: 185, total: 260 },
    { filled: 180, total: 260 },
  ];

  return (
    <div className="flex flex-col gap-3">
      {data.map((item, idx) => (
        <div key={idx} className="relative h-5" style={{ width: `${item.total}px` }}>
          <div
            className="absolute top-0 left-0 h-5 rounded-full"
            style={{
              backgroundColor: '#ade8f4',
              width: `${item.total}px`,
            }}
          />
          <div
            className="absolute top-0 left-0 h-5 rounded-full"
            style={{
              backgroundColor: '#0077b6',
              width: `${item.filled}px`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

// Chart 3: Concentric Rings - rebuilt with D3 arc geometry
function ConcentricDonutChart() {
  const size = 208;
  const center = size / 2;
  const rings = [
    {
      track: '#f3f4f6',
      fill: '#03045e',
      innerRadius: 88,
      outerRadius: 104,
      startAngle: 212 * DEGREE,
      endAngle: 494 * DEGREE,
    },
    {
      track: '#f3f4f6',
      fill: '#0077b6',
      innerRadius: 68,
      outerRadius: 84,
      startAngle: 185 * DEGREE,
      endAngle: 452 * DEGREE,
    },
    {
      track: '#f3f4f6',
      fill: '#00b4d8',
      innerRadius: 48,
      outerRadius: 64,
      startAngle: 205 * DEGREE,
      endAngle: 420 * DEGREE,
    },
  ];

  return (
    <div className="flex items-center justify-center w-full" style={{ height: 280 }}>
      <div className="relative size-[208px]">
        <svg aria-hidden="true" className="size-full" viewBox={`0 0 ${size} ${size}`} fill="none">
          <g transform={`translate(${center} ${center})`}>
            {rings.map((ring, index) => (
              <g key={index}>
                <path
                  d={arcPath({
                    startAngle: -Math.PI / 2,
                    endAngle: -Math.PI / 2 + TAU - 0.001,
                    innerRadius: ring.innerRadius,
                    outerRadius: ring.outerRadius,
                    cornerRadius: 8,
                  })}
                  fill={ring.track}
                />
                <path
                  d={arcPath({
                    startAngle: ring.startAngle,
                    endAngle: ring.endAngle,
                    innerRadius: ring.innerRadius,
                    outerRadius: ring.outerRadius,
                    cornerRadius: 8,
                  })}
                  fill={ring.fill}
                />
              </g>
            ))}
          </g>
        </svg>

        <div className="absolute inset-[56px] flex items-center justify-center rounded-full bg-[#2c2c2c]">
          <span className="font-['Roboto',sans-serif] text-[24px] font-bold leading-none text-black">
            99%
          </span>
        </div>
      </div>
    </div>
  );
}

// Chart 4: Segmented Ring - rebuilt with D3 arc geometry
function SegmentedRingChart() {
  const size = 208;
  const center = size / 2;
  const segments: ArcShape[] = [
    {
      startAngle: -44 * DEGREE,
      endAngle: 42 * DEGREE,
      innerRadius: 52,
      outerRadius: 100,
      fill: '#1285c9',
      cornerRadius: 8,
    },
    {
      startAngle: 144 * DEGREE,
      endAngle: 236 * DEGREE,
      innerRadius: 52,
      outerRadius: 100,
      fill: '#1285c9',
      cornerRadius: 8,
    },
    {
      startAngle: 185 * DEGREE,
      endAngle: 229 * DEGREE,
      innerRadius: 52,
      outerRadius: 84,
      fill: '#06068a',
      cornerRadius: 8,
    },
    {
      startAngle: -90 * DEGREE,
      endAngle: 90 * DEGREE,
      innerRadius: 52,
      outerRadius: 96,
      fill: '#17b5dd',
      cornerRadius: 8,
    },
  ];

  return (
    <div className="flex items-center justify-center w-full" style={{ height: 280 }}>
      <div className="relative size-[208px]">
        <svg aria-hidden="true" className="size-full" viewBox={`0 0 ${size} ${size}`} fill="none">
          <circle cx={center} cy={center} r="65" fill="#b6b6b6" opacity="0.1" />
          <g transform={`translate(${center} ${center})`}>
            {segments.map((segment, index) => (
              <path
                key={index}
                d={arcPath(segment)}
                fill={segment.fill}
                opacity={segment.opacity}
              />
            ))}
          </g>
          <circle cx={center} cy={center} r="52" fill="#ffffff" />
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-['Roboto',sans-serif] text-[25px] font-medium leading-none text-black">
            73%
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ColorComparisonPage() {
  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <h1 className="mb-8 text-3xl font-bold text-white">Color Comparison - Charts</h1>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">Column 1: Reference Charts</h2>

          <div className="rounded-lg bg-gray-800 p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">List of countries</h3>
              <p className="text-sm text-gray-400">8 countries</p>
            </div>
            <HorizontalBarChart />
          </div>

          <div className="rounded-lg bg-gray-800 p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-white">Progress Indicators</h3>
            <ProgressBarsChart />
          </div>

          <div className="flex flex-col items-center rounded-lg bg-gray-800 p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-white">Concentric Rings</h3>
            <ConcentricDonutChart />
          </div>

          <div className="flex flex-col items-center rounded-lg bg-gray-800 p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-white">Segmented Donut</h3>
            <SegmentedRingChart />
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-white">Column 2: Custom Colors</h2>
          <div className="flex min-h-96 items-center justify-center rounded-lg bg-gray-800 p-6 shadow-lg">
            <p className="text-center text-gray-400">
              Column 2 with brand colors coming soon...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
