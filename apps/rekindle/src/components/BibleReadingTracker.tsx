import { useReadingPlan } from "@/hooks/useReadingPlan";
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  planId: string;
  totalDays: number;
}
export default function BibleReadingTracker({ planId, totalDays }: Props) {
  const { completedDays, completeDay, loading } = useReadingPlan(planId);

  if (loading) return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center justify-between border p-3 rounded">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-28 rounded" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {Array.from({ length: totalDays }).map((_, index) => {
        const day = index + 1;
        const completed = completedDays.includes(day);

        return (
          <div
            key={day}
            className="flex items-center justify-between border p-3 rounded"
          >
            <span>Day {day}</span>
            <button
              disabled={completed}
              onClick={() => completeDay(day)}
              className={`px-3 py-1 rounded ${
                completed ? "bg-green-600 text-white" : "bg-primary text-white"
              }`}
            >
              {completed ? "Completed" : "Mark Complete"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

