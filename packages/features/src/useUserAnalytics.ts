import { useEffect, useState } from 'react'
import { supabase } from '@rekindle/supabase'
import { useAuth } from './AuthContext'

interface UserAnalytics {
  booksCompleted: number     // "Books Completed"  → books finished from the Books feature
  prayersCompleted: number   // "Prayers Completed" → series + topics + watches completed
  xpPoints: number           // "Complete"         → devotionals completed (daily + library days)
  disciples: number          // "Followers"        → members of ministries this user owns/leads
}

const sumArrayLengths = (rows: any[] | null, field: string): number =>
  (rows ?? []).reduce(
    (sum, r) => sum + (Array.isArray(r?.[field]) ? r[field].length : 0),
    0
  )

export function useUserAnalytics() {
  const { user } = useAuth()
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    const uid = user.id
    let active = true

    // Isolate each metric so one failed query can't zero out the others.
    const safe = async (fn: () => Promise<number>): Promise<number> => {
      try { return await fn() } catch (e) { console.warn('[analytics] metric failed', e); return 0 }
    }

    const loadAnalytics = async () => {
      setLoading(true)

      const [booksCompleted, prayersCompleted, devotionalsComplete, followers] = await Promise.all([
        // "Books Completed" — books finished in the Books feature
        safe(async () => {
          const { count } = await supabase
            .from('user_book_progress')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', uid)
            .eq('is_completed', true)
          return count ?? 0
        }),

        // "Prayers Completed" — prayer series + prayer topics + prayer watches completed
        safe(async () => {
          const [seriesRes, topicsRes, watchesRes] = await Promise.all([
            // Prayer series completed: progress rows flagged as fully finished
            supabase
              .from('prayer_user_progress')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', uid)
              .eq('is_completed', true),
            // Prayer topics completed: prayer_history rows that are NOT prayer watches
            supabase
              .from('prayer_history')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', uid)
              .is('prayer_watch_topic', null),
            // Prayer watches completed: prayer_history rows tagged with a watch topic
            supabase
              .from('prayer_history')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', uid)
              .not('prayer_watch_topic', 'is', null),
          ])
          const seriesCompleted = seriesRes.count ?? 0
          const topicsCompleted = topicsRes.count ?? 0
          const watchesCompleted = watchesRes.count ?? 0
          return seriesCompleted + topicsCompleted + watchesCompleted
        }),

        // "Complete" — devotionals completed: daily devotionals + library days
        safe(async () => {
          const [dailyRes, libRes] = await Promise.all([
            supabase
              .from('devotional_progress')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', uid)
              .eq('completed', true),
            supabase
              .from('devotional_user_progress')
              .select('completed_days')
              .eq('user_id', uid),
          ])
          const daily = dailyRes.count ?? 0
          const library = sumArrayLengths(libRes.data, 'completed_days')
          return daily + library
        }),

        // "Followers" — members of ministries this user owns or leads (excluding self)
        safe(async () => {
          const { data: groups } = await supabase
            .from('ministry_groups')
            .select('member_count')
            .or(`owner_id.eq.${uid},leader_id.eq.${uid}`)
          const total = (groups ?? []).reduce(
            (sum, g: any) => sum + (g.member_count || 0),
            0
          )
          // member_count includes the leader themselves (set to 1 on creation)
          return Math.max(0, total - (groups?.length ?? 0))
        }),
      ])

      if (!active) return
      setAnalytics({
        booksCompleted: booksCompleted,
        prayersCompleted: prayersCompleted,
        xpPoints: devotionalsComplete,
        disciples: followers,
      })
      setLoading(false)
    }

    loadAnalytics()

    // Refresh on window focus and whenever a devotional/prayer is completed
    window.addEventListener('focus', loadAnalytics)
    window.addEventListener('streak:updated', loadAnalytics)

    return () => {
      active = false
      window.removeEventListener('focus', loadAnalytics)
      window.removeEventListener('streak:updated', loadAnalytics)
    }
  }, [user?.id])

  return { analytics, loading }
}
