import { Suspense } from "react";

import { ArenaView } from "@/components/arena/arena-view";
import { PageSkeleton } from "@/components/states";

export const metadata = { title: "Arena" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ArenaView />
    </Suspense>
  );
}
