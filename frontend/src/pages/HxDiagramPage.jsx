import React from "react";
import HxDiagram from "../components/HxDiagram.jsx";

export default function HxDiagramPage() {
  return (
    <div className="px-2 md:px-4 py-4">
      <HxDiagram
        standalone={false}
        initialPressureKPa={95}
        initialTRange={[0, 50]}
        initialXmax={30}
        heightVh={70}
      />
    </div>
  );
}
