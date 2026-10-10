import Link from "next/link";
import { CompassIcon } from "lucide-react";

import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
      <EmptyState icon={<CompassIcon />} title="Page not found" description="This page doesn't exist, or the run or benchmark was deleted.">
        <Button asChild>
          <Link href="/">Back to overview</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
