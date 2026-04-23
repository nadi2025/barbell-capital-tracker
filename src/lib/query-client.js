import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			// Refetch when user returns to the tab — critical for "real-time" feel
			refetchOnWindowFocus: true,
			// Keep unused data in cache for 5 minutes before GC
			gcTime: 5 * 60 * 1000,
			// Consider data fresh for 30s — avoids duplicate fetches across components
			staleTime: 30 * 1000,
			retry: 1,
		},
	},
});
