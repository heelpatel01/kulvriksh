// Decorative family-tree illustration for the public site (sample names, not real people).
const NODES = [
  { x: 120, y: 30, label: 'Harilal', sub: '1921' },
  { x: 280, y: 30, label: 'Kamla', sub: '1926' },
  { x: 60, y: 130, label: 'Ramesh', sub: '1948' },
  { x: 200, y: 130, label: 'Savita', sub: '1952' },
  { x: 340, y: 130, label: 'Pravin', sub: '1951' },
  { x: 30, y: 230, label: 'Nikhil', sub: '1976' },
  { x: 150, y: 230, label: 'Asha', sub: '1979' },
  { x: 270, y: 230, label: 'Kiran', sub: '1982' },
  { x: 390, y: 230, label: 'Aarav', sub: '2008' },
];

const LINKS: Array<[number, number]> = [
  [0, 2],
  [1, 2],
  [0, 4],
  [2, 5],
  [2, 6],
  [3, 6],
  [2, 7],
  [5, 8],
];

const W = 96;
const H = 46;

export function TreeIllustration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 490 290" role="img" aria-label="Illustration of a three-generation family tree">
      <g stroke="#b9ae98" strokeWidth="1.5" fill="none">
        {LINKS.map(([from, to]) => {
          const a = NODES[from];
          const b = NODES[to];
          if (!a || !b) {
            return null;
          }
          const x1 = a.x + W / 2;
          const y1 = a.y + H;
          const x2 = b.x + W / 2;
          const y2 = b.y;
          const mid = (y1 + y2) / 2;
          return <path key={`${from}-${to}`} d={`M${x1} ${y1} V${mid} H${x2} V${y2}`} />;
        })}
      </g>
      {NODES.map((node, index) => (
        <g key={node.label} transform={`translate(${node.x} ${node.y})`}>
          <rect
            width={W}
            height={H}
            rx="10"
            fill={index === 6 ? '#1f4d3a' : '#ffffff'}
            stroke={index === 6 ? '#1f4d3a' : '#d8cfbd'}
          />
          <text
            x={W / 2}
            y="20"
            textAnchor="middle"
            fontSize="13"
            fontWeight="600"
            fontFamily="system-ui, sans-serif"
            fill={index === 6 ? '#fbf8f2' : '#1f1c17'}
          >
            {node.label}
          </text>
          <text
            x={W / 2}
            y="36"
            textAnchor="middle"
            fontSize="11"
            fontFamily="system-ui, sans-serif"
            fill={index === 6 ? '#dfe9e3' : '#6f675b'}
          >
            {node.sub}
          </text>
        </g>
      ))}
    </svg>
  );
}
