import { Suspense } from "react";

import { BenchmarksView } from "@/components/benchmarks/benchmarks-view";
import { PageSkeleton } from "@/components/states";

export const metadata = { title: "Benchmarks" };

export default function BenchmarksPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BenchmarksView />
    </Suspense>
  );
}
