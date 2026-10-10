import { Suspense } from "react";

import { PlaygroundView } from "@/components/playground/playground-view";
import { PageSkeleton } from "@/components/states";

export const metadata = { title: "Playground" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PlaygroundView />
    </Suspense>
  );
}
