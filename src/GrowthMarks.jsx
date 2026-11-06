const path = (outline) =>
  outline
    .map(
      (points) =>
        `M${points.map(([x, y]) => `${x} ${y}`).join("L")}Z`,
    )
    .join("");

// Draws measured outlines and boxes in 4K frame coordinates.
export default function GrowthMarks({ plants, labelSize }) {
  return plants
    .filter((plant) => plant.box)
    .map((plant) => {
      const [x, y, width, height] = plant.box;
      return (
        <g key={plant.id} className="growth-marks">
          <path className="growth-outline" d={path(plant.outline)} />
          <rect
            className="growth-box"
            x={x}
            y={y}
            width={width}
            height={height}
          />
          <text x={x} y={y - labelSize * 0.45} fontSize={labelSize}>
            {plant.name}
            {plant.heightCm != null && `: ${Math.round(plant.heightCm)} cm`}
          </text>
        </g>
      );
    });
}
