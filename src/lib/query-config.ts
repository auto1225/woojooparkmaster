/** TanStack Query 캐싱 전략 설정 */
export const CACHE_CONFIG = {
  // 거의 안 변함 → 오래 캐시
  codemaster: { staleTime: 60 * 60 * 1000 },       // 1시간
  systemConfig: { staleTime: 60 * 60 * 1000 },      // 1시간
  moduleLicenses: { staleTime: 30 * 60 * 1000 },    // 30분
  profiles: { staleTime: 10 * 60 * 1000 },           // 10분

  // 적당히 캐시
  parkingLots: { staleTime: 5 * 60 * 1000 },         // 5분
  surveys: { staleTime: 2 * 60 * 1000 },             // 2분
  equipment: { staleTime: 5 * 60 * 1000 },            // 5분

  // 자주 변함 → 짧게
  revenueDaily: { staleTime: 60 * 1000 },              // 1분
  complaints: { staleTime: 60 * 1000 },                 // 1분

  // 실시간 → 캐시 안함
  realtimeStatus: { staleTime: 0 },
  notifications: { staleTime: 0 },
} as const;
