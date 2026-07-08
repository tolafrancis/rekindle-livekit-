import { useReadingPlan } from "@/hooks/useReadingPlan";

interface Props {
  planId: string;
  totalDays: number;
}
export default function BibleReadingTracker({ planId, totalDays }: Props) {
  const { completedDays, completeDay, loading } = useReadingPlan(planId);

  if (loading) return <p>Loading reading progress...</p>;

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

