import { Suspense } from "react";

import { BenchmarkDetail } from "@/components/benchmarks/benchmark-detail";
import { PageSkeleton } from "@/components/states";

export const metadata = { title: "Benchmark" };

export default function BenchmarkPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BenchmarkDetail />
    </Suspense>
  );
}
