import { useEffect, useState } from "react";
import {
  getReadingProgress,
  markDayCompleted,
  resetPlan,
} from "@/lib/readingPlanService";
import { useAuth } from "@/context/AuthContext";

export function useReadingPlan(planId: string) {
  const { user } = useAuth();
  const [completedDays, setCompletedDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    getReadingProgress(user.id, planId)
      .then((rows) => {
        setCompletedDays(rows.map((r: any) => r.day_number));
      })
      .finally(() => setLoading(false));
  }, [user, planId]);

  async function completeDay(day: number) {
    if (!user || completedDays.includes(day)) return;

    await markDayCompleted(user.id, planId, day);
    setCompletedDays((prev) => [...prev, day]);
  }

  async function reset() {
    if (!user) return;

    await resetPlan(user.id, planId);
    setCompletedDays([]);
  }

  return {
    completedDays,
    completeDay,
    reset,
    loading,
  };
}