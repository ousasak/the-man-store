import React from "react";

export default function ProductGridSkeleton({ count = 8, className = "mt-6" }) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="fs-card overflow-hidden">
          <div className="aspect-[4/5] bg-zinc-100 animate-pulse" />
          <div className="p-3 space-y-2">
            <div className="h-3 w-2/3 bg-zinc-100 animate-pulse rounded" />
            <div className="h-3 w-1/3 bg-zinc-100 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
